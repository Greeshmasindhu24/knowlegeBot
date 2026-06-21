export const SUPPORTED_UPLOAD_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

export const SUPPORTED_UPLOAD_ACCEPT = '.pdf,.docx,.txt,.md';

export const SUPPORTED_UPLOAD_LABEL = 'PDF, TXT, MD, DOCX';

export function isSupportedUploadExtension(ext: string): boolean {
  const normalized = ext.toLowerCase();
  return (SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(normalized);
}
