/**
 * Server-side API fetch utility.
 * Only usable in Server Components / Route Handlers — no browser globals.
 * Bypasses Next.js rewrites by calling the backend directly.
 */

function getServerApiBase(): string {
  const defaultOrigin =
    process.env.NODE_ENV === 'production' ? 'http://api:8100' : 'http://localhost:8111';
  const publicApiOrigin =
    process.env.NEXT_PUBLIC_API_URL?.startsWith('http')
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : null;
  const origin =
    process.env.INTERNAL_API_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? defaultOrigin : publicApiOrigin) ||
    defaultOrigin;
  return `${origin}/api/v1`;
}

export async function serverFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const base = getServerApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 60 },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`serverFetch ${path} failed with status ${res.status}`);
  }

  const json: unknown = await res.json();
  if (json === null || typeof json !== 'object') {
    throw new Error(`serverFetch ${path}: unexpected response structure`);
  }
  // TransformInterceptor format: { status, data, timestamp }
  if ('data' in json) {
    const wrapped = json as { status?: unknown; data: unknown };
    if (typeof wrapped.status !== 'string') {
      throw new Error(`serverFetch ${path}: missing or invalid status field`);
    }
    return wrapped.data as T;
  }
  return json as T;
}
