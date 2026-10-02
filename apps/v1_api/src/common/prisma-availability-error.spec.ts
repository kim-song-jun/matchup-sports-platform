import { isPrismaAvailabilityError } from './prisma-availability-error';

describe('isPrismaAvailabilityError', () => {
  it('P2024(커넥션 풀 시간 초과)를 가용성 실패로 본다', () => {
    expect(isPrismaAvailabilityError({ code: 'P2024', message: 'Timed out fetching a new connection' })).toBe(true);
  });

  it('P2028(트랜잭션 API 오류)을 가용성 실패로 본다', () => {
    expect(isPrismaAvailabilityError({ code: 'P2028', message: 'Transaction API error' })).toBe(true);
  });

  // alpha 실측 그대로. 승강 확정 6건 동시 요청이 전부 이 에러로 500 이 됐다.
  it('alpha 에서 실제로 관측된 "트랜잭션을 시작할 수 없음" 문구를 잡는다', () => {
    const observed = {
      code: 'P2028',
      message: 'Transaction API error: Unable to start a transaction in the given time.',
    };
    expect(isPrismaAvailabilityError(observed)).toBe(true);
  });

  it('코드가 비어도 Prisma 형태면 메시지로 판정한다', () => {
    expect(
      isPrismaAvailabilityError({
        code: 'P2999',
        message: 'Unable to start a transaction in the given time',
      }),
    ).toBe(true);
  });

  // ── 넘겨짚지 않아야 하는 것들 ─────────────────────────────────────────────
  it('충돌 계열은 가용성 실패가 아니다 — 도메인이 409 로 번역할 몫이다', () => {
    for (const code of ['P2002', 'P2034', 'P2010']) {
      expect(isPrismaAvailabilityError({ code, message: 'conflict' })).toBe(false);
    }
  });

  it('Prisma 코드가 아닌 에러는 문구가 비슷해도 잡지 않는다', () => {
    expect(
      isPrismaAvailabilityError({
        code: 'ETIMEDOUT',
        message: 'Timed out fetching a new connection from the connection pool',
      }),
    ).toBe(false);
    expect(
      isPrismaAvailabilityError(new Error('Unable to start a transaction in the given time')),
    ).toBe(false);
  });

  it('일반 런타임 에러·null·문자열을 잡지 않는다', () => {
    expect(isPrismaAvailabilityError(new TypeError('boom'))).toBe(false);
    expect(isPrismaAvailabilityError(null)).toBe(false);
    expect(isPrismaAvailabilityError(undefined)).toBe(false);
    expect(isPrismaAvailabilityError('P2028')).toBe(false);
    expect(isPrismaAvailabilityError({})).toBe(false);
  });

  it('레코드 없음(P2025) 같은 일반 Prisma 오류는 잡지 않는다', () => {
    expect(isPrismaAvailabilityError({ code: 'P2025', message: 'Record to update not found.' })).toBe(false);
  });
});
