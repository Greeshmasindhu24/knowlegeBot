import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { DOCUMENTS_BUCKET, ensureDocumentsBucket } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Server-side storage check using the service role (private buckets are not visible to anon keys). */
export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL is missing on this deployment.' },
        { status: 500 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to Render/Vercel env vars (server only, never expose to the browser).',
        },
        { status: 500 },
      );
    }

    const supabaseAdmin = createAdminClient();
    await ensureDocumentsBucket(supabaseAdmin);

    const probePath = `__healthcheck__/${Date.now()}-probe.txt`;
    const probeBody = 'storage-health-probe';

    const { error: uploadError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(probePath, Buffer.from(probeBody), {
        contentType: 'text/plain',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          ok: false,
          bucket: DOCUMENTS_BUCKET,
          error: uploadError.message,
          hint:
            'Run database/migrations/003_storage_documents_bucket.sql in Supabase SQL Editor, or npm run setup:storage locally.',
        },
        { status: 500 },
      );
    }

    await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([probePath]);

    return NextResponse.json({
      ok: true,
      bucket: DOCUMENTS_BUCKET,
      message: 'Storage bucket exists and accepts uploads.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: 'Run database/migrations/003_storage_documents_bucket.sql in Supabase SQL Editor.',
      },
      { status: 500 },
    );
  }
}
