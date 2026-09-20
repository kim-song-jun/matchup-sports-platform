/**
 * 정규 리그 결과 권한을 `resolveActor` 실코드에 대고 못 박는다.
 *
 * D1(2026-08-24 사용자 확정: 운영자가 기본 입력자, 팀은 확인만) + 정본 §4(경기 종료가 곧
 * 제출, 확인은 어드민 하나)에 따라 참가팀에는 제출도 승인도 없다. 이 판정을 느슨하게
 * 풀면 정본이 없앤 상대팀 승인 레인이 되살아나고, 어드민 확인 없이 OFFICIAL 로 올리는
 * 자동승인 잡까지 함께 열린다 — 정책 회귀가 아니라 정합성 사고다.
 */
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

const ids = {
  game: '68168001-0000-4000-8000-00000000a001',
  teamMatch: '68168001-0000-4000-8000-00000000a002',
  league: '68168001-0000-4000-8000-00000000a003',
  hostTeam: '68168001-0000-4000-8000-00000000a004',
  awayTeam: '68168001-0000-4000-8000-00000000a005',
  hostManager: '68168001-0000-4000-8000-00000000a006',
  awayOwner: '68168001-0000-4000-8000-00000000a007',
  plainMember: '68168001-0000-4000-8000-00000000a008',
  admin: '68168001-0000-4000-8000-00000000a009',
} as const;

type Membership = { userId: string; teamId: string; role: 'owner' | 'manager' | 'member'; status: 'active' };

const eligibleAdmin = {
  adminRole: 'ops',
  status: 'active',
  revokedAt: null,
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  user: { accountStatus: 'active' },
};

/**
 * `kind: 'regular_league'` 은 tournament·league 양쪽에 쓴다 —
 * league-fixture-creation.ts 가 `tournamentId`/`leagueId` 를 같은 id 로 이중 기록한다.
 */
function makeService(options: {
  kind?: 'regular_tournament' | 'regular_league';
  memberships?: Membership[];
  admin?: unknown;
}) {
  const kind = options.kind ?? 'regular_league';
  const isLeague = kind === 'regular_league';
  const teamMatch = {
    id: ids.teamMatch,
    deletedAt: null,
    hostTeamId: ids.hostTeam,
    approvedApplicantTeamId: ids.awayTeam,
    tournamentId: ids.league,
    leagueId: isLeague ? ids.league : null,
    fieldId: null,
    tournament: { kind },
    league: isLeague ? { kind } : null,
    tournamentDetails: isLeague
      ? null
      : {
          teamMatchId: ids.teamMatch,
          tournamentId: ids.league,
          homeRegistration: { teamId: ids.hostTeam },
          awayRegistration: { teamId: ids.awayTeam },
        },
  };
  const prisma = {
    v1Game: { findUnique: jest.fn().mockResolvedValue({ sourceType: 'TEAM_MATCH', teamMatch }) },
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(options.admin ?? null) },
    v1TournamentStaffAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMembership: {
      findMany: jest.fn().mockResolvedValue(options.memberships ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const service = new GamesService(
    prisma as unknown as PrismaService,
    {} as OperationAuditWriterService,
    new GameTakeoverService(),
  );
  return { service, prisma };
}

function resolve(service: GamesService, prisma: unknown, userId: string, action: string) {
  return (
    service as unknown as {
      resolveActor: (tx: unknown, gameId: string, userId: string, action: string) => Promise<unknown>;
    }
  ).resolveActor(prisma, ids.game, userId, action);
}

const hostManager: Membership = { userId: ids.hostManager, teamId: ids.hostTeam, role: 'manager', status: 'active' };
const awayOwner: Membership = { userId: ids.awayOwner, teamId: ids.awayTeam, role: 'owner', status: 'active' };
const plainMember: Membership = { userId: ids.plainMember, teamId: ids.hostTeam, role: 'member', status: 'active' };

describe('정규 리그 결과는 운영·어드민 전용 레인이다', () => {
  it.each([
    ['홈팀 매니저', 'team_result_submit', hostManager, ids.hostManager],
    ['원정팀 오너', 'opponent_result_decide', awayOwner, ids.awayOwner],
    ['홈팀 매니저', 'team_result_correction', hostManager, ids.hostManager],
    ['원정팀 오너', 'team_result_void', awayOwner, ids.awayOwner],
  ])('%s 는 %s 를 할 수 없다', async (_label, action, membership, userId) => {
    const { service, prisma } = makeService({ memberships: [membership] });

    await expect(resolve(service, prisma, userId, action)).rejects.toMatchObject({ status: 403 });
  });

  // 전원 거부로 위 단언을 만족시킬 수 없게 하는 대칭 케이스 — 운영 경로는 살아 있어야 한다.
  it.each(['team_result_submit', 'opponent_result_decide'])(
    '자격 있는 플랫폼 어드민은 %s 를 할 수 있다',
    async (action) => {
      const { service, prisma } = makeService({ admin: eligibleAdmin });

      await expect(resolve(service, prisma, ids.admin, action)).resolves.toMatchObject({
        role: 'platform_ops',
        tournamentId: ids.league,
        fixtureId: ids.teamMatch,
        authorizationSubject: expect.any(String),
      });
    },
  );

  // 같은 액션이 정규 대회에서는 이 게이트를 타지 않는다는 것까지 본다 — 리그 조건이
  // 통째로 빠져도 위 케이스만으로는 드러나지 않는다.
  it('정규 대회의 홈팀 매니저는 리그 전용 게이트가 아니라 기존 스태프 판정으로 막힌다', async () => {
    const { service, prisma } = makeService({ kind: 'regular_tournament', memberships: [hostManager] });

    await expect(resolve(service, prisma, ids.hostManager, 'team_result_submit')).rejects.toMatchObject({ status: 403 });
    await expect(resolve(service, prisma, ids.hostManager, 'lineup_mutate')).resolves.toMatchObject({
      role: 'team_manager',
      teamId: ids.hostTeam,
    });
  });
});

describe('정규 리그 결과 열람은 참가팀 전원에게 열린다', () => {
  it('일반 멤버도 결과를 읽을 수 있다', async () => {
    const { service, prisma } = makeService({ memberships: [plainMember] });

    await expect(resolve(service, prisma, ids.plainMember, 'read')).resolves.toMatchObject({
      role: 'team_member',
      teamId: ids.hostTeam,
      fixtureId: ids.teamMatch,
    });
  });

  it.each(['team_result_submit', 'opponent_result_decide', 'lineup_mutate'])(
    '일반 멤버에게 %s 는 여전히 닫혀 있다',
    async (action) => {
      const { service, prisma } = makeService({ memberships: [plainMember] });

      await expect(resolve(service, prisma, ids.plainMember, action)).rejects.toMatchObject({ status: 403 });
    },
  );

  it('정규 대회에서는 일반 멤버 열람을 열지 않는다 — 리그에 한정한 완화다', async () => {
    const { service, prisma } = makeService({ kind: 'regular_tournament', memberships: [plainMember] });

    await expect(resolve(service, prisma, ids.plainMember, 'read')).rejects.toMatchObject({ status: 403 });
  });

  it('어느 참가팀 소속도 아니면 열람도 막힌다', async () => {
    const { service, prisma } = makeService({ memberships: [] });

    await expect(resolve(service, prisma, ids.plainMember, 'read')).rejects.toMatchObject({ status: 403 });
  });
});
