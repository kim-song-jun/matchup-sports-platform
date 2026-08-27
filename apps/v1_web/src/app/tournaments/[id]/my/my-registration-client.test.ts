import { describe, expect, it } from 'vitest';
import { shouldShowBankTransferAccountInfo, shouldShowConfirmedAt } from './my-registration-client';

describe('shouldShowBankTransferAccountInfo', () => {
  it('shows transfer account while a bank transfer payment is still ready', () => {
    expect(shouldShowBankTransferAccountInfo({
      paymentMethod: 'bank_transfer',
      paymentStatus: 'ready',
      bankName: '국민은행',
      bankAccount: '123-456-789',
      bankHolder: '팀밋',
    })).toBe(true);
  });

  it('does not show account details for paid transfers or incomplete account data', () => {
    expect(shouldShowBankTransferAccountInfo({
      paymentMethod: 'bank_transfer',
      paymentStatus: 'paid',
      bankName: '국민은행',
      bankAccount: '123-456-789',
      bankHolder: '팀밋',
    })).toBe(false);

    expect(shouldShowBankTransferAccountInfo({
      paymentMethod: 'bank_transfer',
      paymentStatus: 'ready',
      bankName: '국민은행',
      bankAccount: '',
      bankHolder: '팀밋',
    })).toBe(false);
  });
});

// 감사 finding #47: 대기(waitlisted) 처리된 신청이 confirmedAt을 함께 갖게 되면(과거 데이터
// 오염, 또는 향후 회귀) 화면에 "대기 중"과 "확정일"이 동시에 뜨는 모순이 재발한다.
describe('shouldShowConfirmedAt', () => {
  it('shows the confirmed date only when the registration is actually confirmed', () => {
    expect(shouldShowConfirmedAt('confirmed', '2026-08-01T00:00:00.000Z')).toBe(true);
  });

  it('hides the confirmed date for a waitlisted registration even if confirmedAt is set (stale data guard)', () => {
    expect(shouldShowConfirmedAt('waitlisted', '2026-08-01T00:00:00.000Z')).toBe(false);
  });

  it('hides the confirmed date when confirmedAt is absent', () => {
    expect(shouldShowConfirmedAt('confirmed', null)).toBe(false);
    expect(shouldShowConfirmedAt('confirmed', undefined)).toBe(false);
  });
});
