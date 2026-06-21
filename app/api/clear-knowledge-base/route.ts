import { NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createServerSideClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can clear the knowledge base' },
        { status: 403 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: documents, error: listError } = await supabaseAdmin
      .from('documents')
      .select('id, file_path');

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const filePaths = (documents || []).map((doc) => doc.file_path).filter(Boolean);

    if (filePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage.from('documents').remove(filePaths);
      if (storageError) {
        console.error('Storage cleanup warning:', storageError.message);
      }
    }

    const { error: deleteError } = await supabaseAdmin.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'clear_knowledge_base',
      ipAddress: getClientIp(req.headers),
      details: {
        documents_removed: documents?.length || 0,
      },
    });

    return NextResponse.json({
      success: true,
      removed: documents?.length || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
