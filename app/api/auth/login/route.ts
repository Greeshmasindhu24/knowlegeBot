import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/backendUrl';
import { parseJsonResponse } from '@/lib/parseJsonResponse';

const BACKEND_TIMEOUT_MS = 45_000;

async function backendFetch(path: string, init: RequestInit) {
  return fetch(`${getBackendUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const res = await backendFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await parseJsonResponse<{ access_token?: string; expires_in?: number; detail?: string }>(res);

    if (!res.ok) {
      const detail =
        typeof data.detail === 'string'
          ? data.detail
          : res.status === 404
            ? `Backend not found at ${getBackendUrl()}. Check BACKEND_URL / NEXT_PUBLIC_API_URL on Render.`
            : 'Login failed';
      return NextResponse.json({ detail }, { status: res.status });
    }

    const response = NextResponse.json(data);
    
    // Set secure HTTP-only cookie with token
    response.cookies.set('auth_token', data.access_token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: data.expires_in ?? 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error && (error.message.includes('fetch failed') || error.name === 'TimeoutError')
        ? 'Cannot reach the API server. Check that the backend is running and DATABASE_URL is configured.'
        : error instanceof Error
          ? error.message
          : 'Internal server error';

    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
