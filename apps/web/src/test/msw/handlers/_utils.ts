import { HttpResponse } from 'msw';

export const timestamp = () => new Date().toISOString();

export function success<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: timestamp() });
}

export function paged<T>(items: T[], nextCursor: string | null = null) {
  return success({ items, nextCursor });
}
