import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAuthenticatedUser, ensureSupabaseUser } from '@/lib/backend-auth';

export const dynamic = 'force-dynamic';

/** List chat sessions or fetch messages for one session (?sessionId=...) */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSupabaseUser(user);

    const supabaseAdmin = createAdminClient();
    const sessionId = new URL(req.url).searchParams.get('sessionId');

    if (sessionId) {
      const { data: session, error: sessionErr } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, user_id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (sessionErr || !session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const { data: messages, error: msgErr } = await supabaseAdmin
        .from('chat_messages')
        .select('id, role, content, created_at, citations, confidence, needs_review, disclaimer')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
      }

      return NextResponse.json({ messages: messages || [] });
    }

    const { data: sessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete a chat session and its messages */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = new URL(req.url).searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: session } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from('chat_sessions').delete().eq('id', sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
