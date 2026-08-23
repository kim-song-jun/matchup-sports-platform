import { isCommandConcurrencyConflict } from './command-concurrency-error';

describe('isCommandConcurrencyConflict', () => {
  it('Prisma 자체 충돌 코드(P2034·P2002)를 충돌로 본다', () => {
    expect(isCommandConcurrencyConflict('P2034')).toBe(true);
    expect(isCommandConcurrencyConflict('P2002')).toBe(true);
  });

  // 이 케이스가 이 파일의 존재 이유다 — alpha 에서 실제로 500 을 만든 모양 그대로.
  it('raw query 안에서 난 40001(serialization failure)을 충돌로 본다', () => {
    expect(
      isCommandConcurrencyConflict('P2010', {
        code: '40001',
        message: 'could not serialize access due to concurrent update',
      }),
    ).toBe(true);
  });

  it('raw query 안에서 난 40P01(deadlock)도 충돌로 본다', () => {
    expect(isCommandConcurrencyConflict('P2010', { code: '40P01' })).toBe(true);
  });

  it('meta 가 비어 있으면 메시지의 SQLSTATE 로 판정한다', () => {
    const message =
      'Invalid `prisma.$queryRaw()` invocation:\n\nRaw query failed. Code: `40001`. ' +
      'Message: `could not serialize access due to concurrent update`';
    expect(isCommandConcurrencyConflict('P2010', undefined, message)).toBe(true);
    expect(isCommandConcurrencyConflict('P2010', null, message)).toBe(true);
  });

  // 넓게 잡으면 진짜 SQL 결함이 409 로 둔갑해 조용히 묻힌다.
  it('충돌이 아닌 raw query 실패는 충돌로 보지 않는다', () => {
    expect(
      isCommandConcurrencyConflict('P2010', {
        code: '42703',
        message: 'column "nope" does not exist',
      }),
    ).toBe(false);
    expect(
      isCommandConcurrencyConflict(
        'P2010',
        undefined,
        'Raw query failed. Code: `42703`. Message: `column "nope" does not exist`',
      ),
    ).toBe(false);
  });

  it('무관한 Prisma 코드는 충돌로 보지 않는다', () => {
    expect(isCommandConcurrencyConflict('P2025')).toBe(false);
    expect(isCommandConcurrencyConflict('P2003', { code: '40001' })).toBe(false);
  });

  it('숫자만 든 메시지가 우연히 걸리지 않는다', () => {
    expect(isCommandConcurrencyConflict('P2010', undefined, '40001 rows affected')).toBe(false);
  });
});
