import { describe, expect, it } from 'vitest';
import { getLeagueStatusConfig, getTournamentStatusConfig } from './v1-tournament-status';
import { leagueStateChip } from './competition-status';

describe('리그 표시 상태는 네 가지로 통일한다', () => {
  it.each([
    ['draft', '모집완료'], ['open', '모집완료'], ['closed', '모집완료'],
    ['in_progress', '시즌 진행 중'], ['on_hold', '보류'],
    ['completed', '종료'], ['cancelled', '종료'],
  ])('%s 저장 상태를 %s로 표시한다', (status, label) => {
    expect(getLeagueStatusConfig(status).label).toBe(label);
  });

  it('호환 API와 공통 대회 API가 같은 리그 상태를 표시한다', () => {
    for (const status of ['draft', 'open', 'closed'] as const) {
      expect(getLeagueStatusConfig(status).label).toBe(leagueStateChip('draft').label);
      expect(getTournamentStatusConfig(status, true, true).label).toBe('모집완료');
    }
    expect(leagueStateChip('on_hold').label).toBe('보류');
    expect(leagueStateChip('draft', { withSubject: true }).label).toBe('리그 · 모집완료');
  });

  it('일반 대회의 준비·모집 상태는 유지한다', () => {
    expect(getTournamentStatusConfig('draft').label).toBe('준비 중');
    expect(getTournamentStatusConfig('open').label).toBe('모집 중');
  });

  it.each(['new_state', 'constructor', 'toString'])('알 수 없는 %s를 정상 상태로 숨기지 않는다', (status) => {
    expect(getLeagueStatusConfig(status).label).toBe('상태 확인 중');
  });
});
