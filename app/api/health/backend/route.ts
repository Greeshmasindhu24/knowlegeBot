import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

/** Server-side probe: can this frontend reach the FastAPI backend? */
export async function GET() {
  const backendUrl = getBackendUrl();
  const liveUrl = `${backendUrl}/health/live`;

  try {
    const res = await fetch(liveUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* HTML error page from Render */
    }

    return NextResponse.json({
      backendUrl,
      liveUrl,
      ok: res.ok,
      status: res.status,
      body: typeof body === 'string' && body.length > 500 ? `${body.slice(0, 500)}…` : body,
      hint:
        res.status === 502 || res.status === 503
          ? 'Backend service is down or still starting. Open liveUrl in a browser and check Render backend Logs.'
          : res.ok
            ? 'Backend is reachable from the frontend.'
            : 'Backend responded but not healthy. Check DATABASE_URL and backend Logs on Render.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return NextResponse.json(
      {
        backendUrl,
        liveUrl,
        ok: false,
        status: 0,
        error: message,
        hint:
          backendUrl.includes('localhost')
            ? 'BACKEND_URL is not set on the frontend Render service (still localhost).'
            : 'Cannot reach backend. Confirm the API web service exists on Render and BACKEND_URL matches its URL (no /api suffix).',
      },
      { status: 503 }
    );
  }
}
