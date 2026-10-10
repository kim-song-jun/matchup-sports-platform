import { describe, expect, it } from 'vitest';
import { buildSideLabelContext } from '@/lib/bracket-canvas-layout';
import type { LeagueBoardNode } from '@/lib/league-board-model';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import {
  bracketMobileNode,
  bracketMobileSide,
  buildBracketMobileRounds,
  buildLeagueMobileRounds,
  buildLeagueTournamentMobileRounds,
  candidatesFromLeagueTeams,
  candidatesFromRegistrations,
  hasTeam,
  leagueMobileNode,
  leagueMobileSide,
  pickableCandidates,
  pickInitialRoundKey,
  sideDisplayName,
} from './bracket-canvas-mobile-model';

describe('bracketMobileSide / sideDisplayName', () => {
  const slots = [
    makeSlot({ id: 's-gr', kind: 'GROUP_RANK', label: 'A조 1위' }),
    makeSlot({ id: 's-e', kind: 'ENTRY', label: '2번 자리', registrationId: 'r-2', teamName: '마포FC' }),
  ];
  const groups = [
    makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
    makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
  ];
  const quarter = makeFixture({
    id: 'f-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-gr', awaySlotId: 's-e', awayRegistrationId: 'r-2', awayTeamName: '마포FC',
  });
  const semi = makeFixture({
    id: 'f-5', groupId: 'g-s', fixtureNumber: 5, bracketSources: [{ fixtureId: 'f-1', outcome: 'WINNER', side: 'HOME' }],
  });
  const labels = buildSideLabelContext(groups, [quarter, semi], slots);

  it('팀이 있으면 팀 이름이 보이고 자리 라벨은 숨는다', () => {
    const away = bracketMobileSide(quarter, 'AWAY', labels);
    expect(away).toEqual({ slotId: 's-e', slotKind: 'ENTRY', source: 'slot', registrationId: 'r-2', teamName: '마포FC', slotLabel: null });
    expect(hasTeam(away)).toBe(true);
    expect(sideDisplayName(away)).toBe('마포FC');
  });

  it('팀이 없고 자리가 있으면 자리 라벨 — 조 순위 자리는 종류도 보존한다', () => {
    const home = bracketMobileSide(quarter, 'HOME', labels);
    expect(home).toEqual({ slotId: 's-gr', slotKind: 'GROUP_RANK', source: 'slot', registrationId: null, teamName: null, slotLabel: 'A조 1위' });
    expect(hasTeam(home)).toBe(false);
    expect(sideDisplayName(home)).toBe('A조 1위');
  });

  it('자리가 없고 앞 경기 결과를 기다리면 PR-3 라벨("8강 1번 경기 승자"), 아무것도 없으면 미정', () => {
    const waiting = bracketMobileSide(semi, 'HOME', labels);
    expect(waiting.slotId).toBeNull();
    expect(waiting.slotKind).toBeNull();
    expect(waiting.source).toBe('feeder');
    expect(bracketMobileSide(semi, 'AWAY', labels).source).toBe('direct');
    expect(sideDisplayName(waiting)).toBe('8강 1번 경기 승자');
    expect(sideDisplayName(bracketMobileSide(semi, 'AWAY', labels))).toBe('미정');
  });
});

describe('leagueMobileSide', () => {
  const slotsById = new Map([['s-1', makeSlot({ id: 's-1', kind: 'ENTRY' })]]);

  it('보드 사이드에서 팀 이름·자리 라벨을 갈라 받고 자리 종류를 자리 목록에서 찾는다', () => {
    expect(leagueMobileSide({ slotId: 's-1', label: '강남FC', filled: true, registrationId: 'r-1' }, slotsById)).toEqual({
      slotId: 's-1', slotKind: 'ENTRY', source: 'slot', registrationId: 'r-1', teamName: '강남FC', slotLabel: null,
    });
    expect(leagueMobileSide({ slotId: 's-1', label: '1번 자리', filled: false, registrationId: null }, slotsById)).toEqual({
      slotId: 's-1', slotKind: 'ENTRY', source: 'slot', registrationId: null, teamName: null, slotLabel: '1번 자리',
    });
  });

  it('자리가 없는 사이드(예전 경기)는 자리 종류가 없고, 부전승 라벨도 그대로 보인다', () => {
    const bye = leagueMobileSide({ slotId: null, label: '부전승', filled: false, registrationId: null }, slotsById);
    expect(bye.slotKind).toBeNull();
    expect(sideDisplayName(bye)).toBe('부전승');
  });
});

