import { Test } from '@nestjs/testing';
import { computeGameRoster } from '../games/roster/game-roster-computation';
import { loadCompetitionRosterBase, loadGameRoster } from '../games/roster/game-roster-loader';
import { PrismaService } from '../prisma/prisma.service';
import { LineupTodoService } from './lineup-todo.service';
import { TeamUpcomingGamesService } from './team-upcoming-games.service';

// 명단 계산 입력(DB 로더)만 대체한다. 계산 자체(`computeGameRoster`)는 진짜를 쓴다.
jest.mock('../games/roster/game-roster-loader', () => ({
  loadCompetitionRosterBase: jest.fn(),
  loadGameRoster: jest.fn(),
}));
jest.mock('../tournaments/discipline/team-game-order', () => ({
  loadTeamCompetitionGameOrder: jest.fn().mockResolvedValue([]),
}));

const NOW = new Date('2026-09-29T15:00:00.000Z');
const PAST = new Date('2026-09-28T10:00:00.000Z');
const LEAGUE_KICKOFF = new Date('2026-09-29T16:10:00.000Z');
const FRIENDLY_KICKOFF = new Date('2026-10-03T10:00:00.000Z');
const OTHER_TEAM_KICKOFF = new Date('2026-09-29T15:30:00.000Z');

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const TEAM_X = 'team-x';
const OPPONENT = 'team-opponent';
const LEAGUE_ID = 'league-1';

// 대조군: 두 선수가 같은 팀의 같은 경기를 보되 한 명은 명단에서 빠져 있다.
const PLAYER_IN = 'user-in';
const PLAYER_OUT = 'user-out';
const OUTSIDER = 'user-outsider';

interface FakeMatch {
  id: string;
  startAt: Date;
  hostTeamId: string;
  hostName: string;
  kind: 'LEAGUE' | 'FRIENDLY';
  placeName: string | null;
}

const MATCHES: FakeMatch[] = [
  { id: 'match-past', startAt: PAST, hostTeamId: TEAM_A, hostName: '팀A', kind: 'FRIENDLY', placeName: null },
  { id: 'match-league', startAt: LEAGUE_KICKOFF, hostTeamId: TEAM_A, hostName: '팀A', kind: 'LEAGUE', placeName: '망원 유수지 풋살장' },
  { id: 'match-friendly', startAt: FRIENDLY_KICKOFF, hostTeamId: TEAM_A, hostName: '팀A', kind: 'FRIENDLY', placeName: '합정 풋살장' },
  { id: 'match-b', startAt: new Date('2026-10-05T10:00:00.000Z'), hostTeamId: TEAM_B, hostName: '팀B', kind: 'FRIENDLY', placeName: null },
  { id: 'match-x', startAt: OTHER_TEAM_KICKOFF, hostTeamId: TEAM_X, hostName: '남의 팀', kind: 'FRIENDLY', placeName: null },
];

type LineupRow = { id: string; gameId: string; sideId: string; revision: number; state: 'DRAFT' | 'SUBMITTED' | 'LOCKED' };

interface FakeDb {
  lineups: LineupRow[];
  participants: Array<{ lineupId: string; userId: string }>;
}

function toTeamMatchRow(match: FakeMatch) {
  const isLeague = match.kind === 'LEAGUE';
  return {
    id: match.id,
    title: isLeague ? '가을 정규 리그 1주차 1경기' : '토요일 친선 한 판',
    startAt: match.startAt,
    hostTeamId: match.hostTeamId,
    hostTeam: { name: match.hostName },
    approvedApplicantTeamId: OPPONENT,
    approvedApplicantTeam: { name: '상대 FC' },
    leagueId: isLeague ? LEAGUE_ID : null,
    tournamentId: null,
    tournament: null,
    tournamentDetails: null,
    league: isLeague ? { title: '가을 정규 리그' } : null,
    game: { id: `game-${match.id}` },
  };
}

// 팀 A 의 활성 팀원. OUTSIDER 는 어느 팀에도 없다.
const TEAM_A_MEMBERS = new Set([PLAYER_IN, PLAYER_OUT]);

