import { SENSITIVE_DOMAINS, DOMAIN_DISCLAIMERS, CONFIDENCE_THRESHOLD } from './constants';

const PII_PATTERNS: { name: string; pattern: RegExp; replacement: string }[] = [
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED-SSN]' },
  { name: 'credit_card', pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/g, replacement: '[REDACTED-CARD]' },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[REDACTED-EMAIL]',
  },
  {
    name: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED-PHONE]',
  },
];

const HIGH_RISK_KEYWORDS = [
  'terminate',
  'termination',
  'lawsuit',
  'legal action',
  'discrimination',
  'harassment',
  'salary of',
  'compensation of',
  'confidential contract',
  'nda breach',
];

export interface GuardrailResult {
  text: string;
  blocked: boolean;
  redactions: string[];
  needsHumanReview: boolean;
  reviewReason?: string;
  disclaimer?: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  confidenceScore: number;
}

export function scrubPII(text: string): { text: string; redactions: string[] } {
  let scrubbed = text;
  const redactions: string[] = [];

  for (const { name, pattern, replacement } of PII_PATTERNS) {
    if (pattern.test(scrubbed)) {
      redactions.push(name);
      scrubbed = scrubbed.replace(pattern, replacement);
    }
    pattern.lastIndex = 0;
  }

  return { text: scrubbed, redactions };
}

export function assessConfidence(topSimilarity: number, matchCount: number): GuardrailResult['confidenceLevel'] {
  if (matchCount === 0 || topSimilarity < CONFIDENCE_THRESHOLD) return 'low';
  if (topSimilarity >= 0.6 && matchCount >= 2) return 'high';
  return 'medium';
}

export function requiresHumanReview(
  question: string,
  department: string,
  confidenceLevel: GuardrailResult['confidenceLevel']
): { needsReview: boolean; reason?: string; domain?: string } {
  const lowerQ = question.toLowerCase();

  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (lowerQ.includes(keyword)) {
      return {
        needsReview: true,
        reason: `High-risk keyword detected: "${keyword}"`,
        domain: department,
      };
    }
  }

  if (SENSITIVE_DOMAINS.includes(department as (typeof SENSITIVE_DOMAINS)[number]) && confidenceLevel === 'low') {
    return {
      needsReview: true,
      reason: `Low-confidence response in sensitive ${department} domain`,
      domain: department,
    };
  }

  return { needsReview: false };
}

export function getDomainDisclaimer(department: string): string | undefined {
  return DOMAIN_DISCLAIMERS[department];
}

export function applyOutputGuardrails(
  text: string,
  department: string,
  topSimilarity: number,
  matchCount: number,
  question = ''
): GuardrailResult {
  const confidenceLevel = assessConfidence(topSimilarity, matchCount);
  const confidenceScore = matchCount === 0 ? 0 : topSimilarity;
  const { text: scrubbed, redactions } = scrubPII(text);
  const review = requiresHumanReview(question, department, confidenceLevel);
  const disclaimer = getDomainDisclaimer(department);

  if (confidenceLevel === 'low' && matchCount === 0) {
    return {
      text: 'I could not find relevant documents to answer your question with sufficient confidence. Please try rephrasing, specify a department, or upload the relevant policy document.',
      blocked: false,
      redactions,
      needsHumanReview: false,
      disclaimer,
      confidenceLevel,
      confidenceScore,
    };
  }

  return {
    text: scrubbed,
    blocked: false,
    redactions,
    needsHumanReview: review.needsReview,
    reviewReason: review.reason,
    disclaimer,
    confidenceLevel,
    confidenceScore,
  };
}

export function applyInputGuardrails(question: string): { allowed: boolean; message?: string } {
  const blockedPatterns = [
    /\bignore (all )?previous instructions\b/i,
    /\bdisregard (your )?system prompt\b/i,
    /\breveal (your )?system prompt\b/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(question)) {
      return { allowed: false, message: 'This request was blocked by security policy.' };
    }
  }

  return { allowed: true };
}

export function isAmbiguousQuestion(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length < 10) return true;

  const vaguePatterns = [
    /^(what|how|tell me|explain)\??$/i,
    /\b(that|this|it)\b/i,
  ];

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 3 && vaguePatterns.some((p) => p.test(trimmed))) return true;

  return false;
}

export function buildClarifyingQuestion(question: string, department: string): string {
  return `Your question "${question}" is a bit broad. Could you specify which ${department !== 'General' ? department + ' ' : ''}policy, document, or topic you need help with? For example: "What is the ${department !== 'General' ? department.toLowerCase() + ' ' : ''}leave approval process?"`;
}
