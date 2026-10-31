import { afterEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { peekPendingSocialLink, savePendingSocialLink } from '@/lib/pending-social-link';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';
import {
  buildAccountConflictPath,
  routeSocialLoginRecovery,
  routeToAccountConflict,
  routeToWithdrawalCancel,
} from './login-recovery-route';

const apiError = (statusCode: number, code: string, details?: unknown) =>
  new V1ApiError({ status: 'error', statusCode, code, message: '실패', details, timestamp: '2026-10-31T00:00:00.000Z' });
const conflict = (extra: Record<string, unknown> = {}, provider = 'kakao') =>
  apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT', { next: 'sign_in_then_link', provider, ...extra });
const withToken = { linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 };
const withdrawal = apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', { withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600 });

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('routeToAccountConflict', () => {
  it('연결 토큰을 보관하고 제공자별 안내 화면 경로를 돌려준다', () => {
    expect(routeToAccountConflict(conflict(withToken))).toEqual({ type: 'navigate', path: '/auth/account-conflict?provider=kakao' });
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: 'link-token-1', provider: 'kakao' });
    expect(routeToAccountConflict(conflict(withToken, 'apple'))).toEqual({ type: 'navigate', path: '/auth/account-conflict?provider=apple' });
  });

  it('토큰이 없는 안내는 안내 화면으로만 보내고, 이전에 남은 토큰은 거둔다', () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'apple', ...withToken });
    expect(routeToAccountConflict(conflict())).toEqual({ type: 'navigate', path: '/auth/account-conflict?provider=kakao' });
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('돌아갈 경로는 같은 사이트 경로일 때만 싣는다', () => {
    expect(buildAccountConflictPath('kakao', '/teams/new?tab=a')).toBe('/auth/account-conflict?provider=kakao&redirect=%2Fteams%2Fnew%3Ftab%3Da');
    expect(buildAccountConflictPath('kakao', 'https://evil.example/x')).toBe('/auth/account-conflict?provider=kakao');
    expect(buildAccountConflictPath('kakao', '/login')).toBe('/auth/account-conflict?provider=kakao');
  });

  it.each([
    ['details 가 없는 409', apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT')],
    ['409 가 아닌 같은 모양', apiError(400, 'SOCIAL_LINK_CONTACT_CONFLICT', { next: 'sign_in_then_link', provider: 'kakao', ...withToken })],
    ['연결할 수 없는 제공자', conflict(withToken, 'naver')],
    ['오류가 아닌 값', new Error('network')],
  ])('안내가 아니면 null 이다 (%s)', (_label, error) => {
    expect(routeToAccountConflict(error)).toBeNull();
    expect(peekPendingSocialLink()).toBeNull();
  });
});

describe('routeToWithdrawalCancel', () => {
  it('철회 토큰과 돌아갈 경로를 보관하고 철회 화면 경로를 돌려준다', () => {
    expect(routeToWithdrawalCancel(withdrawal, '/chat')).toEqual({ type: 'navigate', path: '/auth/withdrawal-cancel' });
    expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1', returnTo: '/chat' });
  });

  it('돌아갈 경로가 없거나 안전하지 않으면 null 로 보관한다', () => {
    routeToWithdrawalCancel(withdrawal, 'https://evil.example/x');
    expect(readWithdrawalCancel()).toMatchObject({ returnTo: null });
  });

  it('저장 칸이 막혀 있으면 이동하지 않고 이유를 돌려준다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(routeToWithdrawalCancel(withdrawal, '/chat')).toEqual({
      type: 'storage-failed',
      message: expect.stringContaining('저장 공간'),
    });
  });

  it('토큰이 없는 403(자격 불일치)은 철회 화면으로 보내지 않는다', () => {
    expect(routeToWithdrawalCancel(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING'))).toBeNull();
    expect(readWithdrawalCancel()).toBeNull();
  });
});

describe('routeSocialLoginRecovery', () => {
  it('충돌 안내와 철회를 가르고, 둘 다 아니면 null 이다', () => {
    expect(routeSocialLoginRecovery(conflict(withToken))).toMatchObject({ path: '/auth/account-conflict?provider=kakao' });
    expect(routeSocialLoginRecovery(withdrawal)).toMatchObject({ path: '/auth/withdrawal-cancel' });
    expect(routeSocialLoginRecovery(apiError(401, 'UNAUTHENTICATED'))).toBeNull();
  });
});
