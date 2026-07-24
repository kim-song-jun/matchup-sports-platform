import { SolapiSmsSender } from './solapi-sms-sender';

describe('SolapiSmsSender', () => {
  const OLD_ENV = process.env;
  const OLD_FETCH = global.fetch;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
  });

  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = OLD_FETCH;
  });

  it('3개 시크릿이 모두 있어야 enabled=true', () => {
    process.env.SOLAPI_API_KEY = 'k';
    process.env.SOLAPI_API_SECRET = 's';
    process.env.SOLAPI_SENDER_NUMBER = '01000000000';
    expect(new SolapiSmsSender().enabled).toBe(true);

    delete process.env.SOLAPI_API_SECRET;
    expect(new SolapiSmsSender().enabled).toBe(false);
  });

  it('send는 solapi /messages/v4/send로 from/to/text를 POST하고 HMAC-SHA256 Authorization을 붙인다', async () => {
    process.env.SOLAPI_API_KEY = 'key1';
    process.env.SOLAPI_API_SECRET = 'secret1';
    process.env.SOLAPI_SENDER_NUMBER = '01011112222';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ groupId: 'G1' }),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new SolapiSmsSender().send('01033334444', '[Teameet] 인증번호 123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.solapi.com/messages/v4/send');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(
      /^HMAC-SHA256 apiKey=key1, date=.+, salt=[0-9a-f]+, signature=[0-9a-f]{64}$/,
    );
    const body = JSON.parse(init.body as string);
    expect(body.message).toEqual({
      to: '01033334444',
      from: '01011112222',
      text: '[Teameet] 인증번호 123456',
    });
  });

  it('비2xx 응답이면 throw (발송 실패는 흡수하지 않음)', async () => {
    process.env.SOLAPI_API_KEY = 'k';
    process.env.SOLAPI_API_SECRET = 's';
    process.env.SOLAPI_SENDER_NUMBER = '01000000000';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => 'bad number',
    }) as unknown as typeof fetch;

    await expect(new SolapiSmsSender().send('01033334444', 't')).rejects.toThrow('Solapi send failed: 400');
  });
});
