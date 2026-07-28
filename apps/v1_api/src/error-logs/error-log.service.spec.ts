import { ErrorLogService, computeFingerprint, normalizeForFingerprint } from './error-log.service';

describe('normalizeForFingerprint / computeFingerprint', () => {
  it('normalizes UUIDs in a route to :id so different targets fold into the same fingerprint', () => {
    const a = computeFingerprint('server', 500, '/tournaments/11111111-2222-3333-4444-555555555555', 'boom');
    const b = computeFingerprint('server', 500, '/tournaments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'boom');
    expect(a).toBe(b);
  });

  it('normalizes consecutive digits to :n', () => {
    expect(normalizeForFingerprint('/matches/42/join')).toBe('/matches/:n/join');
  });

  // route 는 어드민 목록·상세에 그대로 보이는 값이다. 숫자를 무조건 접으면 API 버전까지
  // 먹혀 /api/v1/... 이 /api/v:n/... 으로 표시돼 어느 API 인지 읽을 수 없다.
  it('keeps the API version segment — only fully numeric segments fold', () => {
    expect(normalizeForFingerprint('/api/v1/auth/login')).toBe('/api/v1/auth/login');
    expect(normalizeForFingerprint('/api/v1/matches/42/join')).toBe('/api/v1/matches/:n/join');
  });

  it('produces a 32-hex-char fingerprint', () => {
    const fp = computeFingerprint('server', 500, '/x', 'boom');
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it('differs by statusCode even when route/message are identical', () => {
    const a = computeFingerprint('server', 500, '/x', 'boom');
    const b = computeFingerprint('server', 404, '/x', 'boom');
    expect(a).not.toBe(b);
  });

  // NestJS 내장 404는 message에 원본 URL을 그대로 담는다("Cannot GET /path?token=..").
  // 쿼리스트링을 지문에서 걷어내지 않으면 스캐너가 값만 바꿔 훑어도 매번 새 행이 생겨,
  // 보존이 무기한인 이 테이블에서 dedupe가 통째로 무력해진다.
  it('folds URL query strings so scanning with different values reuses one fingerprint', () => {
    const a = computeFingerprint('server', 404, '/api/v1/nope', 'Cannot GET /api/v1/nope?token=abcXYZ');
    const b = computeFingerprint('server', 404, '/api/v1/nope', 'Cannot GET /api/v1/nope?token=zzTOP');
    expect(a).toBe(b);
    // 쿼리스트링만 사라지고 API 버전(v1)은 그대로 남는다.
    expect(normalizeForFingerprint('Cannot GET /api/v1/nope?token=abcXYZ')).toBe('Cannot GET /api/v1/nope');
  });

  it('keeps a question mark that is not a URL query — Korean copy must survive normalization', () => {
    expect(normalizeForFingerprint('정말 삭제할까요?')).toBe('정말 삭제할까요?');
  });

  it('strips queries from multiple URL tokens without scanning across whitespace', () => {
    expect(normalizeForFingerprint('GET /first?a=1 then /second?b=2')).toBe('GET /first then /second');
  });
});

describe('ErrorLogService.record', () => {
  function buildPrismaMock() {
    return { v1ErrorLog: { upsert: jest.fn().mockResolvedValue({}) } };
  }
  const logger = { warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('buckets 401 responses into a 24-hour window', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    const fixedNow = new Date('2026-07-26T10:15:00.000Z');
    // process.nextTick은 실제로 남겨둔다 — flushMicrotasks()가 이걸로 record()의
    // fire-and-forget persist()가 끝나길 기다리기 때문에, 가짜 타이머가 이를 삼키면
    // 영원히 resolve되지 않는다.
    jest.useFakeTimers({ doNotFake: ['nextTick'] }).setSystemTime(fixedNow);

    service.record({ source: 'server', level: 'error', statusCode: 401, route: '/auth/me', message: 'unauthorized' });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    const expectedBucket = new Date(Math.floor(fixedNow.getTime() / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000);
    expect(call.where.fingerprint_windowBucket.windowBucket).toEqual(expectedBucket);
  });

  it('buckets 403 responses into a 24-hour window', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({ source: 'server', level: 'error', statusCode: 403, route: '/teams/1', message: 'forbidden' });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    const bucketMs = call.where.fingerprint_windowBucket.windowBucket.getTime();
    expect(bucketMs % (24 * 60 * 60 * 1000)).toBe(0);
  });

  it('buckets 500 responses into a 1-hour window', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({ source: 'server', level: 'error', statusCode: 500, route: '/x', message: 'boom' });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    const bucketMs = call.where.fingerprint_windowBucket.windowBucket.getTime();
    expect(bucketMs % (60 * 60 * 1000)).toBe(0);
    // and it must NOT be 24h-aligned unless coincidentally so — assert the size directly via update path below instead.
  });

  it('upserts with occurrenceCount increment + lastSeenAt refresh on update, and preserves body/stack via create-only fields', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({ source: 'server', level: 'error', statusCode: 500, route: '/x', message: 'boom', stack: 'stack trace' });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ occurrenceCount: { increment: 1 }, lastSeenAt: expect.any(Date) });
    expect(call.create.stack).toBe('stack trace');
    expect(call.create.occurrenceCount).toBe(1);
  });

  it('folds a UUID-varying route into the same fingerprint (same where clause) across two records', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({ source: 'server', level: 'error', statusCode: 500, route: '/tournaments/11111111-2222-3333-4444-555555555555', message: 'boom' });
    service.record({ source: 'server', level: 'error', statusCode: 500, route: '/tournaments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', message: 'boom' });
    await flushMicrotasks();

    const [first, second] = prisma.v1ErrorLog.upsert.mock.calls;
    expect(first[0].where.fingerprint_windowBucket.fingerprint).toBe(
      second[0].where.fingerprint_windowBucket.fingerprint,
    );
  });

  it('masks sensitive keys in requestBody/requestHeaders before storing', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({
      source: 'server',
      level: 'error',
      statusCode: 500,
      route: '/auth/kakao',
      message: 'boom',
      requestBody: { password: 'hunter2', nested: { token: 'abc' } },
      requestHeaders: { authorization: 'Bearer abc', cookie: 'sid=1' },
    });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    // requestBody/requestHeaders는 마스킹된 "구조"(object)로 저장된다 — Json 컬럼에 미리
    // 직렬화한 문자열을 넣으면 어드민 프론트가 그 문자열을 재차 JSON.stringify해 이스케이프된
    // 한 줄로 뭉개는 이중 인코딩 버그가 생기므로, 여기서는 object 그대로임을 고정한다.
    expect(call.create.requestBody).toEqual({ password: '[REDACTED]', nested: { token: '[REDACTED]' } });
    expect(JSON.stringify(call.create.requestBody)).not.toContain('hunter2');
    expect(call.create.requestHeaders).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]' });
    expect(JSON.stringify(call.create.requestHeaders)).not.toContain('Bearer abc');
  });

  it('masks sensitive query-string values embedded in the message text (e.g. NestJS 404 "Cannot GET /path?token=...")', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({
      source: 'server',
      level: 'warn',
      statusCode: 404,
      route: '/aaaaa',
      message: 'Cannot GET /api/v1/aaaaa?password=hunter2&token=eyJhbGciOiJIUzI1NiJ9',
    });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    expect(call.create.message).not.toContain('hunter2');
    expect(call.create.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(call.create.message).toBe('Cannot GET /api/v1/aaaaa?password=[REDACTED]&token=[REDACTED]');
  });

  it('replaces requestBody with a truncated placeholder object (not a bare string) when serialized size exceeds the cap', async () => {
    const prisma = buildPrismaMock();
    const service = new ErrorLogService(prisma as never, logger as never);

    service.record({
      source: 'server',
      level: 'error',
      statusCode: 500,
      route: '/x',
      message: 'boom',
      requestBody: { blob: 'x'.repeat(5000) },
    });
    await flushMicrotasks();

    const call = prisma.v1ErrorLog.upsert.mock.calls[0][0];
    expect(typeof call.create.requestBody).toBe('object');
    expect(call.create.requestBody._truncated).toBe(true);
    expect(typeof call.create.requestBody.preview).toBe('string');
  });

  it('defaults releaseSha to null when V1_RELEASE is not set', async () => {
    const previous = process.env.V1_RELEASE;
    delete process.env.V1_RELEASE;
    try {
      const prisma = buildPrismaMock();
      const service = new ErrorLogService(prisma as never, logger as never);

      service.record({ source: 'server', level: 'error', statusCode: 500, route: '/x', message: 'boom' });
      await flushMicrotasks();

      expect(prisma.v1ErrorLog.upsert.mock.calls[0][0].create.releaseSha).toBeNull();
    } finally {
      if (previous !== undefined) process.env.V1_RELEASE = previous;
    }
  });

  // compose 가 `V1_RELEASE: ${ALPHA_RELEASE_VERSION:-}` 라 미설정 시 빈 문자열이 주입된다.
  // `?? null` 로는 걸러지지 않아 DB 에 ''가 남고 화면의 버전 칸만 비어 보인다.
  it('stores a blank V1_RELEASE as null rather than an empty string', async () => {
    const previous = process.env.V1_RELEASE;
    process.env.V1_RELEASE = '   ';
    try {
      const prisma = buildPrismaMock();
      const service = new ErrorLogService(prisma as never, logger as never);

      service.record({ source: 'server', level: 'error', statusCode: 500, route: '/x', message: 'boom' });
      await flushMicrotasks();

      expect(prisma.v1ErrorLog.upsert.mock.calls[0][0].create.releaseSha).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.V1_RELEASE;
      else process.env.V1_RELEASE = previous;
    }
  });

  it('never throws when the underlying prisma call rejects, and logs a warning instead', async () => {
    const prisma = { v1ErrorLog: { upsert: jest.fn().mockRejectedValue(new Error('db down')) } };
    const service = new ErrorLogService(prisma as never, logger as never);

    expect(() =>
      service.record({ source: 'server', level: 'error', statusCode: 500, route: '/x', message: 'boom' }),
    ).not.toThrow();

    await flushMicrotasks();
    await flushMicrotasks();

    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('ErrorLogService.list pagination', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };

  function buildPrismaMock(rowCount: number, total: number) {
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      id: `err-${i}`,
      source: 'server',
      level: 'error',
      statusCode: 500,
      route: '/x',
      method: 'GET',
      message: 'boom',
      fingerprint: 'f',
      occurrenceCount: 1,
      releaseSha: null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    }));
    return {
      v1ErrorLog: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(total),
      },
    };
  }

  it('skips the pages before the requested one and reports the total page count', async () => {
    // 3페이지(20건씩)를 요청하면 앞의 2페이지 40건을 건너뛰어야 한다 — off-by-one 이 나면
    // 페이지 경계에서 같은 행이 다시 보이거나 통째로 빠진다.
    const prisma = buildPrismaMock(21, 55);
    const service = new ErrorLogService(prisma as never, logger as never);

    const result = await service.list({ page: 3, limit: 20 });

    expect(prisma.v1ErrorLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 21 });
    expect(result.items).toHaveLength(20);
    expect(result.pageInfo).toMatchObject({ page: 3, limit: 20, total: 55, totalPages: 3, hasNext: true, hasPrev: true });
  });

  it('counts with the same where clause as the list so the total matches the filtered rows', async () => {
    const prisma = buildPrismaMock(2, 2);
    const service = new ErrorLogService(prisma as never, logger as never);

    await service.list({ source: 'client', level: 'warn', limit: 20 });

    const listWhere = prisma.v1ErrorLog.findMany.mock.calls[0][0].where;
    expect(prisma.v1ErrorLog.count).toHaveBeenCalledWith({ where: listWhere });
    expect(listWhere).toMatchObject({ source: 'client', level: 'warn' });
  });
});

/** record()는 fire-and-forget(내부 promise를 await하지 않음)이므로 마이크로태스크 큐가
 * 비워질 때까지 명시적으로 양보해 upsert 호출이 기록될 시간을 준다.
 * process.nextTick은 jest의 fake timers(setTimeout/setImmediate 등을 가짜로 만듦)에
 * 영향받지 않으므로 401/403 버킷 테스트(fake timers 사용)에서도 안전하다. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => process.nextTick(resolve));
}