describe('후보 팀', () => {
  it('확정된 등록만 후보가 된다', () => {
    expect(
      candidatesFromRegistrations([
        { id: 'r-1', status: 'confirmed', teamName: '강남FC' },
        { id: 'r-2', status: 'waitlisted', teamName: '마포FC' },
        { id: 'r-3', status: 'confirmed', teamName: null },
      ]),
    ).toEqual([
      { registrationId: 'r-1', teamName: '강남FC' },
      { registrationId: 'r-3', teamName: '이름 없는 팀' },
    ]);
  });

  it('리그 참가팀은 registrationId 가 있는 팀만 후보가 된다 (값이 null 이면 빠진다)', () => {
    expect(
      candidatesFromLeagueTeams([
        { name: '강남FC', registrationId: 'r-1' },
        { name: '없음FC', registrationId: null },
      ]),
    ).toEqual([{ registrationId: 'r-1', teamName: '강남FC' }]);
  });

  it('이미 다른 ENTRY·BYE 자리에 있는 팀은 빼고, GROUP_RANK 자리에 있는 팀과 지금 자리의 팀은 다르게 다룬다', () => {
    const target = makeSlot({ id: 's-target', kind: 'ENTRY' });
    const slots = [
      target,
      makeSlot({ id: 's-e', kind: 'ENTRY', registrationId: 'r-3' }),
      makeSlot({ id: 's-b', kind: 'BYE', registrationId: 'r-5' }),
      makeSlot({ id: 's-gr', kind: 'GROUP_RANK', registrationId: 'r-4' }),
    ];
    const candidates = ['r-1', 'r-2', 'r-3', 'r-4', 'r-5'].map((registrationId) => ({ registrationId, teamName: registrationId }));
    expect(pickableCandidates(candidates, slots, target).map((c) => c.registrationId)).toEqual(['r-1', 'r-2', 'r-4']);

    // 대조군: 자기 자리의 팀은 제외되지 않는다(비우기·교체는 호출부가 따로 다룬다)
    const own = { ...target, registrationId: 'r-1' };
    expect(pickableCandidates(candidates, [own, ...slots.slice(1)], own).map((c) => c.registrationId)).toContain('r-1');
  });
});

const officialGame = (entryMethod: 'quick' | 'console' = 'quick'): V1AdminBracketFixtureGame =>
  makeGame({
    state: 'ENDED',
    latestRevision: { id: 'rev-1', state: 'OFFICIAL', score: { home: 2, away: 1, penalties: { home: 4, away: 3 } }, entryMethod },
  });

