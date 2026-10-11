import type { V1AuthUser } from '../auth/v1-auth-user';
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

describe('GamesService.listResultRevisions — 리비전을 만든 사람 이름', () => {
  const ops = { id: 'ops-user', accountStatus: 'active' } as V1AuthUser;

  function revision(overrides: Record<string, unknown>) {
    return {
      id: 'rev',
      gameId: 'game-1',
      revision: 1,
      createdByActorType: 'USER',
      createdByUserId: null,
      createdBySystemActor: null,
      resultParticipants: [],
      ...overrides,
    };
  }

  function makeService(revisions: unknown[], profiles: unknown[]) {
    const prisma = {
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'game-1',
          sourceType: 'TEAM_MATCH',
          teamMatch: {
            id: 'tm-1',
            deletedAt: null,
            hostTeamId: 'team-host',
            approvedApplicantTeamId: 'team-away',
            tournamentId: null,
            leagueId: null,
            fieldId: null,
            tournament: null,
            league: null,
            tournamentDetails: null,
          },
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue({
          adminRole: 'ops',
          status: 'active',
          revokedAt: null,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
          user: { accountStatus: 'active' },
        }),
      },
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
      v1GameResultRevision: { findMany: jest.fn().mockResolvedValue(revisions) },
      v1UserProfile: { findMany: jest.fn().mockResolvedValue(profiles) },
    };
    return new GamesService(
      prisma as unknown as PrismaService,
      {} as OperationAuditWriterService,
      {} as GameTakeoverService,
    );
  }

  const profile = (userId: string, overrides: Record<string, unknown> = {}) => ({
    userId,
    realName: '실명',
    displayName: null,
    nickname: `${userId}-닉네임`,
    tournamentRealNameVisible: true,
    deletedAt: null,
    ...overrides,
  });

  it('제출한 스태프의 이름을 리비전마다 싣는다 — 시스템이 만든 리비전과 탈퇴 회원은 이름을 지어내지 않는다', async () => {
    const service = makeService(
      [
        revision({ id: 'r3', revision: 3, createdByUserId: 'staff-1' }),
        revision({ id: 'r2', revision: 2, createdByActorType: 'SYSTEM', createdBySystemActor: 'assist-sync' }),
        revision({ id: 'r1', revision: 1, createdByUserId: 'gone-1' }),
      ],
      [
        profile('staff-1'),
        profile('gone-1', { deletedAt: new Date('2026-09-02T00:00:00.000Z'), displayName: '탈퇴 회원', nickname: 'deleted_ab12cd34' }),
      ],
    );

    const result = await service.listResultRevisions(ops, 'game-1');

    expect(result.map((row) => ({ id: row.id, createdByName: row.createdByName }))).toEqual([
      // 스태프 화면의 이름 공개 정책(`tournamentRealNameVisible`)은 선수 기록용이다 — 운영 담당자는 닉네임으로만 보인다.
      { id: 'r3', createdByName: 'staff-1-닉네임' },
      { id: 'r2', createdByName: null },
      { id: 'r1', createdByName: '탈퇴 회원' },
    ]);
  });
});
