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

type Revision = { id: string; gameId: string; revision: number; state: string; supersedesId?: string | null; reason?: string };
type FakeRecord = { version: number; goals: unknown[]; subMatches: unknown[]; confirmations: unknown[]; officialAt: Date | null };

/** 양 팀이 확인을 마친 공동 기록 — 홈 1골(rev-1 이 현재 공식). */
const OFFICIAL_RECORD = (): FakeRecord => ({
  version: 3,
  goals: [{ id: '00000000-0000-4000-8000-000000000001', sideId: 'side-home', participantId: 'p-home', ownGoal: false, minute: 10, subMatchId: null }],
  subMatches: [],
  confirmations: [
    { sideId: 'side-home', userId: 'home-player', name: '홈 선수', at: '2026-09-30T10:00:00.000Z' },
    { sideId: 'side-away', userId: 'away-player', name: '원정 선수', at: '2026-09-30T10:01:00.000Z' },
  ],
  officialAt: new Date('2026-09-30T10:01:00.000Z'),
});

function createFake(options: {
  leagueId?: string | null;
  tournamentId?: string | null;
  memberships: Membership[];
  admins?: string[];
  official?: boolean;
}) {
  const changes: Array<{ version: number; actorUserId: string; actorName: string; action: string }> = [];
  const writes = {
    revisionUpdates: [] as Array<Record<string, unknown>>,
    participants: [] as Array<{ resultRevisionId: string; participantId: string; goals: number }>,
    outbox: [] as Array<{ businessKey: string; type: string; revisionId: string }>,
    adminLogs: [] as Array<{ action: string; beforeJson: Record<string, unknown>; afterJson: Record<string, unknown> }>,
  };
  const game = {
    id: 'game-1',
    teamMatchId: 'tm-1',
    state: options.official ? 'ENDED' : 'SCHEDULED',
    currentOfficialRevisionId: options.official ? 'rev-1' : (null as string | null),
    teamMatch: {
      id: 'tm-1', title: '친선', status: options.official ? 'completed' : 'matched', startAt: new Date(Date.now() - 10 * 60_000), deletedAt: null,
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
    sharedRecord: (options.official ? OFFICIAL_RECORD() : null) as null | FakeRecord,
    visibilityPolicy: { mode: 'LIVE' },
    events: [],
    resultRevisions: (options.official ? [{ id: 'rev-1', gameId: 'game-1', revision: 1, state: 'OFFICIAL' }] : []) as Revision[],
  };
  const tx = {
    $queryRaw: async () => [],
    v1Game: {
      findUnique: async () => game,
      update: async (args: { data: { currentOfficialRevisionId?: string } }) => {
        if (args.data.currentOfficialRevisionId) game.currentOfficialRevisionId = args.data.currentOfficialRevisionId;
        return game;
      },
    },
    v1GameResultRevision: {
      create: async (args: { data: Omit<Revision, 'id'> }) => {
        const row = { id: `rev-${args.data.revision}`, ...args.data };
        game.resultRevisions.unshift(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.revisionUpdates.push({ id: args.where.id, ...args.data });
        const row = game.resultRevisions.find((revision) => revision.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    },
    v1GameResultParticipant: {
      createMany: async (args: { data: typeof writes.participants }) => {
        writes.participants.push(...args.data);
        return { count: args.data.length };
      },
    },
    v1OutboxEvent: { create: async (args: { data: (typeof writes.outbox)[number] }) => writes.outbox.push(args.data) },
    v1AdminActionLog: { create: async (args: { data: (typeof writes.adminLogs)[number] }) => writes.adminLogs.push(args.data) },
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
    v1AdminUser: {
      findFirst: async (args: { where: { userId: string } }) =>
        (options.admins ?? []).includes(args.where.userId) ? { id: `admin-${args.where.userId}` } : null,
    },
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
  return { service: new TeamMatchRecordService(prisma), changes, game, writes };
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

// 2026-10-01 사용자 결정 "어드민은 언제든 수정" — 양 팀이 확인한 친선 결과도 플랫폼 어드민은 고친다.
describe('TeamMatchRecordService — 확정 뒤 어드민 정정', () => {
  const editGoal = (expectedVersion: number) => ({
    action: 'edit' as const,
    expectedVersion,
    commandId: randomUUID(),
    goalId: '00000000-0000-4000-8000-000000000001',
    sideId: 'side-away',
    participantId: 'p-away',
  });

  it('어드민이 확정된 득점을 고치면 rev-1 을 대체하는 새 공식 리비전이 서고, 양 팀 확인은 그대로다', async () => {
    const { service, game, writes, changes } = createFake({ memberships: [], admins: ['ops-admin'], official: true });

    expect(await service.read(user('ops-admin'), 'tm-1')).toMatchObject({ phase: 'official', canEdit: true, operator: true });
    const view = await service.mutate(user('ops-admin'), 'tm-1', editGoal(3));

    expect(game.resultRevisions[0]).toMatchObject({ id: 'rev-2', revision: 2, supersedesId: 'rev-1', state: 'OFFICIAL', reason: '운영자 결과 정정' });
    expect(game.resultRevisions[1]).toMatchObject({ id: 'rev-1', state: 'OFFICIAL' });
    expect(game.currentOfficialRevisionId).toBe('rev-2');
    expect(writes.participants.filter((row) => row.resultRevisionId === 'rev-2')).toEqual([
      expect.objectContaining({ participantId: 'p-home', goals: 0 }),
      expect.objectContaining({ participantId: 'p-away', goals: 1 }),
    ]);
    expect(writes.outbox).toEqual([
      expect.objectContaining({ type: 'GAME_RESULT_OFFICIAL', revisionId: 'rev-2', businessKey: 'game:game-1:revision:2:correction_officialize' }),
    ]);
    expect(writes.adminLogs).toEqual([
      expect.objectContaining({
        action: 'team_match.record_correction',
        beforeJson: expect.objectContaining({ revisionId: 'rev-1' }),
        afterJson: expect.objectContaining({ revisionId: 'rev-2' }),
      }),
    ]);
    expect(changes).toEqual([expect.objectContaining({ actorUserId: 'ops-admin', actorName: 'Teameet 운영', action: 'edit' })]);
    expect(game.sharedRecord?.confirmations).toHaveLength(2);
    expect(game.sharedRecord?.officialAt).toEqual(new Date('2026-09-30T10:01:00.000Z'));
    expect(view).toMatchObject({ phase: 'official', canEdit: true });
    expect(view.sides.map((side) => side.score)).toEqual([0, 1]);
  });

  it('정정하면 응답의 officialCorrected 가 참이 된다 — 관전자에게도 같고, 정정 전 확정·진행 중은 거짓이다', async () => {
    const { service } = createFake({ memberships: [], admins: ['ops-admin'], official: true });

    expect(await service.read(user('ops-admin'), 'tm-1')).toMatchObject({ phase: 'official', officialCorrected: false });
    expect(await service.mutate(user('ops-admin'), 'tm-1', editGoal(3))).toMatchObject({ phase: 'official', officialCorrected: true });
    expect(await service.read(null, 'tm-1')).toMatchObject({ phase: 'official', officialCorrected: true });

    const live = createFake({ memberships: [], admins: ['ops-admin'] });
    expect(await live.service.read(user('ops-admin'), 'tm-1')).toMatchObject({ phase: 'live', officialCorrected: false });
  });

  it('정정된 경기를 한 번 더 고치면 rev-2 를 대체한다', async () => {
    const { service, game } = createFake({ memberships: [], admins: ['ops-admin'], official: true });

    await service.mutate(user('ops-admin'), 'tm-1', editGoal(3));
    await service.mutate(user('ops-admin'), 'tm-1', { action: 'delete', expectedVersion: 4, commandId: randomUUID(), goalId: '00000000-0000-4000-8000-000000000001' });

    expect(game.resultRevisions[0]).toMatchObject({ id: 'rev-3', supersedesId: 'rev-2', state: 'OFFICIAL' });
    expect(game.currentOfficialRevisionId).toBe('rev-3');
  });

  it.each([
    ['양 팀 선수', 'home-player', []],
    ['팀장', 'coach', [{ userId: 'coach', teamId: 'team-home', role: 'owner' as const }]],
  ])('%s 는 확정 뒤 고칠 수 없다 (409 RECORD_NOT_EDITABLE)', async (_label, userId, memberships) => {
    const { service, game, writes } = createFake({ memberships, admins: ['ops-admin'], official: true });

    expect(await service.read(user(userId), 'tm-1')).toMatchObject({ canEdit: false });
    await expect(service.mutate(user(userId), 'tm-1', editGoal(3))).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'RECORD_NOT_EDITABLE' }),
    });
    expect(game.resultRevisions).toHaveLength(1);
    expect(writes.outbox).toHaveLength(0);
  });

  it('어드민도 종료 확인은 대신하지 못한다', async () => {
    const { service, writes } = createFake({ memberships: [], admins: ['ops-admin'], official: true });

    await expect(service.mutate(user('ops-admin'), 'tm-1', { action: 'reopen', expectedVersion: 3, commandId: randomUUID() })).rejects.toMatchObject({ status: 403 });
    expect(writes.outbox).toHaveLength(0);
  });

  it('어드민이 아니면 확정 뒤 비공개 기록·편집 권한을 받지 못한다', async () => {
    const { service } = createFake({ memberships: [], admins: [], official: true });

    expect(await service.read(user('ops-admin'), 'tm-1')).toMatchObject({ canEdit: false, operator: false, goals: [] });
    await expect(service.mutate(user('ops-admin'), 'tm-1', editGoal(3))).rejects.toMatchObject({ status: 403 });
  });

  it('리그 경기는 이 경로로 고칠 수 없다 — 결과 정정 레인을 쓴다', async () => {
    const { service } = createFake({ memberships: [], admins: ['ops-admin'], official: true, leagueId: 'league-1' });

    await expect(service.mutate(user('ops-admin'), 'tm-1', editGoal(3))).rejects.toMatchObject({ status: 403 });
  });
});
