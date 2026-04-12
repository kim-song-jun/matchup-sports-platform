'use client';

import type { ApiResponse, CursorPage } from '@/types/api';

// Helper: the axios response interceptor returns `response.data` (the ApiResponse wrapper),
// so each `api` call resolves to `ApiResponse<T>`. Cast once here rather than at each call site.
export function extractData<T>(res: unknown): T {
  return (res as ApiResponse<T>).data;
}

export function extractCollection<T>(res: unknown): T[] {
  const data = extractData<T[] | { items?: T[] }>(res);
  if (Array.isArray(data)) {
    return data;
  }

  return data.items ?? [];
}

export function extractCursorPage<T>(res: unknown): CursorPage<T> {
  return extractData<CursorPage<T>>(res);
}
