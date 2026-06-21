import { NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { syncDocumentsFolder } from '@/lib/folderSync';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
      .select('department, role')
      .eq('id', user.id)
      .single();

    const department = profile?.department || 'General';

    const result = await syncDocumentsFolder(user.id, department);

    const supabaseAdmin = createAdminClient();
    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'folder_sync',
      ipAddress: getClientIp(req.headers),
      details: {
        added: result.added.length,
        updated: result.updated.length,
        removed: result.removed.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
      },
    });

    return NextResponse.json({
      success: true,
      result,
      summary: `Added ${result.added.length}, updated ${result.updated.length}, removed ${result.removed.length}, skipped ${result.skipped.length}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
