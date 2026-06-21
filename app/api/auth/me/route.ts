import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseJsonResponse } from '@/lib/parseJsonResponse';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
    }

    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await parseJsonResponse<{
      id?: string;
      email?: string;
      full_name?: string | null;
      role?: string;
      department?: string;
      detail?: string;
    }>(res);

    if (!res.ok) {
      return NextResponse.json(
        { detail: data.detail || 'Failed to load profile' },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error && (error.message.includes('fetch failed') || error.name === 'TimeoutError')
        ? 'Cannot reach the API server.'
        : error instanceof Error
          ? error.message
          : 'Internal server error';

    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
