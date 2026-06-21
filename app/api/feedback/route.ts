import { NextRequest, NextResponse } from 'next/server';
import { createServerSideClient, createAdminClient } from '@/lib/supabase-server';
import { writeAuditLog, getClientIp } from '@/lib/observability';

export const dynamic = 'force-dynamic';

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

    const { messageId, rating, comment } = await req.json();

    if (!messageId || !['positive', 'negative'].includes(rating)) {
      return NextResponse.json({ error: 'messageId and rating (positive/negative) required' }, { status: 400 });
    }

    const { error } = await supabase.from('message_feedback').upsert(
      {
        message_id: messageId,
        user_id: user.id,
        rating,
        comment: comment || null,
      },
      { onConflict: 'message_id,user_id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient();
    await writeAuditLog(supabaseAdmin, {
      userId: user.id,
      action: 'message_feedback',
      ipAddress: getClientIp(req.headers),
      details: { message_id: messageId, rating },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
