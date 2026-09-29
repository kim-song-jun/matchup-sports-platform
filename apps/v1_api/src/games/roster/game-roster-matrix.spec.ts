import type { V1GameState } from '@prisma/client';
import { computeGameRoster, type GameRosterBaseEntry, type GameRosterComputationInput } from './game-roster-computation';
import type { LoadedGameRoster } from './game-roster-loader';
import { buildTeamRosterMatrix, type TeamRosterMatrixGame } from './game-roster-matrix';
import { decideTeamRosterAccess } from './team-roster-access';

const KICKOFF = new Date('2026-10-03T10:00:00.000Z');

const entry = (userId: string): GameRosterBaseEntry => ({
  userId,
  accountLinked: true,
  displayNameSnapshot: `선수-${userId}`,
  jerseyNumber: null,
  sourceParticipantId: `p-${userId}`,
});

function game(gameId: string, overrides: Partial<TeamRosterMatrixGame> = {}): TeamRosterMatrixGame {
  return {
    gameId,
    sideId: `side-${gameId}`,
    teamMatchId: `tm-${gameId}`,
    competitionId: 'cup',
    competitionKind: 'TOURNAMENT',
    competitionTitle: '가을 컵',
    opponentName: '상대',
    scheduledAt: KICKOFF,
    gameState: 'SCHEDULED' as V1GameState,
    ...overrides,
  };
}

function loaded(base: GameRosterBaseEntry[], extra: Partial<GameRosterComputationInput> = {}): LoadedGameRoster {
  const input: GameRosterComputationInput = {
    base,
    adjustments: [],
    unavailabilities: [],
    gameStartAt: KICKOFF,
    suspensionVerdicts: new Map(),
    ...extra,
  };
  return { context: {} as LoadedGameRoster['context'], baseSource: 'REGISTRATION', base, computation: computeGameRoster(input) };
}

describe('buildTeamRosterMatrix — 선수 × 경기 표', () => {
  const adjustment = {
    id: 'adj-1',
    userId: 'u1',
    reason: 'INJURY',
    actorUserId: 'manager',
    actorRole: 'TEAM_MANAGER',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    revokedAt: null,
  };
  const period = {
    id: 'un-1',
    userId: 'u2',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-10-10T00:00:00.000Z'),
    reason: 'PERSONAL',
    actorUserId: 'admin',
    actorRole: 'ADMIN',
    revokedAt: null,
  };

  it('경기마다 칸 상태·사유·행위자를 싣고, 한 경기의 빼기가 다른 경기 칸으로 새지 않는다', () => {
    const matrix = buildTeamRosterMatrix({
      canWrite: true,
      columns: [
        {
          game: game('g1'),
          loaded: loaded([entry('u1'), entry('u2'), entry('u3')], {
            adjustments: [adjustment],
            unavailabilities: [period],
            suspensionVerdicts: new Map([['u3', { suspended: true, reason: '레드카드', remainingMatches: 1 }]]),
          }),
        },
        // 같은 대회 다음 경기 — 조정 없음. 결장 기간 밖(시작 뒤)이라 u2 도 출전한다.
        {
          game: game('g2', { scheduledAt: new Date('2026-10-20T10:00:00.000Z') }),
          loaded: loaded([entry('u1'), entry('u2'), entry('u3')], {
            gameStartAt: new Date('2026-10-20T10:00:00.000Z'),
            unavailabilities: [period],
          }),
        },
      ],
    });

    const cells = new Map(matrix.players.map((player) => [player.userId, player.cells]));
    expect(cells.get('u1')?.map((cell) => cell.status)).toEqual(['EXCLUDED', 'PARTICIPATING']);
    expect(cells.get('u1')?.[0]).toMatchObject({ reason: 'INJURY', actorRole: 'TEAM_MANAGER', adjustmentId: 'adj-1' });
    expect(cells.get('u2')?.map((cell) => cell.status)).toEqual(['UNAVAILABLE', 'PARTICIPATING']);
    expect(cells.get('u2')?.[0]).toMatchObject({ reason: 'PERSONAL', actorRole: 'ADMIN', unavailabilityId: 'un-1' });
    expect(cells.get('u3')?.map((cell) => cell.status)).toEqual(['SUSPENDED', 'PARTICIPATING']);
    expect(cells.get('u3')?.[0]).toMatchObject({ reason: '레드카드', remainingMatches: 1, actorRole: null });
    expect(matrix.games.map((column) => column.summary)).toEqual([
      { participating: 0, excluded: 1, unavailable: 1, suspended: 1 },
      { participating: 3, excluded: 0, unavailable: 0, suspended: 0 },
    ]);
  });

  it('다른 대회 명단에만 있는 선수는 NOT_IN_ROSTER, 확정 명단이 없는 경기는 전원 NOT_IN_ROSTER', () => {
    const matrix = buildTeamRosterMatrix({
      canWrite: true,
      columns: [
        { game: game('cup-1'), loaded: loaded([entry('u1'), entry('u2')]) },
        { game: game('league-1', { competitionId: 'league', competitionKind: 'LEAGUE' }), loaded: loaded([entry('u2'), entry('u9')]) },
        { game: game('other-cup-1', { competitionId: 'other' }), loaded: null },
      ],
    });

    expect(matrix.players.map((player) => player.userId)).toEqual(['u1', 'u2', 'u9']);
    const statuses = Object.fromEntries(matrix.players.map((player) => [player.userId, player.cells.map((cell) => cell.status)]));
    expect(statuses).toEqual({
      u1: ['PARTICIPATING', 'NOT_IN_ROSTER', 'NOT_IN_ROSTER'],
      u2: ['PARTICIPATING', 'PARTICIPATING', 'NOT_IN_ROSTER'],
      u9: ['NOT_IN_ROSTER', 'PARTICIPATING', 'NOT_IN_ROSTER'],
    });
    expect(matrix.games.map((column) => [column.gameId, column.editable, column.summary === null])).toEqual([
      ['cup-1', true, false],
      ['league-1', true, false],
      ['other-cup-1', false, true],
    ]);
  });

  it('쓰기 권한이 없거나 경기가 SCHEDULED 가 아니면 editable 이 아니다', () => {
    const matrix = buildTeamRosterMatrix({
      canWrite: false,
      columns: [{ game: game('g1'), loaded: loaded([entry('u1')]) }],
    });
    expect(matrix.games[0].editable).toBe(false);
    const live = buildTeamRosterMatrix({
      canWrite: true,
      columns: [{ game: game('g1', { gameState: 'LIVE' as V1GameState }), loaded: loaded([entry('u1')]) }],
    });
    expect(live.games[0].editable).toBe(false);
  });
});

