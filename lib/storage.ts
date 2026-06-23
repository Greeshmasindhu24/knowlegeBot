import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from './uploadConstants';

/** Supabase Storage bucket for uploaded document files. */
export const DOCUMENTS_BUCKET = 'documents';

let bucketReady: Promise<void> | null = null;

function resetBucketReadyCache(): void {
  bucketReady = null;
}

function isBucketMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('bucket not found') || lower.includes('not found');
}

function isAlreadyExistsError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('already exists') || lower.includes('duplicate');
}

/**
 * Ensures the private `documents` storage bucket exists.
 * Uses the service-role client; safe to call repeatedly (cached per process).
 */
export async function ensureDocumentsBucket(supabaseAdmin: SupabaseClient): Promise<void> {
  if (!bucketReady) {
    bucketReady = ensureDocumentsBucketOnce(supabaseAdmin).catch((error) => {
      resetBucketReadyCache();
      throw error;
    });
  }
  return bucketReady;
}

async function ensureDocumentsBucketOnce(supabaseAdmin: SupabaseClient): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.getBucket(DOCUMENTS_BUCKET);
  if (data && !error) {
    return;
  }

  if (error && !isBucketMissingError(error.message)) {
    throw new Error(`Storage bucket check failed: ${error.message}`);
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_FILE_SIZE_BYTES,
  });

  if (createError && !isAlreadyExistsError(createError.message)) {
    throw new Error(
      `Storage bucket '${DOCUMENTS_BUCKET}' is missing and could not be created automatically: ${createError.message}. ` +
        `Run database/migrations/003_storage_documents_bucket.sql in the Supabase SQL editor.`
    );
  }
}
