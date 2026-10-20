import { Test } from '@nestjs/testing';
import { V1GameLineupState, V1GameResultRevisionState, V1GameState } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { GamesService } from '../games.service';
import { computeGameRoster } from './game-roster-computation';
import * as rosterLoader from './game-roster-loader';
import { GameRosterService } from './game-roster.service';

const AT = new Date('2026-10-16T00:00:00Z');
const TARGET = { gameId: 'game', teamId: 'home' };
const viewer = (id = 'owner'): V1AuthUser => ({ id, email: `${id}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' });
type SideFilter = { readonly id?: string; readonly teamId?: string };
type ResultFilter = { readonly resultRevisionId?: string; readonly sideId?: string };
type GameQuery = { readonly select?: { readonly sides?: boolean | { readonly where?: SideFilter }; readonly currentOfficialRevision?: boolean | { readonly select?: { readonly resultParticipants?: boolean | { readonly where?: ResultFilter } } } } };
type ParticipantFilter = { readonly gameId?: string; readonly sideId?: string; readonly id?: { readonly in: readonly string[] }; readonly lineupId?: { readonly in: readonly string[] } };

function fixture() {
  const base = ['a', 'b'].map((userId, index) => ({ userId, accountLinked: true, displayNameSnapshot: `선수 ${userId}`, jerseyNumber: index + 1, sourceParticipantId: `registration-${userId}`, goalkeeper: false }));
  const lineups = [
    { id: 'lineup', sideId: 'home-side', revision: 1, state: V1GameLineupState.SUBMITTED, supersedesId: null },
    { id: 'lineup-draft', sideId: 'home-side', revision: 2, state: V1GameLineupState.DRAFT, supersedesId: null },
  ];
  const participants = ['a', 'b', 'c'].map((userId, index) => ({ id: `participant-${userId}`, gameId: 'game', sideId: 'home-side', lineupId: userId === 'c' ? 'lineup-draft' : 'lineup', userId, displayNameSnapshot: `기록 ${userId}`, jerseyNumber: index + 10, position: null }));
  participants.push({ id: 'participant-away', gameId: 'game', sideId: 'away-side', lineupId: 'away-lineup', userId: 'away', displayNameSnapshot: '상대팀 선수', jerseyNumber: 99, position: null });
  const resultRow = (revision: string, userId: string, sideId = 'home-side') => ({ id: `${revision}-${userId}`, resultRevisionId: revision, participantId: `participant-${userId}`, sideId, started: true, minutesPlayed: null, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: userId === 'b', createdAt: AT, updatedAt: AT });
  const revisions: { readonly id: string; readonly gameId: string; readonly revision: number; state: V1GameResultRevisionState; officialAt: Date | null; resultParticipants: ReturnType<typeof resultRow>[] }[] = [
    { id: 'official-1', gameId: 'game', revision: 1, state: V1GameResultRevisionState.OFFICIAL, officialAt: AT, resultParticipants: [resultRow('official-1', 'a')] },
    { id: 'official-2', gameId: 'game', revision: 2, state: V1GameResultRevisionState.DRAFT, officialAt: null, resultParticipants: [resultRow('official-2', 'b'), resultRow('official-2', 'away', 'away-side')] },
    { id: 'correction-draft', gameId: 'game', revision: 3, state: V1GameResultRevisionState.DRAFT, officialAt: null, resultParticipants: [resultRow('correction-draft', 'c')] },
  ];
  const world: { state: V1GameState; currentOfficialRevisionId: string | null } = { state: V1GameState.ENDED, currentOfficialRevisionId: 'official-1' };
  const sides = [{ id: 'home-side', teamId: 'home' }, { id: 'away-side', teamId: 'away' }];
  const tx = {
    v1Game: { findUnique: jest.fn(async (query: GameQuery) => {
      const sideQuery = query.select?.sides;
      const sideFilter = typeof sideQuery === 'object' ? sideQuery.where : undefined;
      const officialQuery = query.select?.currentOfficialRevision;
      const resultQuery = typeof officialQuery === 'object' ? officialQuery.select?.resultParticipants : undefined;
      const resultFilter = typeof resultQuery === 'object' ? resultQuery.where : undefined;
      const official = revisions.find((row) => row.id === world.currentOfficialRevisionId) ?? null;
      return {
        id: 'game', state: world.state, sourceType: 'TEAM_MATCH', currentOfficialRevisionId: world.currentOfficialRevisionId,
        currentOfficialRevision: official === null ? null : { ...official, resultParticipants: official.resultParticipants.filter((row) => resultFilter?.sideId === undefined || row.sideId === resultFilter.sideId) },
        sides: sides.filter((side) => (sideFilter?.id === undefined || side.id === sideFilter.id) && (sideFilter?.teamId === undefined || side.teamId === sideFilter.teamId)),
        teamMatch: { id: 'match', deletedAt: null, tournamentId: null, leagueId: 'league', hostTeamId: 'home', hostTeam: { name: '홈' }, approvedApplicantTeam: { name: '원정' } },
      };
    }) },
    v1TeamMembership: { findUnique: jest.fn(async ({ where }: { where: { teamId_userId: { teamId: string; userId: string } } }) => {
      const { teamId, userId } = where.teamId_userId;
      return teamId === 'home' && ['owner', 'member'].includes(userId) ? { role: userId === 'owner' ? 'owner' : 'member', status: 'active' } : null;
    }) },
    v1GameLineup: { findMany: jest.fn(async () => lineups) },
    v1GameParticipant: { findMany: jest.fn(async ({ where }: { where: ParticipantFilter }) => participants.filter((row) =>
      (where.gameId === undefined || row.gameId === where.gameId) && (where.sideId === undefined || row.sideId === where.sideId) &&
      (where.id === undefined || where.id.in.includes(row.id)) && (where.lineupId === undefined || where.lineupId.in.includes(row.lineupId)),
    )) },
    v1GameResultParticipant: { findMany: jest.fn(async ({ where }: { where: ResultFilter }) => revisions.flatMap((revision) => revision.resultParticipants).filter((row) =>
      (where.resultRevisionId === undefined || row.resultRevisionId === where.resultRevisionId) && (where.sideId === undefined || row.sideId === where.sideId),
    )) },
    v1OperationAudit: { findFirst: jest.fn(async () => ({ id: 'roster-synced' })) },
    v1User: { findMany: jest.fn(async ({ where }: { where: { id: { in: readonly string[] } } }) => where.id.in.map((id) => ({ id, profile: { nickname: id, displayName: null, realName: `실명 ${id}` } }))) },
  };
  // 공유 로더의 경기 전 기준만 고정한다. 실제 공개 서비스의 인가·공식 결과 선택·뷰 직렬화는 그대로 실행한다.
  jest.spyOn(rosterLoader, 'loadGameRoster').mockImplementation(async () => ({
    context: { gameId: 'game', sideId: 'home-side', teamId: 'home', teamMatchId: 'match', competitionId: 'league', tournamentId: null, leagueId: 'league', isLeague: true, gameState: world.state, startAt: AT },
    baseSource: 'REGISTRATION', base,
    computation: computeGameRoster({ base, adjustments: [], unavailabilities: [], gameStartAt: AT, suspensionVerdicts: new Map() }),
  }));
  jest.spyOn(rosterLoader, 'loadJerseyRegistration').mockResolvedValue({ id: 'registration', editable: false });
  const officializeCorrection = () => {
    const revision = revisions.find((row) => row.id === 'official-2');
    if (revision === undefined) throw new Error('correction fixture missing');
    revision.state = V1GameResultRevisionState.OFFICIAL;
    revision.officialAt = AT;
    world.currentOfficialRevisionId = revision.id;
  };
  return { world, revisions, lineups, participants, tx, officializeCorrection };
}

describe('GameRosterService — 팀 경기 출전은 현재 공식 결과를 따른다', () => {
  let data: ReturnType<typeof fixture>;
  let service: GameRosterService;

  beforeEach(async () => {
    data = fixture();
    const module = await Test.createTestingModule({ providers: [
      GameRosterService,
      { provide: PrismaService, useValue: { $transaction: async (read: (tx: typeof data.tx) => unknown) => read(data.tx) } },
      { provide: GamesService, useValue: { resolveCompetitionOperator: async (_tx: unknown, _gameId: string, userId: string) => userId === 'ops' ? { role: 'platform_ops', canMutateLineup: true, platformAdmin: true } : null } },
    ] }).compile();
    service = module.get(GameRosterService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('공식 rev1의 A를 정정 rev2의 B로 교체하고 라인업·결과 이력은 보존한다', async () => {
    const before = structuredClone({ lineups: data.lineups, participants: data.participants, revisions: data.revisions });
    const original = await service.getTeamGameRoster(viewer(), TARGET);
    expect(original.participants.map((row) => row.userId)).toEqual(['a']);
    data.officializeCorrection();
    const corrected = await service.getTeamGameRoster(viewer(), TARGET);
    expect(corrected.participants).toEqual([{ userId: 'b', displayName: '기록 b', jerseyNumber: 11, goalkeeper: true, accountLinked: true, participantId: 'registration-b', joinedAfterFixtureCreated: false }]);
    expect(corrected.base.map((row) => [row.userId, row.status])).toEqual([['b', 'PARTICIPATING']]);
    expect(corrected.counts.participating).toBe(1);
    expect(corrected.editable).toBe(false);
    expect({ lineups: data.lineups, participants: data.participants }).toEqual({ lineups: before.lineups, participants: before.participants });
    expect(data.revisions.find((row) => row.id === 'official-1')).toEqual(before.revisions.find((row) => row.id === 'official-1'));
  });

  it.each([V1GameResultRevisionState.DRAFT, V1GameResultRevisionState.SUBMITTED])('더 높은 정정 %s는 현재 공식 출전자 A를 덮지 않는다', async (state) => {
    const draft = data.revisions.find((row) => row.id === 'correction-draft');
    if (draft === undefined) throw new Error('correction fixture missing');
    draft.state = state;
    expect((await service.getTeamGameRoster(viewer(), TARGET)).participants.map((row) => row.userId)).toEqual(['a']);
  });

  it.each([V1GameState.SCHEDULED, V1GameState.LIVE])('%s 경기는 공식 포인터가 있어도 기존 명단 계약을 유지한다', async (state) => {
    data.world.state = state;
    data.officializeCorrection();
    const result = await service.getTeamGameRoster(viewer(), TARGET);
    expect(result.participants.map((row) => row.userId)).toEqual(['a', 'b']);
    expect(result.editable).toBe(state === V1GameState.SCHEDULED);
    expect(result.participants.map((row) => row.goalkeeper)).toEqual([false, false]);
  });

  it('종료됐지만 공식 결과가 없으면 제출 명단을 보존하고 최신 초안을 무시한다', async () => {
    data.world.currentOfficialRevisionId = null;
    expect((await service.getTeamGameRoster(viewer(), TARGET)).participants.map((row) => row.userId)).toEqual(['a', 'b']);
  });

  it('공식 포인터가 VOID면 결과 출전자를 투영하지 않는다', async () => {
    const current = data.revisions.find((row) => row.id === 'official-1');
    if (current === undefined) throw new Error('official fixture missing');
    current.state = V1GameResultRevisionState.VOID;
    expect((await service.getTeamGameRoster(viewer(), TARGET)).participants.map((row) => row.userId)).toEqual(['a', 'b']);
  });

  it('공식 결과에 이 팀 출전자가 0명이면 상대팀이나 제출 명단으로 채우지 않는다', async () => {
    data.officializeCorrection();
    const current = data.revisions.find((row) => row.id === 'official-2');
    if (current === undefined) throw new Error('official fixture missing');
    current.resultParticipants = current.resultParticipants.filter((row) => row.sideId === 'away-side');
    const result = await service.getTeamGameRoster(viewer(), TARGET);
    expect(result.participants).toEqual([]);
    expect(result.counts.participating).toBe(0);
    expect(result.editable).toBe(false);
  });

  it('공식 출전자는 최신 제출본에 없더라도 해당 경기의 보존된 참가자 행으로 읽는다', async () => {
    data.officializeCorrection();
    const player = data.participants.find((row) => row.id === 'participant-b');
    if (player === undefined) throw new Error('player fixture missing');
    player.lineupId = 'historical-lineup';
    expect((await service.getTeamGameRoster(viewer(), TARGET)).participants.map((row) => row.userId)).toEqual(['b']);
  });

  it.each(['outsider', 'away-owner'])('다른 팀·외부인 %s에게 공식 명단을 열지 않는다', async (id) => {
    await expect(service.getTeamGameRoster(viewer(id), TARGET)).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
  });

  it('경기의 팀이 아닌 경로는 공식 결과 유무와 관계없이 거부한다', async () => {
    await expect(service.getTeamGameRoster(viewer(), { ...TARGET, teamId: 'unrelated' })).rejects.toMatchObject({ status: 404, response: { code: 'GAME_ROSTER_NOT_AVAILABLE' } });
  });

  it('정정된 출전자의 실명은 운영진에게만 반환하고 팀원 편집 권한은 열지 않는다', async () => {
    data.officializeCorrection();
    const member = await service.getTeamGameRoster(viewer('member'), TARGET);
    expect(member.participants.map((row) => row.userId)).toEqual(['b']);
    expect(member.participants[0]).not.toHaveProperty('realName');
    expect(member.editable).toBe(false);
    const ops = await service.getTeamGameRoster(viewer('ops'), TARGET);
    expect(ops.participants.map((row) => [row.userId, row.realName])).toEqual([['b', '실명 b']]);
    expect(ops.editable).toBe(false);
  });
});
