import { NextRequest, NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { reindexDocument } from '@/lib/ingestion';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSideClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('id');

    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data: document } = await supabase
      .from('documents')
      .select('uploaded_by')
      .eq('id', docId)
      .single();

    if (!document) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    const isAdmin = profile?.role === 'admin';
    const isOwner = document.uploaded_by === user.id;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { chunkCount, documentName } = await reindexDocument(supabase, docId);

    const supabaseAdmin = createAdminClient();
    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'reindex_document',
      ipAddress: getClientIp(req.headers),
      details: { document_id: docId, document_name: documentName, chunk_count: chunkCount },
    });

    return NextResponse.json({
      success: true,
      documentId: docId,
      documentName,
      chunkCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
