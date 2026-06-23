/** Resolve FastAPI backend base URL (no trailing slash, no /api suffix). */
export function getBackendUrl(): string {
  let raw =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:8000';

  // Render dashboard mistake: value pasted with quotes → invalid fetch URL
  raw = raw.replace(/^["']|["']$/g, '');
  raw = raw.replace(/\/$/, '');
  // Common Render mistake: ...onrender.com/api — FastAPI routes are /auth/login not /api/auth/login
  if (raw.endsWith('/api')) {
    raw = raw.slice(0, -4);
  }

  return raw;
}
