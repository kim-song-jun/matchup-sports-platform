import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 리그 대진에 **공식 확정된 결과 하나**를 만든다 (테스트 픽스처 전용).
 *
 * Task 165 BE-3 이 리그 전용 결과 입력 **엔드포인트**를 지웠다(콘솔이 대신한다). 그런데
 * 이의·자격 스펙들은 그 엔드포인트로 "확정된 결과가 있는 상태" 를 만들고 있었다 —
 * 검증 대상이 아니라 **전제**였다.
 *
 * 콘솔 HTTP 경로로 세우려면 스태프 권한·`expectedVersion`·`eventsHash`·`baseRevisionId` 를
 * 조립해야 하는데, 그 스펙들이 검증하는 것은 **이의 흐름**이지 결과를 만드는 경로가 아니다.
 * 그래서 지워진 서비스가 내부에서 밟던 3단계(create → submit → decide(approve))를 그대로
 * 밟는다 — `league-match-forfeit.service.ts` 가 프로덕션에서 쓰는 것과 같은 순서다.
 *
 * **두 스펙이 각자 이 절차를 인라인으로 적으면 한쪽만 바뀌었을 때 조용히 어긋난다.**
 */
export async function seedOfficialLeagueResult(
  deps: { prisma: PrismaService; games: GamesService },
  input: { teamMatchId: string; adminUserId: string; homeScore: number; awayScore: number; reason: string },
): Promise<{ gameId: string; revisionId: string }> {
  const actor: V1AuthUser = {
    id: input.adminUserId,
    email: null,
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const game = await deps.prisma.v1Game.findFirstOrThrow({ where: { teamMatchId: input.teamMatchId } });
  const prefix = `seed-official-${randomUUID()}`;

  const created = await deps.games.createResultRevision(actor, game.id, `${prefix}:create`, {
    expectedVersion: game.version,
    clientCommandId: `${prefix}:create`,
    score: { home: input.homeScore, away: input.awayScore },
    actualParticipants: [],
    eventsHash: canonicalGameCommandPayloadHash([]),
    reason: input.reason,
  });
  const submitted = await deps.games.submitResultRevision(
    actor,
    game.id,
    created.revisionId,
    `${prefix}:submit`,
    { expectedVersion: created.version, clientCommandId: `${prefix}:submit` },
  );
  await deps.games.decideResultRevision(actor, game.id, created.revisionId, `${prefix}:decide`, {
    expectedVersion: submitted.version,
    clientCommandId: `${prefix}:decide`,
    decision: 'approve',
    reason: input.reason,
  });

  return { gameId: game.id, revisionId: created.revisionId };
}
