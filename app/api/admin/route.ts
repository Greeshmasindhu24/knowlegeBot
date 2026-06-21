import { NextRequest, NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSideClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();

    const [docsCount, usersCount, chatsCount, uploadsCount, logsData, pendingReviews, feedbackData] =
      await Promise.all([
        supabaseAdmin.from('documents').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('chat_sessions').select('*', { count: 'exact', head: true }),
        supabaseAdmin
          .from('audit_logs')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'upload_document'),
        supabaseAdmin
          .from('audit_logs')
          .select('*, users(email)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabaseAdmin
          .from('flagged_responses')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabaseAdmin.from('message_feedback').select('rating'),
      ]);

    if (logsData.error) {
      return NextResponse.json({ error: logsData.error.message }, { status: 500 });
    }

    const positiveFeedback =
      feedbackData.data?.filter((f: { rating: string }) => f.rating === 'positive').length || 0;
    const totalFeedback = feedbackData.data?.length || 0;

    return NextResponse.json({
      metrics: {
        totalDocuments: docsCount.count || 0,
        totalUsers: usersCount.count || 0,
        totalChats: chatsCount.count || 0,
        totalUploads: uploadsCount.count || 0,
        pendingReviews: pendingReviews.count || 0,
        feedbackScore: totalFeedback > 0 ? Math.round((positiveFeedback / totalFeedback) * 100) : null,
      },
      auditLogs: logsData.data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}
