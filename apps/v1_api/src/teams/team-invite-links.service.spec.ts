/**
 * 초대 링크(Task 180 G12) 계약. 링크·멤버십·가입 신청을 메모리 DB 로 들고 있어서 "만든 링크로 들어오면 신청이 생긴다"
 * "재발급하면 옛 링크가 막힌다" 를 상태 변화로 확인한다. 팀장 판정·가입 규칙은 실제 TeamsService 를 탄다.
 */
import { TeamInviteLinksService } from './team-invite-links.service';
import { hashInviteLinkToken } from './team-invite-link-token';
import { TeamsService } from './teams.service';

const TEAM = 'team-1';
const T0 = new Date('2026-10-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'test-session-secret-0123456789-abcdefghij';

type Role = 'owner' | 'manager' | 'member';
type LinkRow = {
  id: string;
  teamId: string;
  createdByUserId: string;
  tokenSalt: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
};

function user(id: string) {
  return { id, email: `${id}@teameet.v1`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}

function setup(options: { joinPolicy?: 'approval_required' | 'closed'; teamStatus?: 'active' | 'archived' } = {}) {
  const team = {
    id: TEAM,
    name: '마포 FC',
    ownerUserId: 'owner',
    status: options.teamStatus ?? 'active',
    joinPolicy: options.joinPolicy ?? 'approval_required',
    memberCount: 3,
    deletedAt: null as Date | null,
  };
  const memberships: Array<{ id: string; teamId: string; userId: string; role: Role; status: 'active' }> = [
    { id: 'm-owner', teamId: TEAM, userId: 'owner', role: 'owner', status: 'active' },
    { id: 'm-manager', teamId: TEAM, userId: 'manager', role: 'manager', status: 'active' },
    { id: 'm-member', teamId: TEAM, userId: 'member', role: 'member', status: 'active' },
  ];
  const links: LinkRow[] = [];
  const applications: Array<{ id: string; teamId: string; applicantUserId: string; status: string; createdAt: Date }> = [];
  const logs: Array<{ reason: string; targetId: string }> = [];

  const teamRelations = (viewerId: string | null) => ({
    ...team,
    sport: { id: 'sport-futsal', name: '풋살' },
    region: { id: 'region-mapo', name: '마포구', parent: { name: '서울' } },
    profile: { logoUrl: '/uploads/logo.png', memberGoalCount: 24 },
    memberships: memberships
      .filter((row) => row.status === 'active' || row.userId === viewerId)
      .map((row) => ({ ...row, joinedAt: T0, user: { profile: { nickname: row.userId, displayName: null, profileImageUrl: null } } })),
    joinApplications: applications.filter((row) => row.applicantUserId === viewerId).slice(-1),
    trustScore: null,
    ownerUser: { id: 'owner', profile: null },
  });

  let transactionClient: unknown;
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) => callback(transactionClient)),
    v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMembership: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string; userId: string; status: string; role?: { in: Role[] } } }) =>
        memberships.find(
          (row) =>
            row.teamId === where.teamId &&
            row.userId === where.userId &&
            row.status === where.status &&
            (where.role === undefined || where.role.in.includes(row.role)),
        ) ?? null,
      ),
    },
    v1Team: {
      findFirst: jest.fn(async ({ where, include }: { where: { id: string; status?: string }; include?: unknown }) => {
        if (where.id !== team.id || team.deletedAt !== null) return null;
        if (where.status !== undefined && where.status !== team.status) return null;
        return include === undefined ? { ...team, profile: { memberGoalCount: 24 } } : teamRelations(currentViewer);
      }),
    },
    v1TeamJoinApplication: {
      create: jest.fn(async ({ data }: { data: { teamId: string; applicantUserId: string; status: string } }) => {
        const row = { id: `app-${applications.length + 1}`, createdAt: new Date(), ...data };
        applications.push(row);
        return row;
      }),
      update: jest.fn(),
    },
    v1StatusChangeLog: {
      create: jest.fn(async ({ data }: { data: { reason: string; targetId: string } }) => {
        logs.push({ reason: data.reason, targetId: data.targetId });
        return data;
      }),
    },
    v1TeamInviteLink: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string; revokedAt: null } }) =>
        links.find((row) => row.teamId === where.teamId && row.revokedAt === null) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = links.find((link) => link.tokenHash === where.tokenHash);
        return row === undefined ? null : { ...row, team: teamRelations(null) };
      }),
      // 실제 DB 의 부분 unique 인덱스(팀당 살아 있는 행 하나)를 흉내 낸다 — 옛 링크를 안 닫으면 여기서 깨진다.
      create: jest.fn(async ({ data }: { data: Omit<LinkRow, 'id' | 'revokedAt' | 'revokedByUserId' | 'createdAt'> }) => {
        if (links.some((row) => row.teamId === data.teamId && row.revokedAt === null)) {
          throw new Error('unique violation: v1_team_invite_links_active_team_key');
        }
        const row: LinkRow = { id: `link-${links.length + 1}`, revokedAt: null, revokedByUserId: null, createdAt: new Date(), ...data };
        links.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<LinkRow> }) => {
        const row = links.find((link) => link.id === where.id);
        if (row === undefined) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
    },
  };
  transactionClient = prisma;
  let currentViewer: string | null = null;
  const notifications = { refreshTeamJoinApplicationsLine: jest.fn().mockResolvedValue(undefined) };
  const teams = new TeamsService(prisma as never, notifications as never, {} as never);
  const service = new TeamInviteLinksService(prisma as never, teams);
  const as = (viewerId: string) => {
    currentViewer = viewerId;
    return user(viewerId);
  };

  return { service, as, team, memberships, links, applications, logs, notifications, prisma };
}

