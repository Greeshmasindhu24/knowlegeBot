import { NextRequest, NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSideClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSideClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from('flagged_responses')
      .select('*, users(email)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSideClient();
    const auth = await requireAdmin(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { user } = auth;

    const { id, status, reviewerNotes } = await req.json();

    if (!id || !['approved', 'rejected', 'revised'].includes(status)) {
      return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from('flagged_responses')
      .update({
        status,
        reviewer_id: user!.id,
        reviewer_notes: reviewerNotes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAuditLog(supabaseAdmin, {
      userId: user!.id,
      action: 'review_response',
      ipAddress: getClientIp(req.headers),
      details: { flagged_id: id, status, reviewer_notes: reviewerNotes },
    });

    return NextResponse.json({ success: true, item: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
