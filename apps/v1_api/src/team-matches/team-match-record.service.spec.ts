/**
 * 명단 밖 팀장·매니저의 기록·종료 확인 권한(H5 결정 A) — 친선에서만 열리고 대회·리그는 403 그대로다.
 * 실제 DB 흐름은 test/team-matches/team-match-shared-record.integration-spec.ts 가 본다. 여기서는 권한
 * 판정의 대조군(명단 밖 멤버·상대 팀장·양 팀 겸직·대회 경기)을 가짜 tx 로 빠르게 가른다.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, V1GameParticipant } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TeamMatchRecordService } from './team-match-record.service';

const user = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });

type Membership = {
  userId: string;
  teamId: string;
  role: 'owner' | 'manager' | 'member';
  status?: 'active' | 'left' | 'removed';
  displayName?: string;
  accountStatus?: 'active' | 'suspended' | 'deleted';
};

type MembershipQuery = {
  where: {
    userId?: string;
    teamId?: string | { in: string[] };
    role?: { in: string[] };
    status?: string;
    user?: { accountStatus?: string; deletedAt?: null };
  };
};

function matchingMemberships(memberships: readonly Membership[], query: MembershipQuery) {
  const { where } = query;
  return memberships.filter((row) => {
    const teamMatches = where.teamId === undefined || (typeof where.teamId === 'string' ? row.teamId === where.teamId : where.teamId.in.includes(row.teamId));
    return teamMatches &&
      (where.userId === undefined || row.userId === where.userId) &&
      (where.role === undefined || where.role.in.includes(row.role)) &&
      (where.status === undefined || (row.status ?? 'active') === where.status) &&
      (where.user?.accountStatus === undefined || (row.accountStatus ?? 'active') === where.user.accountStatus) &&
      (where.user?.deletedAt === undefined || row.accountStatus !== 'deleted');
  });
}

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
  configPeriods?: unknown;
  revokedDefaultUserId?: string;
}) {
  const changes: Array<{ version: number; actorUserId: string; actorName: string; action: string }> = [];
  const audits: Prisma.V1OperationAuditUncheckedCreateInput[] = [];
  const identityLinks: Array<{ participantId: string; userId: string; linkId: string }> = [];
  const consentSnapshots: Array<{ participantId: string; linkId: string; state: 'REVOKED'; policyHash: string; actorUserId: string; consentVersion: number }> = [];
  const writes = {
    revisionUpdates: [] as Array<Record<string, unknown>>,
    participants: [] as Array<{ resultRevisionId: string; participantId: string; goals: number }>,
    outbox: [] as Array<{ businessKey: string; type: string; revisionId: string }>,
    adminLogs: [] as Array<{ action: string; beforeJson: Record<string, unknown>; afterJson: Record<string, unknown> }>,
  };
  const participants: Array<Pick<V1GameParticipant, 'id' | 'sideId' | 'lineupId' | 'userId' | 'displayNameSnapshot' | 'jerseyNumber' | 'position' | 'started'>> = [
    { id: 'p-home', sideId: 'side-home', lineupId: 'lineup-home', userId: 'home-player', displayNameSnapshot: '홈 선수', jerseyNumber: 7, position: null, started: true },
    { id: 'p-away', sideId: 'side-away', lineupId: 'lineup-away', userId: 'away-player', displayNameSnapshot: '원정 선수', jerseyNumber: 9, position: null, started: true },
  ];
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
    participants,
    sharedRecord: (options.official ? OFFICIAL_RECORD() : null) as null | FakeRecord,
    visibilityPolicy: { mode: 'LIVE' },
    events: [],
    competitionConfig: { periods: options.configPeriods ?? [{ extraTime: false }, { extraTime: false }] },
    resultRevisions: (options.official ? [{ id: 'rev-1', gameId: 'game-1', revision: 1, state: 'OFFICIAL' }] : []) as Revision[],
  };
  const revokedParticipant = game.participants.find((participant) => participant.userId === options.revokedDefaultUserId);
  if (revokedParticipant !== undefined && revokedParticipant.userId !== null) {
    identityLinks.push({ participantId: revokedParticipant.id, userId: revokedParticipant.userId, linkId: 'original-revoked-link' });
    consentSnapshots.push({ participantId: revokedParticipant.id, linkId: 'original-revoked-link', state: 'REVOKED', policyHash: 'original-policy', actorUserId: revokedParticipant.userId, consentVersion: 1 });
  }
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
    v1GameLineup: {
      create: async ({ data }: { data: Prisma.V1GameLineupUncheckedCreateInput }) => {
        const row = { ...data, id: data.id ?? randomUUID(), sideId: data.sideId, revision: data.revision, state: data.state ?? 'DRAFT', invalidatedAt: null };
        game.lineups.unshift(row);
        return row;
      },
    },
    v1GameParticipant: {
      findMany: async ({ where }: { where: { lineupId: string } }) => game.participants.filter((participant) => participant.lineupId === where.lineupId),
      createMany: async ({ data }: { data: Prisma.V1GameParticipantCreateManyInput[] }) => {
        for (const row of data) game.participants.push({
          id: row.id ?? randomUUID(), sideId: row.sideId, lineupId: row.lineupId, userId: row.userId ?? null,
          displayNameSnapshot: row.displayNameSnapshot, jerseyNumber: row.jerseyNumber ?? null, position: row.position ?? null, started: row.started ?? true,
        });
        return { count: data.length };
      },
    },
    v1GameEvent: { findFirst: async () => game.events[0] ?? null },
    v1OperationAudit: {
      findMany: async () => audits,
      create: async ({ data }: { data: Prisma.V1OperationAuditUncheckedCreateInput }) => {
        audits.push(data);
        return { id: data.id ?? randomUUID() };
      },
    },
    v1ParticipantIdentityLinkEvent: {
      createManyAndReturn: async ({ data }: { data: Array<{ participantId: string; userId: string; linkId: string }> }) =>
        data.map((event) => ({ ...event, effectiveAt: new Date() })),
    },
    v1ParticipantIdentityLinkCurrent: {
      findMany: async ({ where }: { where: { participantId?: { in: string[] }; userId?: string } }) => identityLinks.filter((link) =>
        (where.participantId === undefined || where.participantId.in.includes(link.participantId)) && (where.userId === undefined || where.userId === link.userId)),
      createMany: async ({ data }: { data: typeof identityLinks }) => { identityLinks.push(...data); return { count: data.length }; },
      findUniqueOrThrow: async ({ where }: { where: { participantId: string } }) => {
        const link = identityLinks.find((row) => row.participantId === where.participantId);
        if (link === undefined) throw new Error('The participant identity link does not exist.');
        return link;
      },
    },
    v1ParticipantConsentSnapshot: {
      findMany: async ({ where }: { where: { linkId: { in: string[] } } }) => consentSnapshots.filter((snapshot) => where.linkId.in.includes(snapshot.linkId)),
      create: async ({ data }: { data: (typeof consentSnapshots)[number] }) => { consentSnapshots.push(data); return data; },
    },
    v1UserProfile: { findMany: async () => [] },
    v1TeamMembership: {
      findMany: async (args: MembershipQuery) =>
        matchingMemberships(options.memberships, args).map((row) => ({
          id: `membership-${row.teamId}-${row.userId}`,
          teamId: row.teamId,
          userId: row.userId,
          role: row.role,
          status: row.status ?? 'active',
          jerseyNumber: null,
          user: {
            accountStatus: row.accountStatus ?? 'active',
            deletedAt: row.accountStatus === 'deleted' ? new Date('2026-10-01T00:00:00Z') : null,
            profile: { nickname: row.displayName ?? `${row.userId} 님`, displayName: null },
          },
        })),
      findFirst: async (args: MembershipQuery) => matchingMemberships(options.memberships, args)[0] ?? null,
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
  return { service: new TeamMatchRecordService(prisma), changes, game, writes, audits, identityLinks, consentSnapshots };
}

it.each(['cancelled', 'archived'])('%s record is absent for guests/team managers, while active admins retain the record', async (status) => {
  const { service, game } = createFake({ memberships: [{ userId: 'coach', teamId: 'team-home', role: 'owner' }], admins: ['ops-admin'] });
  game.teamMatch.status = status;
  for (const viewer of [null, user('coach')]) {
    await expect(service.read(viewer, 'tm-1')).rejects.toMatchObject({ status: 404, response: { code: 'TEAM_MATCH_NOT_FOUND' } });
  }
  await expect(service.read(user('ops-admin'), 'tm-1')).resolves.toMatchObject({ teamMatchId: 'tm-1' });
});

const addGoal = (sideId: string) => ({ action: 'add' as const, expectedVersion: 0, commandId: randomUUID(), sideId });
const confirm = () => ({ action: 'confirm' as const, expectedVersion: 0, commandId: randomUUID() });

describe('MD-QA #146: TeamMatchRecordService automatic current default', () => {
  const memberships = (): Membership[] => [
    { userId: 'coach', teamId: 'team-home', role: 'owner', displayName: '현재 홈 팀장' },
    { userId: 'home-player', teamId: 'team-home', role: 'member', displayName: '현재 홈 선수' },
    { userId: 'away-player', teamId: 'team-away', role: 'member', displayName: '현재 원정 선수' },
  ];

  function automatic(options: Membership[] = memberships()) {
    const fixture = createFake({ memberships: options });
    for (const lineup of fixture.game.lineups) {
      lineup.revision = 1;
      lineup.state = 'DRAFT';
    }
    return fixture;
  }

  it('reads untouched automatic drafts as current qualified defaults with stable UUID preview ids and no writes', async () => {
    // Given: automatic creation snapshots exist, but nobody has submitted a manual roster.
    const { service, game, changes } = automatic();
    const before = JSON.stringify({ lineups: game.lineups, participants: game.participants, record: game.sharedRecord });

    // When: the actual record service reads the same effective roster twice.
    const first = await service.read(user('coach'), 'tm-1');
    const repeated = await service.read(user('coach'), 'tm-1');

    // Then: current names and membership are authoritative, identifiers are stable, and GET does not persist.
    expect(first).toMatchObject({ lineupReady: true, canEdit: true, missingSides: [] });
    expect(first.participants.map((participant) => participant.name).sort()).toEqual(['현재 홈 팀장', '현재 홈 선수', '현재 원정 선수'].sort());
    expect(repeated.participants.map((participant) => participant.id)).toEqual(first.participants.map((participant) => participant.id));
    for (const participant of first.participants) expect(participant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(JSON.stringify({ lineups: game.lineups, participants: game.participants, record: game.sharedRecord })).toBe(before);
    expect(changes).toEqual([]);
  });

  it('uses a late join and excludes departed or suspended members before the first real record', async () => {
    // Given: the creation snapshot is stale and current membership/account status has changed.
    const { service } = automatic([
      ...memberships().map((row) => row.userId === 'home-player' ? { ...row, status: 'left' as const } : row),
      { userId: 'late-player', teamId: 'team-home', role: 'member', displayName: '새 홈 선수' },
      { userId: 'suspended-player', teamId: 'team-home', role: 'member', displayName: '출전 불가 선수', accountStatus: 'suspended' },
    ]);

    // When: the actual read path calculates the current default roster.
    const view = await service.read(user('coach'), 'tm-1');

    // Then: eligible current members replace the stale initial snapshot without including excluded accounts.
    expect(view).toMatchObject({ lineupReady: true });
    expect(view.participants.map((participant) => participant.name).sort()).toEqual(['현재 홈 팀장', '새 홈 선수', '현재 원정 선수'].sort());
  });

  it('uses current defaults when a saved manual draft has never been submitted', async () => {
    // Given: a saved DRAFT exists, but there is no submitted or locked revision in either side's history.
    const { service, game } = automatic();
    game.lineups.unshift({ ...game.lineups[0], id: 'never-submitted-home-draft', revision: 2 });

    // When: the actual record service reads the effective participants.
    const view = await service.read(user('coach'), 'tm-1');

    // Then: a never-submitted draft does not erase the agreed current-members default.
    expect(view).toMatchObject({ lineupReady: true });
    expect(view.participants.map((participant) => participant.name).sort()).toEqual(['현재 홈 팀장', '현재 홈 선수', '현재 원정 선수'].sort());
  });

  it('allows the first actual authorized record without a separate preparation read or fabricated human submission', async () => {
    // Given: both sides only have untouched automatic DRAFT revisions.
    const { service, game, changes } = automatic();

    // When: a real record mutation is the first user action.
    const view = await service.mutate(user('coach'), 'tm-1', addGoal('side-home'));

    // Then: the record succeeds and automatic defaults remain distinguishable from a human submission.
    expect(view).toMatchObject({ version: 1, lineupReady: true });
    expect(view.participants).toHaveLength(3);
    expect(changes).toEqual([expect.objectContaining({ action: 'add', actorUserId: 'coach' })]);
    expect(game.lineups.some((lineup) => lineup.state === 'SUBMITTED' || lineup.state === 'LOCKED')).toBe(false);
  });

  it('still blocks a reopened DRAFT after a previous real submitted roster', async () => {
    // Given: a real submitted roster has been reopened for review.
    const { service, game, changes } = createFake({ memberships: memberships() });
    game.lineups.unshift({ ...game.lineups[0], id: 'reopened-home-draft', revision: 3, state: 'DRAFT' });

    // When: the captain attempts to confirm while the replacement is still pending.
    await expect(service.mutate(user('coach'), 'tm-1', confirm())).rejects.toMatchObject({ status: 409, response: { code: 'ROSTER_INCOMPLETE' } });

    // Then: the automatic default cannot bypass the existing human review lock.
    expect(changes).toEqual([]);
  });

  it.each([
    { viewer: 'coach', dto: { ...addGoal('side-home'), expectedVersion: 9 }, status: 409, code: 'VERSION_CONFLICT' },
    { viewer: 'spectator', dto: addGoal('side-home'), status: 403, code: 'RECORD_PARTICIPANT_REQUIRED' },
    { viewer: 'coach', dto: { ...addGoal('side-home'), participantId: 'p-home' }, status: 422, code: 'PARTICIPANT_INVALID' },
  ])('does not freeze or write a roster for rejected $code commands', async ({ viewer, dto, status, code }) => {
    // Given: automatic default previews exist and the requested command is invalid or unauthorized.
    const { service, game, changes, audits, identityLinks } = automatic();
    const before = JSON.stringify({ lineups: game.lineups, participants: game.participants });

    // When: the actual mutation rejects before committing a real record.
    await expect(service.mutate(user(viewer), 'tm-1', dto)).rejects.toMatchObject({ status, response: { code } });

    // Then: failures do not manufacture snapshots, identity assertions or audit success.
    expect(JSON.stringify({ lineups: game.lineups, participants: game.participants })).toBe(before);
    expect(changes).toEqual([]);
    expect(audits).toEqual([]);
    expect(identityLinks).toEqual([]);
  });

  it('rejects a preview scorer who departed before the actual mutation without persisting a snapshot', async () => {
    // Given: the client read a valid current preview, then the selected member left.
    const currentMembers = memberships();
    const { service, changes, audits } = automatic(currentMembers);
    const preview = await service.read(user('coach'), 'tm-1');
    const scorer = preview.participants.find((participant) => participant.name === '현재 홈 선수');
    if (scorer === undefined) throw new Error('The initial current roster must contain the scorer.');
    const membership = currentMembers.find((member) => member.userId === 'home-player');
    if (membership === undefined) throw new Error('The scorer must have a membership to leave.');
    membership.status = 'left';

    // When: the old preview identifier is submitted after that qualification change.
    await expect(service.mutate(user('coach'), 'tm-1', { ...addGoal('side-home'), participantId: scorer.id })).rejects.toMatchObject({ status: 422, response: { code: 'PARTICIPANT_INVALID' } });

    // Then: the stale client cannot turn a departed member into an actual appearance.
    expect(changes).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('preserves a manual side while freezing only the other side current default', async () => {
    // Given: HOME submitted an explicit subset; AWAY never submitted its automatic draft.
    const { service, game, audits } = createFake({ memberships: memberships() });
    game.lineups[1].revision = 1;
    game.lineups[1].state = 'DRAFT';

    // When: the captain records the first actual goal.
    const view = await service.mutate(user('coach'), 'tm-1', addGoal('side-home'));

    // Then: HOME's original participant id and subset survive; only AWAY gets a system snapshot.
    expect(view.participants.find((participant) => participant.sideId === 'side-home')).toMatchObject({ id: 'p-home', name: '홈 선수' });
    expect(view.participants).toHaveLength(2);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'SYSTEM', systemActor: 'FRIENDLY_DEFAULT_ROSTER_FROZEN', resourceType: 'GAME', resourceId: 'game-1', after: { sideId: 'side-away' } });
    expect(game.lineups.filter((lineup) => lineup.sideId === 'side-home')).toHaveLength(1);
  });

  it('keeps frozen default participants unchanged when memberships change after the first actual record', async () => {
    // Given: the first real record has established the default appearance snapshot.
    const currentMembers = memberships();
    const { service, game, audits } = automatic(currentMembers);
    const recorded = await service.mutate(user('coach'), 'tm-1', addGoal('side-home'));
    const ids = recorded.participants.map((participant) => participant.id);
    currentMembers.push({ userId: 'late-player', teamId: 'team-home', role: 'member', displayName: '기록 후 합류' });
    const departing = currentMembers.find((member) => member.userId === 'home-player');
    if (departing === undefined) throw new Error('The recorded participant must have a membership.');
    departing.status = 'left';

    // When: the actual record reader opens the game again.
    const view = await service.read(user('coach'), 'tm-1');

    // Then: later roster membership cannot rewrite recorded appearance identities or append another snapshot.
    expect(view.participants.map((participant) => participant.id)).toEqual(ids);
    expect(view.participants.map((participant) => participant.name)).toContain('현재 홈 선수');
    expect(view.participants.map((participant) => participant.name)).not.toContain('기록 후 합류');
    expect(audits).toHaveLength(2);
    expect(game.lineups).toHaveLength(4);
  });

  it('carries a revoked participant consent to the new system snapshot without deleting the original history', async () => {
    // Given: the automatic creation participant had already opted out of this game's public record.
    const fixture = createFake({ memberships: memberships(), revokedDefaultUserId: 'home-player' });
    for (const lineup of fixture.game.lineups) { lineup.revision = 1; lineup.state = 'DRAFT'; }

    // When: an authorized first record freezes the current effective default.
    const view = await fixture.service.mutate(user('coach'), 'tm-1', addGoal('side-home'));

    // Then: a new identity link preserves the original actor/policy REVOKED decision and old participant row.
    const current = view.participants.find((participant) => participant.name === '현재 홈 선수');
    if (current === undefined) throw new Error('The frozen default must include the current player.');
    expect(fixture.consentSnapshots.find((snapshot) => snapshot.participantId === current.id)).toMatchObject({ state: 'REVOKED', actorUserId: 'home-player', policyHash: 'original-policy' });
    expect(fixture.consentSnapshots.find((snapshot) => snapshot.participantId === 'p-home')).toMatchObject({ state: 'REVOKED' });
    expect(fixture.game.participants.some((participant) => participant.id === 'p-home')).toBe(true);
  });
});

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
describe('TeamMatchRecordService — periodCount', () => {
  it.each([
    ['단판', [{ extraTime: false }], 1],
    ['전·후반', [{ extraTime: false }, { extraTime: false }], 2],
    ['단판+연장', [{ extraTime: false }, { extraTime: true }], 1],
  ])('%s 설정이면 정규 피리어드 수 %i를 내려준다', async (_label, configPeriods, expected) => {
    const { service } = createFake({ memberships: [], configPeriods });
    expect(await service.read(null, 'tm-1')).toMatchObject({ periodCount: expected });
  });
});

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


it.each([
  { leagueId: null, tournamentId: 'cup-1' },
  { leagueId: 'league-1', tournamentId: 'league-1' },
  { leagueId: null, tournamentId: null },
])('record read returns ownership for the correct detail handoff: %j', async (ownership) => {
  const { service } = createFake({ ...ownership, memberships: [] });
  await expect(service.read(null, 'tm-1')).resolves.toMatchObject(ownership);
});

type ExistingRevision = {
  id: string; gameId: string; revision: number; state: 'OFFICIAL' | 'DRAFT' | 'VOID';
  score: Prisma.JsonValue; goalEvents: Prisma.JsonValue | null; officialAt: Date | null;
};
type ExistingEvent = {
  id: string; gameId: string; type: string; sideId: string; participantId: string | null;
  period: number; clockMs: number; sequence: number; reversesEventId: string | null; payload: Prisma.JsonValue;
};
type ExistingEventWhere = {
  gameId?: string; type?: string | { in: string[] }; reversesEventId?: null | { not: null };
  AND?: ExistingEventWhere[]; OR?: ExistingEventWhere[];
};
type ExistingEventQuery = {
  where?: ExistingEventWhere;
  orderBy?: Array<Partial<Record<'period' | 'clockMs' | 'sequence', 'asc' | 'desc'>>>;
  select?: Partial<Record<keyof ExistingEvent, boolean>>;
};

function matchesExistingEvent(event: ExistingEvent, where: ExistingEventWhere = {}): boolean {
  if (where.gameId !== undefined && event.gameId !== where.gameId) return false;
  if (typeof where.type === 'string' && event.type !== where.type) return false;
  if (typeof where.type === 'object' && !where.type.in.includes(event.type)) return false;
  if (where.reversesEventId === null && event.reversesEventId !== null) return false;
  if (where.reversesEventId?.not === null && event.reversesEventId === null) return false;
  if (where.AND && !where.AND.every((clause) => matchesExistingEvent(event, clause))) return false;
  return !where.OR || where.OR.some((clause) => matchesExistingEvent(event, clause));
}

/** Current v1 event producer: an official result without a shared score sheet or revision JSON goals. */
function createExistingResultFake(options: {
  policy?: 'LIVE' | 'OFFICIAL_ONLY' | 'STATUS_ONLY' | 'HIDDEN'; liveEnabled?: boolean;
  revision?: ExistingRevision | null; submittedRoster?: boolean; deleted?: boolean;
} = {}) {
  const current: ExistingRevision | null = options.revision === undefined ? {
    id: 'current-result', gameId: 'existing-game', revision: 1, state: 'OFFICIAL',
    score: { home: 1, away: 3 }, goalEvents: null, officialAt: new Date('2026-10-01T10:00:00Z'),
  } : options.revision;
  const events: ExistingEvent[] = ['home', 'away', 'away', 'away'].map((side, index) => ({
    id: `event-${index + 1}`, gameId: 'existing-game', type: 'GOAL', sideId: `side-${side}`,
    participantId: `participant-${side}`, period: index < 2 ? 1 : 2, clockMs: (7 + index * 3) * 60_000,
    sequence: index + 1, reversesEventId: null, payload: {},
  }));
  const participants = ['home', 'away'].map((side) => ({
    id: `participant-${side}`, sideId: `side-${side}`, lineupId: `lineup-${side}`, userId: `user-${side}`,
    displayNameSnapshot: `${side} private real name`, jerseyNumber: 7, position: null, started: true,
  }));
  const game = {
    id: 'existing-game', teamMatchId: 'existing-match', state: 'ENDED', currentOfficialRevisionId: current?.id ?? null,
    teamMatch: {
      id: 'existing-match', title: '기존 친선', status: 'completed', startAt: new Date('2026-10-01T09:00:00Z'),
      deletedAt: options.deleted ? new Date() : null, hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away',
      leagueId: null, tournamentId: null, platformManaged: false,
    },
    sides: ['home', 'away'].map((side) => ({ id: `side-${side}`, sideKey: side.toUpperCase(), teamId: `team-${side}`, displayNameSnapshot: `${side} FC` })),
    lineups: ['home', 'away'].map((side) => ({
      id: `lineup-${side}`, sideId: `side-${side}`, revision: 1, state: options.submittedRoster ? 'SUBMITTED' : 'DRAFT', invalidatedAt: null,
    })),
    participants, sharedRecord: null as FakeRecord | null, visibilityPolicy: { mode: options.policy ?? 'OFFICIAL_ONLY' },
    events: events.slice(0, 1).map(({ id }) => ({ id })), resultRevisions: current ? [current] : [] as ExistingRevision[],
  };
  const lookups: Prisma.V1GameFindUniqueArgs[] = [];
  const eventLookups: ExistingEventQuery[] = [];
  const transactionOptions: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    v1Game: { findUnique: async (args: Prisma.V1GameFindUniqueArgs) => {
      lookups.push(args);
      if (args.where.teamMatchId !== game.teamMatchId) return null;
      // An unrequested relation is absent, just as Prisma omits it from a real response.
      return { ...game, ...(args.include?.currentOfficialRevision ? { currentOfficialRevision: current } : {}) };
    } },
    v1GameEvent: { findMany: async (args: ExistingEventQuery) => {
      eventLookups.push(args);
      return events.filter((event) => matchesExistingEvent(event, args.where))
        .sort((a, b) => {
          for (const order of args.orderBy ?? []) {
            for (const key of ['period', 'clockMs', 'sequence'] as const) {
              if (order[key] && a[key] !== b[key]) return (a[key] - b[key]) * (order[key] === 'asc' ? 1 : -1);
            }
          }
          return 0;
        })
        .map((event) => Object.fromEntries(Object.entries(event)
          .filter(([key]) => !args.select || args.select[key as keyof ExistingEvent])));
    } },
    v1ParticipantIdentityLinkCurrent: { findMany: async (args: { where: { userId?: string; participantId?: { in: string[] } } }) =>
      participants.filter((participant) => (!args.where.userId || participant.userId === args.where.userId)
        && (!args.where.participantId || args.where.participantId.in.includes(participant.id)))
        .map((participant) => ({ participantId: participant.id, userId: participant.userId, linkId: `link-${participant.id}` })),
    },
    v1UserProfile: { findMany: async (args: { where: { userId: { in: string[] } } }) =>
      participants.filter((participant) => args.where.userId.in.includes(participant.userId)).map((participant) => ({
        userId: participant.userId, nickname: `${participant.sideId} nickname`, realName: participant.displayNameSnapshot,
        displayName: participant.displayNameSnapshot, tournamentRealNameVisible: false, deletedAt: null, profileImageUrl: null,
      })),
    },
    v1UserRecordConsent: { findMany: async () => [] },
    v1ParticipantConsentSnapshot: { findMany: async () => [] },
    v1TeamMembership: { findMany: async () => [], findFirst: async () => null },
    v1AdminUser: { findFirst: async () => null },
    v1GameOperationFlag: { findUnique: async () => ({ value: options.liveEnabled ? 'on' : 'off' }) },
    v1OperationAudit: { findMany: async () => [] },
    v1TeamMatchRecordChange: { findMany: async () => [], findUnique: async () => null },
  };
  const prisma = { $transaction: async <T>(fn: (client: typeof tx) => Promise<T>, transaction: unknown) => {
    transactionOptions.push(transaction);
    return fn(tx);
  } } as unknown as PrismaService;
  return { service: new TeamMatchRecordService(prisma), game, current, events, lookups, eventLookups, transactionOptions };
}