describe('bracketMobileNode — 상태·점수·입력 방식', () => {
  const group = makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 });
  const nodeOf = (overrides: Parameters<typeof makeFixture>[0], knockout = true, groupName: string | null = '8강') => {
    const fixture = makeFixture(overrides);
    return bracketMobileNode(fixture, groupName, knockout, buildSideLabelContext([group], [fixture], []));
  };

  it('제목은 조 이름 · 경기 번호, 조 이름이 없으면 경기 번호만이고 결선 여부는 그대로 실린다', () => {
    const inGroup = nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 3 });
    expect(inGroup.title).toBe('8강 · 3번 경기');
    expect(inGroup.knockout).toBe(true);
    const orphan = nodeOf({ id: 'f-9', groupId: null, fixtureNumber: 9 }, false, null);
    expect(orphan.title).toBe('9번 경기');
    expect(orphan.knockout).toBe(false);
  });

  it('취소된 경기는 게임이 SCHEDULED 로 남아 있어도 cancelled — 같은 게임의 비취소 경기가 대조군', () => {
    expect(nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, status: 'cancelled', game: makeGame() }).state).toBe('cancelled');
    expect(nodeOf({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2, game: makeGame() }).state).toBe('scheduled');
  });

  it('점수는 확정(또는 확정 전) 결과에만 나온다 — 무효된 리비전에 점수가 남아 있어도 숨긴다', () => {
    const official = nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, game: officialGame() });
    expect(official.state).toBe('official');
    expect(official.scoreText).toBe('2:1 (승부차기 4:3)');

    const submitted = nodeOf({
      id: 'f-2', groupId: 'g-q', fixtureNumber: 2,
      game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev-2', state: 'SUBMITTED', score: { home: 1, away: 0 }, entryMethod: 'console' } }),
    });
    expect(submitted.state).toBe('submitted');
    expect(submitted.scoreText).toBe('1:0');

    const voided = nodeOf({
      id: 'f-3', groupId: 'g-q', fixtureNumber: 3,
      game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev-3', state: 'VOID', score: { home: 5, away: 5 }, entryMethod: 'quick' } }),
    });
    expect(voided.state).toBe('scheduled');
    expect(voided.scoreText).toBeNull();

    expect(nodeOf({ id: 'f-4', groupId: 'g-q', fixtureNumber: 4, game: makeGame() }).scoreText).toBeNull();
    expect(nodeOf({ id: 'f-5', groupId: 'g-q', fixtureNumber: 5, game: null }).scoreText).toBeNull();
  });

  it('빠른 입력 표시(quickEntered)는 리비전 entryMethod 가 quick 일 때만 — console·정정·게임 없음은 아니다', () => {
    expect(nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, game: officialGame('quick') }).quickEntered).toBe(true);
    expect(nodeOf({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2, game: officialGame('console') }).quickEntered).toBe(false);
    expect(nodeOf({ id: 'f-3', groupId: 'g-q', fixtureNumber: 3, game: null }).quickEntered).toBe(false);
  });

  it('일정·장소·게임은 응답 그대로 실린다', () => {
    const node = nodeOf({
      id: 'f-1', groupId: 'g-q', fixtureNumber: 1, scheduledAt: '2026-10-12T05:00:00.000Z', venue: '구장', game: makeGame({ id: 'g-7', version: 3 }),
    });
    expect(node.scheduledAt).toBe('2026-10-12T05:00:00.000Z');
    expect(node.venue).toBe('구장');
    expect(node.game).toMatchObject({ id: 'g-7', version: 3 });
  });
});

describe('leagueMobileNode', () => {
  const boardNode = (overrides: Partial<LeagueBoardNode> = {}): LeagueBoardNode => ({
    fixtureId: 'm-1', title: '1주차', startAt: '2026-10-12T05:00:00.000Z', placeName: '구장', state: 'scheduled', hiddenFromPublic: false,
    home: { slotId: 's-1', label: '강남FC', filled: true, registrationId: 'r-1' },
    away: { slotId: 's-2', label: '2번 자리', filled: false, registrationId: null },
    game: null, ...overrides,
  });
  const slotsById = new Map([
    ['s-1', makeSlot({ id: 's-1' })],
    ['s-2', makeSlot({ id: 's-2' })],
  ]);

  it('보드 노드의 제목·상태·일정을 옮기고, 리그는 결선이 아니다', () => {
    const node = leagueMobileNode(boardNode({ state: 'cancelled' }), slotsById);
    expect(node).toMatchObject({ fixtureId: 'm-1', title: '1주차', state: 'cancelled', scheduledAt: '2026-10-12T05:00:00.000Z', venue: '구장', knockout: false });
    expect(sideDisplayName(node.home)).toBe('강남FC');
    expect(sideDisplayName(node.away)).toBe('2번 자리');
  });

  it('점수·빠른 입력 표시는 토너먼트 칸과 같은 규칙이다', () => {
    const node = leagueMobileNode(boardNode({ state: 'official', game: officialGame('quick') }), slotsById);
    expect(node.scoreText).toBe('2:1 (승부차기 4:3)');
    expect(node.quickEntered).toBe(true);
    expect(leagueMobileNode(boardNode({ state: 'scheduled', game: makeGame() }), slotsById).scoreText).toBeNull();
  });
});

