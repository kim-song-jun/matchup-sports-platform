import { afterEach, describe, expect, it, vi } from 'vitest';
import { getV1ApiBaseUrl, getV1DevAuthHeaders } from './api-client';
import { V1_USER_EMAIL_KEY, V1_USER_ID_KEY } from './session-storage';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe('getV1ApiBaseUrl', () => {
  it('uses the root-mounted backend API by default', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    expect(getV1ApiBaseUrl()).toBe('/api/v1');
  });
});

describe('getV1DevAuthHeaders', () => {
  it('never forwards local identity values in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    window.localStorage.setItem(V1_USER_ID_KEY, 'admin-user');
    window.localStorage.setItem(V1_USER_EMAIL_KEY, 'admin@example.com');

    const headers = getV1DevAuthHeaders() as Record<string, string>;

    expect(headers['x-v1-user-id']).toBeUndefined();
    expect(headers['x-v1-user-email']).toBeUndefined();
    expect(headers['x-v1-search-session-id']).toBeTruthy();
  });
});