describe('TeamMatchRecordService — existing v1 official friendly public record (MD-QA #61)', () => {
  it('reads the actual 1:3 score and four events without a shared score sheet, and exposes no edit identities', async () => {
    const { service, lookups, transactionOptions } = createExistingResultFake();
    const view = await service.read(null, 'existing-match');

    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
    expect(view).toMatchObject({ phase: 'legacy', canEdit: false, participant: false, operator: false, goals: [], participants: [], history: [], confirmations: [] });
    expect(view.goalEvents).toHaveLength(4);
    expect(view.goalEvents.map((event) => event.participantName)).toEqual(['side-home nickname', 'side-away nickname', 'side-away nickname', 'side-away nickname']);
    for (const event of view.goalEvents) expect(Object.keys(event).sort()).toEqual([
      'minute', 'ownGoal', 'participantName', 'sideId', 'subMatchId', ...('period' in event ? ['period'] : []),
    ].sort());
    expect(JSON.stringify(view)).not.toContain('private real name');
    expect(lookups[0].include).toHaveProperty('currentOfficialRevision');
    expect(transactionOptions).toEqual([{ isolationLevel: 'RepeatableRead' }]);
  });

  it.each([
    { home: 1, away: 3 },
    { regulation: { home: 1, away: 3 }, penalty: null },
  ])('uses the canonical score JSON shape %j even when goal events do not tally to the score', async (score) => {
    const fixture = createExistingResultFake();
    fixture.current!.score = score;
    fixture.events.splice(1);
    expect((await fixture.service.read(null, 'existing-match')).sides.map((side) => side.score)).toEqual([1, 3]);
  });

  it('keeps the current official pointer when a newer draft or stale shared record exists', async () => {
    const fixture = createExistingResultFake();
    fixture.game.resultRevisions.unshift({ ...fixture.current!, id: 'newer-draft', revision: 2, state: 'DRAFT', score: { home: 9, away: 9 } });
    fixture.game.sharedRecord = { version: 1, goals: OFFICIAL_RECORD().goals, subMatches: [], confirmations: [], officialAt: null };
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.phase).toBe('legacy');
    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
    expect(view.goalEvents).toHaveLength(4);
  });

  it('never gives a private legacy viewer stale shared goals or submatches ahead of the official projection', async () => {
    const fixture = createExistingResultFake({ submittedRoster: true });
    fixture.game.sharedRecord = { version: 1, goals: OFFICIAL_RECORD().goals, subMatches: [{ id: 'stale-submatch', title: '이전 기록', order: 0 }], confirmations: [], officialAt: null };
    const view = await fixture.service.read(user('user-home'), 'existing-match');
    expect(view).toMatchObject({ phase: 'legacy', participant: true, canEdit: false });
    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
    expect(view.goalEvents).toHaveLength(4);
    expect(view.goals).toEqual([]);
    expect(view.subMatches).toEqual([]);
  });

  it('prefers explicit revision JSON goals to old raw events, including an explicitly empty list', async () => {
    const fixture = createExistingResultFake();
    fixture.current!.goalEvents = [{ id: 'corrected-goal', sideId: 'side-away', participantId: 'participant-away', ownGoal: true, minute: 15 }];
    expect((await fixture.service.read(null, 'existing-match')).goalEvents).toEqual([
      { sideId: 'side-away', participantName: 'side-away nickname', ownGoal: true, minute: 15, subMatchId: null },
    ]);
    fixture.current!.goalEvents = [];
    expect((await fixture.service.read(null, 'existing-match')).goalEvents).toEqual([]);
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it('filters reversals while retaining the credited side and actual own-goal flag', async () => {
    const fixture = createExistingResultFake();
    fixture.events[1] = { ...fixture.events[1], type: 'OWN_GOAL', participantId: 'participant-home' };
    fixture.events.push({ ...fixture.events[0], id: 'undo-goal', type: 'CORRECTION', sequence: 5, reversesEventId: fixture.events[0].id });
    fixture.events.push({ ...fixture.events[0], id: 'other-game-goal', gameId: 'other-game' });
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
    expect(view.goalEvents).toHaveLength(3);
    expect(view.goalEvents).toContainEqual(expect.objectContaining({ sideId: 'side-away', participantName: 'side-home nickname', ownGoal: true, minute: 10, subMatchId: null }));
  });

  it.each(['OFFICIAL_ONLY', 'LIVE'] as const)('%s keeps official results visible with PUBLIC_LIVE off', async (policy) => {
    const { service } = createExistingResultFake({ policy });
    const view = await service.read(null, 'existing-match');
    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
    expect(view.goalEvents).toHaveLength(4);
  });

  it('STATUS_ONLY hides scores and goals before reading events', async () => {
    const fixture = createExistingResultFake({ policy: 'STATUS_ONLY' });
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.sides.map((side) => side.score)).toEqual([null, null]);
    expect(view.goalEvents).toEqual([]);
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it('keeps the existing private read exception for submitted participants on a hidden result', async () => {
    const { service } = createExistingResultFake({ policy: 'HIDDEN', submittedRoster: true });
    const view = await service.read(user('user-home'), 'existing-match');
    expect(view).toMatchObject({ phase: 'legacy', participant: true, canEdit: false });
    expect(view.sides.map((side) => side.score)).toEqual([1, 3]);
  });

  it.each(['hidden', 'deleted', 'unknown'] as const)('%s records fail closed for public readers', async (condition) => {
    const fixture = createExistingResultFake({ policy: condition === 'hidden' ? 'HIDDEN' : 'OFFICIAL_ONLY', deleted: condition === 'deleted' });
    await expect(fixture.service.read(null, condition === 'unknown' ? 'wrong-match' : 'existing-match')).rejects.toMatchObject({
      status: 404, response: { code: 'TEAM_MATCH_NOT_FOUND' },
    });
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it.each(['missing', 'draft', 'void', 'malformed-score'] as const)('%s current result never invents 0:0 or revives old events', async (condition) => {
    const fixture = createExistingResultFake({ ...(condition === 'missing' ? { revision: null } : {}), policy: 'LIVE', liveEnabled: true });
    if (condition === 'draft') fixture.current!.state = 'DRAFT';
    if (condition === 'void') fixture.current!.state = 'VOID';
    if (condition === 'malformed-score') fixture.current!.score = { home: 1 };
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.sides.map((side) => side.score)).toEqual([null, null]);
    expect(view.goalEvents).toEqual([]);
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it('malformed JSON goals do not fall back to unrelated event history', async () => {
    const fixture = createExistingResultFake();
    fixture.current!.goalEvents = [{ id: 'invalid-goal', ownGoal: false }];
    expect((await fixture.service.read(null, 'existing-match')).goalEvents).toEqual([]);
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it('keeps existing-result participants unable to write through the shared endpoint', async () => {
    const { service } = createExistingResultFake({ submittedRoster: true });
    expect(await service.read(user('user-home'), 'existing-match')).toMatchObject({ phase: 'legacy', canEdit: false, participant: true });
    await expect(service.mutate(user('user-home'), 'existing-match', confirm())).rejects.toMatchObject({
      status: 409, response: { code: 'RECORD_NOT_EDITABLE' },
    });
  });
});

describe('TeamMatchRecordService — public goal period metadata (#1694 finding 3)', () => {
  it('preserves period-relative P1:40 then P2:5 and selects the real event period', async () => {
    const fixture = createExistingResultFake();
    const first = { ...fixture.events[0], period: 1, clockMs: 40 * 60_000, sequence: 1 };
    const second = { ...fixture.events[1], period: 2, clockMs: 5 * 60_000, sequence: 2 };
    fixture.events.splice(0, fixture.events.length, second, first);

    const view = await fixture.service.read(null, 'existing-match');
    expect(view.goalEvents).toMatchObject([{ period: 1, minute: 40 }, { period: 2, minute: 5 }]);
    expect(fixture.eventLookups[0].select).toMatchObject({ period: true });
    expect(fixture.eventLookups[0].orderBy).toEqual([{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }]);
  });

  it('retains known official JSON periods without changing the JSON source order or relative minute', async () => {
    const fixture = createExistingResultFake();
    fixture.current!.goalEvents = [
      { id: 'json-p2', sideId: 'side-away', participantId: 'participant-away', period: 2, minute: 5, ownGoal: false },
      { id: 'json-p1', sideId: 'side-home', participantId: 'participant-home', period: 1, minute: 40, ownGoal: false },
    ];
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.goalEvents).toMatchObject([{ period: 2, minute: 5 }, { period: 1, minute: 40 }]);
    expect(fixture.eventLookups).toHaveLength(0);
  });

  it.each([null, undefined])('keeps unknown JSON period %s optional and its unknown minute null', async (period) => {
    const fixture = createExistingResultFake();
    fixture.current!.goalEvents = [{ id: 'json-unknown', sideId: 'side-home', participantId: 'participant-home', minute: null, ownGoal: false,
      ...(period === undefined ? {} : { period }),
    }];
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.goalEvents).toEqual([{ sideId: 'side-home', participantName: 'side-home nickname', minute: null, ownGoal: false, subMatchId: null }]);
  });

  it('does not turn a GOAL_BACKFILL placeholder into a known first period or zero minute', async () => {
    const fixture = createExistingResultFake();
    fixture.events.splice(1);
    fixture.events[0] = { ...fixture.events[0], period: 1, clockMs: 0, payload: { source: 'GOAL_BACKFILL_V1', minuteKnown: false } };
    const view = await fixture.service.read(null, 'existing-match');
    expect(view.goalEvents).toEqual([{ sideId: 'side-home', participantName: 'side-home nickname', minute: null, ownGoal: false, subMatchId: null }]);
  });

  it('keeps shared-record goals without period metadata compatible', async () => {
    const { service } = createFake({ memberships: [], official: true });
    const view = await service.read(null, 'tm-1');
    expect(view.goalEvents).toEqual([{ sideId: 'side-home', participantName: '홈 선수', minute: 10, ownGoal: false, subMatchId: null }]);
  });
});
