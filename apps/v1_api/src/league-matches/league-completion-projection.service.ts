import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow } from '../game-operations/game-result-official-projection.types';

/**
 * `GameResultOfficialProjectionService.handler`가 여는 같은 트랜잭션(tx) 위에서
 * 실행되는 리그(V1League) 전용 후처리(R6, D-3).
 *
 * team-match(리그 대진)가 공식 결과(현재 리비전)를 얻을 때마다 호출되어, 그 리그의
 * 취소되지 않은 모든 대진이 공식 결과를 확보했는지 확인하고, 확보했다면
 * `V1League.state`를 `active -> completed`로 자동 전이한다. team-match가 아닌
 * 게임(토너먼트 픽스처)이거나 leagueId가 없는 일반 팀매치에는 완전히 no-op이다.
 *
 * 이 클래스는 리그 도메인(`league-matches/`) 소유다 — 여러 도메인이 공유하는
 * `game-result-official-projection.service.ts` 쪽 변경은 이 클래스를 인스턴스화해
 * `project()`를 한 번 호출하는 두 줄로 최소화했다. `GameResultBracketProjectionService`/
 * `GameResultStandingsProjectionService`와 같은 "handler가 도메인별 프로젝터를
 * 조립한다" 기존 패턴을 그대로 따른 것이다.
 */
export class LeagueCompletionProjectionService {
  async project(tx: Prisma.TransactionClient, revision: OfficialRevisionRow): Promise<void> {
    if (revision.sourceType !== 'TEAM_MATCH') return;

    const game = await tx.v1Game.findUnique({
      where: { id: revision.gameId },
      select: { teamMatchId: true, teamMatch: { select: { leagueId: true } } },
    });
    if (game === null || game.teamMatchId === null) return;
    const leagueId = game.teamMatch?.leagueId ?? null;
    if (leagueId === null) return;

    // 조회만으로 이미 completed/draft(대진 없음)인 리그를 조기에 걸러 아래 대진 전수
    // 스캔 비용을 아낀다 -- 실제 멱등성·동시성 보장은 맨 아래 조건부 updateMany(WHERE
    // state='active')가 담당하므로 이 조회 자체엔 락이 필요 없다(동시 트랜잭션 둘 다
    // 이 지점까지 도달해도 안전하다 -- 아래 주석 참고).
    const league = await tx.v1League.findUnique({ where: { id: leagueId }, select: { state: true } });
    if (league === null || league.state !== 'active') return;

    // 취소된 대진은 R8과 동일한 기준으로 완전히 제외한다 -- 결과가 영원히 안 생길
    // 대진(취소됨)까지 "전부 확정"의 조건에 넣으면 취소된 대진이 하나라도 남은 리그는
    // 절대 자동 완료되지 않는다.
    const fixtures = await tx.v1TeamMatch.findMany({
      where: { leagueId, status: { not: 'cancelled' } },
      select: { game: { select: { currentOfficialRevisionId: true } } },
    });
    // 대진이 하나도 없거나(생성 전) 전부 취소된 리그는 "모두 확정"의 의미가 없어
    // 자동 완료 대상에서 제외한다 -- 이 시점은 방금 대진 하나가 확정되어 호출된
    // 경로라 실제로 비는 경우는 없지만, 방어적으로 남겨둔다.
    if (fixtures.length === 0) return;
    const allConfirmed = fixtures.every((fixture) => fixture.game?.currentOfficialRevisionId != null);
    if (!allConfirmed) return;

    // 동시성: 두 대진의 결과가 거의 동시에 OFFICIAL이 되면 두 트랜잭션 모두 이 지점까지
    // 도달할 수 있다. WHERE state = 'active' 조건부 UPDATE가 행 잠금을 통해 오직 먼저
    // 커밋하는 쪽만 실제로 completed로 전이시키고, 늦게 도착한 트랜잭션은 이미 state가
    // completed로 바뀐 걸 보고 0행 매치라 조용히 no-op한다 -- teams.service.ts
    // acceptInvitation()의 "조건부 update" 선례(R15-002)와 동일한 패턴이라 별도
    // SELECT ... FOR UPDATE가 필요 없다.
    const result = await tx.v1League.updateMany({
      where: { id: leagueId, state: 'active' },
      data: { state: 'completed' },
    });
    if (result.count === 0) return;

    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'league_match',
        targetId: leagueId,
        fromStatus: 'active',
        toStatus: 'completed',
        actorType: 'system',
        reason: 'all_fixtures_confirmed',
      },
    });
  }
}
