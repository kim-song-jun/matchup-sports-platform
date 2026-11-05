import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestNativeAppleLinkPayload, requestNativeKakaoLinkPayload } from './native-social-credentials';

const api = vi.hoisted(() => ({ v1Post: vi.fn() }));
vi.mock('./api-client', () => ({ v1Post: api.v1Post }));

let reply: Record<string, unknown> = {};

/** 셸을 흉내 낸다: 요청을 받으면 같은 requestId 로 결과 이벤트를 쏜다. */
function installShell(resultEvent: string) {
  const postMessage = vi.fn((message: string) => {
    const request = JSON.parse(message) as { requestId: string };
    window.dispatchEvent(new CustomEvent(resultEvent, { detail: { requestId: request.requestId, ...reply } }));
  });
  window.TeameetNative = { postMessage, supports: ['sign-in-with-kakao', 'sign-in-with-apple'] };
  return postMessage;
}

const sentMessage = (postMessage: ReturnType<typeof installShell>) =>
  JSON.parse(postMessage.mock.calls[0][0]) as Record<string, unknown>;

afterEach(() => {
  delete window.TeameetNative;
  vi.clearAllMocks();
});

describe('requestNativeKakaoLinkPayload', () => {
  let postMessage: ReturnType<typeof installShell>;
  beforeEach(() => {
    postMessage = installShell('teameet:native-kakao-result');
  });

  it('returns the SDK token for the link call and never calls the login API', async () => {
    reply = { accessToken: 'kakao-token' };
    await expect(requestNativeKakaoLinkPayload()).resolves.toEqual({ status: 'ready', payload: { accessToken: 'kakao-token' } });
    expect(api.v1Post).not.toHaveBeenCalled();
  });

  it('asks the shell for no extra consent scopes', async () => {
    reply = { accessToken: 'kakao-token' };
    await requestNativeKakaoLinkPayload();
    expect(sentMessage(postMessage)).toMatchObject({ type: 'sign-in-with-kakao' });
    expect(sentMessage(postMessage)).not.toHaveProperty('scopes');
  });

  it('reports a dismissed sheet as cancelled, not failed', async () => {
    reply = { cancelled: true };
    await expect(requestNativeKakaoLinkPayload()).resolves.toEqual({ status: 'cancelled' });
  });

  it('reports a shell error with its reason', async () => {
    reply = { error: 'KOE101' };
    await expect(requestNativeKakaoLinkPayload()).resolves.toEqual({ status: 'failed', reason: 'KOE101' });
  });

  it('fails when the shell answered without a token and without a reason', async () => {
    reply = {};
    await expect(requestNativeKakaoLinkPayload()).resolves.toEqual({ status: 'failed', reason: 'missing-token' });
  });
});

describe('requestNativeAppleLinkPayload', () => {
  let postMessage: ReturnType<typeof installShell>;
  beforeEach(() => {
    postMessage = installShell('teameet:native-apple-result');
    api.v1Post.mockResolvedValue({ nonce: 'server-nonce' });
  });

  it('gets the nonce from the server first and sends that same nonce back with the identity token', async () => {
    reply = { ok: true, identityToken: 'identity-token', authorizationCode: 'auth-code', fullName: '김팀밋' };
    await expect(requestNativeAppleLinkPayload()).resolves.toEqual({
      status: 'ready',
      payload: { identityToken: 'identity-token', nonce: 'server-nonce', authorizationCode: 'auth-code', fullName: '김팀밋' },
    });
    expect(api.v1Post).toHaveBeenCalledWith('/auth/apple/nonce');
    expect(sentMessage(postMessage)).toMatchObject({ type: 'sign-in-with-apple', nonce: 'server-nonce' });
  });

  it('leaves out the fields Apple did not send (name only arrives on the first authorization)', async () => {
    reply = { ok: true, identityToken: 'identity-token' };
    const result = await requestNativeAppleLinkPayload();
    expect(result).toEqual({ status: 'ready', payload: { identityToken: 'identity-token', nonce: 'server-nonce' } });
    expect(result.status === 'ready' && 'fullName' in result.payload).toBe(false);
  });

  it('reports a dismissed sheet (ok false, no error) as cancelled', async () => {
    reply = { ok: false };
    await expect(requestNativeAppleLinkPayload()).resolves.toEqual({ status: 'cancelled' });
  });

  it('reports a refusal that carries a reason as failed — it is not a silent cancel', async () => {
    reply = { ok: false, error: 'AuthorizationError 1000' };
    await expect(requestNativeAppleLinkPayload()).resolves.toEqual({ status: 'failed', reason: 'AuthorizationError 1000' });
  });

  it('fails when Apple said ok but sent no identity token', async () => {
    reply = { ok: true };
    await expect(requestNativeAppleLinkPayload()).resolves.toEqual({ status: 'failed', reason: 'missing-token' });
  });

  it('does not open the Apple sheet when the nonce request fails', async () => {
    api.v1Post.mockRejectedValue(new Error('nonce unavailable'));
    await expect(requestNativeAppleLinkPayload()).rejects.toThrow('nonce unavailable');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
