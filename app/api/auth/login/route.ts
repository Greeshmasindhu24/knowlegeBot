import { NextRequest, NextResponse } from 'next/server';
import { parseJsonResponse } from '@/lib/parseJsonResponse';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const BACKEND_TIMEOUT_MS = 20_000;

async function backendFetch(path: string, init: RequestInit) {
  return fetch(`${BACKEND_URL}${path}`, {
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
      return NextResponse.json(
        { detail: data.detail || 'Login failed' },
        { status: res.status },
      );
    }

    const response = NextResponse.json(data);
    
    // Set secure HTTP-only cookie with token
    response.cookies.set('auth_token', data.access_token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: data.expires_in,
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
