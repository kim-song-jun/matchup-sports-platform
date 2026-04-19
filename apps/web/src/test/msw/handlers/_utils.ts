import { HttpResponse } from 'msw';

export const timestamp = () => new Date().toISOString();

export function success<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: timestamp() });
}

export function paged<T>(items: T[], nextCursor: string | null = null) {
  return success({ items, nextCursor });
}

/** CursorPage shape — used by endpoints that return { data, nextCursor, hasMore }. */
export function cursorPaged<T>(data: T[], nextCursor: string | null = null) {
  return success({ data, nextCursor, hasMore: nextCursor !== null });
}
