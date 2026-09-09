import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { getWithdrawalErrorGuidance } from './withdrawal-guidance';

describe('getWithdrawalErrorGuidance', () => {
  it.each([
    ['WITHDRAWAL_BLOCKED_ACTIVE_MATCH', '진행 중인 매치를 먼저 정리해 주세요'],
    ['WITHDRAWAL_BLOCKED_TEAM_AUTHORITY', '팀 관리 권한을 먼저 넘겨 주세요'],
    ['ADMIN_WITHDRAWAL_FORBIDDEN', '운영자 권한을 먼저 해제해 주세요'],
  ])('maps %s to an actionable title', (code, title) => {
    expect(getWithdrawalErrorGuidance(new V1ApiError({
      status: 'error',
      statusCode: 409,
      code,
      message: '서버 안내',
      timestamp: '2026-09-08T00:00:00.000Z',
    }))).toEqual({
      title,
      message: '서버 안내',
    });
  });

  it('keeps an honest fallback for an unknown failure', () => {
    expect(getWithdrawalErrorGuidance(new Error('네트워크 오류'))).toEqual({
      title: '탈퇴 요청을 접수하지 못했어요',
      message: '네트워크 오류',
    });
  });
});
