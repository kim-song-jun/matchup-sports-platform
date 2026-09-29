import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

// Task 179 경기 명단 화면의 운영자 판정. support 어드민은 경기 인가(resolveActor)에서 빠지지만
// 팀 표·어드민 표처럼 명단을 읽기로 본다 — 쓰기는 열지 않는다.
// 스태프 정책은 UUID 가 아닌 id 를 INVALID_INPUT 으로 거부한다.
const ids = {
  game: '17817801-0000-4000-8000-00000000a001',
  teamMatch: '17817801-0000-4000-8000-00000000a002',
  tournament: '17817801-0000-4000-8000-00000000a003',
  hostTeam: '17817801-0000-4000-8000-00000000a004',
  awayTeam: '17817801-0000-4000-8000-00000000a005',
  user: '17817801-0000-4000-8000-00000000a006',
} as const;

const admin = (adminRole: 'ops' | 'support', overrides: Record<string, unknown> = {}) => ({
  adminRole,
  status: 'active',
  revokedAt: null,
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  user: { accountStatus: 'active' },
  ...overrides,
});

function makeService(options: { admin?: unknown; memberships?: unknown[] }) {
  const teamMatch = {
    id: ids.teamMatch,
    deletedAt: null,
    hostTeamId: ids.hostTeam,
    approvedApplicantTeamId: ids.awayTeam,
    tournamentId: ids.tournament,
    leagueId: null,
    fieldId: null,
    tournament: { kind: 'regular_tournament' },
    league: null,
    tournamentDetails: {
      teamMatchId: ids.teamMatch,
      tournamentId: ids.tournament,
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
  const service = new GamesService(prisma as unknown as PrismaService, {} as OperationAuditWriterService, new GameTakeoverService());
  return { operator: () => service.resolveCompetitionOperator(prisma as never, ids.game, ids.user) };
}

describe('resolveCompetitionOperator — 경기 명단 운영자 판정', () => {
  it('ops 어드민은 플랫폼 운영자로 쓴다', async () => {
    await expect(makeService({ admin: admin('ops') }).operator()).resolves.toEqual({
      role: 'platform_ops',
      canMutateLineup: true,
      platformAdmin: true,
    });
  });

  it('support 어드민은 플랫폼 어드민으로 읽기만 한다', async () => {
    await expect(makeService({ admin: admin('support') }).operator()).resolves.toEqual({
      role: 'support_readonly',
      canMutateLineup: false,
      platformAdmin: true,
    });
  });

  it.each([
    ['회수된', { revokedAt: new Date('2026-09-01T00:00:00.000Z') }],
    ['비활성', { status: 'suspended' }],
    ['계정이 정지된', { user: { accountStatus: 'suspended' } }],
  ])('%s support 어드민은 운영자가 아니다', async (_label, overrides) => {
    await expect(makeService({ admin: admin('support', overrides) }).operator()).resolves.toBeNull();
  });

  it('참가팀 매니저는 운영자가 아니다(팀 권한은 사이드 멤버십으로 따로 본다)', async () => {
    const memberships = [{ userId: ids.user, teamId: ids.hostTeam, role: 'manager', status: 'active' }];
    await expect(makeService({ memberships }).operator()).resolves.toBeNull();
  });
});
