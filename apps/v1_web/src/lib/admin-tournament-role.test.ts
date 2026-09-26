/**
 * admin-tournament-role.test.ts
 *
 * 이 매핑은 인가 표현을 하나로 합치는 과정의 첫 걸음이라, **기존 동작과 정확히 같은 결과**를
 * 내는지가 계약이다. 여기가 어긋나면 조회 전용 관리자에게 쓰기 버튼이 열리거나, 반대로
 * 운영자에게서 사라진다.
 */
import { describe, expect, it } from 'vitest';
import type { V1AdminMe } from '@/types/api';
import {
  canWriteTournamentAdmin,
  deriveTournamentAdminRole,
  type TournamentAdminRole,
} from './admin-tournament-role';

/** 서버가 실제로 내려주는 capability 목록(admin.service.ts#getCapabilities)과 같은 값. */
const SERVER_CAPABILITIES: Record<V1AdminMe['adminRole'], string[]> = {
  owner: ['overview:read', 'status:write', 'logs:read', 'admin:owner'],
  ops: ['overview:read', 'status:write', 'logs:read'],
  support: ['overview:read', 'logs:read'],
};

describe('deriveTournamentAdminRole', () => {
  it('플랫폼 관리자 owner·ops 는 서버의 platform_ops 판정과 같게 본다', () => {
    // 서버 assertAccess 도 활성 관리자 중 owner/ops 만 platform_ops 주체로 인정한다.
    expect(deriveTournamentAdminRole({ kind: 'platform', adminRole: 'owner' })).toBe('PLATFORM_OPS');
    expect(deriveTournamentAdminRole({ kind: 'platform', adminRole: 'ops' })).toBe('PLATFORM_OPS');
  });

  it('플랫폼 관리자 support 는 조회 전용으로 본다', () => {
    expect(deriveTournamentAdminRole({ kind: 'platform', adminRole: 'support' })).toBe('SUPPORT_READONLY');
  });

  it('대회 스태프는 배정된 역할을 그대로 쓴다', () => {
    const roles: TournamentAdminRole[] = [
      'PLATFORM_OPS',
      'TOURNAMENT_DIRECTOR',
      'FIELD_OPERATOR',
      'SUPPORT_READONLY',
    ];
    for (const role of roles) {
      expect(deriveTournamentAdminRole({ kind: 'staff', role })).toBe(role);
    }
  });
});

describe('canWriteTournamentAdmin', () => {
  it('기존 capabilities 기반 판정과 결과가 같다', () => {
    // 옮기기 전 코드: adminMe.capabilities.includes('status:write')
    for (const adminRole of ['owner', 'ops', 'support'] as const) {
      const legacy = SERVER_CAPABILITIES[adminRole].includes('status:write');
      const next = canWriteTournamentAdmin(
        deriveTournamentAdminRole({ kind: 'platform', adminRole }),
      );
      expect(next).toBe(legacy);
    }
  });

  it('스태프 역할에는 대회 관리 쓰기를 아직 열지 않는다', () => {
    // 화면을 어드민으로 들여올 때 화면별로 정한다 — 미리 넓히면 서버가 막더라도
    // "쓸 수 있는 것처럼 보이는" 결함이 된다.
    expect(canWriteTournamentAdmin('TOURNAMENT_DIRECTOR')).toBe(false);
    expect(canWriteTournamentAdmin('FIELD_OPERATOR')).toBe(false);
    expect(canWriteTournamentAdmin('SUPPORT_READONLY')).toBe(false);
  });
});
