import { maskSensitive, maskSensitiveText, truncateForLog, SENSITIVE_KEYS } from './mask-sensitive';

describe('maskSensitive', () => {
  it('masks a top-level sensitive key', () => {
    const input = { password: 'hunter2', nickname: 'jun' };
    const result = maskSensitive(input);
    expect(result).toEqual({ password: '[REDACTED]', nickname: 'jun' });
  });

  // 키 이름이 안전해 보여도 값 안에 시크릿이 박혀 오는 자리가 있다. referer 헤더가
  // 대표적이다 — 카카오 콜백 URL이 통째로 담겨 인가코드가 값 안쪽에 들어온다.
  it('scrubs secrets embedded inside string values whose key is not sensitive', () => {
    const masked = maskSensitive({
      referer: 'https://alpha.teameet.co.kr/callback/kakao?code=REAL_AUTH_CODE&state=xyz',
      note: 'no secret here',
    });

    expect(masked.referer).toContain('[REDACTED]');
    expect(masked.referer).not.toContain('REAL_AUTH_CODE');
    // 시크릿이 없는 문자열은 건드리지 않는다.
    expect(masked.note).toBe('no secret here');
  });

  it('masks sensitive keys nested inside objects', () => {
    const input = {
      user: {
        profile: { phoneNumber: '010-1234-5678', nickname: 'jun' },
      },
    };
    const result = maskSensitive(input);
    expect(result).toEqual({
      user: { profile: { phoneNumber: '[REDACTED]', nickname: 'jun' } },
    });
  });

  it('masks sensitive keys inside objects contained in arrays', () => {
    const input = {
      items: [
        { token: 'abc.def.ghi', label: 'a' },
        { label: 'b', accessToken: 'xyz' },
      ],
    };
    const result = maskSensitive(input);
    expect(result).toEqual({
      items: [
        { token: '[REDACTED]', label: 'a' },
        { label: 'b', accessToken: '[REDACTED]' },
      ],
    });
  });

  it('matches sensitive keys case-insensitively (Authorization / AUTHORIZATION)', () => {
    const input = { Authorization: 'Bearer abc', AUTHORIZATION: 'Bearer def', authorization: 'Bearer ghi' };
    const result = maskSensitive(input);
    expect(result).toEqual({
      Authorization: '[REDACTED]',
      AUTHORIZATION: '[REDACTED]',
      authorization: '[REDACTED]',
    });
  });

  it('masks the kakao auth code and session cookie keys specifically', () => {
    const input = { code: 'kakao-auth-code', cookie: 'session=abc123', setCookie: 'session=xyz' };
    const result = maskSensitive(input);
    expect(result).toEqual({
      code: '[REDACTED]',
      cookie: '[REDACTED]',
      setCookie: '[REDACTED]',
    });
  });

  it('does not mutate the original input', () => {
    const input = { password: 'hunter2', nested: { token: 'abc' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    maskSensitive(input);
    expect(input).toEqual(snapshot);
  });

  it('handles circular references without infinite looping', () => {
    type Circular = { name: string; password: string; self?: Circular };
    const input: Circular = { name: 'root', password: 'hunter2' };
    input.self = input;

    const result = maskSensitive(input) as Circular;

    expect(result.password).toBe('[REDACTED]');
    expect(result.self).toBe(result);
  });

  it('handles circular references inside arrays without infinite looping', () => {
    type Node = { label: string; children: Node[] };
    const node: Node = { label: 'a', children: [] };
    node.children.push(node);

    const result = maskSensitive(node) as Node;

    expect(result.children[0]).toBe(result);
  });

  it('passes through primitives, null, and undefined unchanged', () => {
    expect(maskSensitive('hello')).toBe('hello');
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive(true)).toBe(true);
    expect(maskSensitive(null)).toBe(null);
    expect(maskSensitive(undefined)).toBe(undefined);
  });

  it('clones Date instances instead of masking or mutating them', () => {
    const date = new Date('2026-07-26T00:00:00.000Z');
    const result = maskSensitive({ createdAt: date }) as { createdAt: Date };
    expect(result.createdAt).toEqual(date);
    expect(result.createdAt).not.toBe(date);
  });

  it('covers the documented minimum sensitive key list', () => {
    const minimum = [
      'password',
      'passwordConfirm',
      'newPassword',
      'token',
      'accessToken',
      'refreshToken',
      'idToken',
      'code',
      'authorization',
      'cookie',
      'setCookie',
      'secret',
      'apiKey',
      'phone',
      'phoneNumber',
      'ssn',
      'birthDate',
      'cardNumber',
      'cvc',
    ];
    const lowered = SENSITIVE_KEYS.map((key) => key.toLowerCase());
    for (const key of minimum) {
      expect(lowered).toContain(key.toLowerCase());
    }
  });
});

describe('maskSensitiveText', () => {
  it('masks a sensitive query-string value (NestJS built-in 404 "Cannot GET /path?token=...")', () => {
    const input = 'Cannot GET /api/v1/aaaaa?password=hunter2&token=eyJhbGciOiJIUzI1NiJ9';
    expect(maskSensitiveText(input)).toBe('Cannot GET /api/v1/aaaaa?password=[REDACTED]&token=[REDACTED]');
  });

  it('is case-insensitive when matching query-string keys', () => {
    expect(maskSensitiveText('/x?Token=abc')).toBe('/x?Token=[REDACTED]');
  });

  it('masks a "key":"value" pattern embedded in free text', () => {
    const input = 'upstream responded with {"authorization":"Bearer abc","nickname":"jun"}';
    expect(maskSensitiveText(input)).toBe(
      'upstream responded with {"authorization":"[REDACTED]","nickname":"jun"}',
    );
  });

  it('leaves non-sensitive query params and text untouched', () => {
    expect(maskSensitiveText('/matches?page=2&sort=asc')).toBe('/matches?page=2&sort=asc');
  });

  it('leaves plain text with no key=value pattern untouched', () => {
    expect(maskSensitiveText('boom, something broke')).toBe('boom, something broke');
  });
});

describe('truncateForLog', () => {
  it('returns short strings unchanged', () => {
    expect(truncateForLog('hello')).toBe('hello');
  });

  it('serializes objects to JSON', () => {
    expect(truncateForLog({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
  });

  it('truncates serialized values over the 4000-char cap by default', () => {
    const longString = 'x'.repeat(5000);
    const result = truncateForLog(longString);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThan(5000);
    expect(result!.endsWith('…[TRUNCATED]')).toBe(true);
  });

  it('honors a custom max length', () => {
    const result = truncateForLog('abcdefghij', 4);
    expect(result).toBe('abcd…[TRUNCATED]');
  });

  it('returns null for null and undefined input', () => {
    expect(truncateForLog(null)).toBeNull();
    expect(truncateForLog(undefined)).toBeNull();
  });

  it('does not throw on BigInt values', () => {
    expect(() => truncateForLog({ big: BigInt(10) })).not.toThrow();
    expect(truncateForLog({ big: BigInt(10) })).toBe('{"big":"10"}');
  });

  it('does not throw on circular references and returns a fallback marker', () => {
    type Circular = { name: string; self?: Circular };
    const input: Circular = { name: 'root' };
    input.self = input;

    expect(() => truncateForLog(input)).not.toThrow();
    expect(truncateForLog(input)).toBe('[UNSERIALIZABLE]');
  });
});
