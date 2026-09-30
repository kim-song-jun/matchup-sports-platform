import { describe, expect, it } from 'vitest';
import type { V1TeamMatchLineup } from '@/types/api';
import { buildAttendanceSummary } from './team-match-attendance-summary';

const KICKOFF = '2026-09-30T12:00:00.000Z';
// KST 오후 7:12 / 오후 8:05 — 공개(킥오프 1시간 전, 오후 8:00) 전과 뒤.
const BEFORE_PUBLISH = Date.parse('2026-09-30T10:12:00.000Z');
const AFTER_PUBLISH = Date.parse('2026-09-30T11:05:00.000Z');

const player = (id: string, jerseyNumber: number) => ({
  id, userId: id, displayName: id, jerseyNumber, position: null, goalkeeper: false, positionX: null, positionY: null,
});

function lineup(opponent: V1TeamMatchLineup['opponent'], overrides: Partial<V1TeamMatchLineup> = {}): V1TeamMatchLineup {
  return {
    teamMatchId: 'tm-1', gameId: 'game-1', sideId: 'side-home', role: 'team_owner', lineupId: 'l-1', revision: 2,
    state: 'SUBMITTED', version: 2, formation: null, publicLineupAt: null, ownTeamName: '마포 FC',
    starters: [player('a', 1), player('b', 2), player('c', 3)], bench: [], opponent, ...overrides,
  };
}

describe('buildAttendanceSummary — 진행 체크리스트 참석명단 칸의 상대 명단 (H5 D-1)', () => {
  it('공개 전에는 상대의 제출 여부만 말하고 [보기] 입구가 없다', () => {
    const summary = buildAttendanceSummary('tm-1', lineup({ teamName: '합정 유나이티드', submitted: true, published: false, participantCount: null }), KICKOFF, BEFORE_PUBLISH);

    expect(summary.ownCount).toBe(3);
    expect(summary.opponent).toEqual({
      name: '합정 유나이티드',
      badge: { tone: 'green', label: '제출 완료' },
      note: '명단은 오후 8:00에 서로 공개돼요 · 지금은 제출 여부만 보여요',
      viewHref: null,
    });
  });

  it('공개 뒤에는 인원과 읽기 전용 화면 링크를 준다', () => {
    const summary = buildAttendanceSummary('tm-1', lineup({ teamName: '합정 유나이티드', submitted: true, published: true, participantCount: 6 }), KICKOFF, AFTER_PUBLISH);

    expect(summary.opponent).toEqual({
      name: '합정 유나이티드',
      badge: { tone: 'blue', label: '공개됨 · 6명' },
      note: '오후 8:00에 공개됐어요',
      viewHref: '/team-matches/tm-1/lineup/opponent',
    });
  });

  it('공개 시각이 지나도 상대가 안 냈으면 제출 전으로 남고 입구가 없다', () => {
    const summary = buildAttendanceSummary('tm-1', lineup({ teamName: '합정 유나이티드', submitted: false, published: false, participantCount: null }), KICKOFF, AFTER_PUBLISH);

    expect(summary.opponent).toMatchObject({ badge: { tone: 'grey', label: '제출 전' }, note: '상대 팀이 아직 참석명단을 내지 않았어요', viewHref: null });
  });

  it('우리가 아직 안 냈으면 인원이 없고, 상대가 미정이면 상대 줄이 없다', () => {
    const summary = buildAttendanceSummary('tm-1', lineup({ teamName: null, submitted: false, published: false, participantCount: null }, { state: 'DRAFT', revision: 1 }), KICKOFF, BEFORE_PUBLISH);

    expect(summary).toEqual({ ownCount: null, opponent: null });
  });
});
