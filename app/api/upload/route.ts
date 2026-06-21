import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAuthenticatedUser, ensureSupabaseUser, insertDocumentRecord } from '@/lib/backend-auth';
import { processDocument } from '@/lib/documentProcessor';
import { embedAndStoreChunks } from '@/lib/rag';
import { getFileTooLargeMessage, isFileTooLarge } from '@/lib/uploadConstants';
import { isSupportedUploadExtension } from '@/lib/supportedFileTypes';
import { writeAuditLog, getClientIp } from '@/lib/observability';
import { DOCUMENTS_BUCKET, ensureDocumentsBucket } from '@/lib/storage';
import { assertDatabaseReady } from '@/lib/databaseSetup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSupabaseUser(user);

    const supabaseAdmin = createAdminClient();
    await assertDatabaseReady(supabaseAdmin);

    // 2. Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const department = formData.get('department') as string | null;
    const sourceSystem = (formData.get('sourceSystem') as string) || 'manual_upload';
    const owner = formData.get('owner') as string | null;
    const sensitivityLabel = (formData.get('sensitivityLabel') as string) || 'internal';
    const version = (formData.get('version') as string) || '1.0';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const filename = file.name;
    const fileSize = file.size;
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    if (!isSupportedUploadExtension(extension)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF, DOCX, TXT, and MD are allowed.' },
        { status: 400 }
      );
    }

    if (isFileTooLarge(fileSize)) {
      return NextResponse.json(
        { error: getFileTooLargeMessage(fileSize) },
        { status: 413 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Upload raw file to Supabase Storage
    // We use the admin client to ensure bucket uploads succeed even if policies are strict
    await ensureDocumentsBucket(supabaseAdmin);

    const storagePath = `${user.id}/${Date.now()}-${filename}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload storage error:', uploadError);
      return NextResponse.json(
        { error: `File storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 4. Save document metadata in PostgreSQL
    let docData;
    try {
      docData = await insertDocumentRecord(supabaseAdmin, user, {
        name: filename,
        file_path: uploadData.path,
        file_size: fileSize,
        file_type: extension,
        department: department || 'General',
        uploaded_by: user.id,
        source_system: sourceSystem,
        owner: owner || null,
        sensitivity_label: sensitivityLabel,
        version,
        source_updated_at: new Date().toISOString(),
      });
    } catch (docError: unknown) {
      console.error('Upload documents insert error:', docError);
      await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([uploadData.path]);
      const message = docError instanceof Error ? docError.message : String(docError);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // 5. Extract, chunk, and embed documents
    try {
      const chunks = await processDocument(buffer, extension);
      
      if (chunks.length > 0) {
        await embedAndStoreChunks(docData.id, chunks);
      }
    } catch (processError: unknown) {
      console.error('Upload processing error:', processError);
      // Rollback document metadata & storage on processing error
      await supabaseAdmin.from('documents').delete().eq('id', docData.id);
      await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([uploadData.path]);
      const message =
        processError instanceof Error ? processError.message : String(processError);
      return NextResponse.json(
        { error: `Document processing failed: ${message}` },
        { status: 500 }
      );
    }

    // 6. Record Audit Log
    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'upload_document',
      ipAddress: getClientIp(req.headers),
      details: {
        document_id: docData.id,
        document_name: filename,
        file_size: fileSize,
        file_type: extension,
        department: department || 'General',
        source_system: sourceSystem,
        sensitivity_label: sensitivityLabel,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: docData.id,
        name: docData.name,
        file_type: docData.file_type,
        department: docData.department,
        created_at: docData.created_at,
      },
    });
  } catch (error: unknown) {
    console.error('Error in upload route:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
