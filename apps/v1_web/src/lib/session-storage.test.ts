import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeRedirectPath, stripConfiguredBasePath } from './session-storage';

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
  if (originalBasePath === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
  }
});

describe('sanitizeRedirectPath', () => {
  it('keeps v1 alias redirects when no configured basePath exists', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(sanitizeRedirectPath('/v1/my')).toBe('/v1/my');
  });

  it('strips the configured basePath before handing the path to Next router', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(sanitizeRedirectPath('/v1/my')).toBe('/my');
    expect(sanitizeRedirectPath('/v1/v1/my')).toBe('/my');
  });

  it('rejects login redirects after basePath normalization', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(sanitizeRedirectPath('/v1/login?redirect=%2Fmy')).toBeNull();
  });

  it('rejects protocol-relative redirects after basePath normalization', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(sanitizeRedirectPath('/v1//example.com')).toBeNull();
  });
});

describe('stripConfiguredBasePath', () => {
  it('does not strip similar prefixes', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(stripConfiguredBasePath('/v10/my')).toBe('/v10/my');
  });
});
