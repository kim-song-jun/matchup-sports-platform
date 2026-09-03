import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { LEAGUE_RESULT_AUTO_APPROVE_SYSTEM_ACTOR_ID } from '../../league-matches/league-result-auto-approve.constants';

type SubmittedRevisionRow = {
  revisionId: string;
  gameId: string;
  state: string;
  leagueId: string | null;
  teamMatchStatus: string | null;
};

/**
 * D2 (E2, 2026-08-24 사용자 확정): 리그 팀매치 결과가 SUBMITTED 상태로 24시간 동안
 * 상대팀의 응답(승인/정정요청) 없이 머물면 시스템이 자동으로 승인해 OFFICIAL 로
 * 만든다. `GameResultSubmittedEscalationService.scheduleDueDeliveries`의 리그
 * 분기가 예약하는 `GAME_RESULT_LEAGUE_AUTO_APPROVE` 아웃박스 이벤트를 처리한다.
 *
 * **멱등 계약**: 이미 사람이 승인(approve)했든 정정요청(change_request)했든,
 * `revision.state`는 더 이상 `SUBMITTED`가 아니므로 아래 가드가 조용히 아무것도
 * 하지 않는다. `syncAssistsIntoSubmittedRevision`(ASSIST_SYNC)이 이 리비전을
 * superseded 시킨 경우도 같은 이유로 걸러야 한다 -- `state`가 SUBMITTED로 남는
 * 그 알려진 갭을 `game-result-submitted-escalation.service.ts`의 이웃 핸들러들과
 * 정확히 같은 predicate(`supersedes_id`로 역참조)로 재확인한다(파일마다 독립적으로
 * 중복하는 이유는 그 파일의 `guardSuperseded` 문서 참고 -- 다른 서비스, 다른
 * 레인이라는 같은 근거).
 *
 * **OFFICIAL 전이 자체는 `GamesService.decideResultRevision`을 호출하지 않는다** --
 * 그 메서드는 `resolveActor`로 인간 액터(팀 오너/매니저 또는 admin)를 요구하는데,
 * 워커에는 HTTP 인증 컨텍스트가 없다. 대신 같은 전이(state -> OFFICIAL,
 * `V1GameResultDecision` 행 기록, `game.currentOfficialRevisionId` 갱신,
 * `GAME_RESULT_OFFICIAL` 아웃박스 발행)를 raw SQL로 직접 수행한다 --
 * `GAME_RESULT_OFFICIAL`은 이미 `GameResultOfficialProjectionService`에 등록돼
 * 있으므로(표준 승인·정정 양쪽이 재사용) 새 프로젝션 핸들러가 필요 없다.
 *
 * **시스템 액터 함정 회피**: `V1GameResultDecision.actorUserId`는 NOT NULL이고
 * `@@unique([revisionId, actorUserId, decision])`가 걸려 있다. actorUserId를
 * nullable로 바꾸면 NULL <> NULL이라 그 유니크가 무력화된다 -- 대신 NULL을
 * 도입하지 않고 고정 시스템 액터 문자열을
 * `LEAGUE_RESULT_AUTO_APPROVE_SYSTEM_ACTOR_ID`로 채운다(이 컬럼은 애초에 FK가
 * 없다 -- 자세한 근거는 그 상수의 doc comment 참고). `ON CONFLICT ... DO NOTHING`과
 * 결합하면 (revisionId, 이 상수, 'approve') 조합이 그대로 두 번째 방어선이 된다
 * (첫 번째 방어선은 위 state 가드 + `FOR UPDATE` 잠금).
 */
