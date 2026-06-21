import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAuthenticatedUser } from '@/lib/backend-auth';
import { canAccessDocument } from '@/lib/documentAccess';

export const dynamic = 'force-dynamic';

// GET: Retrieve documents listing
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: documents, error: dbError } = await supabaseAdmin
      .from('documents')
      .select('*, users(email)')
      .order('created_at', { ascending: false });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const filtered = (documents || []).filter((doc) => canAccessDocument(user, doc));

    return NextResponse.json({ documents: filtered });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message}` },
      { status: 500 }
    );
  }
}

// DELETE: Remove a document, chunks, and storage file
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('id');

    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: document, error: fetchErr } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (fetchErr || !document) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = document.uploaded_by === user.id;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Cannot delete other users\' documents' }, { status: 403 });
    }

    // 2. Remove file from storage
    const { error: storageErr } = await supabaseAdmin.storage
      .from('documents')
      .remove([document.file_path]);

    if (storageErr) {
      console.error(`Warning: Failed to delete storage file: ${storageErr.message}`);
    }

    // 3. Delete document row (cascades to chunks)
    const { error: deleteErr } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', docId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // 4. Create audit log
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'delete_document',
      details: {
        document_id: docId,
        document_name: document.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message}` },
      { status: 500 }
    );
  }
}
