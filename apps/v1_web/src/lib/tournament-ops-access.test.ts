import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import {
  classifyTournamentStaffAccessError,
  isTournamentStaffScopeNotYetSupported,
  tournamentOpsAccessDeniedLabel,
  tournamentStaffDenialReasonCode,
} from './tournament-ops-access';

function apiError(reason?: string) {
  return new V1ApiError({
    status: 'error', statusCode: 403, code: 'STAFF_SCOPE_DENIED', message: 'denied',
    details: reason ? { reason } : undefined, timestamp: '2026-08-07T00:00:00.000Z',
  });
}

function serverErrorApiError() {
  return new V1ApiError({
    status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'unavailable',
    details: undefined, timestamp: '2026-08-07T00:00:00.000Z',
  });
}

describe('tournamentStaffDenialReasonCode', () => {
  it('V1ApiError의 details.reason을 추출한다', () => {
    expect(tournamentStaffDenialReasonCode(apiError('ASSIGNMENT_REQUIRED'))).toBe('ASSIGNMENT_REQUIRED');
  });
  it('V1ApiError가 아니면 undefined', () => {
    expect(tournamentStaffDenialReasonCode(new Error('x'))).toBeUndefined();
  });
});

describe('isTournamentStaffScopeNotYetSupported', () => {
  it('FIXTURE_SCOPE_REQUIRED 등은 true', () => {
    expect(isTournamentStaffScopeNotYetSupported('FIXTURE_SCOPE_REQUIRED')).toBe(true);
    expect(isTournamentStaffScopeNotYetSupported('FIELD_SCOPE_DENIED')).toBe(true);
  });
  it('ASSIGNMENT_REQUIRED 등 일반 권한 없음은 false', () => {
    expect(isTournamentStaffScopeNotYetSupported('ASSIGNMENT_REQUIRED')).toBe(false);
    expect(isTournamentStaffScopeNotYetSupported(undefined)).toBe(false);
  });
});

describe('tournamentOpsAccessDeniedLabel', () => {
  it('scope-not-yet-supported면 준비 중 문구', () => {
    expect(tournamentOpsAccessDeniedLabel('FIELD_SCOPE_REQUIRED')).toBe('아직 지원하지 않는 화면이에요.');
  });
  it('그 외 사유는 스태프 배정 문구(D-16 예시 카피)', () => {
    expect(tournamentOpsAccessDeniedLabel('ASSIGNMENT_REQUIRED')).toBe('스태프 배정이 필요해요.');
    expect(tournamentOpsAccessDeniedLabel(undefined)).toBe('스태프 배정이 필요해요.');
  });
});

describe('classifyTournamentStaffAccessError', () => {
  it('403은 권한 거부로 분류하고 reasonCode를 함께 반환한다', () => {
    expect(classifyTournamentStaffAccessError(apiError('ASSIGNMENT_REQUIRED'))).toEqual({
      isAuthDenied: true,
      reasonCode: 'ASSIGNMENT_REQUIRED',
    });
  });

  it('5xx는 권한 거부가 아니다 — reasonCode도 비운다(오분류 방지)', () => {
    expect(classifyTournamentStaffAccessError(serverErrorApiError())).toEqual({
      isAuthDenied: false,
      reasonCode: undefined,
    });
  });

  it('V1ApiError가 아닌 에러(네트워크 단절 등)도 권한 거부가 아니다', () => {
    expect(classifyTournamentStaffAccessError(new Error('network down'))).toEqual({
      isAuthDenied: false,
      reasonCode: undefined,
    });
  });
});
