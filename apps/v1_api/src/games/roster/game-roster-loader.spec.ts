import type { Prisma } from '@prisma/client';
import { fillLeagueTeamRoster, notifyLeagueRosterFillOutcomes } from '../../league-matches/league-roster-autofill';
import { loadGameRoster } from './game-roster-loader';

// 조회가 자동 채움(쓰기·알림)을 부르는지 본다. 동기화 쓰기 경로의 호출은 game-roster-sync.spec 이 본다.
jest.mock('../../league-matches/league-roster-autofill', () => ({
  fillLeagueTeamRoster: jest.fn(),
  notifyLeagueRosterFillOutcomes: jest.fn(),
}));

const PROFILE = (nickname: string) => ({ profile: { nickname, displayName: null } });
const KICKOFF = new Date('2026-10-10T10:00:00Z');

interface FakeWorld {
  teamMatch: { id: string; tournamentId: string | null; leagueId: string | null; startAt: Date | null };
  sideTeamId: string | null;
  registration?: { id: string; players: Array<{ id: string; userId: string; user: unknown }> } | null;
  jerseys?: Array<{ id: string; jersey_number: number | null }>;
  leagueTeam?: { memberships: Array<{ id: string; userId: string; user: unknown }> } | null;
  leagueRegistrations?: Array<{ id: string; teamId: string; players: unknown[]; _count: { players: number } }>;
  adjustments?: Array<Record<string, unknown>>;
  unavailabilities?: Array<Record<string, unknown>>;
  rules?: { yellowAccumulationLimit: number | null; redCardSuspensionMatches: number | null };
  competitionMatches?: Array<{ id: string; hostTeamId: string; approvedApplicantTeamId: string; game: { id: string } }>;
  results?: Record<string, Array<{ participantId: string; userId: string; red: number }>>;
}

function fakeTx(world: FakeWorld) {
  const results = world.results ?? {};
  const resultParticipants = Object.values(results).flat();
  return {
    v1Game: {
      findUnique: jest.fn(async () => ({
        id: 'game-1',
        state: 'SCHEDULED',
        teamMatch: world.teamMatch,
        sides: [{ id: 'side-1', teamId: world.sideTeamId }],
      })),
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          currentOfficialRevisionId: null,
          resultRevisions: results[id] === undefined ? [] : [{ id: `rev-${id}` }],
        })),
      ),
    },
    v1TournamentRegistration: {
      findFirst: jest.fn(async () => world.registration ?? null),
      findMany: jest.fn(async () => world.leagueRegistrations ?? []),
    },
    v1Team: {
      findMany: jest.fn(async () =>
        world.leagueTeam ? [{ id: 'team-A', name: 'A팀', memberships: world.leagueTeam.memberships }] : [],
      ),
    },
    $queryRaw: jest.fn(async () => world.jerseys ?? []),
    v1GameRosterAdjustment: {
      findMany: jest.fn(async ({ where }: { where: { teamId?: string } }) =>
        (world.adjustments ?? []).filter((row) => where.teamId === undefined || row.teamId === where.teamId),
      ),
    },
    v1TeamMemberUnavailability: { findMany: jest.fn(async () => world.unavailabilities ?? []) },
    v1Tournament: {
      findFirst: jest.fn(async () => world.rules ?? { yellowAccumulationLimit: null, redCardSuspensionMatches: null }),
    },
    v1TeamMatch: { findMany: jest.fn(async () => world.competitionMatches ?? []) },
    v1GameResultParticipant: {
      findMany: jest.fn(async ({ where }: { where: { resultRevisionId: { in: string[] } } }) =>
        where.resultRevisionId.in.flatMap((revisionId) =>
          (results[revisionId.replace('rev-', '')] ?? []).map((row) => ({
            resultRevisionId: revisionId,
            participantId: row.participantId,
            cards: { yellow: 0, red: row.red },
          })),
        ),
      ),
    },
    v1GameParticipant: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        resultParticipants
          .filter((row) => where.id.in.includes(row.participantId))
          .map((row) => ({ id: row.participantId, userId: row.userId })),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

const TOURNAMENT_MATCH = { id: 'm3', tournamentId: 'cup', leagueId: null, startAt: KICKOFF };
const TOURNAMENT_REGISTRATION = {
  id: 'reg-A',
  players: [
    { id: 'tp-1', userId: 'pa', user: PROFILE('에이') },
    { id: 'tp-2', userId: 'pb', user: PROFILE('비') },
    { id: 'tp-3', userId: 'pc', user: PROFILE('씨') },
  ],
};

