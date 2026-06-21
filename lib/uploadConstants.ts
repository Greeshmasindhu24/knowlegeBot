export const MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export const MAX_UPLOAD_FILE_SIZE_LABEL = '15MB';

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function isFileTooLarge(sizeBytes: number): boolean {
  return sizeBytes > MAX_UPLOAD_FILE_SIZE_BYTES;
}

export function getFileTooLargeMessage(sizeBytes: number): string {
  return `File is too large (${formatFileSize(sizeBytes)}). Maximum allowed size is ${MAX_UPLOAD_FILE_SIZE_LABEL}.`;
}
