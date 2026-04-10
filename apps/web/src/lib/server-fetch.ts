/**
 * Server-side API fetch utility.
 * Only usable in Server Components / Route Handlers — no browser globals.
 * Bypasses Next.js rewrites by calling the backend directly.
 */

function getServerApiBase(): string {
  const origin =
    process.env.INTERNAL_API_ORIGIN ||
    (process.env.NEXT_PUBLIC_API_URL?.startsWith('http')
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : null) ||
    'http://localhost:8111';
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

  const json = await res.json();
  if (json !== null && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}