describe('buildBracketMobileRounds', () => {
  const knockoutGroups = [
    // 3·4위전의 sortOrder 가 결승보다 앞서도 결승 탭 안에서는 결승이 먼저여야 한다.
    makeGroup({ id: 'g-3', phase: 'third_place', name: '3위 결정전', sortOrder: 3 }),
    makeGroup({ id: 'g-f', phase: 'final', name: '결승', sortOrder: 4 }),
    makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
    makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
  ];
  const knockoutFixtures = [
    makeFixture({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2 }),
    makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1 }),
    makeFixture({ id: 'f-5', groupId: 'g-s', fixtureNumber: 5 }),
    makeFixture({ id: 'f-7', groupId: 'g-f', fixtureNumber: 7 }),
    makeFixture({ id: 'f-8', groupId: 'g-3', fixtureNumber: 8 }),
  ];

  it('탭은 단계 순서이고 3·4위전은 결승 탭 안의 두 번째 섹션이다', () => {
    const rounds = buildBracketMobileRounds({ groups: knockoutGroups, fixtures: knockoutFixtures, slots: [] });
    expect(rounds.map((r) => r.label)).toEqual(['8강', '4강', '결승']);
    expect(rounds[2].sections.map((s) => s.heading)).toEqual(['결승', '3위 결정전']);
    // 대조군: 8강 안에서 경기 번호 순
    expect(rounds[0].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['f-1', 'f-2']);
    expect(rounds[0].sections[0].nodes[0].title).toBe('8강 · 1번 경기');
    expect(rounds[0].sections[0].nodes[0].knockout).toBe(true);
  });

  it('같은 경기 번호는 차수(leg) 순이다', () => {
    const [round] = buildBracketMobileRounds({
      groups: [makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 })],
      fixtures: [
        makeFixture({ id: 'leg-2', groupId: 'g-q', fixtureNumber: 1, legNumber: 2 }),
        makeFixture({ id: 'leg-1', groupId: 'g-q', fixtureNumber: 1, legNumber: 1 }),
      ],
      slots: [],
    });
    expect(round.sections[0].nodes.map((n) => n.fixtureId)).toEqual(['leg-1', 'leg-2']);
  });

  it('조별 조는 한 탭으로 묶이고, 조가 하나뿐이면 그 조 이름이 탭 이름이다', () => {
    const multi = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-a', phase: 'group', name: 'A조', sortOrder: 1 }),
        makeGroup({ id: 'g-b', phase: 'group', name: 'B조', sortOrder: 2 }),
        makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 3 }),
      ],
      fixtures: [
        makeFixture({ id: 'a1', groupId: 'g-a', fixtureNumber: 1 }),
        makeFixture({ id: 'b1', groupId: 'g-b', fixtureNumber: 2 }),
        makeFixture({ id: 's1', groupId: 'g-s', fixtureNumber: 3 }),
      ],
      slots: [],
    });
    expect(multi.map((r) => r.label)).toEqual(['조별', '4강']);
    expect(multi[0].sections.map((s) => s.heading)).toEqual(['A조', 'B조']);
    expect(multi[0].sections[0].nodes[0].knockout).toBe(false);

    const single = buildBracketMobileRounds({
      groups: [makeGroup({ id: 'g-l', phase: 'group', name: '리그', sortOrder: 1 })],
      fixtures: [makeFixture({ id: 'l1', groupId: 'g-l', fixtureNumber: 1 })],
      slots: [],
    });
    expect(single.map((r) => r.label)).toEqual(['리그']);
  });

  it('경기가 없는 조는 탭을 만들지 않고, 조에 속하지 않은 경기는 기타 탭으로 남긴다(조용히 버리지 않는다)', () => {
    const rounds = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
        makeGroup({ id: 'g-empty', phase: 'semi', name: '4강', sortOrder: 2 }),
      ],
      fixtures: [
        makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1 }),
        makeFixture({ id: 'orphan', groupId: null, fixtureNumber: 9 }),
        makeFixture({ id: 'ghost', groupId: 'g-deleted', fixtureNumber: 10 }),
      ],
      slots: [],
    });
    expect(rounds.map((r) => r.label)).toEqual(['8강', '기타']);
    expect(rounds[1].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['orphan', 'ghost']);
  });

  it('칸의 사이드 라벨은 같은 응답의 자리·앞 경기 정보로 채워진다', () => {
    const [quarterRound, semiRound] = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
        makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
      ],
      fixtures: [
        makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1' }),
        makeFixture({ id: 'f-5', groupId: 'g-s', fixtureNumber: 5, bracketSources: [{ fixtureId: 'f-1', outcome: 'WINNER', side: 'AWAY' }] }),
      ],
      slots: [makeSlot({ id: 's-1', label: '1번 자리' })],
    });
    expect(sideDisplayName(quarterRound.sections[0].nodes[0].home)).toBe('1번 자리');
    expect(sideDisplayName(semiRound.sections[0].nodes[0].away)).toBe('8강 1번 경기 승자');
  });
});

