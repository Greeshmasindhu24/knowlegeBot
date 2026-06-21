import { createAdminClient } from './supabase-server';
import { processDocument } from './documentProcessor';
import { embedAndStoreChunks } from './rag';
import { isSupportedUploadExtension } from './supportedFileTypes';
import { DOCUMENTS_BUCKET, ensureDocumentsBucket } from './storage';
import { assertDatabaseReady } from './databaseSetup';
import { ensureSupabaseUser, type BackendUser } from './backend-auth';

export interface PersistDocumentParams {
  buffer: Buffer;
  filename: string;
  fileSize: number;
  extension: string;
  userId: string;
  department: string;
  sourceSystem: string;
  sourceUrl?: string | null;
  owner?: string | null;
  sensitivityLabel?: string;
  version?: string;
  user?: BackendUser;
}

export interface PersistDocumentResult {
  id: string;
  name: string;
  chunkCount: number;
}

export async function persistDocument(params: PersistDocumentParams): Promise<PersistDocumentResult> {
  const extension = params.extension.toLowerCase();

  if (!isSupportedUploadExtension(extension)) {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  const supabaseAdmin = createAdminClient();
  await assertDatabaseReady(supabaseAdmin);
  await ensureDocumentsBucket(supabaseAdmin);

  if (params.user) {
    await ensureSupabaseUser(params.user);
  }

  const storagePath = `${params.userId}/${Date.now()}-${params.filename}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`File storage upload failed: ${uploadError.message}`);
  }

  const { data: docData, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      name: params.filename,
      file_path: uploadData.path,
      file_size: params.fileSize,
      file_type: extension,
      department: params.department || 'General',
      uploaded_by: params.userId,
      source_system: params.sourceSystem,
      owner: params.owner || null,
      sensitivity_label: params.sensitivityLabel || 'internal',
      version: params.version || '1.0',
      source_updated_at: new Date().toISOString(),
      source_url: params.sourceUrl || null,
    })
    .select()
    .single();

  if (docError) {
    await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([uploadData.path]);
    throw new Error(`Database entry creation failed: ${docError.message}`);
  }

  try {
    const chunks = await processDocument(params.buffer, extension);
    if (chunks.length > 0) {
      await embedAndStoreChunks(docData.id, chunks);
    }
    return { id: docData.id, name: docData.name, chunkCount: chunks.length };
  } catch (processError: unknown) {
    await supabaseAdmin.from('documents').delete().eq('id', docData.id);
    await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([uploadData.path]);
    const message = processError instanceof Error ? processError.message : String(processError);
    throw new Error(`Document processing failed: ${message}`);
  }
}
