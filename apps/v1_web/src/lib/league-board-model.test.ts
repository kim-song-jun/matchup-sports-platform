import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { buildLeagueBoard } from './league-board-model';

function fixture(overrides: Partial<V1LeagueFixture> & { teamMatchId: string }): V1LeagueFixture {
  return {
    title: '가을 리그 1주차',
    homeTeamId: 't1',
    awayTeamId: 't2',
    startAt: '2030-01-07T10:00:00.000Z',
    placeName: '장소 미정',
    status: 'matched',
    ...overrides,
  };
}

function slot(overrides: Partial<V1AdminBracketSlot> & { id: string }): V1AdminBracketSlot {
  return {
    kind: 'ENTRY',
    groupId: null,
    sourceGroupId: null,
    position: 1,
    label: '1번 자리',
    registrationId: null,
    teamName: null,
    ...overrides,
  };
}

const NAMES = new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]);

const SLOTS = [
  slot({ id: 's1', position: 1, label: '1번 자리' }),
  slot({ id: 's2', position: 2, label: '2번 자리' }),
  slot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
];

describe('buildLeagueBoard', () => {
  it('경기를 KST 날짜 열로 묶고 열·열 안을 시간 순으로 정렬한다 — 자정 직전 UTC 도 다음 KST 날짜로 간다', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'late', startAt: '2030-01-14T10:00:00.000Z' }),
        // 2030-01-07T16:00Z = KST 2030-01-08 01:00 — UTC 날짜로 묶으면 1/7 열에 잘못 들어간다.
        fixture({ teamMatchId: 'kst-next-day', startAt: '2030-01-07T16:00:00.000Z' }),
        fixture({ teamMatchId: 'b', startAt: '2030-01-07T11:00:00.000Z' }),
        fixture({ teamMatchId: 'a', startAt: '2030-01-07T10:00:00.000Z' }),
      ],
      slots: [],
      teamNameById: NAMES,
    });

    expect(columns.map((column) => column.key)).toEqual(['2030-01-07', '2030-01-08', '2030-01-14']);
    expect(columns[0].nodes.map((node) => node.fixtureId)).toEqual(['a', 'b']);
    expect(columns[1].nodes.map((node) => node.fixtureId)).toEqual(['kst-next-day']);
    // 주차 = 경기일 순번 — 공개 화면의 leagueWeekNumbers 와 같은 셈법이라 빈 날짜는 건너뛰지 않고 1,2,3.
    expect(columns.map((column) => column.weekNumber)).toEqual([1, 2, 3]);
  });

  it('사이드 라벨: 팀이 있으면 이름, 자리만 있으면 자리 라벨, 자리도 없는 원정은 부전승', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'filled', homeTeamId: 't1', awayTeamId: 't2', homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'slot-team', homeTeamId: 't9', awayTeamId: null, homeSlotId: 's3', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'legacy-bye', homeTeamId: 't1', awayTeamId: null }),
      ],
      slots: SLOTS,
      teamNameById: NAMES,
    });
    const byId = new Map(columns.flatMap((column) => column.nodes).map((node) => [node.fixtureId, node]));

    expect([byId.get('filled')!.home.label, byId.get('filled')!.away.label]).toEqual(['독수리FC', '호랑이FC']);
    expect([byId.get('empty')!.home.label, byId.get('empty')!.away.label]).toEqual(['1번 자리', '2번 자리']);
    expect(byId.get('empty')!.home).toMatchObject({ slotId: 's1', filled: false, registrationId: null });
    // 자리에 이미 팀 이름이 있으면 이름 맵보다 그것을 쓴다(자리가 정본).
    expect(byId.get('slot-team')!.home).toMatchObject({ label: '사자FC', filled: true, registrationId: 'r3' });
    expect(byId.get('legacy-bye')!.away).toMatchObject({ label: '부전승', slotId: null, filled: false });
  });

  it('공개 대기는 자리 경기에서 한쪽이라도 팀이 비었을 때만 — 다 찬 경기·자리 없는 기존 경기·취소 경기는 아니다', () => {
    const { columns, summary } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'both-empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'half', homeTeamId: 't1', awayTeamId: null, homeSlotId: 's3', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'full', homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'legacy-bye', homeTeamId: 't1', awayTeamId: null }),
        fixture({ teamMatchId: 'cancelled', status: 'cancelled', homeTeamId: null, awayTeamId: null, homeSlotId: null, awaySlotId: null }),
      ],
      slots: SLOTS,
      teamNameById: NAMES,
    });
    const hidden = columns.flatMap((column) => column.nodes).filter((node) => node.hiddenFromPublic).map((node) => node.fixtureId);

    expect(hidden.sort()).toEqual(['both-empty', 'half']);
    expect(summary.hiddenFixtureCount).toBe(2);
  });

  it('상태 태그: 취소는 game 이 뭐든 cancelled, 나머지는 PR-3 의 fixtureNodeState 와 같다', () => {
    const game: V1AdminBracketFixtureGame = {
      id: 'g1',
      state: 'ENDED',
      version: 3,
      hasLiveRecords: false,
      latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
    };
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'official', game }),
        // 리그 취소는 게임을 SCHEDULED 로 남긴다 — game 만 보면 예정으로 읽힌다.
        fixture({ teamMatchId: 'cancelled', status: 'cancelled', game: null }),
        fixture({ teamMatchId: 'no-game', game: null }),
      ],
      slots: [],
      teamNameById: NAMES,
    });
    const byId = new Map(columns.flatMap((column) => column.nodes).map((node) => [node.fixtureId, node]));

    expect(byId.get('official')!.state).toBe(fixtureNodeState(game));
    expect(byId.get('cancelled')!.state).toBe('cancelled');
    expect(byId.get('no-game')!.state).toBe(fixtureNodeState(null));
  });

  it('요약: 자리 수·배정 수·빈 자리 유무', () => {
    expect(buildLeagueBoard({ fixtures: [], slots: SLOTS, teamNameById: NAMES }).summary).toEqual({
      slotCount: 3,
      filledSlotCount: 1,
      hiddenFixtureCount: 0,
      hasEmptySlot: true,
    });
    const allFilled = SLOTS.map((s) => ({ ...s, registrationId: `r-${s.id}`, teamName: s.id }));
    expect(buildLeagueBoard({ fixtures: [], slots: allFilled, teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
    // 자리가 없는 리그(기존 방식)는 빈 자리도 없다 — 무작위 채우기 버튼의 근거.
    expect(buildLeagueBoard({ fixtures: [], slots: [], teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
  });
});
