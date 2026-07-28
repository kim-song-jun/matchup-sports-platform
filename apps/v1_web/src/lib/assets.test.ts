import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('publicAssetPath', () => {
  it('keeps public assets at the web root when a legacy browser base path is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/legacy');
    const { publicAssetPath } = await import('./assets');

    expect(publicAssetPath('/brand/teameet-mark.png')).toBe('/brand/teameet-mark.png');
  });
});
