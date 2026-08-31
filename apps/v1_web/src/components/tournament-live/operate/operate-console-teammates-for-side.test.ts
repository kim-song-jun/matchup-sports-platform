import { describe, expect, it } from 'vitest';
import { teammatesForSide } from './operate-console';
import type { GameLineup, GameLineupParticipant } from '@/types/game-operations';

// ─────────────────────────────────────────────────────────────────────────────
// lineup-revision-state-consistency 감사(2026-08-27) — 어시스트 후보 선택
// (`teammatesForSide`)는 `lineups.find(row => row.sideId === sideId)`로 배열의
// 첫 행(= revision desc 정렬의 최상단, DRAFT 포함)을 집었다. `LineupGrid`가 실제로
// 그리는 명단은 `latestOperableLineup`(SUBMITTED/LOCKED 중 최고 revision)이라,
// 팀이 제출된 라인업을 "다시 편집 → 저장"만 하고 제출을 누르지 않으면 두 목록이
// 서로 다른 리비전을 가리켰다 — 그리드에는 없는 선수가 어시스트 후보로 뜨는 모순.
// ─────────────────────────────────────────────────────────────────────────────

function participant(
  overrides: Partial<GameLineupParticipant> & Pick<GameLineupParticipant, 'id' | 'displayNameSnapshot'>,
): GameLineupParticipant {
  return {
    gameId: 'g-1',
    sideId: 'side-home',
    lineupId: 'lineup-home',
    userId: null,
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    arrivedAt: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

function lineup(participants: GameLineupParticipant[], overrides: Partial<GameLineup> = {}): GameLineup {
  return {
    id: 'lineup-home',
    gameId: 'g-1',
    sideId: 'side-home',
    revision: 1,
    state: 'SUBMITTED',
    version: 0,
    submittedAt: '2026-08-23T00:00:00.000Z',
    supersedesId: null,
    formation: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    participants,
    ...overrides,
  };
}

describe('teammatesForSide — 어시스트 후보 선택', () => {
  it('제출(SUBMITTED)된 라인업이 있는데 그 위에 미제출 DRAFT가 새로 올라와도, 후보는 여전히 제출된 명단에서 뽑는다', () => {
    const lineups: readonly GameLineup[] = [
      // listLineups는 [{sideId asc}, {revision desc}] 순이라 DRAFT가 배열 첫 행이다 —
      // `.find`로 첫 행을 집는 옛 구현이라면 여기서 rev2(DRAFT)의 '재편집선수'를 반환한다.
      lineup([participant({ id: 'p-edited', displayNameSnapshot: '재편집선수' })], {
        id: 'lineup-rev2',
        revision: 2,
        state: 'DRAFT',
      }),
      lineup([participant({ id: 'p-submitted', displayNameSnapshot: '제출선수' })], {
        id: 'lineup-rev1',
        revision: 1,
        state: 'SUBMITTED',
      }),
    ];

    const teammates = teammatesForSide('side-home', lineups, null);

    expect(teammates.map((p) => p.id)).toEqual(['p-submitted']);
  });

  it('제외 대상(득점자 본인)은 후보에서 빠진다', () => {
    const lineups: readonly GameLineup[] = [
      lineup([
        participant({ id: 'p-1', displayNameSnapshot: '득점자' }),
        participant({ id: 'p-2', displayNameSnapshot: '어시스트후보' }),
      ]),
    ];

    const teammates = teammatesForSide('side-home', lineups, 'p-1');

    expect(teammates.map((p) => p.id)).toEqual(['p-2']);
  });

  /**
   * [P1-c 후속] 계약이 뒤집혔다. 예전에는 "전부 DRAFT 면 후보가 없다"였는데, P1-c 로
   * **제출 없이 시작하는 경기가 정상 경로**가 되면서 그 규칙이 곧 "그런 경기에서는
   * 어시스트를 아무에게도 못 붙인다"가 됐다.
   *
   * 후보 목록은 라인업 그리드·검인 패널과 **같은 명단**을 봐야 한다는 원래 계약은
   * 그대로다 — 셋이 함께 폴백으로 옮겨 갔을 뿐이다(lineup-grid.tsx 의
   * `latestLineupForDisplay` 주석 참고).
   */
  it('전부 DRAFT 여도 후보로 쓴다 — 그리드·검인과 같은 명단을 본다 (P1-c 로 제출 없는 경기가 정상이 됐다)', () => {
    const lineups: readonly GameLineup[] = [
      lineup([participant({ id: 'p-draft', displayNameSnapshot: '초안선수' })], { state: 'DRAFT' }),
    ];

    expect(teammatesForSide('side-home', lineups, null).map((p) => p.id)).toEqual(['p-draft']);
  });

  it('sideId가 null이면 빈 배열을 반환한다', () => {
    expect(teammatesForSide(null, [], null)).toEqual([]);
  });
});
