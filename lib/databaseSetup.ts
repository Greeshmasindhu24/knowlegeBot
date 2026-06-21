import type { SupabaseClient } from '@supabase/supabase-js';

const REQUIRED_TABLES = ['documents', 'document_chunks'] as const;

export interface DatabaseReadyResult {
  ready: boolean;
  missingTables: string[];
  message?: string;
}

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find the table') ||
    lower.includes('relation') && lower.includes('does not exist') ||
    lower.includes('schema cache')
  );
}

/** Probe Supabase for tables required by upload/RAG. */
export async function checkDatabaseReady(
  supabaseAdmin: SupabaseClient
): Promise<DatabaseReadyResult> {
  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabaseAdmin.from(table).select('id').limit(1);
    if (error && isMissingTableError(error.message)) {
      missingTables.push(table);
    }
  }

  if (missingTables.length === 0) {
    return { ready: true, missingTables: [] };
  }

  return {
    ready: false,
    missingTables,
    message:
      `Supabase database is not initialized (missing: ${missingTables.join(', ')}). ` +
      'Open Supabase Dashboard → SQL Editor, paste and run database/supabase-init-all.sql, then retry upload. ' +
      'Or set SUPABASE_DB_URL in .env.local and run: npm run setup:schema',
  };
}

export async function assertDatabaseReady(supabaseAdmin: SupabaseClient): Promise<void> {
  const result = await checkDatabaseReady(supabaseAdmin);
  if (!result.ready) {
    throw new Error(result.message);
  }
}
