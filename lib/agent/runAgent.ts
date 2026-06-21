import { SupabaseClient } from '@supabase/supabase-js';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { getLLMClient, SearchMatch, buildRAGPrompt } from '@/lib/rag';
import { createAgentTools, AgentRunState } from './tools';
import {
  applyInputGuardrails,
  applyOutputGuardrails,
  isAmbiguousQuestion,
  buildClarifyingQuestion,
  requiresHumanReview,
} from '@/lib/guardrails';
import { withRetry, initObservability } from '@/lib/observability';
import { AGENT_MAX_ITERATIONS } from '@/lib/constants';

export interface Citation {
  sourceIndex: number;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  content: string;
}

export interface AgentResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  toolsUsed: string[];
  needsHumanReview: boolean;
  reviewReason?: string;
  disclaimer?: string;
  clarificationNeeded?: string;
  blocked?: boolean;
}

function matchesToCitations(matches: SearchMatch[]): Citation[] {
  return matches.map((match, idx) => ({
    sourceIndex: idx + 1,
    documentId: match.document_id,
    documentName: match.document_name,
    pageNumber: match.metadata.pageNumber,
    content: match.content,
  }));
}

export async function runKnowledgeAgent(
  supabase: SupabaseClient,
  question: string,
  department: string,
  userId: string,
  history: { role: string; content: string }[] = []
): Promise<AgentResult> {
  initObservability();

  const inputCheck = applyInputGuardrails(question);
  if (!inputCheck.allowed) {
    return {
      answer: inputCheck.message!,
      citations: [],
      confidence: 0,
      confidenceLevel: 'low',
      toolsUsed: [],
      needsHumanReview: false,
      blocked: true,
    };
  }

  if (isAmbiguousQuestion(question)) {
    return {
      answer: buildClarifyingQuestion(question, department),
      citations: [],
      confidence: 0,
      confidenceLevel: 'low',
      toolsUsed: ['clarification'],
      needsHumanReview: false,
      clarificationNeeded: question,
    };
  }

  const state: AgentRunState = { matches: [], toolsUsed: [] };
  const tools = createAgentTools({ supabase, department, userId }, state);
  const llm = getLLMClient(false).bindTools(tools);

  const systemPrompt = `You are an Enterprise Knowledge Bot agent with access to enterprise tools.
Use tools in a loop until you can answer accurately:
- document_retrieval: search approved internal documents (always use for factual questions)
- metadata_lookup: find document owners, versions, sensitivity labels
- glossary_lookup: define enterprise acronyms
- escalate_to_human: for legal/HR-sensitive or unanswerable questions

Rules:
1. Always call document_retrieval before answering factual questions.
2. Only use information from tool results — never invent facts.
3. Cite sources as [Source N] matching retrieval results.
4. If retrieval returns nothing useful, ask a clarifying question or escalate.
5. User department context: ${department}`;

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
    ...history.map((m) =>
      m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)
    ),
    new HumanMessage(question),
  ];

  for (let i = 0; i < AGENT_MAX_ITERATIONS; i++) {
    const response = await withRetry(() => llm.invoke(messages), 'agent-llm');

    if (!response.tool_calls?.length) {
      const topSimilarity = state.matches[0]?.similarity ?? 0;
      const guardrail = applyOutputGuardrails(
        response.content as string,
        department,
        topSimilarity,
        state.matches.length,
        question
      );

      const review = requiresHumanReview(question, department, guardrail.confidenceLevel);

      let finalAnswer = guardrail.text;
      if (guardrail.disclaimer) {
        finalAnswer += `\n\n---\n*${guardrail.disclaimer}*`;
      }

      return {
        answer: finalAnswer,
        citations: matchesToCitations(state.matches),
        confidence: guardrail.confidenceScore,
        confidenceLevel: guardrail.confidenceLevel,
        toolsUsed: state.toolsUsed,
        needsHumanReview: review.needsReview || guardrail.needsHumanReview,
        reviewReason: review.reason || guardrail.reviewReason,
        disclaimer: guardrail.disclaimer,
      };
    }

    messages.push(response);

    for (const toolCall of response.tool_calls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      let result: string;
      if (tool) {
        const output = await (tool as { invoke: (input: unknown) => Promise<unknown> }).invoke(
          toolCall.args
        );
        result = typeof output === 'string' ? output : JSON.stringify(output);
      } else {
        result = `Unknown tool: ${toolCall.name}`;
      }

      messages.push(
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id!,
        })
      );
    }
  }

  const fallbackContext = buildRAGPrompt(state.matches);
  const fallback = await withRetry(
    () =>
      getLLMClient(false).invoke([
        { role: 'system', content: fallbackContext },
        { role: 'user', content: question },
      ]),
    'agent-fallback'
  );

  const topSimilarity = state.matches[0]?.similarity ?? 0;
  const guardrail = applyOutputGuardrails(
    fallback.content as string,
    department,
    topSimilarity,
    state.matches.length,
    question
  );

  return {
    answer: guardrail.text,
    citations: matchesToCitations(state.matches),
    confidence: guardrail.confidenceScore,
    confidenceLevel: guardrail.confidenceLevel,
    toolsUsed: [...state.toolsUsed, 'fallback'],
    needsHumanReview: guardrail.needsHumanReview,
    disclaimer: guardrail.disclaimer,
  };
}
