/**
 * 명단 밖 팀장·매니저의 기록·종료 확인 권한(H5 결정 A) — 친선에서만 열리고 대회·리그는 403 그대로다.
 * 실제 DB 흐름은 test/team-matches/team-match-shared-record.integration-spec.ts 가 본다. 여기서는 권한
 * 판정의 대조군(명단 밖 멤버·상대 팀장·양 팀 겸직·대회 경기)을 가짜 tx 로 빠르게 가른다.
 */
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TeamMatchRecordService } from './team-match-record.service';

const user = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });

type Membership = { userId: string; teamId: string; role: 'owner' | 'manager' | 'member' };

function createFake(options: { leagueId?: string | null; tournamentId?: string | null; memberships: Membership[] }) {
  const changes: Array<{ version: number; actorUserId: string; actorName: string; action: string }> = [];
  const game = {
    id: 'game-1',
    teamMatchId: 'tm-1',
    state: 'SCHEDULED',
    teamMatch: {
      id: 'tm-1', title: '친선', status: 'matched', startAt: new Date(Date.now() - 10 * 60_000), deletedAt: null,
      hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: options.leagueId ?? null, tournamentId: options.tournamentId ?? null,
      platformManaged: false,
    },
    sides: [
      { id: 'side-home', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈 FC' },
      { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정 FC' },
    ],
    lineups: [
      { id: 'lineup-home', sideId: 'side-home', revision: 2, state: 'SUBMITTED', invalidatedAt: null },
      { id: 'lineup-away', sideId: 'side-away', revision: 2, state: 'SUBMITTED', invalidatedAt: null },
    ],
    participants: [
      { id: 'p-home', sideId: 'side-home', lineupId: 'lineup-home', userId: 'home-player', displayNameSnapshot: '홈 선수', jerseyNumber: 7, position: null, started: true },
      { id: 'p-away', sideId: 'side-away', lineupId: 'lineup-away', userId: 'away-player', displayNameSnapshot: '원정 선수', jerseyNumber: 9, position: null, started: true },
    ],
    sharedRecord: null as null | { version: number; goals: unknown[]; subMatches: unknown[]; confirmations: unknown[]; officialAt: Date | null },
    visibilityPolicy: { mode: 'LIVE' },
    events: [],
    resultRevisions: [],
  };
  const tx = {
    $queryRaw: async () => [],
    v1Game: {
      findUnique: async () => game,
      update: async () => game,
    },
    v1ParticipantIdentityLinkCurrent: { findMany: async () => [] },
    v1UserProfile: { findMany: async () => [] },
    v1TeamMembership: {
      findMany: async (args: { where: { userId: string; teamId: { in: string[] }; role: { in: string[] } } }) =>
        options.memberships
          .filter((row) => row.userId === args.where.userId && args.where.teamId.in.includes(row.teamId) && args.where.role.in.includes(row.role))
          .map((row) => ({ teamId: row.teamId, user: { profile: { nickname: `${row.userId} 님`, displayName: null } } })),
      findFirst: async (args: { where: { userId: string; teamId: { in: string[] }; role: { in: string[] } } }) =>
        options.memberships.find((row) => row.userId === args.where.userId && args.where.teamId.in.includes(row.teamId) && args.where.role.in.includes(row.role)) ?? null,
    },
    v1AdminUser: { findFirst: async () => null },
    v1GameOperationFlag: { findUnique: async () => null },
    v1TeamMatchRecord: {
      upsert: async (args: { create: { version: number; goals: unknown[]; subMatches: unknown[]; confirmations: unknown[]; officialAt: Date | null } }) => {
        game.sharedRecord = { ...args.create };
        return game.sharedRecord;
      },
    },
    v1TeamMatchRecordChange: {
      findUnique: async () => null,
      findMany: async () => [...changes].reverse().map((row) => ({ ...row, id: randomUUID(), goalId: null, subMatchId: null, before: null, after: null, createdAt: new Date() })),
      create: async (args: { data: { version: number; actorUserId: string; actorName: string; action: string } }) => {
        changes.push(args.data);
        return args.data;
      },
    },
  };
  const prisma = { $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx) } as unknown as PrismaService;
  return { service: new TeamMatchRecordService(prisma), changes, game };
}

const addGoal = (sideId: string) => ({ action: 'add' as const, expectedVersion: 0, commandId: randomUUID(), sideId });
const confirm = () => ({ action: 'confirm' as const, expectedVersion: 0, commandId: randomUUID() });

describe('TeamMatchRecordService — 명단 밖 팀장 권한 (H5 결정 A, 친선만)', () => {
  it('명단 밖 팀장은 친선에서 기록하고, 이력에 "팀장 권한"으로 남는다', async () => {
    const { service, changes } = createFake({ memberships: [{ userId: 'coach', teamId: 'team-home', role: 'owner' }] });

    const view = await service.read(user('coach'), 'tm-1');
    expect(view).toMatchObject({ teamAuthority: true, participant: true, canEdit: true, ownSideId: 'side-home' });

    await service.mutate(user('coach'), 'tm-1', addGoal('side-home'));
    expect(changes).toEqual([expect.objectContaining({ actorUserId: 'coach', actorName: 'coach 님 · 팀장 권한', action: 'add' })]);
  });

  it('매니저도 같은 권한이고, 종료 확인은 자기 팀 쪽으로만 들어간다', async () => {
    const { service, game } = createFake({ memberships: [{ userId: 'away-manager', teamId: 'team-away', role: 'manager' }] });

    await service.mutate(user('away-manager'), 'tm-1', confirm());
    expect(game.sharedRecord?.confirmations).toEqual([expect.objectContaining({ sideId: 'side-away', userId: 'away-manager' })]);
  });

  it('명단 밖 일반 멤버는 403 이다', async () => {
    const { service } = createFake({ memberships: [{ userId: 'member', teamId: 'team-home', role: 'member' }] });

    expect(await service.read(user('member'), 'tm-1')).toMatchObject({ teamAuthority: false, canEdit: false });
    await expect(service.mutate(user('member'), 'tm-1', addGoal('side-home'))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'RECORD_PARTICIPANT_REQUIRED' }),
    });
  });

  it('이 경기와 무관한 팀의 팀장은 403 이다', async () => {
    const { service } = createFake({ memberships: [{ userId: 'other-captain', teamId: 'team-other', role: 'owner' }] });

    await expect(service.mutate(user('other-captain'), 'tm-1', addGoal('side-home'))).rejects.toMatchObject({ status: 403 });
  });

  it('양 팀을 모두 관리하면 어느 쪽인지 몰라 권한을 주지 않는다', async () => {
    const { service } = createFake({
      memberships: [
        { userId: 'both', teamId: 'team-home', role: 'owner' },
        { userId: 'both', teamId: 'team-away', role: 'manager' },
      ],
    });

    await expect(service.mutate(user('both'), 'tm-1', confirm())).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ['리그', { leagueId: 'league-1' }],
    ['대회', { tournamentId: 'tournament-1' }],
  ])('%s 경기에서는 팀장이 기록·종료 확인을 보내도 403 이다(정본 §4)', async (_label, competition) => {
    const { service, changes } = createFake({ ...competition, memberships: [{ userId: 'coach', teamId: 'team-home', role: 'owner' }] });

    await expect(service.mutate(user('coach'), 'tm-1', addGoal('side-home'))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'RECORD_PARTICIPANT_REQUIRED' }),
    });
    await expect(service.mutate(user('coach'), 'tm-1', confirm())).rejects.toMatchObject({ status: 403 });
    expect(changes).toHaveLength(0);
  });

  it('명단에 있는 팀장은 선수 권한 그대로다 — 이름에 "팀장 권한"을 붙이지 않는다', async () => {
    const { service, changes } = createFake({ memberships: [{ userId: 'home-player', teamId: 'team-home', role: 'owner' }] });

    await service.mutate(user('home-player'), 'tm-1', addGoal('side-home'));
    expect(changes).toEqual([expect.objectContaining({ actorName: '홈 선수' })]);
  });
});