describe('TeamInviteLinksService', () => {
  const previousSecret = process.env.V1_SESSION_SECRET;
  beforeEach(() => {
    process.env.V1_SESSION_SECRET = SECRET;
    jest.useFakeTimers({ now: T0, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env.V1_SESSION_SECRET = previousSecret;
  });

  it('링크로 들어온 사람은 가입 신청(대기)이 되고 멤버는 되지 않는다', async () => {
    const ctx = setup();
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);

    const result = await ctx.service.join(ctx.as('newcomer'), link.token!);

    expect(result).toMatchObject({ teamId: TEAM, status: 'requested', joinState: 'requested', requiresApproval: true });
    expect(ctx.applications).toEqual([expect.objectContaining({ applicantUserId: 'newcomer', status: 'requested' })]);
    expect(ctx.memberships.some((row) => row.userId === 'newcomer')).toBe(false);
    expect(ctx.logs).toEqual([{ reason: 'team_join_application_created_via_invite_link', targetId: 'app-1' }]);
    expect(ctx.notifications.refreshTeamJoinApplicationsLine).toHaveBeenCalledWith(TEAM, 'arrival');
  });

  it('DB 에는 토큰 원문이 없고, 다시 열면 같은 링크를 보여 준다', async () => {
    const ctx = setup();
    const first = await ctx.service.issue(ctx.as('owner'), TEAM);
    const again = await ctx.service.issue(ctx.as('manager'), TEAM);
    const current = await ctx.service.current(ctx.as('manager'), TEAM);

    expect(first).toMatchObject({ status: 'active', created: true, expiresAt: new Date(T0.getTime() + 7 * DAY) });
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(again).toMatchObject({ token: first.token, created: false });
    expect(current).toMatchObject({ status: 'active', token: first.token });
    expect(ctx.links).toHaveLength(1);
    expect(Object.values(ctx.links[0])).not.toContain(first.token);
    expect(ctx.links[0].tokenHash).toBe(hashInviteLinkToken(first.token!));
  });

  it('재발급하면 이전 링크는 "새 링크가 만들어졌다"로 거절되고 새 링크만 통한다', async () => {
    const ctx = setup();
    const old = await ctx.service.issue(ctx.as('owner'), TEAM);
    const next = await ctx.service.reissue(ctx.as('manager'), TEAM);

    expect(next.token).not.toBe(old.token);
    await expect(ctx.service.preview(null, old.token!)).rejects.toMatchObject({
      status: 410,
      response: expect.objectContaining({ code: 'TEAM_INVITE_LINK_REVOKED' }),
    });
    await expect(ctx.service.join(ctx.as('newcomer'), old.token!)).rejects.toMatchObject({ status: 410 });
    await expect(ctx.service.preview(null, next.token!)).resolves.toMatchObject({ team: { id: TEAM } });
    expect(ctx.links.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(ctx.applications).toHaveLength(0);
  });

  it('7일이 되는 순간 만료되고, 만료 뒤 새로 만들어도 옛 링크는 "만료" 안내를 유지한다', async () => {
    const ctx = setup();
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);

    jest.setSystemTime(new Date(T0.getTime() + 7 * DAY - 1));
    await expect(ctx.service.preview(null, link.token!)).resolves.toMatchObject({ team: { name: '마포 FC' } });

    jest.setSystemTime(new Date(T0.getTime() + 7 * DAY));
    const expired = { status: 410, response: expect.objectContaining({ code: 'TEAM_INVITE_LINK_EXPIRED' }) };
    await expect(ctx.service.preview(null, link.token!)).rejects.toMatchObject(expired);
    await expect(ctx.service.current(ctx.as('owner'), TEAM)).resolves.toMatchObject({ status: 'expired', token: null });

    const fresh = await ctx.service.issue(ctx.as('owner'), TEAM);
    expect(fresh).toMatchObject({ status: 'active', created: true });
    await expect(ctx.service.preview(null, link.token!)).rejects.toMatchObject(expired);
  });

  it.each(['member', 'outsider'])('%s 는 링크를 보거나 만들거나 재발급할 수 없다(403)', async (viewerId) => {
    const ctx = setup();
    const forbidden = { status: 403, response: expect.objectContaining({ code: 'PERMISSION_DENIED' }) };
    await expect(ctx.service.current(ctx.as(viewerId), TEAM)).rejects.toMatchObject(forbidden);
    await expect(ctx.service.issue(ctx.as(viewerId), TEAM)).rejects.toMatchObject(forbidden);
    await expect(ctx.service.reissue(ctx.as(viewerId), TEAM)).rejects.toMatchObject(forbidden);
    expect(ctx.links).toHaveLength(0);
  });

  it('이미 멤버면 409 ALREADY_MEMBER, 대기 중 신청이 있으면 그 상태를 보여 주고 다시 신청은 409', async () => {
    const ctx = setup();
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);

    await expect(ctx.service.preview(ctx.as('member'), link.token!)).resolves.toMatchObject({
      viewer: { joinState: 'member', eligible: false, reasonCode: 'ALREADY_MEMBER' },
    });
    await expect(ctx.service.join(ctx.as('member'), link.token!)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'ALREADY_MEMBER' }),
    });

    await ctx.service.join(ctx.as('newcomer'), link.token!);
    await expect(ctx.service.preview(ctx.as('newcomer'), link.token!)).resolves.toMatchObject({
      viewer: { joinState: 'requested', eligible: false, reasonCode: 'ALREADY_REQUESTED' },
    });
    await expect(ctx.service.join(ctx.as('newcomer'), link.token!)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'ALREADY_REQUESTED' }),
    });
    expect(ctx.applications).toHaveLength(1);
  });

  it('미리보기는 팀 이름·종목·지역·로고만 내준다(비로그인은 viewer 없음)', async () => {
    const ctx = setup();
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);
    const preview = await ctx.service.preview(null, link.token!);

    expect(preview.team).toEqual({ id: TEAM, name: '마포 FC', sportName: '풋살', regionName: '서울 마포구', logoUrl: '/uploads/logo.png' });
    expect(preview.viewer).toBeNull();
  });

  it('가입을 닫아 둔 팀은 링크를 만들 수 없고, 이미 퍼진 링크로도 신청이 안 된다', async () => {
    const ctx = setup({ joinPolicy: 'closed' });
    await expect(ctx.service.issue(ctx.as('owner'), TEAM)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'JOIN_CLOSED' }),
    });

    ctx.team.joinPolicy = 'approval_required';
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);
    ctx.team.joinPolicy = 'closed';
    await expect(ctx.service.join(ctx.as('newcomer'), link.token!)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'JOIN_CLOSED' }),
    });
    expect(ctx.applications).toHaveLength(0);
  });

  it('해체된 팀의 링크는 410 TEAM_NOT_ACTIVE', async () => {
    const ctx = setup();
    const link = await ctx.service.issue(ctx.as('owner'), TEAM);
    ctx.team.status = 'archived';

    await expect(ctx.service.preview(null, link.token!)).rejects.toMatchObject({
      status: 410,
      response: expect.objectContaining({ code: 'TEAM_NOT_ACTIVE' }),
    });
  });

  it('형식이 다른 값은 DB 를 보지 않고, 없는 토큰은 DB 를 본 뒤 404 TEAM_INVITE_LINK_NOT_FOUND', async () => {
    const ctx = setup();
    const notFound = { status: 404, response: expect.objectContaining({ code: 'TEAM_INVITE_LINK_NOT_FOUND' }) };

    await expect(ctx.service.preview(null, '../../teams')).rejects.toMatchObject(notFound);
    expect(ctx.prisma.v1TeamInviteLink.findUnique).not.toHaveBeenCalled();
    await expect(ctx.service.preview(null, 'A'.repeat(32))).rejects.toMatchObject(notFound);
    expect(ctx.prisma.v1TeamInviteLink.findUnique).toHaveBeenCalledTimes(1);
  });

  it('서버 시크릿이 없으면 링크를 만들지 않는다(503) — 빈 키로 서명한 링크는 누구나 만들 수 있다', async () => {
    const ctx = setup();
    delete process.env.V1_SESSION_SECRET;

    await expect(ctx.service.issue(ctx.as('owner'), TEAM)).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ code: 'TEAM_INVITE_LINK_UNAVAILABLE' }),
    });
    expect(ctx.links).toHaveLength(0);
  });

  it('시크릿이 바뀌어 다시 보여 줄 수 없는 링크는 없는 것으로 보고, 만들면 새 링크로 바꾼다', async () => {
    const ctx = setup();
    const old = await ctx.service.issue(ctx.as('owner'), TEAM);
    process.env.V1_SESSION_SECRET = `${SECRET}-rotated`;

    await expect(ctx.service.current(ctx.as('owner'), TEAM)).resolves.toMatchObject({ status: 'none', token: null });
    const next = await ctx.service.issue(ctx.as('owner'), TEAM);
    expect(next).toMatchObject({ status: 'active', created: true });
    expect(next.token).not.toBe(old.token);
  });
});
