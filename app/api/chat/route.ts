import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getAuthenticatedUser, ensureSupabaseUser } from '@/lib/backend-auth';
import {
  prepareChatContext,
  finalizeChatResult,
  buildStreamMessages,
  getStreamingLLM,
} from '@/lib/chatPipeline';
import { getClientIp, logRetrievalEvent, writeAuditLog } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSupabaseUser(user);

    const supabaseAdmin = createAdminClient();
    const department = user.department || 'General';
    const { question, sessionId } = await req.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    let history: { role: string; content: string }[] = [];
    if (sessionId && sessionId !== 'new') {
      const { data: session } = await supabaseAdmin
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (session) {
        const { data: historyMsgs } = await supabaseAdmin
          .from('chat_messages')
          .select('role, content')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })
          .limit(10);

        if (historyMsgs) {
          history = historyMsgs.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          }));
        }
      }
    }

    const encoder = new TextEncoder();
    const ip = getClientIp(req.headers);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          const context = await prepareChatContext(supabaseAdmin, question, department, (step) =>
            send('progress', { step })
          );

          if (context.type === 'instant') {
            const r = context.result;
            send('meta', {
              citations: r.citations,
              confidence: r.confidence,
              confidenceLevel: r.confidenceLevel,
              toolsUsed: r.toolsUsed,
              needsHumanReview: r.needsHumanReview,
              disclaimer: r.disclaimer,
            });
            send('token', { text: r.answer });
            await persistAndFinish(
              send,
              user.id,
              sessionId,
              question,
              department,
              r,
              ip
            );
            return;
          }

          const { matches, citations } = context;
          send('progress', { step: 'Generating answer...' });
          send('meta', {
            citations,
            confidence: matches[0]?.similarity ?? 0,
            confidenceLevel: matches.length === 0 ? 'low' : 'medium',
            toolsUsed: ['document_retrieval'],
            needsHumanReview: false,
            disclaimer: undefined,
          });

          const llm = getStreamingLLM();
          const messages = buildStreamMessages(matches, history, question);
          let fullAnswer = '';

          const responseStream = await llm.stream(
            messages.map((m) => [m.role, m.content] as [string, string])
          );

          for await (const chunk of responseStream) {
            const token = (chunk.content as string) || '';
            if (!token) continue;
            fullAnswer += token;
            send('token', { text: token });
          }

          const result = finalizeChatResult(question, department, fullAnswer, matches, citations);

          // Send disclaimer if added during finalization
          if (result.answer.length > fullAnswer.length) {
            send('token', { text: result.answer.slice(fullAnswer.length) });
          }

          send('meta', {
            citations: result.citations,
            confidence: result.confidence,
            confidenceLevel: result.confidenceLevel,
            toolsUsed: result.toolsUsed,
            needsHumanReview: result.needsHumanReview,
            disclaimer: result.disclaimer,
          });

          await persistAndFinish(send, user.id, sessionId, question, department, result, ip);
        } catch (err) {
          console.error('Chat stream error:', err);
          send('error', {
            error: err instanceof Error ? err.message : 'Stream failed',
          });
        } finally {
          send('done', {});
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in chat route:', error);
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}

async function persistAndFinish(
  send: (event: string, data: unknown) => void,
  userId: string,
  sessionId: string,
  question: string,
  department: string,
  result: {
    answer: string;
    citations: { documentId: string }[];
    confidence: number;
    confidenceLevel: string;
    toolsUsed: string[];
    needsHumanReview: boolean;
    reviewReason?: string;
    disclaimer?: string;
  },
  ip: string
) {
  try {
    const supabaseAdmin = createAdminClient();
    let activeSessionId = sessionId;

    if (!activeSessionId || activeSessionId === 'new') {
      const title = question.length > 40 ? `${question.slice(0, 40)}...` : question;
      const { data: newSession, error: sessionErr } = await supabaseAdmin
        .from('chat_sessions')
        .insert({ user_id: userId, title })
        .select()
        .single();

      if (!sessionErr && newSession) {
        activeSessionId = newSession.id;
      }
    }

    if (!activeSessionId) return;

    await supabaseAdmin.from('chat_messages').insert({
      session_id: activeSessionId,
      role: 'user',
      content: question,
    });

    const { data: assistantMsg } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        session_id: activeSessionId,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        confidence: result.confidence,
        needs_review: result.needsHumanReview,
        disclaimer: result.disclaimer || null,
      })
      .select()
      .single();

    if (result.needsHumanReview && assistantMsg) {
      await supabaseAdmin.from('flagged_responses').insert({
        message_id: assistantMsg.id,
        session_id: activeSessionId,
        user_id: userId,
        question,
        response: result.answer,
        reason: result.reviewReason || 'Flagged by guardrails',
        domain: department,
        status: 'pending',
      });
    }

    await supabaseAdmin
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeSessionId);

    await Promise.all([
      logRetrievalEvent(supabaseAdmin, {
        userId,
        sessionId: activeSessionId,
        question,
        department,
        toolsUsed: result.toolsUsed,
        documentIds: result.citations.map((c) => c.documentId),
        topSimilarity: result.confidence,
        confidence: result.confidenceLevel,
        matchCount: result.citations.length,
      }),
      writeAuditLog(supabaseAdmin, {
        userId,
        action: 'ask_question',
        ipAddress: ip,
        details: {
          session_id: activeSessionId,
          question,
          citations_count: result.citations.length,
          confidence: result.confidenceLevel,
          tools_used: result.toolsUsed,
          needs_review: result.needsHumanReview,
        },
      }),
    ]);

    send('session', { sessionId: activeSessionId, messageId: assistantMsg?.id });
  } catch (persistErr) {
    console.error('Chat persistence skipped:', persistErr);
  }
}
