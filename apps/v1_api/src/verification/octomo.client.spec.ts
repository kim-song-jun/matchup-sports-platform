import { OctomoApiError, OctomoClient, OctomoDisabledError } from './octomo.client';

describe('OctomoClient', () => {
  const OLD = process.env.OCTOMO_API_KEY;
  afterEach(() => { process.env.OCTOMO_API_KEY = OLD; jest.restoreAllMocks(); });

  it('is disabled without an API key and throws OctomoDisabledError', async () => {
    delete process.env.OCTOMO_API_KEY;
    const client = new OctomoClient();
    expect(client.enabled).toBe(false);
    await expect(client.messageExists('01012345678', 'ABC123')).rejects.toBeInstanceOf(OctomoDisabledError);
  });

  it('posts to /message/exists with the Octomo auth header and returns exists', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ exists: true }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const client = new OctomoClient();
    const result = await client.messageExists('01012345678', 'ABC123', 5);
    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.octoverse.kr/octomo/v1/public/message/exists');
    expect((init!.headers as Record<string, string>).authorization).toBe('Octomo test-key');
    expect(JSON.parse(init!.body as string)).toEqual({ mobileNum: '01012345678', text: 'ABC123', withinMinutes: 5 });
  });

  it('returns false when Octomo reports exists:false', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ exists: false }), { status: 201 }));
    expect(await new OctomoClient().messageExists('01012345678', 'ABC123')).toBe(false);
  });

  it('throws OctomoApiError on non-2xx', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad request', { status: 400 }));
    await expect(new OctomoClient().messageExists('01012345678', 'X')).rejects.toBeInstanceOf(OctomoApiError);
  });

  it('createQrCode returns the qrCode data URL', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ qrCode: 'data:image/png;base64,AAA' }), { status: 201 }));
    expect(await new OctomoClient().createQrCode('ABC123')).toBe('data:image/png;base64,AAA');
  });

  it('aborts with OctomoApiError(504) when a hung request exceeds the timeout', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.useFakeTimers();
    // 옥토모가 응답하지 않는 상황: abort 신호에만 반응하는 영원히 pending인 fetch를 모사한다.
    jest.spyOn(global, 'fetch').mockImplementation(((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
      })) as never);
    const pending = new OctomoClient().messageExists('01012345678', 'ABC123');
    const assertion = expect(pending).rejects.toMatchObject({ name: 'OctomoApiError', status: 504 });
    await jest.advanceTimersByTimeAsync(5001); // OCTOMO_TIMEOUT_MS(5000) 초과 → controller.abort()
    await assertion;
    jest.useRealTimers();
  });
});