describe('pickInitialRoundKey', () => {
  const round = (key: string, states: Array<'scheduled' | 'official' | 'cancelled'>) => ({
    key,
    label: key,
    sections: [{ key, heading: null, nodes: states.map((state, i) => ({ fixtureId: `${key}-${i}`, state }) as never) }],
  });

  it('아직 끝나지 않은 경기가 있는 첫 라운드를 고른다', () => {
    expect(pickInitialRoundKey([round('a', ['official']), round('b', ['official', 'scheduled']), round('c', ['scheduled'])])).toBe('b');
  });
  it('전부 끝났으면 마지막 라운드, 비었으면 null', () => {
    expect(pickInitialRoundKey([round('a', ['official']), round('b', ['cancelled', 'official'])])).toBe('b');
    expect(pickInitialRoundKey([])).toBeNull();
  });
});

describe('buildLeagueMobileRounds', () => {
  const leagueFixture = (o: Partial<V1LeagueFixture> & { teamMatchId: string; startAt: string }): V1LeagueFixture =>
    ({ title: '', homeTeamId: null, awayTeamId: null, placeName: '구장', status: 'matched', ...o }) as unknown as V1LeagueFixture;

  it('KST 날짜별로 묶여 N주차 라운드가 된다 — 자정 직전·직후 경계의 양쪽 대조군 포함', () => {
    const rounds = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-late', startAt: '2026-10-11T14:59:00.000Z' }), // KST 10/11 23:59
        leagueFixture({ teamMatchId: 'm-0', startAt: '2026-10-11T15:00:00.000Z' }), // KST 10/12 00:00
        leagueFixture({ teamMatchId: 'm-1', startAt: '2026-10-12T05:00:00.000Z' }), // KST 10/12 14:00
      ],
      slots: [],
      teamNameById: new Map(),
    });
    expect(rounds.map((r) => [r.key, r.label])).toEqual([['2026-10-11', '1주차'], ['2026-10-12', '2주차']]);
    expect(rounds[1].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['m-0', 'm-1']);
    expect(rounds[1].sections[0].nodes[0].knockout).toBe(false);
  });

  it('팀 이름은 자리에서, 자리가 없는 기존 경기는 팀 id 로 찾는다 — 빈 사이드는 자리 라벨', () => {
    const slots = [
      makeSlot({ id: 's-1', label: '1번 자리', registrationId: 'r-1', teamName: '강남FC' }),
      makeSlot({ id: 's-2', label: '2번 자리' }),
    ];
    const [round] = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-slot', startAt: '2026-10-12T05:00:00.000Z', homeSlotId: 's-1', awaySlotId: 's-2', homeTeamId: 'team-1', awayTeamId: null }),
        leagueFixture({ teamMatchId: 'm-legacy', startAt: '2026-10-12T06:00:00.000Z', homeTeamId: 'team-9', awayTeamId: 'team-8' }),
      ],
      slots,
      teamNameById: new Map([['team-9', '서초FC'], ['team-8', '송파FC']]),
    });
    const [withSlots, legacy] = round.sections[0].nodes;
    expect(sideDisplayName(withSlots.home)).toBe('강남FC');
    expect(withSlots.home.registrationId).toBe('r-1');
    expect(sideDisplayName(withSlots.away)).toBe('2번 자리');
    expect(withSlots.away.slotKind).toBe('ENTRY');
    expect(sideDisplayName(legacy.home)).toBe('서초FC');
    expect(legacy.home.slotId).toBeNull();
  });

  it('취소된 경기는 취소 칸으로 남고 라운드에서 빠지지 않는다', () => {
    const [round] = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-x', startAt: '2026-10-12T05:00:00.000Z', status: 'cancelled' }),
        leagueFixture({ teamMatchId: 'm-y', startAt: '2026-10-12T06:00:00.000Z' }),
      ],
      slots: [],
      teamNameById: new Map(),
    });
    expect(round.sections[0].nodes.map((n) => [n.fixtureId, n.state])).toEqual([['m-x', 'cancelled'], ['m-y', 'scheduled']]);
  });
});

