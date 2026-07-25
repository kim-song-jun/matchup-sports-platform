import { GabiaSmsSender } from './gabia-sms-sender';

describe('GabiaSmsSender', () => {
  const OLD_ENV = process.env;
  const OLD_FETCH = global.fetch;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.GABIA_SMS_ID;
    delete process.env.GABIA_API_KEY;
    delete process.env.GABIA_SENDER_NUMBER;
  });

  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = OLD_FETCH;
  });

  function setEnv() {
    process.env.GABIA_SMS_ID = 'id1';
    process.env.GABIA_API_KEY = 'key1';
    process.env.GABIA_SENDER_NUMBER = '01011112222';
  }

  function tokenResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access-tok',
        refresh_token: 'refresh-tok',
        expires_in: 3600,
        token_type: 'bearer',
        create_on: '2026-01-01',
        ...overrides,
      }),
      text: async () => '',
    };
  }

  function sendResponse(body: Record<string, unknown>) {
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => '',
    };
  }

  it('3개 시크릿이 모두 있어야 enabled=true', () => {
    setEnv();
    expect(new GabiaSmsSender().enabled).toBe(true);

    delete process.env.GABIA_API_KEY;
    expect(new GabiaSmsSender().enabled).toBe(false);
  });

  it('첫 send는 토큰 발급 후 발송하며 각 요청 형식을 정확히 맞춘다', async () => {
    setEnv();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(sendResponse({ code: '200' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      new GabiaSmsSender().send('01033334444', '[Teameet] 인증번호 123456'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://sms.gabia.com/oauth/token');
    const tokenHeaders = tokenInit.headers as Record<string, string>;
    expect(tokenHeaders['Authorization']).toBe(
      `Basic ${Buffer.from('id1:key1').toString('base64')}`,
    );
    expect(tokenHeaders['content-type']).toBe('application/x-www-form-urlencoded');
    expect(tokenInit.body).toBe('grant_type=client_credentials');

    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sendUrl).toBe('https://sms.gabia.com/api/send/sms');
    const sendHeaders = sendInit.headers as Record<string, string>;
    expect(sendHeaders['Authorization']).toBe(
      `Basic ${Buffer.from('id1:access-tok').toString('base64')}`,
    );
    const sendBody = new URLSearchParams(sendInit.body as string);
    expect(sendBody.get('phone')).toBe('01033334444');
    expect(sendBody.get('callback')).toBe('01011112222');
    expect(sendBody.get('message')).toBe('[Teameet] 인증번호 123456');
    expect(sendBody.get('refkey')).toBe('refresh-tok');
  });

  it('HTTP 200이어도 응답 code가 false면 실패로 throw (HTTP-200-on-failure 회귀 가드)', async () => {
    setEnv();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        sendResponse({ code: false, message: '잘못된 번호', code_detail: 'invalid_phone' }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(new GabiaSmsSender().send('01033334444', 't')).rejects.toThrow(
      'Gabia send failed: false',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('토큰 TTL 내 연속 2회 send는 토큰 발급을 1회만 호출한다', async () => {
    setEnv();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(sendResponse({ code: '200' }))
      .mockResolvedValueOnce(sendResponse({ code: '200' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const sender = new GabiaSmsSender();
    await sender.send('01033334444', 't1');
    await sender.send('01033334444', 't2');

    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => url === 'https://sms.gabia.com/oauth/token',
    );
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('토큰이 TTL(skew 포함)을 지나 만료되면 다음 send에서 재발급한다', async () => {
    setEnv();
    // fetchWithTimeout 의 abort setTimeout 과 간섭하지 않도록 fake timer 대신 Date.now 를
    // 직접 제어해 만료 판정(getToken)·expiresAt 계산(issueToken)만 시간 이동시킨다.
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(tokenResponse({ expires_in: 3600 }))
        .mockResolvedValueOnce(sendResponse({ code: '200' }))
        .mockResolvedValueOnce(tokenResponse({ expires_in: 3600 }))
        .mockResolvedValueOnce(sendResponse({ code: '200' }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const sender = new GabiaSmsSender();
      await sender.send('01033334444', 't1'); // expiresAt = 1_000_000 + 3_600_000 - 60_000 = 4_540_000
      now = 4_540_001; // 만료 경계(skew 반영)를 막 지난 시점
      await sender.send('01033334444', 't2'); // 캐시 만료 → 재발급

      const tokenCalls = fetchMock.mock.calls.filter(
        ([url]) => url === 'https://sms.gabia.com/oauth/token',
      );
      expect(tokenCalls).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('발송이 token_verification_failed면 토큰 재발급 후 1회만 재시도한다', async () => {
    setEnv();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'stale-tok' }))
      .mockResolvedValueOnce(sendResponse({ code: 'token_verification_failed', message: 'expired' }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'fresh-tok' }))
      .mockResolvedValueOnce(sendResponse({ code: '200' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(new GabiaSmsSender().send('01033334444', 't')).resolves.toBeUndefined();

    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => url === 'https://sms.gabia.com/oauth/token',
    );
    expect(tokenCalls).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [, retryInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe(
      `Basic ${Buffer.from('id1:fresh-tok').toString('base64')}`,
    );
  });

  it('토큰과 무관한 실패는 재시도 없이 즉시 throw한다', async () => {
    setEnv();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        sendResponse({ code: false, message: '잔액 부족', code_detail: 'insufficient_balance' }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(new GabiaSmsSender().send('01033334444', 't')).rejects.toThrow(
      'Gabia send failed: false',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
