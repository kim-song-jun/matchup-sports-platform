import { describe, expect, it } from 'vitest';
import { getLeagueStatusConfig, getTournamentStatusConfig } from './v1-tournament-status';
import { leagueStateChip } from './competition-status';
import { leagueLifecycleLabel } from './v1-status-labels';

// 2026-10-27 사용자 확정: 리그 상태 이름을 대회처럼 나눈다(초안·접수 중·마감이 따로 보인다).
describe('리그 공개 배지는 대회와 같은 이름에 리그 말만 다르다', () => {
  it.each([
    ['draft', '준비 중'], ['open', '모집 중'], ['closed', '마감'],
    ['in_progress', '시즌 진행 중'], ['on_hold', '보류'],
    ['completed', '종료'], ['cancelled', '종료'],
  ])('%s 저장 상태를 %s로 표시한다', (status, label) => {
    expect(getLeagueStatusConfig(status).label).toBe(label);
  });

  it('접수 중이어도 마감·정원으로 막히면 대회처럼 모집 마감이다', () => {
    expect(getLeagueStatusConfig('open', true).label).toBe('모집 마감');
    expect(getTournamentStatusConfig('open', true, true).label).toBe('모집 마감');
    expect(getTournamentStatusConfig('in_progress', true, true).label).toBe('시즌 진행 중');
  });

  it('시작 전 단계를 묶은 칩은 시작 전이라고 말한다', () => {
    expect(leagueStateChip('draft').label).toBe('시작 전');
    expect(leagueStateChip('draft', { withSubject: true }).label).toBe('리그 · 시작 전');
    expect(leagueStateChip('on_hold').label).toBe('보류');
  });

  it('일반 대회의 준비·모집 상태는 유지한다', () => {
    expect(getTournamentStatusConfig('draft').label).toBe('준비 중');
    expect(getTournamentStatusConfig('open').label).toBe('모집 중');
  });

  it.each(['new_state', 'constructor', 'toString'])('알 수 없는 %s를 정상 상태로 숨기지 않는다', (status) => {
    expect(getLeagueStatusConfig(status).label).toBe('상태 확인 중');
    expect(leagueLifecycleLabel(status)).toBe('상태 확인 중');
  });
});

describe('리그 어드민 이름은 대회 어드민과 같은 말을 쓴다', () => {
  it.each([
    ['draft', '초안'], ['open', '접수 중'], ['closed', '마감'],
    ['in_progress', '시즌 진행 중'], ['completed', '종료'], ['cancelled', '종료'], ['on_hold', '보류'],
  ])('%s → %s', (status, label) => {
    expect(leagueLifecycleLabel(status)).toBe(label);
  });
});
