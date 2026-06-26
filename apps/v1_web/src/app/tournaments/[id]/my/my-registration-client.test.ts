import { describe, expect, it } from 'vitest';
import { shouldShowBankTransferAccountInfo } from './my-registration-client';

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
