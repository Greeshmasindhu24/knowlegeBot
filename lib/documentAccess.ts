export interface DocumentAccessUser {
  id: string;
  role: string;
  department: string;
}

export interface DocumentAccessRecord {
  department: string | null;
  uploaded_by: string;
}

/** Whether a user may view a document in listings, chat retrieval, etc. */
export function canAccessDocument(
  user: DocumentAccessUser,
  doc: DocumentAccessRecord
): boolean {
  if (user.role === 'admin' || user.role === 'reviewer') return true;
  // Uploaders always see documents they ingested (even for other departments).
  if (doc.uploaded_by === user.id) return true;
  if (!doc.department || doc.department === 'General') return true;
  return doc.department === user.department;
}
