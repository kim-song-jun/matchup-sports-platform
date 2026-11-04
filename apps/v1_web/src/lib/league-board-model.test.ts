import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { buildLeagueBoard, leagueDirectPlacedRegistrationIds } from './league-board-model';

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
  // 2026-11-03 사용자 확정: 칸은 경기일이 아니라 KST 달력 주(월~일)다. 2030-01-07 은 월요일.
  it('경기를 KST 달력 주 칸으로 묶고 칸·칸 안을 시간 순으로 정렬한다 — 일요일 자정 직후 UTC 도 다음 KST 주로 간다', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [
        // 2030-01-13T16:00Z = KST 1/14(월) 01:00 — UTC 날짜(1/13 일)로 묶으면 1/7 주에 잘못 들어간다.
        fixture({ teamMatchId: 'kst-next-week', startAt: '2030-01-13T16:00:00.000Z' }),
        fixture({ teamMatchId: 'sat', startAt: '2030-01-12T01:00:00.000Z' }),
        fixture({ teamMatchId: 'b', startAt: '2030-01-07T11:00:00.000Z' }),
        fixture({ teamMatchId: 'a', startAt: '2030-01-07T10:00:00.000Z' }),
      ],
      slots: [],
      teamNameById: NAMES,
    });

    expect(columns.map((column) => column.key)).toEqual(['2030-01-07', '2030-01-14']);
    expect(columns[0].nodes.map((node) => node.fixtureId)).toEqual(['a', 'b', 'sat']);
    expect(columns[1].nodes.map((node) => node.fixtureId)).toEqual(['kst-next-week']);
    expect(columns.map((column) => column.weekNumber)).toEqual([1, 2]);
    expect(columns[0]).toMatchObject({ startDate: '2030-01-07', endDate: '2030-01-13', multiDay: true });
    expect(columns[1].multiDay).toBe(false);
  });

  it('주차 요약: 쉬는 팀·두 경기 팀·경기 수는 취소 경기를 빼고 센다', () => {
    const names = new Map([['t1', '독수리FC'], ['t2', '호랑이FC'], ['t3', '사자FC'], ['t4', '곰FC']]);
    const { columns, summary } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'm1', homeTeamId: 't1', awayTeamId: 't2', startAt: '2030-01-12T01:00:00.000Z' }),
        fixture({ teamMatchId: 'm2', homeTeamId: 't1', awayTeamId: 't3', startAt: '2030-01-13T01:00:00.000Z' }),
        fixture({ teamMatchId: 'gone', homeTeamId: 't4', awayTeamId: 't2', startAt: '2030-01-13T03:00:00.000Z', status: 'cancelled' }),
      ],
      slots: [],
      teamNameById: names,
    });
    expect(columns[0].summary).toEqual({ gameCount: 2, restingTeamNames: ['곰FC'], doubleBookedTeamNames: ['독수리FC'] });
    // 6쌍 중 t1-t2, t1-t3 두 쌍만 붙었다 — 취소된 t4-t2 는 붙은 것으로 치지 않는다.
    expect(summary.unplayedPairCount).toBe(4);
  });

  it('팀 목록을 아직 모르면 쉬는 팀·안 붙은 대진을 지어내지 않는다', () => {
    const { columns, summary } = buildLeagueBoard({
      fixtures: [fixture({ teamMatchId: 'm1' })],
      slots: [],
      teamNameById: new Map(),
    });
    expect(columns[0].summary.restingTeamNames).toEqual([]);
    expect(summary.unplayedPairCount).toBe(0);
  });

  it('PR 통합 회귀: 무효 경기는 주차 경기 수·중복·미편성 대진 집계에서 제외한다', () => {
    const names = new Map([...NAMES, ['t3', '사자FC']]);
    const { columns, summary } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'live', homeTeamId: 't1', awayTeamId: 't2' }),
        fixture({ teamMatchId: 'void', homeTeamId: 't1', awayTeamId: 't3', resultStage: 'voided' }),
      ],
      slots: [],
      teamNameById: names,
    });
    expect(columns[0].nodes).toHaveLength(2);
    expect(columns[0].summary).toEqual({ gameCount: 1, restingTeamNames: ['사자FC'], doubleBookedTeamNames: [] });
    expect(summary.unplayedPairCount).toBe(2);
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
      hasOfficialResult: true,
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
      // 경기가 없으니 두 팀(독수리·호랑이) 한 쌍이 아직 안 붙었다.
      unplayedPairCount: 1,
    });
    const allFilled = SLOTS.map((s) => ({ ...s, registrationId: `r-${s.id}`, teamName: s.id }));
    expect(buildLeagueBoard({ fixtures: [], slots: allFilled, teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
    // 자리가 없는 리그(기존 방식)는 빈 자리도 없다 — 무작위 채우기 버튼의 근거.
    expect(buildLeagueBoard({ fixtures: [], slots: [], teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
  });
});

describe('leagueDirectPlacedRegistrationIds', () => {
  const teams: V1AdminLeagueTeam[] = [
    { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
    { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
    { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r3' },
    { teamId: 't4', name: '곰FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: null },
  ];
  const slots = [slot({ id: 's1' }), slot({ id: 's2' })];

  it('자리 없는 사이드의 팀만 모은다 — 자리에 연결된 사이드는 제외, 자리 없는 사이드는 포함', () => {
    const ids = leagueDirectPlacedRegistrationIds(
      [
        fixture({ teamMatchId: 'slotted', homeTeamId: 't1', awayTeamId: 't2', homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'legacy', homeTeamId: 't3', awayTeamId: null, homeSlotId: null, awaySlotId: null }),
      ],
      slots,
      teams,
    );
    expect([...ids]).toEqual(['r3']);
  });

  it('취소된 경기(경기 상태·게임 상태 모두)는 세지 않고, 등록 id 가 없는 팀은 건너뛴다', () => {
    const cancelledGame = { state: 'CANCELLED', latestRevision: null } as unknown as V1AdminBracketFixtureGame;
    const ids = leagueDirectPlacedRegistrationIds(
      [
        fixture({ teamMatchId: 'c1', homeTeamId: 't1', awayTeamId: 't2', status: 'cancelled' }),
        fixture({ teamMatchId: 'c2', homeTeamId: 't1', awayTeamId: 't2', game: cancelledGame }),
        fixture({ teamMatchId: 'no-reg', homeTeamId: 't4', awayTeamId: 't3' }),
      ],
      slots,
      teams,
    );
    expect([...ids]).toEqual(['r3']);
  });
});


describe('리그 무효 경기 상태', () => {
  it('무효 경기를 예정 경기로 표시하지 않는다', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [fixture({ teamMatchId: 'void', resultStage: 'voided' })],
      slots: [], teamNameById: NAMES,
    });
    expect(columns[0].nodes[0].state).toBe('voided');
  });
});
