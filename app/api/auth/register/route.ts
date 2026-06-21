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
      return NextResponse.json(
        { detail: data.detail || 'Registration failed' },
        { status: res.status },
      );
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
