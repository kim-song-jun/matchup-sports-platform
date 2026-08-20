/**
 * tournament-live-routes.test.ts
 *
 * 이 판정들은 **인가 경계**에 쓰인다 — `isAdminLiveConsolePath` 가 true 를 내는 경로에서는
 * AdminGate 가 "플랫폼 관리자냐"를 묻지 않고 대회 스코프 게이트에 넘긴다. 접두사가 조금만
 * 헐거워져도 어드민 화면이 관리자 판정 없이 열린다.
 */
import { describe, expect, it } from 'vitest';
import {
  adminLiveBase,
  fixtureIdFromConsolePath,
  isAdminLiveConsolePath,
  resolveTournamentLiveBase,
  staffLiveBase,
  tournamentIdFromAdminLivePath,
} from './tournament-live-routes';

describe('isAdminLiveConsolePath', () => {
  it('현장 콘솔 경로에서만 true 다', () => {
    expect(isAdminLiveConsolePath('/admin/live/t-1')).toBe(true);
    expect(isAdminLiveConsolePath('/admin/live/t-1/operations')).toBe(true);
    expect(isAdminLiveConsolePath('/admin/live/t-1/fixtures/fx-1/operate')).toBe(true);
  });

  it('다른 어드민 화면은 절대 통과시키지 않는다', () => {
    // 여기가 true 가 되면 그 화면이 관리자 판정 없이 열린다.
    expect(isAdminLiveConsolePath('/admin')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/tournaments/t-1')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/tournaments/t-1/registrations')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/users')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/hub')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/ops/tournaments')).toBe(false);
    // 대회 id 가 없으면 스코프 게이트가 판정할 대상이 없다.
    expect(isAdminLiveConsolePath('/admin/live')).toBe(false);
    expect(isAdminLiveConsolePath('/admin/live/')).toBe(false);
    // 접두사만 닮은 경로
    expect(isAdminLiveConsolePath('/admin/liveness/t-1')).toBe(false);
    expect(isAdminLiveConsolePath('/administrator/live/t-1')).toBe(false);
    expect(isAdminLiveConsolePath(null)).toBe(false);
  });
});

describe('resolveTournamentLiveBase', () => {
  it('지금 서 있는 표면의 base 를 돌려준다', () => {
    expect(resolveTournamentLiveBase('/admin/live/t-1/operations', 't-1')).toBe(adminLiveBase('t-1'));
    expect(resolveTournamentLiveBase('/tournament-ops/tournaments/t-1/operations', 't-1')).toBe(staffLiveBase('t-1'));
    // 알 수 없는 경로는 기존 동작(스태프 표면)을 유지한다.
    expect(resolveTournamentLiveBase(null, 't-1')).toBe(staffLiveBase('t-1'));
  });
});

describe('fixtureIdFromConsolePath', () => {
  it('두 표면 모두에서 fixtureId 를 꺼낸다', () => {
    expect(fixtureIdFromConsolePath('/tournament-ops/tournaments/t-1/fixtures/fx-9/operate', 't-1')).toBe('fx-9');
    expect(fixtureIdFromConsolePath('/admin/live/t-1/fixtures/fx-9/operate', 't-1')).toBe('fx-9');
  });

  it('경로의 대회가 지금 대회와 다르면 무시한다', () => {
    // 이 값이 새면 필드 담당자 딥링크가 남의 대회 경기로 열린다.
    expect(fixtureIdFromConsolePath('/admin/live/t-2/fixtures/fx-9/operate', 't-1')).toBeNull();
    expect(fixtureIdFromConsolePath('/tournament-ops/tournaments/t-2/fixtures/fx-9/operate', 't-1')).toBeNull();
  });

  it('인코딩된 세그먼트를 디코딩해 비교한다', () => {
    expect(fixtureIdFromConsolePath('/admin/live/t%2D1/fixtures/fx%2D9/operate', 't-1')).toBe('fx-9');
  });

  it('콘솔이 아닌 경로는 null 이다', () => {
    expect(fixtureIdFromConsolePath('/admin/live/t-1/operations', 't-1')).toBeNull();
    expect(fixtureIdFromConsolePath('/admin/tournaments/t-1/bracket', 't-1')).toBeNull();
  });

  it('경기 콘솔이 아닌 fixtures 하위 경로까지 넓히지 않는다', () => {
    // 이 판정은 셸 진입이 거부된 필드 담당자를 우회 통과시키는 자리다. `/fixtures/:id` 까지만
    // 보면 나중에 생기는 하위 화면이 전부 콘솔 딥링크로 오인돼 우회가 넓어진다.
    expect(fixtureIdFromConsolePath('/admin/live/t-1/fixtures/fx-9', 't-1')).toBeNull();
    expect(fixtureIdFromConsolePath('/admin/live/t-1/fixtures/fx-9/summary', 't-1')).toBeNull();
    expect(fixtureIdFromConsolePath('/tournament-ops/tournaments/t-1/fixtures/fx-9/summary', 't-1')).toBeNull();
    // 콘솔 자체와 그 하위는 계속 인식한다.
    expect(fixtureIdFromConsolePath('/admin/live/t-1/fixtures/fx-9/operate', 't-1')).toBe('fx-9');
    expect(fixtureIdFromConsolePath('/admin/live/t-1/fixtures/fx-9/operate/lineup', 't-1')).toBe('fx-9');
  });
});

describe('tournamentIdFromAdminLivePath', () => {
  it('어드민 현장 콘솔 경로에서만 대회 id 를 꺼낸다', () => {
    expect(tournamentIdFromAdminLivePath('/admin/live/t-1/staff')).toBe('t-1');
    expect(tournamentIdFromAdminLivePath('/admin/tournaments/t-1/staff')).toBeNull();
    expect(tournamentIdFromAdminLivePath(null)).toBeNull();
  });
});
