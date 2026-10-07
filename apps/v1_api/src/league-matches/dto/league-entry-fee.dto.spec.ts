import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { UpdateLeagueEntryFeeDto } from './league-entry-fee.dto';

const metadata = { type: 'body' as const, metatype: UpdateLeagueEntryFeeDto };
const parse = (body: unknown) => createGlobalValidationPipe().transform(body, metadata) as Promise<UpdateLeagueEntryFeeDto>;
const bank = { bankName: '국민은행', bankAccount: '123-456-789012', bankHolder: '팀밋' };

describe('UpdateLeagueEntryFeeDto (전역 ValidationPipe 경로)', () => {
  it('유료 금액과 계좌를 그대로 통과시킨다', async () => {
    await expect(parse({ entryFee: 70000, ...bank })).resolves.toMatchObject({ entryFee: 70000, ...bank });
  });

  it('0원과 계좌 없음은 통과한다(무료 확정)', async () => {
    const dto = await parse({ entryFee: 0 });
    expect(dto.entryFee).toBe(0);
    expect(dto.bankName).toBeUndefined();
  });

  // 암묵 변환이 0 으로 바꾸는 값들 — 하나라도 통과하면 '무료 확정'이 조용히 저장된다.
  it.each(['', '0', '70000', null, false, true, [], {}, undefined])('entryFee %p 는 거부한다', async (entryFee) => {
    await expect(parse({ entryFee })).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
  });

  it.each([-1, 1.5, 100_000_001])('범위·정수 밖 금액 %p 는 거부한다', async (entryFee) => {
    await expect(parse({ entryFee })).rejects.toMatchObject({ status: 400 });
  });

  it('1억 원 경계는 통과한다', async () => {
    await expect(parse({ entryFee: 100_000_000, ...bank })).resolves.toMatchObject({ entryFee: 100_000_000 });
  });

  it('entryFee 가 없으면 거부한다', async () => {
    await expect(parse({ ...bank })).rejects.toMatchObject({ status: 400 });
  });

  it.each(['bankName', 'bankAccount', 'bankHolder'])('%s: 공백만·개행·제어문자·61자·숫자는 거부한다', async (field) => {
    for (const value of ['   ', 'a\nb', 'a\u0000b', 'a\u007fb', 'x'.repeat(61), 123, '']) {
      await expect(parse({ entryFee: 1000, [field]: value })).rejects.toMatchObject({ status: 400 });
    }
  });

  it('계좌 필드는 trim 한 값으로 통과하고 60자 경계는 허용한다', async () => {
    const dto = await parse({ entryFee: 1000, bankName: ' 국민 ', bankAccount: 'x'.repeat(60), bankHolder: '\t팀밋 ' });
    expect(dto).toMatchObject({ bankName: '국민', bankHolder: '팀밋' });
    expect(dto.bankAccount).toHaveLength(60);
  });

  it('모르는 필드는 거부한다', async () => {
    await expect(parse({ entryFee: 0, entryFeeConfiguredAt: '2026-10-07' })).rejects.toMatchObject({ status: 400 });
  });

  it('reason: 공백만이면 null, 아니면 trim, 501자는 거부', async () => {
    await expect(parse({ entryFee: 0, reason: '   ' })).resolves.toMatchObject({ reason: null });
    await expect(parse({ entryFee: 0, reason: ' 계좌 변경 ' })).resolves.toMatchObject({ reason: '계좌 변경' });
    await expect(parse({ entryFee: 0, reason: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400 });
    await expect(parse({ entryFee: 0, reason: 5 })).rejects.toMatchObject({ status: 400 });
  });
});
