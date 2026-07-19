import { afterEach, describe, expect, it, vi } from 'vitest';

describe('publicAssetPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefixes root-relative upload URLs with the configured basePath', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/v1');
    const { publicAssetPath } = await import('./assets');

    expect(publicAssetPath('/uploads/2026/07/image.webp')).toBe('/v1/uploads/2026/07/image.webp');
  });

  it('does not double-prefix an already-prefixed asset URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/v1');
    const { publicAssetPath } = await import('./assets');

    expect(publicAssetPath('/v1/uploads/2026/07/image.webp')).toBe('/v1/uploads/2026/07/image.webp');
  });
});