describe('loadGameRoster — 대회 경기', () => {
  it('confirmed 참가 명단(등번호 포함)이 기준이고 활성 조정·결장 기간을 뺀다', async () => {
    const tx = fakeTx({
      teamMatch: TOURNAMENT_MATCH,
      sideTeamId: 'team-A',
      registration: TOURNAMENT_REGISTRATION,
      jerseys: [{ id: 'tp-1', jersey_number: 10 }],
      adjustments: [
        {
          id: 'adj-1', teamId: 'team-A', userId: 'pb', reason: 'INJURY', actorUserId: 'mgr', actorRole: 'TEAM_MANAGER',
          createdAt: new Date('2026-10-01T00:00:00Z'), revokedAt: null,
        },
      ],
      unavailabilities: [
        {
          id: 'un-1', userId: 'pc', startsAt: new Date('2026-10-09T00:00:00Z'), endsAt: new Date('2026-10-11T00:00:00Z'),
          reason: 'PERSONAL', actorUserId: 'admin-1', actorRole: 'ADMIN', revokedAt: null,
        },
      ],
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.baseSource).toBe('REGISTRATION');
    expect(loaded?.context).toEqual(
      expect.objectContaining({ competitionId: 'cup', isLeague: false, teamId: 'team-A', teamMatchId: 'm3' }),
    );
    expect(loaded?.computation.participants).toEqual([
      { userId: 'pa', accountLinked: true, displayNameSnapshot: '에이', jerseyNumber: 10, sourceParticipantId: 'tp-1' },
    ]);
    expect(loaded?.computation.excluded.map((row) => row.entry.userId)).toEqual(['pb']);
    expect(loaded?.computation.unavailable).toEqual([
      expect.objectContaining({ unavailabilityId: 'un-1', actorRole: 'ADMIN' }),
    ]);
  });

  it('사이드 팀이 바뀌었으면 옛 팀의 활성 조정은 새 팀 명단에 걸리지 않는다', async () => {
    const adjustment = (id: string, teamId: string, userId: string) => ({
      id, teamId, userId, reason: 'INJURY', actorUserId: 'mgr', actorRole: 'TEAM_MANAGER',
      createdAt: new Date('2026-10-01T00:00:00Z'), revokedAt: null,
    });
    // 같은 계정이 두 팀 참가 명단에 모두 있다 — 옛 팀(A)이 뺀 pa 는 새 팀(C)에서 출전한다.
    const tx = fakeTx({
      teamMatch: TOURNAMENT_MATCH,
      sideTeamId: 'team-C',
      registration: TOURNAMENT_REGISTRATION,
      adjustments: [adjustment('adj-old', 'team-A', 'pa'), adjustment('adj-new', 'team-C', 'pc')],
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.computation.excluded.map((row) => row.adjustmentId)).toEqual(['adj-new']);
    expect(loaded?.computation.participants.map((row) => row.userId)).toEqual(['pa', 'pb']);
  });

  it('규정이 있는 대회는 그 팀 경기 순서로 판정한 출전정지 선수를 뺀다', async () => {
    const tx = fakeTx({
      teamMatch: TOURNAMENT_MATCH,
      sideTeamId: 'team-A',
      registration: TOURNAMENT_REGISTRATION,
      rules: { yellowAccumulationLimit: null, redCardSuspensionMatches: 1 },
      // 사이에 다른 팀 경기(m2)가 끼어도 A팀의 다음 경기(m3)에서 정지된다.
      competitionMatches: [
        { id: 'm1', hostTeamId: 'team-A', approvedApplicantTeamId: 'team-B', game: { id: 'g1' } },
        { id: 'm2', hostTeamId: 'team-C', approvedApplicantTeamId: 'team-D', game: { id: 'g2' } },
        { id: 'm3', hostTeamId: 'team-A', approvedApplicantTeamId: 'team-C', game: { id: 'g3' } },
      ],
      results: { g1: [{ participantId: 'gp-1', userId: 'pa', red: 1 }] },
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.computation.suspended.map((row) => row.entry.userId)).toEqual(['pa']);
    expect(loaded?.computation.participants.map((row) => row.userId)).toEqual(['pb', 'pc']);
  });

  it('confirmed 참가 신청이 없는 팀은 계산 대상이 아니다(null)', async () => {
    const tx = fakeTx({ teamMatch: TOURNAMENT_MATCH, sideTeamId: 'team-A', registration: null });
    await expect(loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' })).resolves.toBeNull();
  });

  it('팀이 정해지지 않은 사이드와 친선 경기는 계산 대상이 아니다(null)', async () => {
    const undecided = fakeTx({ teamMatch: TOURNAMENT_MATCH, sideTeamId: null, registration: TOURNAMENT_REGISTRATION });
    await expect(loadGameRoster(undecided, { gameId: 'game-1', sideId: 'side-1' })).resolves.toBeNull();
    const friendly = fakeTx({
      teamMatch: { id: 'f1', tournamentId: null, leagueId: null, startAt: KICKOFF },
      sideTeamId: 'team-A',
      registration: TOURNAMENT_REGISTRATION,
    });
    await expect(loadGameRoster(friendly, { gameId: 'game-1', sideId: 'side-1' })).resolves.toBeNull();
  });
});

describe('loadGameRoster — 리그 폴백 팀(참가 명단 없음)', () => {
  it('팀 활성 멤버가 기준이고, 멤버십 userId 로 조정이 걸리며 출전자는 계정 연결 없음이다', async () => {
    const tx = fakeTx({
      teamMatch: { id: 'lm-1', tournamentId: 'league-1', leagueId: 'league-1', startAt: KICKOFF },
      sideTeamId: 'team-A',
      leagueTeam: {
        memberships: [
          { id: 'ms-1', userId: 'u1', user: PROFILE('하나') },
          { id: 'ms-2', userId: 'u2', user: PROFILE('둘') },
        ],
      },
      leagueRegistrations: [],
      adjustments: [
        {
          id: 'adj-9', teamId: 'team-A', userId: 'u2', reason: null, actorUserId: 'mgr', actorRole: 'TEAM_MANAGER',
          createdAt: new Date('2026-10-01T00:00:00Z'), revokedAt: null,
        },
      ],
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.baseSource).toBe('TEAM_MEMBERS');
    expect(loaded?.context).toEqual(expect.objectContaining({ competitionId: 'league-1', isLeague: true }));
    expect(loaded?.computation.participants).toEqual([
      { userId: 'u1', accountLinked: false, displayNameSnapshot: '하나', jerseyNumber: null, sourceParticipantId: 'ms-1' },
    ]);
    expect(loaded?.computation.excluded.map((row) => row.entry.sourceParticipantId)).toEqual(['ms-2']);
  });

  it('리그 참가 명단이 있으면 폴백하지 않고 선수(계정 연결)가 기준이다', async () => {
    const tx = fakeTx({
      teamMatch: { id: 'lm-1', tournamentId: 'league-1', leagueId: 'league-1', startAt: KICKOFF },
      sideTeamId: 'team-A',
      leagueTeam: { memberships: [{ id: 'ms-1', userId: 'u1', user: PROFILE('하나') }] },
      leagueRegistrations: [
        {
          id: 'lreg-1',
          teamId: 'team-A',
          players: [{ id: 'lp-1', userId: 'u7', user: PROFILE('칠') }],
          _count: { players: 1 },
        },
      ],
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.baseSource).toBe('REGISTRATION');
    expect(loaded?.computation.participants).toEqual([
      { userId: 'u7', accountLinked: true, displayNameSnapshot: '칠', jerseyNumber: null, sourceParticipantId: 'lp-1' },
    ]);
  });
});

describe('loadGameRoster — 조회는 DB 를 바꾸지 않는다', () => {
  it('명단 행이 없는 리그 확정 신청을 채우지 않고 팀원 폴백으로 읽는다', async () => {
    const tx = fakeTx({
      teamMatch: { id: 'lm-1', tournamentId: 'league-1', leagueId: 'league-1', startAt: KICKOFF },
      sideTeamId: 'team-A',
      leagueTeam: { memberships: [{ id: 'ms-1', userId: 'u1', user: PROFILE('하나') }] },
      leagueRegistrations: [{ id: 'lreg-empty', teamId: 'team-A', players: [], _count: { players: 0 } }],
    });
    const loaded = await loadGameRoster(tx, { gameId: 'game-1', sideId: 'side-1' });
    expect(loaded?.baseSource).toBe('TEAM_MEMBERS');
    expect(fillLeagueTeamRoster).not.toHaveBeenCalled();
    expect(notifyLeagueRosterFillOutcomes).not.toHaveBeenCalled();
  });
});
