export const CONFIDENCE_THRESHOLD = 0.35;
export const RETRIEVAL_MATCH_THRESHOLD = 0.25;
export const RETRIEVAL_MATCH_COUNT = 5;
export const AGENT_MAX_ITERATIONS = 5;

export const SENSITIVE_DOMAINS = ['HR', 'Legal', 'Finance'] as const;

export const DOMAIN_DISCLAIMERS: Record<string, string> = {
  HR: 'This response is informational only and does not constitute official HR advice. Contact HR for binding policy decisions.',
  Legal: 'This is not legal advice. Consult the Legal department for authoritative interpretation of contracts and regulations.',
  Finance: 'Financial figures and policies should be verified with the Finance team before making business decisions.',
};

export const ENTERPRISE_GLOSSARY: Record<string, string> = {
  PTO: 'Paid Time Off — company leave balance used for vacation, sick days, and personal time.',
  RAG: 'Retrieval-Augmented Generation — AI answers grounded in enterprise document search results.',
  RLS: 'Row Level Security — database access control enforcing department and role permissions.',
  SOP: 'Standard Operating Procedure — documented step-by-step process for operational tasks.',
  SLA: 'Service Level Agreement — committed response or resolution time for internal services.',
};

export const SOURCE_SYSTEMS = [
  'manual_upload',
  'sharepoint',
  'confluence',
  'url',
  'file_store',
] as const;

export const SENSITIVITY_LABELS = ['public', 'internal', 'confidential', 'restricted'] as const;

export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];
export type SensitivityLabel = (typeof SENSITIVITY_LABELS)[number];
