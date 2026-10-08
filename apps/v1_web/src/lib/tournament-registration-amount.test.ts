import { describe, expect, it } from 'vitest';
import { resolveRegistrationAmount } from './tournament-registration-amount';

describe('resolveRegistrationAmount', () => {
  it('결제 레코드가 있으면 현재 참가비가 아니라 신청 당시 금액을 쓴다', () => {
    expect(resolveRegistrationAmount({ payment: { amount: 70000 } }, { entryFee: 80000 })).toBe(70000);
    expect(resolveRegistrationAmount({ payment: { amount: 70000 } }, { entryFee: 0 })).toBe(70000);
  });

  it('신청 당시 0원은 현재 참가비가 올라도 0원이다 (0 을 falsy 로 읽지 않는다)', () => {
    expect(resolveRegistrationAmount({ payment: { amount: 0 } }, { entryFee: 80000 })).toBe(0);
  });

  it('결제 레코드가 없거나 신청이 없을 때만 현재 참가비로 갈음한다', () => {
    expect(resolveRegistrationAmount({ payment: null }, { entryFee: 80000 })).toBe(80000);
    expect(resolveRegistrationAmount(undefined, { entryFee: 80000 })).toBe(80000);
    expect(resolveRegistrationAmount(null, { entryFee: 0 })).toBe(0);
  });
});
