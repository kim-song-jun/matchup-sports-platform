import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow } from '../game-operations/game-result-official-projection.types';
import { shouldCompleteLeague } from './league-lifecycle-rules';
import { STATUS_BY_LEAGUE_STATE } from '../tournaments/league-competition-mirror';
import { LEAGUE_STATE_BY_STATUS } from '../tournaments/league-competition-mirror';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

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

    await this.settle(tx, leagueId, 'all_fixtures_confirmed');
  }

  /**
   * "취소되지 않은 모든 대진이 공식 결과를 확보했는가"를 판정해 `active -> completed`로
   * 전이한다. 조건을 만족하지 않으면 아무것도 하지 않는다(멱등).
   *
   * `project()` 말고 **대진 취소·무효 경로에서도** 불러야 한다. 결과 확정만 훅으로 잡으면
   * 마지막 미확정 대진을 "취소"로 끝낸 리그가 D-3의 완료 조건을 충족하면서도 영원히
   * `active`로 남는다(alpha 실측으로 재현됨). 취소는 남은 대진 집합을 줄이는 조작이라
   * 결과 확정과 정확히 같은 판정을 다시 돌려야 한다.
   */
  async settle(
    tx: Prisma.TransactionClient,
    leagueId: string,
    reason: 'all_fixtures_confirmed' | 'remaining_fixture_cancelled' | 'remaining_fixture_voided',
  ): Promise<boolean> {
    // BE-5: 조기 반환 판정을 통합 축에서 읽는다(쓰기는 아래 dual-write 그대로).
    const league = await findTournamentOnSurface(tx, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: { status: true },
    });
    // active 가 아니면 여기서 끝낸다. shouldCompleteLeague 도 같은 판정을 하지만, 그건
    // 아래 findMany 를 이미 돌린 뒤다 -- 이 조기 반환이 없으면 completed/draft 리그마다
    // 대진 전수 스캔이 헛돈다(결과 확정마다 호출되는 경로라 그냥 낭비가 아니다).
    // 멱등성·동시성 보장은 맨 아래 조건부 updateMany(WHERE state='active')가 담당하므로
    // 이 조회 자체엔 락이 필요 없다.
    if (league === null || LEAGUE_STATE_BY_STATUS[league.status] !== 'active') return false;

    // status까지 읽어 판정은 shouldCompleteLeague에 맡긴다 -- 취소 제외/빈 리그 배제
    // 규칙이 서비스 안에 인라인으로 있으면 그 규칙만 검증하는 테스트를 로컬에서 돌릴 수
    // 없다(이 파일은 @prisma/client를 import 한다). league-lifecycle-rules.ts 참고.
    const fixtures = await tx.v1TeamMatch.findMany({
      where: { leagueId },
      select: {
        status: true,
        game: {
          select: {
            // 감사 L-E finding 5 수정: 예전 계산은 "currentOfficialRevisionId == null"을
            // "무효"의 신호로 삼았는데, voidTeamMatchResult(games.service.ts)는 포인터를
            // null로 풀지 않고 VOID 리비전 자신으로 옮긴다 -- 그래서 hasOfficialResult와
            // isVoided가 서로 배타적인 이 계산식에서 isVoided는 프로덕션에서 절대 true가
            // 될 수 없었다(항상 hasOfficialResult=true로 잘못 잡혀 "이 대진은 결과가
            // 확정됐다"로 세어짐). 포인터가 실제로 가리키는 리비전의 state를 직접 읽으면
            // 두 값이 항상 정확히 하나만 참이 된다 -- 재입력으로 새 OFFICIAL 리비전이
            // 생기면 포인터가 그쪽으로 옮겨가므로 isVoided는 자연히 다시 false가 된다.
            currentOfficialRevision: { select: { state: true } },
          },
        },
      },
    });
    const ready = shouldCompleteLeague({
      state: LEAGUE_STATE_BY_STATUS[league.status],
      fixtures: fixtures.map((fixture) => ({
        status: fixture.status,
        hasOfficialResult: fixture.game?.currentOfficialRevision?.state === 'OFFICIAL',
        isVoided: fixture.game?.currentOfficialRevision?.state === 'VOID',
      })),
    });
    if (!ready) return false;

    // 동시성: 두 대진의 결과가 거의 동시에 OFFICIAL이 되면 두 트랜잭션 모두 이 지점까지
    // 도달할 수 있다. WHERE state = 'active' 조건부 UPDATE가 행 잠금을 통해 오직 먼저
    // 커밋하는 쪽만 실제로 completed로 전이시키고, 늦게 도착한 트랜잭션은 이미 state가
    // completed로 바뀐 걸 보고 0행 매치라 조용히 no-op한다 -- teams.service.ts
    // acceptInvitation()의 "조건부 update" 선례(R15-002)와 동일한 패턴이라 별도
    // SELECT ... FOR UPDATE가 필요 없다.
    // BE-5 drop: 조건부 update 를 통합 축에 직접 건다. 위 동시성 설계는 그대로다 —
    // `where` 에 현재 상태를 걸어 **먼저 커밋하는 쪽만** 1행을 잡고, 늦게 온 트랜잭션은
    // 0행이라 조용히 no-op 한다. (`kind` 가드로 같은 id 의 진짜 대회를 제외한다.)
    const result = await tx.v1Tournament.updateMany({
      where: { id: leagueId, kind: 'regular_league', status: STATUS_BY_LEAGUE_STATE.active },
      data: { status: STATUS_BY_LEAGUE_STATE.completed },
    });
    if (result.count === 0) return false;

    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'league_match',
        targetId: leagueId,
        fromStatus: 'active',
        toStatus: 'completed',
        actorType: 'system',
        reason,
      },
    });
    return true;
  }
}
