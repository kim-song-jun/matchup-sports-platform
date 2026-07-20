import { Writable } from 'stream';
import pinoHttp from 'pino-http';
import { buildPinoHttpOptions } from './pino-http.config';

/**
 * app.module.ts 의 실제 pinoHttp 설정을 진짜 pino-http 인스턴스에 물려 로그 라인을 캡처하고,
 * redact.paths 가 죽은 설정이 아니라 실제로 동작하는지 end-to-end 로 검증한다.
 * (배경: 과거 req 커스텀 serializer 가 {id, method, url} 만 반환해 req.headers.* redact 경로가
 * 지울 대상이 없는 dead-config 였다 — 이 테스트는 그 회귀를 다시 잡아낸다.)
 */
function captureLogLines(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('buildPinoHttpOptions', () => {
  // pino-pretty transport (dev-only console 출력) 은 worker-thread destination 을 만들어
  // 이 테스트가 검증하려는 redact/serializer 계약과 무관하게 캡처 stream 을 우회한다.
  // 실제 redaction 계약만 검증하기 위해 transport 는 제거하고 캡처용 stream 으로 직접 보낸다.
  function optionsForTest() {
    const { transport: _transport, ...rest } = buildPinoHttpOptions();
    return rest;
  }

  it('redacts sensitive req headers while preserving safe headers and stripping the query string', () => {
    const { stream, lines } = captureLogLines();
    const { logger } = pinoHttp(optionsForTest(), stream);

    const req = {
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/auth/check-email?email=secret@example.com',
      headers: {
        authorization: 'Bearer topsecret',
        cookie: 'session=abc',
        'x-v1-user-email': 'me@example.com',
        'x-v1-user-id': 'user-123',
        'user-agent': 'jest-test-agent',
      },
    };

    logger.info({ req }, 'test log');

    const [entry] = lines();
    const loggedReq = entry.req as Record<string, unknown>;
    expect(loggedReq.url).toBe('/api/v1/auth/check-email');
    expect(loggedReq.headers).not.toHaveProperty('authorization');
    expect(loggedReq.headers).not.toHaveProperty('cookie');
    expect(loggedReq.headers).not.toHaveProperty('x-v1-user-email');
    expect(loggedReq.headers).not.toHaveProperty('x-v1-user-id');
    expect((loggedReq.headers as Record<string, unknown>)['user-agent']).toBe('jest-test-agent');
  });

  it('redacts req.headers.referer to prevent leaking OAuth code/state carried by same-origin Referer headers', () => {
    const { stream, lines } = captureLogLines();
    const { logger } = pinoHttp(optionsForTest(), stream);

    const req = {
      id: 'req-2',
      method: 'GET',
      url: '/api/v1/auth/kakao',
      headers: {
        // strict-origin-when-cross-origin 하에서 same-origin fetch 는 쿼리스트링을 포함한
        // 전체 URL을 Referer 로 보낸다 — 카카오 콜백 페이지의 code/state 가 여기 실린다.
        referer:
          'https://teameet.example.com/callback/kakao?code=abcd1234&state=csrf-secret-state',
        'user-agent': 'jest-test-agent',
      },
    };

    logger.info({ req }, 'test log');

    const [entry] = lines();
    const loggedReq = entry.req as Record<string, unknown>;
    expect(loggedReq.headers).not.toHaveProperty('referer');
    expect((loggedReq.headers as Record<string, unknown>)['user-agent']).toBe('jest-test-agent');
  });

  it('redacts res.headers["set-cookie"] while preserving other response headers', () => {
    const { stream, lines } = captureLogLines();
    const { logger } = pinoHttp(optionsForTest(), stream);

    const res = {
      headersSent: true,
      statusCode: 200,
      getHeaders: () => ({ 'content-type': 'application/json', 'set-cookie': 'sid=xyz' }),
    };

    logger.info({ res }, 'test log');

    const [entry] = lines();
    const loggedRes = entry.res as Record<string, unknown>;
    expect(loggedRes.statusCode).toBe(200);
    expect(loggedRes.headers).not.toHaveProperty('set-cookie');
    expect((loggedRes.headers as Record<string, unknown>)['content-type']).toBe('application/json');
  });
});
