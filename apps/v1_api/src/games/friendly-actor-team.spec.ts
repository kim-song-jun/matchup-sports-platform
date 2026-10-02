/**
 * 친선 팀매치에서 `resolveActor` 가 돌려주는 `teamId` 는 **매니저 권한을 준 멤버십의 팀**이어야 한다.
 *
 * 예전 fallthrough 는 `role` 을 `호스트 매니저 ?? 상대 매니저` 로 정하면서 `teamId` 는 따로
 * `호스트 멤버십 ?? 상대 멤버십` 으로 정했다. **한쪽 팀의 일반 멤버이면서 다른 쪽 팀의 매니저**인 사용자는
 * role 은 `team_manager` 인데 teamId 는 자기가 매니저가 아닌 팀이 됐고, 그 teamId 로 사이드를 고르는
 * 소비처(명단 검인·라인업 열람)에서 반대편 사이드를 다룰 수 있었다.
 */
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

const ids = {
  game: 'game-1',
  teamMatch: 'tm-1',
  hostTeam: 'team-host',
  oppTeam: 'team-opp',
  hostSide: 'side-host',
  oppSide: 'side-opp',
  hostManager: 'user-host-manager',
  dual: 'user-dual', // 호스트팀 일반 멤버 + 상대팀 매니저
  dualOwner: 'user-dual-owner', // 호스트팀 일반 멤버 + 상대팀 오너
  plain: 'user-plain', // 호스트팀 일반 멤버뿐
} as const;

type Membership = { userId: string; teamId: string; role: 'owner' | 'manager' | 'member'; status: 'active' };
const membership = (userId: string, teamId: string, role: Membership['role']): Membership => ({
  userId, teamId, role, status: 'active',
});

const MEMBERSHIPS: Membership[] = [
  membership(ids.hostManager, ids.hostTeam, 'manager'),
  membership(ids.dual, ids.hostTeam, 'member'),
  membership(ids.dual, ids.oppTeam, 'manager'),
  membership(ids.dualOwner, ids.hostTeam, 'member'),
  membership(ids.dualOwner, ids.oppTeam, 'owner'),
  membership(ids.plain, ids.hostTeam, 'member'),
];

const SIDES = [
  { id: ids.hostSide, gameId: ids.game, teamId: ids.hostTeam },
  { id: ids.oppSide, gameId: ids.game, teamId: ids.oppTeam },
];

/** 친선 — 대회·리그 어느 쪽에도 속하지 않아 `resolveActor` 가 마지막 fallthrough 로 내려온다. */
function makeService() {
  const teamMatch = {
    id: ids.teamMatch,
    deletedAt: null,
    hostTeamId: ids.hostTeam,
    approvedApplicantTeamId: ids.oppTeam,
    tournamentId: null,
    leagueId: null,
    fieldId: null,
    tournament: null,
    league: null,
    tournamentDetails: null,
  };
  // 트랜잭션 콜백이 같은 가짜 클라이언트를 받도록 자기 참조를 상자로 끊는다(타입 추론 순환 방지).
  const self: { client: unknown } = { client: undefined };
  const prisma = {
    v1Game: { findUnique: jest.fn().mockResolvedValue({ sourceType: 'TEAM_MATCH', teamMatch }) },
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(null) },
    v1TeamMembership: {
      findMany: jest.fn(async (args: { where: { userId: string; teamId: { in: string[] } } }) =>
        MEMBERSHIPS.filter((row) => row.userId === args.where.userId && args.where.teamId.in.includes(row.teamId)),
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    v1GameSide: {
      findFirst: jest.fn(async (args: { where: { id: string; gameId: string } }) =>
        SIDES.find((side) => side.id === args.where.id && side.gameId === args.where.gameId) ?? null,
      ),
    },
    v1GameLineup: {
      findMany: jest.fn(async (args: { where: { sideId: string } }) => [
        { id: `lineup-${args.where.sideId}`, sideId: args.where.sideId, revision: 1, state: 'SUBMITTED' },
      ]),
    },
    v1GameParticipant: {
      findMany: jest.fn(async (args: { where: { sideId: string } }) => [
        { id: `p-${args.where.sideId}`, sideId: args.where.sideId, lineupId: `lineup-${args.where.sideId}`, arrivedAt: null },
      ]),
      findFirst: jest.fn(async (args: { where: { id: string } }) => {
        const sideId = args.where.id.replace(/^p-/, '');
        return { id: args.where.id, sideId, lineupId: `lineup-${sideId}`, arrivedAt: null };
      }),
      updateMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => ({ count: args.where.id.in.length })),
      update: jest.fn(async (args: { where: { id: string } }) => ({ id: args.where.id, arrivedAt: new Date() })),
    },
    $transaction: jest.fn(async (callback: (client: unknown) => unknown) => callback(self.client)),
  };
  self.client = prisma;
  const service = new GamesService(
    prisma as unknown as PrismaService,
    {} as OperationAuditWriterService,
    new GameTakeoverService(),
  );
  return { service, prisma };
}

