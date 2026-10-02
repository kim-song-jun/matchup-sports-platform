/**
 * 잘못된 링크는 없는 링크보다 나쁘다 — 운영자를 404 로 데려간다.
 * 아래는 "무엇을 잇지 않는가"가 주된 계약이다.
 */
import { describe, expect, it } from 'vitest';
import { adminAuditActorHref, adminAuditTargetHref } from './admin-audit-links';

describe('adminAuditTargetHref', () => {
  it('targetId 가 그 라우트의 id 와 같은 타입만 잇는다', () => {
    expect(adminAuditTargetHref('user', 'u-1')).toBe('/admin/users/u-1');
    expect(adminAuditTargetHref('team', 't-1')).toBe('/admin/teams/t-1');
    expect(adminAuditTargetHref('tournament', 'to-1')).toBe('/admin/tournaments/to-1');
    expect(adminAuditTargetHref('match', 'm-1')).toBe('/admin/matches/m-1');
  });

  it('대회 하위 타입은 잇지 않는다 — targetId 가 대회 id 가 아니다', () => {
    // /admin/tournaments/<신청id> 로 보내면 없는 대회를 연다.
    expect(adminAuditTargetHref('tournament_registration', 'reg-1')).toBeNull();
    expect(adminAuditTargetHref('tournament_player', 'pl-1')).toBeNull();
    expect(adminAuditTargetHref('tournament_group', 'g-1')).toBeNull();
  });

  it('상세 화면이 없는 타입은 잇지 않는다', () => {
    expect(adminAuditTargetHref('team_match', 'tm-1')).toBeNull();
    expect(adminAuditTargetHref('admin', 'a-1')).toBeNull();
    expect(adminAuditTargetHref('popup', 'p-1')).toBeNull();
  });

  it('모르는 값·빈 값은 링크 없음으로 떨어진다', () => {
    expect(adminAuditTargetHref('brand_new_type', 'x-1')).toBeNull();
    expect(adminAuditTargetHref('user', '')).toBeNull();
    expect(adminAuditTargetHref(null, 'u-1')).toBeNull();
  });

  it('경로 세그먼트를 인코딩한다', () => {
    expect(adminAuditTargetHref('user', 'a/b')).toBe('/admin/users/a%2Fb');
  });
});

describe('adminAuditActorHref', () => {
  it('회원 id 가 있을 때만 잇는다 — 관리자 레코드 id 로는 잇지 않는다', () => {
    expect(adminAuditActorHref('u-9')).toBe('/admin/users/u-9');
    expect(adminAuditActorHref(null)).toBeNull();
    expect(adminAuditActorHref(undefined)).toBeNull();
  });
});
