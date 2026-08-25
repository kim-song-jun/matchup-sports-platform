import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

/**
 * `listLeagueClaimableParticipants` (2026-08-25, claim 의 리그 확장) 의 계약 3개를
 * 고정한다:
 *
 * 1. **리그 스코프 게이트** — teamMatchId 가 그 리그의 대진이 아니면(또는 삭제됐으면)
 *    게임 인가를 태우기 전에 404 로 끊는다. 이 where 절(leagueId + deletedAt: null)이
 *    빠지면 아무 리그 id 로나 남의 팀매치 미연결 명단을 열람하는 경로가 생긴다.
 * 2. **인가는 participant_identity 스코프 재사용** — 두 참가팀의 활성 멤버가 아니면
 *    403. 새 인가 규칙을 만들지 않고 resolveActor 의 team-match 분기를 그대로 탄다.
 * 3. **이미 연결된 참가자는 목록에서 뺀다** — 남의 연결을 빼앗는 신호를 애초에 안 만든다.
 *
 * 대회 판(listClaimableParticipants)과 공통 본문을 공유하므로, 3번은 공통 헬퍼의
 * 회귀 방지도 겸한다.
 */
describe('GamesService.listLeagueClaimableParticipants', () => {
  const user = { id: 'user-1', accountStatus: 'active' } as V1AuthUser;

  function makeService(overrides: {
    teamMatch?: unknown;
    memberships?: unknown[];
    participants?: unknown[];
    linked?: unknown[];
  }) {
    const prisma = {
      v1TeamMatch: {
        findFirst: jest.fn().mockResolvedValue(overrides.teamMatch ?? null),
      },
      v1Game: {
        findUnique: jest.fn().mockResolvedValue({
          sourceType: 'TEAM_MATCH',
          teamMatch: { hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away' },
          tournamentFixture: null,
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
      },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue(overrides.participants ?? []),
      },
      v1ParticipantIdentityLinkCurrent: {
        findMany: jest.fn().mockResolvedValue(overrides.linked ?? []),
      },
    };
    const service = new GamesService(
      prisma as unknown as PrismaService,
      {} as OperationAuditWriterService,
      {} as GameTakeoverService,
    );
    return { service, prisma };
  }

  it('리그 소속이 아닌 teamMatchId 는 인가를 태우기 전에 404 로 끊는다', async () => {
    const { service, prisma } = makeService({ teamMatch: null });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-other'),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURE_GAME_NOT_FOUND' } });

    // 리그 스코프 게이트의 실체 — 이 where 절이 없으면 리그 id 를 무시하고 통과한다.
    expect(prisma.v1TeamMatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tm-other', leagueId: 'league-1', deletedAt: null },
      }),
    );
    expect(prisma.v1Game.findUnique).not.toHaveBeenCalled();
  });

  it('게임이 아직 없는 대진도 같은 404 코드로 끊는다', async () => {
    const { service } = makeService({ teamMatch: { game: null } });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURE_GAME_NOT_FOUND' } });
  });

  it('두 참가팀의 활성 멤버가 아니면 403 이고 참가자 목록은 조회하지 않는다', async () => {
    const { service, prisma } = makeService({
      teamMatch: { game: { id: 'game-1', version: 4 } },
      memberships: [],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.v1GameParticipant.findMany).not.toHaveBeenCalled();
  });

  it('참가팀 멤버에게는 미연결 참가자만 게임 버전과 함께 돌려준다', async () => {
    const { service } = makeService({
      teamMatch: { game: { id: 'game-1', version: 4 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      participants: [
        { id: 'p-1', sideId: 's-1', displayNameSnapshot: '김민준', jerseyNumber: 7 },
        { id: 'p-2', sideId: 's-1', displayNameSnapshot: '이서준', jerseyNumber: null },
      ],
      linked: [{ participantId: 'p-2' }],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).resolves.toEqual({
      gameId: 'game-1',
      // requestIdentityLink 의 expectedVersion 으로 그대로 되돌아가는 값이다.
      version: 4,
      participants: [
        { participantId: 'p-1', sideId: 's-1', displayName: '김민준', jerseyNumber: 7 },
      ],
    });
  });
});
