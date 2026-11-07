import { describe, expect, it } from 'vitest';
import type { V1TournamentStatus } from '@/types/api';
import { getCompetitionCardStatus, getTournamentStatusConfig } from './v1-tournament-status';

describe('getTournamentStatusConfig', () => {
  it('정규 리그의 진행 상태만 시즌 문구로 구분해요', () => {
    expect(getTournamentStatusConfig('in_progress', false, true).label).toBe('시즌 진행 중');
    expect(getTournamentStatusConfig('in_progress', false, false).label).toBe('진행 중');
  });
  it('아는 상태는 라벨과 뱃지를 그대로 돌려줘요', () => {
    expect(getTournamentStatusConfig('open')).toEqual({ badgeClass: 'tm-badge-blue', label: '모집 중' });
    expect(getTournamentStatusConfig('cancelled')).toEqual({ badgeClass: 'tm-badge-red', label: '취소' });
    expect(getTournamentStatusConfig('in_progress').label).toBe('진행 중');
  });

  it('서버가 새로 추가한 모르는 상태는 영문 원문 대신 한글 대체 문구를 보여줘요', () => {
    const unknown = 'postponed' as V1TournamentStatus;
    const config = getTournamentStatusConfig(unknown);
    expect(config.label).toBe('상태 확인 중');
    expect(config.label).not.toContain('postponed');
    expect(config.badgeClass).toBe('tm-badge-grey');
  });
});

describe('getCompetitionCardStatus — 카드 오른쪽 위 상태 하나', () => {
  it.each([
    ['draft', false, false, '준비 중'],
    ['draft', false, true, '준비 중'],
    ['open', true, false, '신청 접수 중'],
    ['open', true, true, '신청 접수 중'],
    ['open', false, false, '접수 마감'],
    ['closed', false, true, '접수 마감'],
    ['in_progress', false, false, '대회 진행 중'],
    ['in_progress', false, true, '시즌 진행 중'],
    ['completed', false, false, '종료'],
    ['completed', false, true, '종료'],
  ] as const)('%s · 접수 가능 %s · 리그 %s → %s', (status, registrationOpen, isLeague, label) => {
    expect(getCompetitionCardStatus(status, registrationOpen, isLeague).label).toBe(label);
  });
  it('필터의 진행 중과 카드의 대회 진행 중은 이름이 다르다', async () => {
    const { COMPETITION_STAGE_LABEL } = await import('./v1-status-labels');
    expect(COMPETITION_STAGE_LABEL.ongoing).toBe('진행 중');
    expect(COMPETITION_STAGE_LABEL.recruiting).toBe('신청 접수 중');
  });
});
