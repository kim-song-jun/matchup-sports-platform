import { describe, expect, it } from 'vitest';
import {
  PULL_MAX_PX,
  PULL_THRESHOLD_PX,
  classifyPullIntent,
  isPullToRefreshRoute,
  pullOffset,
  shouldRefresh,
} from './pull-to-refresh';

describe('isPullToRefreshRoute', () => {
  it.each([
    '/home',
    '/matches',
    '/matches/m1',
    '/team-matches/t1',
    '/tournaments',
    '/tournaments/t1/schedule',
    '/tournaments/t1/matches/f1',
    '/teams',
    '/teams/team1/members',
    '/chat',
    '/my',
    '/my/reviews',
    '/my/reviews/received',
    '/notifications',
    '/users/u1',
  ])('목록·상세 %s 는 새로고침 대상이다', (path) => {
    expect(isPullToRefreshRoute(path)).toBe(true);
  });

  it.each([
    '/chat/room1',
    '/admin',
    '/admin/users/u1',
    '/tournament-ops/tournaments/t1/operations',
    '/matches/new',
    '/matches/new/place-time',
    '/team-matches/new/team',
    '/matches/m1/edit',
    '/teams/team1/schedules/new',
    '/teams/team1/schedules/s1/edit',
    '/my/profile/edit',
    '/my/settings',
    '/my/settings/notifications',
    '/team-matches/t1/lineup',
    '/team-matches/t1/lineup/opponent',
    '/team-matches/t1/record',
    '/team-matches/t1/result/approval',
    '/teams/team1/dissolve',
    '/teams/team1/tactics/g1',
    '/teams/team1/games/g1/roster',
    '/tournaments/t1/apply',
    '/tournaments/t1/registrations/r1/roster',
    '/my/reviews/team_match/t1',
    '/login',
    '/signup/complete',
    '/onboarding/sport',
  ])('채팅방·콘솔·폼 %s 는 제외한다', (path) => {
    expect(isPullToRefreshRoute(path)).toBe(false);
  });

  it('접두어만 같은 다른 경로는 제외하지 않는다', () => {
    expect(isPullToRefreshRoute('/administrators')).toBe(true);
    expect(isPullToRefreshRoute('/chatter')).toBe(true);
  });
});

describe('당김 판정', () => {
  it('슬롭 안에서는 아직 결정하지 않는다', () => {
    expect(classifyPullIntent(3, 5)).toBe('undecided');
  });

  it('세로가 가로보다 우세한 아래 방향만 당김이다', () => {
    expect(classifyPullIntent(2, 20)).toBe('pull');
    expect(classifyPullIntent(30, 20)).toBe('ignore');
    expect(classifyPullIntent(0, -20)).toBe('ignore');
  });

  it('저항 0.5 와 최대 96px 로 이동량을 계산한다', () => {
    expect(pullOffset(40)).toBe(20);
    expect(pullOffset(-30)).toBe(0);
    expect(pullOffset(1000)).toBe(PULL_MAX_PX);
  });

  it('임계 64px 에 못 미치면 새로고침하지 않는다', () => {
    expect(shouldRefresh(PULL_THRESHOLD_PX - 1)).toBe(false);
    expect(shouldRefresh(PULL_THRESHOLD_PX)).toBe(true);
  });
});
