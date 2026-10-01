/**
 * 여러 명 초대(Task 180 G12 F27) 계약. 사용자·멤버십·초대를 메모리 DB 로 들고 항목별 결과와 실제로 생긴 초대를 함께 본다.
 */
import { TeamsService } from './teams.service';

const TEAM = 'team-1';

type Invitation = { id: string; teamId: string; invitedUserId: string; invitedByUserId: string; status: string; message: string | null };

function user(id: string, accountStatus: 'active' | 'suspended' = 'active') {
  return { id, email: `${id}@teameet.v1`, accountStatus, onboardingStatus: 'completed' as const };
}

function setup(options: { memberCount?: number; memberGoalCount?: number | null } = {}) {
  const users = [
    { id: 'u-kim', email: 'kim@example.com', deletedAt: null, profile: { nickname: '김선수' } },
    { id: 'u-lee', email: 'lee@example.com', deletedAt: null, profile: { nickname: '이선수' } },
    { id: 'u-park', email: 'park@example.com', deletedAt: null, profile: { nickname: '박선수' } },
    { id: 'u-twin-1', email: 'twin1@example.com', deletedAt: null, profile: { nickname: '쌍둥이' } },
    { id: 'u-twin-2', email: 'twin2@example.com', deletedAt: null, profile: { nickname: '쌍둥이' } },
    { id: 'member', email: 'member@example.com', deletedAt: null, profile: { nickname: '기존멤버' } },
  ];
  const memberships = [
    { teamId: TEAM, userId: 'owner', role: 'owner', status: 'active' },
    { teamId: TEAM, userId: 'manager', role: 'manager', status: 'active' },
    { teamId: TEAM, userId: 'member', role: 'member', status: 'active' },
  ];
  const invitations: Invitation[] = [
    { id: 'inv-park', teamId: TEAM, invitedUserId: 'u-park', invitedByUserId: 'owner', status: 'pending', message: null },
    { id: 'inv-lee', teamId: TEAM, invitedUserId: 'u-lee', invitedByUserId: 'owner', status: 'declined', message: null },
  ];
  const prisma = {
    v1TeamMembership: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string; userId: string; role: { in: string[] } } }) =>
        memberships.find((row) => row.teamId === where.teamId && row.userId === where.userId && where.role.in.includes(row.role)) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { teamId_userId: { teamId: string; userId: string } } }) =>
        memberships.find((row) => row.teamId === where.teamId_userId.teamId && row.userId === where.teamId_userId.userId) ?? null,
      ),
    },
    v1Team: {
      findFirst: jest.fn(async () => ({
        id: TEAM,
        name: '마포 FC',
        status: 'active',
        joinPolicy: 'approval_required',
        memberCount: options.memberCount ?? 3,
        profile: { memberGoalCount: options.memberGoalCount ?? 24 },
      })),
    },
    v1User: {
      // Prisma 처럼 email IN / profile.nickname IN 을 OR 로 본다 — 부분 일치는 없다.
      findMany: jest.fn(async ({ where }: { where: { OR: [{ email: { in: string[] } }, { profile: { nickname: { in: string[] } } }] } }) =>
        users.filter(
          (row) =>
            row.deletedAt === null &&
            (where.OR[0].email.in.includes(row.email) || where.OR[1].profile.nickname.in.includes(row.profile.nickname)),
        ),
      ),
    },
    v1TeamInvitation: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string; invitedUserId: string; status: string } }) =>
        invitations.find((row) => row.teamId === where.teamId && row.invitedUserId === where.invitedUserId && row.status === where.status) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Omit<Invitation, 'id'> }) => {
        const row = { id: `inv-new-${invitations.length + 1}`, ...data };
        invitations.push(row);
        return row;
      }),
    },
  };
  const notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };
  const service = new TeamsService(prisma as never, notifications as never, {} as never);
  return { service, invitations, notifications };
}

describe('TeamsService.createInvitationsBatch', () => {
  it('이메일·닉네임을 섞어 담으면 항목마다 결과를 돌려주고 새로 초대한 사람에게만 알린다', async () => {
    const ctx = setup();
    const result = await ctx.service.createInvitationsBatch(user('manager'), TEAM, {
      recipients: [' Kim@Example.com ', '이선수', '박선수', '기존멤버', 'ghost@example.com', '쌍둥이'],
      message: '같이 뛰어요',
    });

    expect(result.results).toEqual([
      { recipient: 'Kim@Example.com', status: 'invited', invitationId: 'inv-new-3' },
      { recipient: '이선수', status: 'invited', invitationId: 'inv-new-4' },
      { recipient: '박선수', status: 'already_invited', invitationId: 'inv-park' },
      { recipient: '기존멤버', status: 'already_member', invitationId: null },
      { recipient: 'ghost@example.com', status: 'not_found', invitationId: null },
      { recipient: '쌍둥이', status: 'ambiguous', invitationId: null },
    ]);
    expect(result.invitedCount).toBe(2);
    // 거절했던 초대는 기록으로 남고, 다시 보낸 초대는 지금 매니저가 보낸 새 행이다(W4-V8).
    expect(ctx.invitations.find((row) => row.id === 'inv-lee')).toMatchObject({ status: 'declined', invitedByUserId: 'owner' });
    expect(ctx.invitations.find((row) => row.id === 'inv-new-4')).toMatchObject({ invitedUserId: 'u-lee', status: 'pending', invitedByUserId: 'manager', message: '같이 뛰어요' });
    expect(ctx.invitations.filter((row) => row.status === 'pending').map((row) => row.invitedUserId).sort()).toEqual(['u-kim', 'u-lee', 'u-park']);
    expect(ctx.notifications.emitNotification.mock.calls.map((call) => call[0]).sort()).toEqual(['u-kim', 'u-lee']);
  });

  it('같은 사람을 두 번 적거나 이메일·닉네임으로 겹쳐 적어도 초대는 한 번이다', async () => {
    const ctx = setup();
    const result = await ctx.service.createInvitationsBatch(user('owner'), TEAM, {
      recipients: ['김선수', 'kim@example.com', '김선수'],
    });

    expect(result.results.map((row) => row.status)).toEqual(['invited', 'duplicate', 'duplicate']);
    expect(ctx.invitations.filter((row) => row.invitedUserId === 'u-kim')).toHaveLength(1);
    expect(ctx.notifications.emitNotification).toHaveBeenCalledTimes(1);
  });

  it.each([['member'], ['outsider']])('%s 는 여러 명 초대를 보낼 수 없다(403)', async (actor) => {
    const ctx = setup();
    await expect(ctx.service.createInvitationsBatch(user(actor), TEAM, { recipients: ['김선수'] })).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    expect(ctx.invitations).toHaveLength(2);
  });

  it('정원이 찬 팀은 아무도 초대하지 않고 409 TEAM_FULL', async () => {
    const ctx = setup({ memberCount: 24, memberGoalCount: 24 });
    await expect(ctx.service.createInvitationsBatch(user('owner'), TEAM, { recipients: ['김선수'] })).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'TEAM_FULL' }),
    });
    expect(ctx.notifications.emitNotification).not.toHaveBeenCalled();
  });
});