describe('buildLeagueTournamentMobileRounds', () => {
  const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
  const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
  const fixtures = [
    makeFixture({ id: 'a10', groupId: 'gA', fixtureNumber: 5, round: 'league_r10' }),
    makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'b1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1' }),
    makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 3, round: 'league_r2' }),
  ];

  it('라운드 번호 순서의 탭이 되고 섹션은 그 라운드에 경기가 있는 조만 가진다', () => {
    const rounds = buildLeagueTournamentMobileRounds({ groups: [gB, gA], fixtures, slots: [] });
    expect(rounds.map((r) => r.label)).toEqual(['1라운드', '2라운드', '10라운드']);
    expect(rounds[0].sections.map((s) => [s.heading, s.nodes.map((n) => n.fixtureId)])).toEqual([['A조', ['a1']], ['B조', ['b1']]]);
    expect(rounds[1].sections.map((s) => s.heading)).toEqual(['A조']);
  });

  it('옛 경기와 번호 경기가 섞여도 탭은 번호 줄 하나씩이고 옛 묶음은 같은 번호 탭에 합쳐진다', () => {
    const legacy = [1, 2, 3].map((n) => makeFixture({ id: `o${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' }));
    const rounds = buildLeagueTournamentMobileRounds({
      groups: [gA], slots: [], fixtures: [...legacy, makeFixture({ id: 'n2', groupId: 'gA', fixtureNumber: 9, round: 'league_r2' })],
    });
    expect(rounds.map((round) => round.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(rounds[1].sections[0].nodes.map((node) => node.fixtureId)).toEqual(['o2', 'n2']);
  });

  it('조가 하나면 섹션 제목이 없고 칸 제목은 번호만이다', () => {
    const [round] = buildLeagueTournamentMobileRounds({ groups: [gA], fixtures: [fixtures[1]], slots: [] });
    expect(round.sections[0].heading).toBeNull();
    expect(round.sections[0].nodes[0].title).toBe('1번 경기');
  });

  it('여러 조면 칸 제목에 조 이름이 붙는다', () => {
    const [round] = buildLeagueTournamentMobileRounds({ groups: [gA, gB], fixtures, slots: [] });
    expect(round.sections[1].nodes[0].title).toBe('B조 · 2번 경기');
  });
});
