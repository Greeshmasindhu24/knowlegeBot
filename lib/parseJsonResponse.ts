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
    return { detail: text || `Request failed (${res.status})` } as T;
  }
}
