import { afterEach, describe, expect, it, vi } from 'vitest';
import { getV1ApiBaseUrl } from './api-client';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getV1ApiBaseUrl', () => {
  it('keeps the backend API at the web root when a legacy browser base path is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/legacy');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    expect(getV1ApiBaseUrl()).toBe('/api/v1');
  });
});