const user = (id: string) => ({ id }) as V1AuthUser;

function resolve(service: GamesService, prisma: unknown, userId: string, action: string) {
  return (
    service as unknown as {
      resolveActor: (tx: unknown, gameId: string, userId: string, action: string) => Promise<unknown>;
    }
  ).resolveActor(prisma, ids.game, userId, action);
}

describe('친선 팀매치 resolveActor — teamId 는 매니저 권한을 준 팀이다', () => {
  it.each(['lineup_mutate', 'read'])(
    '호스트팀 일반 멤버이면서 상대팀 매니저인 사용자는 %s 에서 상대팀으로 나온다',
    async (action) => {
      const { service, prisma } = makeService();

      await expect(resolve(service, prisma, ids.dual, action)).resolves.toMatchObject({
        role: 'team_manager',
        teamId: ids.oppTeam,
      });
    },
  );

  it('상대팀 오너이면 team_owner 로, 역시 오너인 상대팀이 teamId 다', async () => {
    const { service, prisma } = makeService();

    await expect(resolve(service, prisma, ids.dualOwner, 'lineup_mutate')).resolves.toMatchObject({
      role: 'team_owner',
      teamId: ids.oppTeam,
    });
  });

  // 대조군 — 고친 뒤에도 평범한 호스트 매니저는 그대로 호스트다.
  it('호스트팀 매니저는 호스트팀으로 나온다', async () => {
    const { service, prisma } = makeService();

    await expect(resolve(service, prisma, ids.hostManager, 'lineup_mutate')).resolves.toMatchObject({
      role: 'team_manager',
      teamId: ids.hostTeam,
    });
  });

  it('매니저 권한이 없는 일반 멤버는 열람만 되고(팀은 자기 팀) 쓰기 액션은 403 이다', async () => {
    const { service, prisma } = makeService();

    await expect(resolve(service, prisma, ids.plain, 'read')).resolves.toMatchObject({
      role: 'support_readonly',
      teamId: ids.hostTeam,
    });
    await expect(resolve(service, prisma, ids.plain, 'lineup_mutate')).rejects.toMatchObject({ status: 403 });
  });
});

describe('친선 명단 검인 — 권한을 준 팀의 사이드만 다룬다', () => {
  it('일괄 검인: 호스트팀 일반 멤버 + 상대팀 매니저는 상대 사이드만 되고 호스트 사이드는 403 이다', async () => {
    const { service, prisma } = makeService();

    await expect(service.confirmSideArrival(user(ids.dual), ids.game, ids.oppSide)).resolves.toMatchObject({
      newlyArrivedCount: 1,
    });
    await expect(service.confirmSideArrival(user(ids.dual), ids.game, ids.hostSide)).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
    // 403 이면 호스트 사이드는 갱신 자체가 나가지 않는다.
    expect(prisma.v1GameParticipant.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.v1GameParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [`p-${ids.oppSide}`] }, arrivedAt: null } }),
    );
  });

  it('개별 검인: 같은 사용자가 호스트 사이드 참가자는 403, 상대 사이드 참가자는 허용이다', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.setParticipantArrival(user(ids.dual), ids.game, `p-${ids.hostSide}`, true),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.v1GameParticipant.update).not.toHaveBeenCalled();

    await expect(
      service.setParticipantArrival(user(ids.dual), ids.game, `p-${ids.oppSide}`, true),
    ).resolves.toMatchObject({ id: `p-${ids.oppSide}` });
  });

  it('호스트팀 매니저는 호스트 사이드가 되고 상대 사이드는 403 이다 (양방향 대조군)', async () => {
    const { service } = makeService();

    await expect(service.confirmSideArrival(user(ids.hostManager), ids.game, ids.hostSide)).resolves.toMatchObject({
      newlyArrivedCount: 1,
    });
    await expect(service.confirmSideArrival(user(ids.hostManager), ids.game, ids.oppSide)).rejects.toMatchObject({
      status: 403,
    });
  });
});