function buildPrisma(db: FakeDb) {
  const sides = MATCHES.flatMap((match) => [
    { id: `side-${match.id}-home`, gameId: `game-${match.id}`, teamId: match.hostTeamId, game: { teamMatchId: match.id } },
    { id: `side-${match.id}-away`, gameId: `game-${match.id}`, teamId: OPPONENT, game: { teamMatchId: match.id } },
  ]);
  return {
    v1Team: { findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id })) },
    v1TeamMembership: {
      findFirst: jest.fn(({ where }: { where: { teamId: string; userId: string } }) =>
        Promise.resolve(where.teamId === TEAM_A && TEAM_A_MEMBERS.has(where.userId) ? { id: `m-${where.userId}` } : null),
      ),
    },
    v1TeamMatch: {
      findMany: jest.fn((args: { where: { status?: string; startAt?: { gte: Date }; OR?: Array<Record<string, { in: string[] }>> } }) => {
        if (args.where.status !== 'matched') return Promise.resolve([{ leagueId: LEAGUE_ID, startAt: LEAGUE_KICKOFF }]);
        const teamIds = args.where.OR?.[0]?.hostTeamId?.in;
        return Promise.resolve(
          MATCHES.filter(
            (match) =>
              match.startAt >= (args.where.startAt?.gte ?? new Date(0)) &&
              (teamIds === undefined || teamIds.includes(match.hostTeamId)),
          ).map(toTeamMatchRow),
        );
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ placeName: MATCHES.find((match) => match.id === where.id)?.placeName ?? null }),
      ),
    },
    v1GameSide: {
      findMany: jest.fn(({ where }: { where: { gameId: { in: string[] }; teamId?: string } }) =>
        Promise.resolve(sides.filter((side) => where.gameId.in.includes(side.gameId) && (where.teamId === undefined || side.teamId === where.teamId))),
      ),
    },
    v1GameLineup: {
      findMany: jest.fn(({ where }: { where: { gameId?: { in: string[] }; sideId?: { in: string[] }; state?: { in: string[] } } }) => {
        const scoped = db.lineups.filter(
          (lineup) =>
            (where.gameId !== undefined ? where.gameId.in.includes(lineup.gameId) : (where.sideId?.in ?? []).includes(lineup.sideId)) &&
            (where.state === undefined || where.state.in.includes(lineup.state)),
        );
        // distinct sideId + revision desc: 사이드마다 최신 한 행.
        const latest = new Map<string, LineupRow>();
        for (const lineup of scoped) {
          const current = latest.get(lineup.sideId);
          if (current === undefined || lineup.revision > current.revision) latest.set(lineup.sideId, lineup);
        }
        return Promise.resolve([...latest.values()]);
      }),
    },
    v1GameParticipant: {
      findMany: jest.fn(({ where }: { where: { lineupId: { in: string[] }; userId: string } }) =>
        Promise.resolve(db.participants.filter((row) => where.lineupId.in.includes(row.lineupId) && row.userId === where.userId)),
      ),
    },
  };
}

const entry = (userId: string) => ({ userId, accountLinked: true, displayNameSnapshot: userId, jerseyNumber: null, sourceParticipantId: `p-${userId}` });

