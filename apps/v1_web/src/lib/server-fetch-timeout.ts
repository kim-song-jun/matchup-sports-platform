// undici's default wait for response headers is 300s, so a stalled API pins every
// server-rendered request (and the React tree it holds) until the API answers.
export const SERVER_FETCH_TIMEOUT_MS = 4000;

export function serverFetchSignal(): AbortSignal {
  return AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS);
}

export function isServerFetchTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}
