import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { FcmAccessTokenProvider } from './fcm-access-token-provider';

describe('FcmAccessTokenProvider', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const clientEmail = 'push-sender@teameet-alpha.iam.gserviceaccount.com';
  let nowMs = 1_700_000_000_000;
  let fetcher: jest.Mock;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    fetcher = jest.fn().mockImplementation(async () => new Response(JSON.stringify({
      access_token: 'short-lived-access-token',
      expires_in: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });

  function decode(assertion: string) {
    const [header, claims, signature] = assertion.split('.');
    return {
      header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
      claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
      signature: Buffer.from(signature, 'base64url'),
      signingInput: header + '.' + claims,
    };
  }

  it('signs and exchanges the Google OAuth assertion', async () => {
    const provider = new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher);
    await expect(provider.current()).resolves.toBe('short-lived-access-token');

    const form = fetcher.mock.calls[0][1].body as URLSearchParams;
    const assertion = decode(form.get('assertion')!);
    expect(assertion.header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(assertion.claims).toEqual({
      iss: clientEmail,
      scope: FcmAccessTokenProvider.SCOPE,
      aud: FcmAccessTokenProvider.TOKEN_ENDPOINT,
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    expect(verifySignature(
      'RSA-SHA256', Buffer.from(assertion.signingInput), publicKey, assertion.signature,
    )).toBe(true);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('PRIVATE KEY');
  });

  it('caches tokens and deduplicates concurrent refreshes', async () => {
    const provider = new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher);
    const [first, second] = await Promise.all([provider.current(), provider.current()]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);

    nowMs += 55 * 60_000 - 1;
    await provider.current();
    expect(fetcher).toHaveBeenCalledTimes(1);
    nowMs += 1;
    await provider.current();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('accepts private keys delivered with escaped newlines', async () => {
    const provider = new FcmAccessTokenProvider(
      pem.replace(/\n/g, '\\n'), clientEmail, () => nowMs, fetcher,
    );
    await expect(provider.current()).resolves.toBe('short-lived-access-token');
  });

  it('fails visibly on rejected or malformed exchanges', async () => {
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher).current())
      .rejects.toThrow('HTTP 401');

    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 }));
    await expect(new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher).current())
      .rejects.toThrow('no access token');
  });

  it('invalidates a cached token after authorization rejection', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'first', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'second', expires_in: 3600 }), { status: 200 }));
    const provider = new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher);
    await expect(provider.current()).resolves.toBe('first');
    provider.invalidate('first');
    await expect(provider.current()).resolves.toBe('second');
  });

  it('does not let a late rejection erase a token that was already refreshed', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'first', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'second', expires_in: 3600 }), { status: 200 }));
    const provider = new FcmAccessTokenProvider(pem, clientEmail, () => nowMs, fetcher);
    await provider.current();
    provider.invalidate('first');
    await expect(provider.current()).resolves.toBe('second');

    provider.invalidate('first');
    await expect(provider.current()).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