async function buildService(db: FakeDb) {
  const prisma = buildPrisma(db);
  const moduleRef = await Test.createTestingModule({
    providers: [LineupTodoService, TeamUpcomingGamesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: moduleRef.get(TeamUpcomingGamesService), prisma, moduleRef };
}

beforeEach(() => {
  // 팀 A 리그 경기의 참가 명단은 IN·OUT 두 명이고 OUT 은 이번 경기에서 뺐다.
  jest.mocked(loadCompetitionRosterBase).mockImplementation(async () => ({
    source: 'REGISTRATION',
    entries: [entry(PLAYER_IN), entry(PLAYER_OUT)],
  }));
  jest.mocked(loadGameRoster).mockImplementation(async (_tx, _target, preloaded) => {
    const computation = computeGameRoster({
      base: preloaded!.base!.entries,
      adjustments: [{ id: 'adj', userId: PLAYER_OUT, reason: null, actorUserId: 'm', actorRole: 'TEAM_MANAGER', createdAt: NOW, revokedAt: null }],
      unavailabilities: [],
      gameStartAt: LEAGUE_KICKOFF,
      suspensionVerdicts: new Map(),
    });
    return { computation } as never;
  });
});

describe('TeamUpcomingGamesService.nextForMemberships — 홈 "다음 경기"', () => {
  const emptyDb = (): FakeDb => ({ lineups: [], participants: [] });

  it('지난 경기를 빼고 리그·친선이 섞인 내 팀 경기 중 가장 가까운 하나를 고른다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      const next = await service.nextForMemberships(PLAYER_IN, [{ teamId: TEAM_A, role: 'member' }], NOW);
      expect(next).toMatchObject({
        gameId: 'game-match-league',
        teamMatchId: 'match-league',
        competitionKind: 'LEAGUE',
        competitionId: LEAGUE_ID,
        opponentName: '상대 FC',
        placeName: '망원 유수지 풋살장',
        teamId: TEAM_A,
        participantCount: 1,
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('리그 경기가 지나가면 그다음 친선 경기가 다음 경기가 된다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      const afterLeague = new Date(LEAGUE_KICKOFF.getTime() + 60_000);
      const next = await service.nextForMemberships(PLAYER_IN, [{ teamId: TEAM_A, role: 'member' }], afterLeague);
      expect(next).toMatchObject({ gameId: 'game-match-friendly', competitionKind: 'FRIENDLY', participantCount: null });
    } finally {
      await moduleRef.close();
    }
  });

  it('출전 명단에 든 선수는 출전, 이번 경기에서 빠진 선수는 출전 아님으로 같은 경기를 다르게 본다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      const memberships = [{ teamId: TEAM_A, role: 'member' }];
      const asIn = await service.nextForMemberships(PLAYER_IN, memberships, NOW);
      const asOut = await service.nextForMemberships(PLAYER_OUT, memberships, NOW);
      expect(asIn?.gameId).toBe('game-match-league');
      expect(asOut?.gameId).toBe('game-match-league');
      expect(asIn?.viewerParticipating).toBe(true);
      expect(asOut?.viewerParticipating).toBe(false);
    } finally {
      await moduleRef.close();
    }
  });

  it('친선은 최신 제출본 참석명단에 든 사람만 출전 — 임시 저장만 있으면 아무도 아니고, 다시 열린 초안은 제출본을 밀어내지 않는다', async () => {
    const afterLeague = new Date(LEAGUE_KICKOFF.getTime() + 60_000);
    const memberships = [{ teamId: TEAM_A, role: 'member' }];
    const submitted: FakeDb = {
      lineups: [{ id: 'lineup-1', gameId: 'game-match-friendly', sideId: 'side-match-friendly-home', revision: 1, state: 'SUBMITTED' }],
      participants: [{ lineupId: 'lineup-1', userId: PLAYER_IN }],
    };
    const draftOnly: FakeDb = {
      lineups: [{ id: 'lineup-1', gameId: 'game-match-friendly', sideId: 'side-match-friendly-home', revision: 1, state: 'DRAFT' }],
      participants: [{ lineupId: 'lineup-1', userId: PLAYER_IN }],
    };
    // 제출 뒤 정정하려고 연 초안(OUT 을 새로 넣음)은 아직 제출 전이라 출전 판정은 직전 제출본을 따른다.
    const reopened: FakeDb = {
      lineups: [
        { id: 'lineup-1', gameId: 'game-match-friendly', sideId: 'side-match-friendly-home', revision: 1, state: 'SUBMITTED' },
        { id: 'lineup-2', gameId: 'game-match-friendly', sideId: 'side-match-friendly-home', revision: 2, state: 'DRAFT' },
      ],
      participants: [
        { lineupId: 'lineup-1', userId: PLAYER_IN },
        { lineupId: 'lineup-2', userId: PLAYER_OUT },
      ],
    };

    const results: Record<string, [boolean | undefined, boolean | undefined]> = {};
    for (const [label, db] of Object.entries({ submitted, draftOnly, reopened })) {
      const { service, moduleRef } = await buildService(db);
      try {
        const asIn = await service.nextForMemberships(PLAYER_IN, memberships, afterLeague);
        const asOut = await service.nextForMemberships(PLAYER_OUT, memberships, afterLeague);
        results[label] = [asIn?.viewerParticipating, asOut?.viewerParticipating];
      } finally {
        await moduleRef.close();
      }
    }
    expect(results).toEqual({ submitted: [true, false], draftOnly: [false, false], reopened: [true, false] });
  });

  it('팀이 여럿이면 팀을 가리지 않고 가장 가까운 경기를 고른다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      const next = await service.nextForMemberships(
        PLAYER_IN,
        [
          { teamId: TEAM_B, role: 'owner' },
          { teamId: TEAM_A, role: 'member' },
        ],
        NOW,
      );
      expect(next?.gameId).toBe('game-match-league');
      expect(next?.viewerCanManage).toBe(false);
    } finally {
      await moduleRef.close();
    }
  });

  it('팀장·매니저 팀의 경기면 관리 권한이 true 다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      const asManager = await service.nextForMemberships(PLAYER_IN, [{ teamId: TEAM_A, role: 'manager' }], NOW);
      const asMember = await service.nextForMemberships(PLAYER_IN, [{ teamId: TEAM_A, role: 'member' }], NOW);
      expect([asManager?.viewerCanManage, asMember?.viewerCanManage]).toEqual([true, false]);
    } finally {
      await moduleRef.close();
    }
  });

  it('내 팀이 아닌 팀의 경기는 더 가까워도 나오지 않는다', async () => {
    const { service, moduleRef } = await buildService(emptyDb());
    try {
      // TEAM_X 의 경기(15:30)가 팀 A 의 다음 경기(16:10)보다 빠르다.
      const next = await service.nextForMemberships(OUTSIDER, [{ teamId: TEAM_A, role: 'member' }], NOW);
      expect(next?.teamId).toBe(TEAM_A);
      expect(await service.nextForMemberships(OUTSIDER, [], NOW)).toBeNull();
    } finally {
      await moduleRef.close();
    }
  });
});

