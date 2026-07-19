import type { Options as PinoHttpOptions } from 'pino-http';

/**
 * pino-http 로깅 설정 — app.module.ts 와 이 파일을 검증하는 테스트가 동일 설정을 공유해
 * 드리프트를 방지한다.
 *
 * - req.url: 쿼리스트링에 실린 PII(예: GET /auth/check-email?email=...)가 그대로 찍히는 것을
 *   막기 위해 경로만 남기고 쿼리스트링은 제거한다.
 * - req.headers: 반드시 포함한다. headers 자체를 통째로 비우면 아래 redact.paths 의
 *   req.headers.* 항목들이 지울 대상이 없어 dead-config 가 되어버린다 — authorization/cookie/
 *   x-v1-user-email 은 redact 로 실제로 제거되고, user-agent 등 안전한 헤더는 로그에 남는다.
 */
export function buildPinoHttpOptions(): PinoHttpOptions {
  return {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    serializers: {
      req(req: { id?: string; method: string; url: string; headers?: Record<string, unknown> }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
          headers: req.headers,
        };
      },
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-v1-user-email"]',
        'req.headers["x-v1-user-id"]',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },
  };
}
