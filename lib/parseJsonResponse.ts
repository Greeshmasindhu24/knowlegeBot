function gatewayErrorDetail(res: Response): string {
  if (res.status === 502 || res.status === 503) {
    return 'API server is unavailable (502). On Render, confirm the FastAPI backend is running and BACKEND_URL on the frontend points to it.';
  }
  if (res.status === 504) {
    return 'API server timed out. Check backend logs and DATABASE_URL on Render.';
  }
  return `Request failed (${res.status})`;
}

/** Parse a fetch Response body as JSON, falling back gracefully for plain-text errors. */
export async function parseJsonResponse<T = Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trimStart().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      return { detail: gatewayErrorDetail(res) } as T;
    }
    return { detail: text || gatewayErrorDetail(res) } as T;
  }
}