describe('TeamUpcomingGamesService.listForTeam — 팀 상세 "다가오는 경기"의 내 출전', () => {
  // 친선 참석명단은 OUT 만 제출했다 — 리그와 반대로 갈려야 칩이 경기마다 따로 판정되는지 드러난다.
  const db = (): FakeDb => ({
    lineups: [{ id: 'lineup-f', gameId: 'game-match-friendly', sideId: 'side-match-friendly-home', revision: 1, state: 'SUBMITTED' }],
    participants: [{ lineupId: 'lineup-f', userId: PLAYER_OUT }],
  });

  it('같은 팀원이라도 출전하는 경기에만 viewerParticipating 이 true 이고 목록 자체는 같다', async () => {
    const { service, moduleRef } = await buildService(db());
    try {
      const asIn = await service.listForTeam({ id: PLAYER_IN } as never, TEAM_A, NOW);
      const asOut = await service.listForTeam({ id: PLAYER_OUT } as never, TEAM_A, NOW);
      const view = (items: Array<{ gameId: string; viewerParticipating: boolean }>) =>
        Object.fromEntries(items.map((item) => [item.gameId, item.viewerParticipating]));

      expect(view(asIn.items)).toEqual({ 'game-match-league': true, 'game-match-friendly': false });
      expect(view(asOut.items)).toEqual({ 'game-match-league': false, 'game-match-friendly': true });
    } finally {
      await moduleRef.close();
    }
  });

  it('팀원이 아니면 목록을 받지 못한다(403)', async () => {
    const { service, moduleRef } = await buildService(db());
    try {
      await expect(service.listForTeam({ id: OUTSIDER } as never, TEAM_A, NOW)).rejects.toMatchObject({ status: 403 });
    } finally {
      await moduleRef.close();
    }
  });
});
