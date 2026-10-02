import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { teamErrorMessage } from './team-error-messages';

function apiError(code: string, message: string, details?: unknown, statusCode = 409) {
  return new V1ApiError({ status: 'error', statusCode, code, message, details, timestamp: '2026-09-30T00:00:00.000Z' });
}

describe('teamErrorMessage', () => {
  it('영어 서버 message 대신 코드에 맞는 해요체 문구를 낸다', () => {
    const forbidden = apiError('PERMISSION_DENIED', 'Only team owners or managers can manage this team', undefined, 403);
    expect(teamErrorMessage(forbidden, '실패')).toBe('팀장·매니저만 할 수 있어요. 필요하면 팀장에게 알려 주세요.');

    const limit = apiError('MANAGER_LIMIT_EXCEEDED', 'Manager count cannot exceed 5');
    expect(teamErrorMessage(limit, '실패')).toContain('매니저는 최대 5명이에요');
  });

  it('정원 검증 실패는 현재 팀원 수를 알려 주고, 다른 필드 검증 실패에는 붙지 않는다', () => {
    const goal = apiError('VALIDATION_FAILED', 'memberGoalCount cannot be lower than the current member count', { field: 'memberGoalCount' }, 400);
    expect(teamErrorMessage(goal, '실패', { memberCount: 4 })).toBe('정원은 지금 팀원 수(4명)보다 적게 정할 수 없어요.');
    expect(teamErrorMessage(goal, '실패')).toBe('정원은 지금 팀원 수보다 적게 정할 수 없어요.');

    const other = apiError('VALIDATION_FAILED', '이름을 입력해 주세요.', { field: 'name' }, 400);
    expect(teamErrorMessage(other, '실패', { memberCount: 4 })).toBe('이름을 입력해 주세요.');
  });

  it('모르는 코드는 서버 message, 에러 형태가 아니면 fallback 을 낸다', () => {
    expect(teamErrorMessage(apiError('SOMETHING_NEW', '새로운 오류예요.'), '실패')).toBe('새로운 오류예요.');
    expect(teamErrorMessage('boom', '저장하지 못했어요.')).toBe('저장하지 못했어요.');
  });
});
