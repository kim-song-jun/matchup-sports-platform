import { randomUUID } from 'node:crypto';
import { Prisma, V1GameResultRevisionState } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { resolveResultStage } from '../../league-matches/league-result-stage';

export const LEAGUE_RESULT_ENTRY_REMINDER_TYPE = 'LEAGUE_RESULT_ENTRY_REMINDER';

/** 사용자 확정(2026-08-24): 경기 시작 +24시간, 1회. */
const REMINDER_DELAY_MS = 24 * 60 * 60 * 1_000;

type LockedFixture = {
  teamMatchId: string;
  status: string;
  startAt: Date;
  leagueId: string | null;
  currentOfficialRevisionId: string | null;
  latestRevisionState: string | null;
};

/**
 * 대진 생성(generateFixtures/regenerateFixtures)과 시작 시각 변경(updateFixture) 때
 * 호출한다. 세대(startAt) 를 business key 에 접어 넣는 스케줄 패턴은
 * team-schedules.service.ts 의 triggerReminder()(RSVP 마감 리마인더 — 자세한 이유는
 * 그쪽 P1-2 fix 주석 참고)를 그대로 따른다: 시작 시각이 바뀌면 새 세대의 행을 하나 더
 * 예약할 뿐, 기존 행을 지우거나 UPDATE 하지 않는다. 옛 세대 행은 발화 시점에
 * `expectedStartAt` 이 현재 값과 달라 스스로 no-op 한다(핸들러 참고) — 그래서 대진을
 * 여러 번 고쳐도 중복 알림도, 유령 행 정리도 필요 없다.
 */
export async function scheduleLeagueResultEntryReminder(
  tx: Prisma.TransactionClient,
  input: { teamMatchId: string; startAt: Date },
): Promise<void> {
  const generation = input.startAt.toISOString();
  const businessKey = `league-result-entry-reminder:${input.teamMatchId}:${generation}`;
  const availableAt = new Date(input.startAt.getTime() + REMINDER_DELAY_MS);
  const payload = JSON.stringify({ teamMatchId: input.teamMatchId, expectedStartAt: generation });
  await tx.$executeRaw`
    INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
    VALUES (${randomUUID()}, ${businessKey}, 'TEAM_MATCH', ${input.teamMatchId}, ${LEAGUE_RESULT_ENTRY_REMINDER_TYPE}, ${payload}::jsonb, ${availableAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (business_key) DO NOTHING
  `;
}

/**
 * 리그 대진의 경기 시작 24시간 후에도 결과가 미입력(not_entered)이면 운영자(active
 * admin 전원, support 제외)에게 1회 알림 — 딥링크는 해당 리그 어드민 대진 표.
 *
 * 이미 존재하는 대진(이 기능 이전에 생성된 것)은 스케줄이 없다 — 백필은 범위 밖.
 */
export class LeagueResultEntryReminderService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    const { teamMatchId, expectedStartAt } = this.payload(claim.payload);
    const fixture = await this.lockFixture(tx, teamMatchId);
    if (fixture === null) return;
    // 방어적: 이 잡은 리그 대진에만 스케줄된다(generateFixtures/regenerateFixtures/
    // updateFixture 세 호출부 전부 league fixture 컨텍스트에서만 부른다).
    if (fixture.leagueId === null) return;
    // 더 새 세대(다른 시작 시각)로 다시 스케줄된 대진이면 이 발화는 무시한다 — 새
    // 세대의 행이 새 시각에 맞춰 따로 판정한다.
    if (fixture.startAt.toISOString() !== expectedStartAt) return;
    if (fixture.status === 'cancelled') return;

    const stage = resolveResultStage({
      currentOfficialRevisionId: fixture.currentOfficialRevisionId,
      resultRevisions:
        fixture.latestRevisionState === null
          ? []
          : [{ state: fixture.latestRevisionState as V1GameResultRevisionState }],
    });
    if (stage !== 'not_entered') return;

    const admins = await this.activeOpsAdmins(tx);
    if (admins.length === 0) return;
    const deepLink = `/admin/league-matches/${fixture.leagueId}`;
    for (const admin of admins) {
      const businessKey = `league-result-entry-reminder:${teamMatchId}:recipient:${admin.userId}`;
      await tx.$executeRaw`
        INSERT INTO v1_notifications (id, business_key, recipient_user_id, target_type, target_id, title, body, deep_link, created_at, updated_at)
        VALUES (
          ${randomUUID()}, ${businessKey}, ${admin.userId}, 'team_match'::"V1NotificationTargetType", ${fixture.leagueId},
          '리그 경기 결과가 아직 입력되지 않았어요', '경기 시작 24시간이 지났는데 결과가 입력되지 않았어요.', ${deepLink},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (business_key) DO NOTHING
      `;
    }
  };

  private payload(payload: unknown): { teamMatchId: string; expectedStartAt: string } {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('teamMatchId' in payload) ||
      typeof (payload as { teamMatchId?: unknown }).teamMatchId !== 'string' ||
      (payload as { teamMatchId: string }).teamMatchId.trim().length === 0 ||
      !('expectedStartAt' in payload) ||
      typeof (payload as { expectedStartAt?: unknown }).expectedStartAt !== 'string' ||
      (payload as { expectedStartAt: string }).expectedStartAt.trim().length === 0
    ) {
      throw new Error('LEAGUE_RESULT_ENTRY_REMINDER payload requires teamMatchId and expectedStartAt');
    }
    return payload as { teamMatchId: string; expectedStartAt: string };
  }

  private async lockFixture(tx: Prisma.TransactionClient, teamMatchId: string): Promise<LockedFixture | null> {
    const rows = await tx.$queryRaw<LockedFixture[]>`
      SELECT
        team_match.id AS "teamMatchId",
        team_match.status::text AS status,
        team_match.start_at AS "startAt",
        team_match.league_id AS "leagueId",
        game.current_official_revision_id AS "currentOfficialRevisionId",
        latest_revision.state::text AS "latestRevisionState"
      FROM v1_team_matches team_match
      LEFT JOIN v1_games game ON game.team_match_id = team_match.id
      LEFT JOIN LATERAL (
        SELECT state FROM v1_game_result_revisions
        WHERE game_id = game.id
        ORDER BY revision DESC LIMIT 1
      ) latest_revision ON true
      WHERE team_match.id = ${teamMatchId}
      FOR UPDATE OF team_match
    `;
    return rows[0] ?? null;
  }

  private async activeOpsAdmins(tx: Prisma.TransactionClient): Promise<Array<{ userId: string }>> {
    return tx.$queryRaw<Array<{ userId: string }>>`
      SELECT admin_user.user_id AS "userId"
      FROM v1_admin_users admin_user
      INNER JOIN v1_users user_account ON user_account.id = admin_user.user_id
      WHERE admin_user.admin_role IN ('owner', 'ops') AND admin_user.status = 'active'
        AND admin_user.revoked_at IS NULL AND user_account.account_status = 'active'
    `;
  }
}
