import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthHandoffStorage } from './auth-handoff-storage';
import { readPendingEmailLink, savePendingEmailLink } from './pending-email-link';
import { peekPendingSocialLink, savePendingSocialLink } from './pending-social-link';
import { clearStoredV1Session, saveStoredV1Session } from './session-storage';
import { readWithdrawalCancel, saveWithdrawalCancel } from './withdrawal-cancel-storage';

const NOW = Date.parse('2026-10-31T10:00:00.000Z');

function fillAllSlots() {
  savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 }, NOW);
  savePendingEmailLink('typed@example.com', NOW);
  saveWithdrawalCancel({ token: 'withdrawal-cancel-token-0001', expiresInSeconds: 600 }, '/my', NOW);
}

describe('clearAuthHandoffStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('removes every hand-off slot, so the next person on this tab cannot reuse the previous token or email', () => {
    fillAllSlots();
    expect(peekPendingSocialLink(NOW)).not.toBeNull();
    expect(readPendingEmailLink(NOW)).toBe('typed@example.com');
    expect(readWithdrawalCancel(NOW)).not.toBeNull();

    clearAuthHandoffStorage();

    expect(peekPendingSocialLink(NOW)).toBeNull();
    expect(readPendingEmailLink(NOW)).toBeNull();
    expect(readWithdrawalCancel(NOW)).toBeNull();
  });

  it('is not part of clearStoredV1Session: a guest 401 on the login screen must not drop the token awaiting the original sign-in', () => {
    fillAllSlots();
    saveStoredV1Session({ userId: 'user-1', userEmail: null });

    clearStoredV1Session();

    expect(peekPendingSocialLink(NOW)).not.toBeNull();
    expect(readPendingEmailLink(NOW)).toBe('typed@example.com');
    expect(readWithdrawalCancel(NOW)).not.toBeNull();
  });
});
