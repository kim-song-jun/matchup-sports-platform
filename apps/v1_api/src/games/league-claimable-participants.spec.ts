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
 * 4. **사이드별 최신 라인업 리비전만 노출한다**(2026-08-27 감사 결함 수정) — 라인업을
 *    재저장하면 옛 리비전 참가자 행이 삭제되지 않고 그대로 남는데, 예전 코드는 gameId 로만
 *    걸러 그 폐기된 리비전의 동명이인까지 목록에 얹었다. 그 행에 연결하면 공식 결과가
 *    최신 participantId 로만 쓰여 개인 기록이 영원히 안 뜬다 — 최신 리비전만 남기는
 *    selectLineupParticipantsWithDraftFallback 스코프를 여기서도 고정한다.
 *
 * 대회 판(listClaimableParticipants)과 공통 본문을 공유하므로, 3·4번은 공통 헬퍼의
 * 회귀 방지도 겸한다.
 */
describe('GamesService.listLeagueClaimableParticipants', () => {
  const user = { id: 'user-1', accountStatus: 'active' } as V1AuthUser;

  function makeService(overrides: {
    teamMatch?: unknown;
    memberships?: unknown[];
    lineups?: unknown[];
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
      v1GameLineup: {
        findMany: jest.fn().mockResolvedValue(overrides.lineups ?? []),
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
      // state 는 selectLineupParticipantsWithDraftFallback 의 필수 입력 — 제출된 리비전만
      // "최신"을 다툰다(DRAFT 는 후보에서 빠진다).
      lineups: [{ id: 'lineup-1', sideId: 's-1', revision: 1, state: 'SUBMITTED' }],
      participants: [
        { id: 'p-1', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '김민준', jerseyNumber: 7 },
        { id: 'p-2', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '이서준', jerseyNumber: null },
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

  it('라인업을 재저장해 폐기된 리비전의 동명이인은 목록에서 빠진다', async () => {
    // 리그 대진 참가자 생성 → 매니저가 라인업을 한 번 재저장 → revision 1(폐기)과
    // revision 2(현재)에 각각 등번호 7번 '김민준' 행이 생긴 상태를 재현한다.
    // v1GameParticipant.delete 경로가 없어 revision 1 행은 그대로 남는다
    // (team-match-lineup.service.ts saveLineup).
    const { service } = makeService({
      teamMatch: { game: { id: 'game-1', version: 6 } },
      memberships: [{ teamId: 'team-host', role: 'member' }],
      lineups: [
        { id: 'lineup-1', sideId: 's-1', revision: 1, state: 'SUBMITTED' },
        { id: 'lineup-2', sideId: 's-1', revision: 2, state: 'SUBMITTED' },
      ],
      participants: [
        { id: 'p-stale', sideId: 's-1', lineupId: 'lineup-1', displayNameSnapshot: '김민준', jerseyNumber: 7 },
        { id: 'p-current', sideId: 's-1', lineupId: 'lineup-2', displayNameSnapshot: '김민준', jerseyNumber: 7 },
      ],
      linked: [],
    });

    await expect(
      service.listLeagueClaimableParticipants(user, 'league-1', 'tm-1'),
    ).resolves.toEqual({
      gameId: 'game-1',
      version: 6,
      // 폐기된 revision 1의 'p-stale'은 나오지 않는다 — 골랐다면 공식 결과가 절대
      // 매칭되지 않는 participantId였다.
      participants: [
        { participantId: 'p-current', sideId: 's-1', displayName: '김민준', jerseyNumber: 7 },
      ],
    });
  });
});
