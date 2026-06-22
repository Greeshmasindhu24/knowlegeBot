import { SupabaseClient } from '@supabase/supabase-js';
import {
  searchSimilarChunks,
  buildRAGPrompt,
  getLLMClient,
  SearchMatch,
} from '@/lib/rag';
import {
  applyInputGuardrails,
  applyOutputGuardrails,
  isAmbiguousQuestion,
  buildClarifyingQuestion,
  requiresHumanReview,
  getDomainDisclaimer,
} from '@/lib/guardrails';
import { Citation } from '@/lib/agent/runAgent';

export interface ChatPipelineResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  toolsUsed: string[];
  needsHumanReview: boolean;
  reviewReason?: string;
  disclaimer?: string;
  blocked?: boolean;
}

function matchesToCitations(matches: SearchMatch[]): Citation[] {
  const seenDocs = new Set<string>();
  const citations: Citation[] = [];
  let sourceIndex = 0;

  for (const match of matches) {
    if (seenDocs.has(match.document_id)) continue;
    seenDocs.add(match.document_id);
    sourceIndex += 1;
    citations.push({
      sourceIndex,
      documentId: match.document_id,
      documentName: match.document_name,
      pageNumber: match.metadata.pageNumber,
      content: match.content,
    });
  }

  return citations;
}

export type ProgressCallback = (step: string) => void;

export async function prepareChatContext(
  supabase: SupabaseClient,
  question: string,
  department: string,
  onProgress?: ProgressCallback
): Promise<
  | { type: 'instant'; result: ChatPipelineResult }
  | { type: 'stream'; matches: SearchMatch[]; citations: Citation[]; messages: { role: string; content: string }[] }
> {
  onProgress?.('Checking request...');

  const inputCheck = applyInputGuardrails(question);
  if (!inputCheck.allowed) {
    return {
      type: 'instant',
      result: {
        answer: inputCheck.message!,
        citations: [],
        confidence: 0,
        confidenceLevel: 'low',
        toolsUsed: [],
        needsHumanReview: false,
        blocked: true,
      },
    };
  }

  if (isAmbiguousQuestion(question)) {
    return {
      type: 'instant',
      result: {
        answer: buildClarifyingQuestion(question, department),
        citations: [],
        confidence: 0,
        confidenceLevel: 'low',
        toolsUsed: ['clarification'],
        needsHumanReview: false,
      },
    };
  }

  onProgress?.('Searching documents...');
  const matches = await searchSimilarChunks(supabase, question, department, 3, 0.3);
  const citations = matchesToCitations(matches);

  return {
    type: 'stream',
    matches,
    citations,
    messages: [], // filled by caller with history
  };
}

export function finalizeChatResult(
  question: string,
  department: string,
  fullAnswer: string,
  matches: SearchMatch[],
  citations: Citation[]
): ChatPipelineResult {
  const topSimilarity = matches[0]?.similarity ?? 0;
  const guardrail = applyOutputGuardrails(
    fullAnswer,
    department,
    topSimilarity,
    matches.length,
    question
  );

  const review = requiresHumanReview(question, department, guardrail.confidenceLevel);

  let answer = guardrail.text;
  const disclaimer = guardrail.disclaimer || getDomainDisclaimer(department);
  // Disclaimer is shown in the chat UI — do not append it to the answer body (avoids duplicate text).

  return {
    answer,
    citations,
    confidence: guardrail.confidenceScore,
    confidenceLevel: guardrail.confidenceLevel,
    toolsUsed: ['document_retrieval'],
    needsHumanReview: review.needsReview || guardrail.needsHumanReview,
    reviewReason: review.reason || guardrail.reviewReason,
    disclaimer,
  };
}

export function buildStreamMessages(
  matches: SearchMatch[],
  history: { role: string; content: string }[],
  question: string
) {
  const systemPrompt = buildRAGPrompt(matches);
  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];
}

export function getStreamingLLM() {
  return getLLMClient(true);
}

export async function streamInstantAnswer(
  answer: string,
  onToken: (text: string) => void
): Promise<void> {
  // Send instantly — no artificial delay
  onToken(answer);
}
