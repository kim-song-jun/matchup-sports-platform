import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

/**
 * **플랫폼 운영자가 리그 경기를 콘솔에서 운영할 수 있는가.**
 *
 * 리그 대진의 게임은 `sourceType = TEAM_MATCH` 로 만들어진다(`league-fixture-creation.ts`).
 * 그런데 `resolveActor` 의 TEAM_MATCH 운영자 분기만 `authorizationSubject` 없이 반환해서,
 * `requestTakeover` 의 `if (actor.authorizationSubject === undefined) throw forbidden()` 에
 * 걸렸다 — **콘솔은 버튼을 다 그려 주고 "실시간 연결됨" 까지 뜨는데 "경기 시작" 이
 * `STAFF_SCOPE_DENIED`** 였다(2026-09-05 alpha 실측).
 *
 * 주체 문자열은 takeover 토큰이 묶이는 값이라(어드민 권한이 바뀌면 `updatedAt` 이 움직여
 * 옛 토큰이 무효가 된다) **경로마다 같아야** 한다.
 */
describe('GamesService.requestTakeover — 플랫폼 운영자와 TEAM_MATCH 게임', () => {
  const ops = { id: 'ops-user', accountStatus: 'active' } as V1AuthUser;
  const ADMIN_UPDATED_AT = new Date('2026-09-01T00:00:00.000Z');

  function makeService(options: { admin?: unknown } = {}) {
    // 서비스는 `grant.token` 을 읽어 `takeoverToken` 으로 내보낸다 — 필드명을 맞춘다.
    const grant = jest.fn().mockReturnValue({
      token: 'token-1',
      expiresAt: '2026-09-05T00:01:30.000Z',
    });
    const prisma = {
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'game-1',
          sourceType: 'TEAM_MATCH',
          version: 3,
          lastSequence: 7,
          teamMatch: { hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away' },
          tournamentFixture: null,
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(
          options.admin === undefined
            ? {
                adminRole: 'ops',
                status: 'active',
                revokedAt: null,
                updatedAt: ADMIN_UPDATED_AT,
                user: { accountStatus: 'active' },
              }
            : options.admin,
        ),
      },
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new GamesService(
      prisma as unknown as PrismaService,
      {} as OperationAuditWriterService,
      { grant } as unknown as GameTakeoverService,
    );
    return { service, prisma, grant };
  }

  it('운영자가 리그 경기(TEAM_MATCH)의 takeover 를 받는다 — 이게 없어 콘솔이 먹통이었다', async () => {
    const { service, grant } = makeService();

    await expect(
      service.requestTakeover(ops, 'game-1', { clientInstanceId: 'c1', lastSequence: 0 }),
    ).resolves.toMatchObject({ takeoverToken: 'token-1' });

    // **주체가 실제로 실려야 한다.** 토큰이 이 문자열에 묶이므로, 비어 있으면
    // `requestTakeover` 가 그 자리에서 403 을 던진다.
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationSubject: `platform_ops:ops-user@${ADMIN_UPDATED_AT.getTime()}`,
      }),
    );
  });

  it('권한이 없는 사람은 그대로 막힌다 — 문을 연 것이 아니라 운영자만 통과시킨다', async () => {
    const { service } = makeService({ admin: null });

    await expect(
      service.requestTakeover(ops, 'game-1', { clientInstanceId: 'c1', lastSequence: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('권한이 정지된 운영자도 막힌다', async () => {
    const { service } = makeService({
      admin: {
        adminRole: 'ops',
        status: 'suspended',
        revokedAt: null,
        updatedAt: ADMIN_UPDATED_AT,
        user: { accountStatus: 'active' },
      },
    });

    await expect(
      service.requestTakeover(ops, 'game-1', { clientInstanceId: 'c1', lastSequence: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