describe('decideTeamRosterAccess — 팀 단위 명단 권한', () => {
  it('팀 owner·manager 는 팀장으로 쓴다', () => {
    for (const membershipRole of ['owner', 'manager'] as const) {
      expect(decideTeamRosterAccess({ membershipRole, adminRole: null })).toEqual({
        viewerRole: 'TEAM_MANAGER',
        writeRole: 'TEAM_MANAGER',
      });
    }
  });

  it('플랫폼 어드민은 ADMIN 으로 쓰고, support 등급은 읽기만 한다', () => {
    expect(decideTeamRosterAccess({ membershipRole: null, adminRole: 'ops' })).toEqual({ viewerRole: 'ADMIN', writeRole: 'ADMIN' });
    expect(decideTeamRosterAccess({ membershipRole: null, adminRole: 'support' })).toEqual({ viewerRole: 'ADMIN', writeRole: null });
  });

  it('일반 팀원은 읽기만, 팀 밖 사람은 거부', () => {
    expect(decideTeamRosterAccess({ membershipRole: 'member', adminRole: null })).toEqual({
      viewerRole: 'TEAM_MEMBER',
      writeRole: null,
    });
    expect(decideTeamRosterAccess({ membershipRole: null, adminRole: null })).toBeNull();
  });
});

describe('buildTeamRosterMatrix — 선수 순서', () => {
  it('처음 나온 순서가 아니라 이름순이다 — 대회·리그마다 등번호가 달라 번호로 줄 세울 수 없다', () => {
    const named = (userId: string, name: string, jerseyNumber: number | null): GameRosterBaseEntry => ({
      ...entry(userId),
      displayNameSnapshot: name,
      jerseyNumber,
    });
    const matrix = buildTeamRosterMatrix({
      canWrite: true,
      columns: [
        { game: game('cup-1'), loaded: loaded([named('u1', '하늘', 1), named('u2', '가람', 9)]) },
        { game: game('league-1', { competitionId: 'league', competitionKind: 'LEAGUE' }), loaded: loaded([named('u3', '나래', 2)]) },
      ],
    });
    expect(matrix.players.map((player) => player.displayName)).toEqual(['가람', '나래', '하늘']);
  });
});
