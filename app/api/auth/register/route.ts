import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/backendUrl';
import { parseJsonResponse } from '@/lib/parseJsonResponse';

const BACKEND_TIMEOUT_MS = 20_000;

async function backendFetch(path: string, init: RequestInit) {
  return fetch(`${getBackendUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name, department, role } = await request.json();

    const res = await backendFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name,
        department,
        role: role || 'employee',
      }),
    });

    const data = await parseJsonResponse<{ detail?: string }>(res);

    if (!res.ok) {
      const detail =
        typeof data.detail === 'string'
          ? data.detail
          : res.status === 404
            ? `Backend not found at ${getBackendUrl()}. Check BACKEND_URL / NEXT_PUBLIC_API_URL on Render.`
            : 'Registration failed';
      return NextResponse.json({ detail }, { status: res.status });
    }

    return NextResponse.json(data, { status: 201 });
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