export class GameResultLeagueAutoApproveService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.leagueId === null) return;
    // 대진이 취소됐으면 그대로 no-op -- 형제 잡(league-result-entry-reminder.service.ts:61)과
    // 운영자 결과입력 경로(league-match-result-entry.service.ts:138-142)가 이미 갖고 있는
    // "취소 대진에 결과를 확정하지 않는다" 방어를 이 워커에도 동일하게 적용한다. 대진 취소
    // 진입점(cancelFixture/regenerateFixtures/removeTeam)은 결과 상태와 무관하게 SUBMITTED
    // 리비전을 그대로 둔 채 team_match.status만 'cancelled'로 바꾸므로, 이 가드가 없으면
    // 취소된 경기가 24시간 뒤 그대로 OFFICIAL로 확정된다.
    if (revision.teamMatchStatus === 'cancelled') return;
    if (await this.isSuperseded(tx, revision.revisionId)) return;
    await this.approve(tx, revision);
  };

  private revisionId(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('revisionId' in payload) ||
      typeof payload.revisionId !== 'string' ||
      payload.revisionId.trim().length === 0
    ) {
      throw new Error('GAME_RESULT_LEAGUE_AUTO_APPROVE payload requires a non-empty revisionId');
    }
    return payload.revisionId.trim();
  }

  private async lockRevision(tx: Prisma.TransactionClient, revisionId: string): Promise<SubmittedRevisionRow> {
    const rows = await tx.$queryRaw<SubmittedRevisionRow[]>`
      SELECT
        revision.id AS "revisionId", revision.game_id AS "gameId", revision.state::text AS state,
        team_match.league_id AS "leagueId", team_match.status::text AS "teamMatchStatus"
      FROM v1_game_result_revisions revision
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision
    `;
    const revision = rows[0];
    if (revision === undefined) {
      throw new Error(`GAME_RESULT_LEAGUE_AUTO_APPROVE revision ${revisionId} was not found`);
    }
    return revision;
  }

  /** `game-result-submitted-escalation.service.ts`의 `isRevisionSuperseded`와 동일한 predicate. */
  private async isSuperseded(tx: Prisma.TransactionClient, revisionId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_game_result_revisions WHERE supersedes_id = ${revisionId} LIMIT 1
    `;
    return rows.length > 0;
  }

  private async approve(tx: Prisma.TransactionClient, revision: SubmittedRevisionRow): Promise<void> {
    const updatedRevision = await tx.$queryRaw<Array<{ revision: number }>>`
      UPDATE v1_game_result_revisions
      SET state = 'OFFICIAL'::"V1GameResultRevisionState",
          official_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${revision.revisionId}
      RETURNING revision
    `;
    const revisionNumber = updatedRevision[0]?.revision;
    if (revisionNumber === undefined) {
      throw new Error(`GAME_RESULT_LEAGUE_AUTO_APPROVE revision ${revision.revisionId} vanished during update`);
    }
    await tx.$executeRaw`
      INSERT INTO v1_game_result_decisions (id, revision_id, decision, reason, actor_type, actor_user_id, created_at)
      VALUES (
        ${randomUUID()}, ${revision.revisionId}, 'approve',
        '상대팀이 24시간 동안 응답하지 않아 자동으로 승인됐어요.',
        'SYSTEM'::"V1IdentityActorType", ${LEAGUE_RESULT_AUTO_APPROVE_SYSTEM_ACTOR_ID}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (revision_id, actor_user_id, decision) DO NOTHING
    `;
    await tx.$executeRaw`
      UPDATE v1_games
      SET current_official_revision_id = ${revision.revisionId},
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${revision.gameId}
    `;
    // 표준 승인(decideResultRevision)·정정(officializeTeamMatchResultCorrection)이
    // 이미 쓰는 것과 똑같은 이벤트 타입 -- GameResultOfficialProjectionService가
    // 순위표·팀 전적·리그 자동완료·알림을 전부 이 한 이벤트로 투영한다.
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, revision_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
      VALUES (
        ${randomUUID()}, ${`game:${revision.gameId}:revision:${revisionNumber}:auto_approve`},
        'GAME', ${revision.gameId}, ${revision.revisionId}, 'GAME_RESULT_OFFICIAL',
        ${JSON.stringify({ revisionId: revision.revisionId })}::jsonb,
        CURRENT_TIMESTAMP, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (business_key) DO NOTHING
    `;
  }
}
