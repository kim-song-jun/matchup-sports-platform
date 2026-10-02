import { describe, expect, it } from 'vitest';
import type { V1TournamentStatus } from '@/types/api';
import { getTournamentStatusConfig } from './v1-tournament-status';

describe('getTournamentStatusConfig', () => {
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
