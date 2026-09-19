import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { syncLeagueRosterLineups } from '../../league-matches/league-roster-sync';
import {
  fillLeagueTeamRoster,
  notifyLeagueRosterFillOutcomes,
  type LeagueRosterFillOutcome,
} from '../../league-matches/league-roster-autofill';
import { findTournamentOnSurface } from '../../tournaments/tournament-surface-lookup';

export const LEAGUE_ROSTER_REMINDER_TYPE = 'LEAGUE_ROSTER_REMINDER';
export const LEAGUE_ROSTER_AUTOCONFIRM_TYPE = 'LEAGUE_ROSTER_AUTOCONFIRM';

/** D10: 시즌 시작 24시간 전 1회. */
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1_000;

/**
 * D10 자동 확정을 **끄고 배포한다**(기본값이 꺼짐).
 *
 * 이 잡은 켜지는 순간 alpha·프로덕션 데이터에 **자동으로 쓰기**를 시작한다(명단 행 생성).
 * 그래서 다른 플래그들과 방향이 반대다: 없으면 켜지는 게 아니라 **없으면 꺼진다.**
 * 켜려면 `DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON=false` 를 명시적으로 넣어야 하고,
 * 그 env 변경 자체가 사용자 승인 대상이다.
 */
/**
 * 자동 확정·리마인더가 **같이 쓰는** 대상 조건. 위 doc 주석 참조 — `status: 'confirmed'`
 * 와 `players: { none: {} }` 둘 다 좁히는 쪽이 계약이고, 두 잡이 갈라지면 알림과 실제
 * 동작이 어긋난다.
 */
const PENDING_ROSTER_REGISTRATION_WHERE = (leagueId: string) =>
  ({ tournamentId: leagueId, status: 'confirmed', players: { none: {} } }) satisfies Prisma.V1TournamentRegistrationWhereInput;

export function isLeagueRosterAutoConfirmEnabled(): boolean {
  return process.env.DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON === 'false';
}

/**
 * 리그 생성·시작일 변경 때 호출한다. **v1 스택에는 cron 데코레이터가 없다** — 주기 작업은
 * 아웃박스에 미래 시각(`available_at`)으로 예약하고 워커가 그때 꺼내 실행한다
 * (`league-result-entry-reminder.service.ts` 선례). `DISABLE_MARKETPLACE_CRON` 류는
 * 구 스택(`apps/api`)의 것이고 이 앱엔 없다.
 *
 * 세대(시작 시각)를 business key 에 접어 넣는 것도 그 선례를 그대로 따른다: 시작일이
 * 바뀌면 새 세대 행을 하나 더 예약할 뿐 기존 행을 지우거나 UPDATE 하지 않는다. 옛 세대
 * 행은 발화 시점에 `expectedStartsOn` 이 현재 값과 달라 스스로 no-op 한다.
 *
 * `ON CONFLICT DO NOTHING` 이 **멱등의 1차 방어**다 — 같은 시즌에 두 번 예약해도 행은 하나다.
 */
/**
 * **정규 리그 생성의 단일 진입점.** 거울(`v1Tournament`) 행을 만들면서 로스터 자동 확정을
 * 같은 트랜잭션에서 예약한다.
 *
 * 왜 여기인가: 리그를 만드는 경로가 셋(운영자 단건 생성 · 시즌 시드 · 다음 시즌 승계)인데
 * **셋 다 반드시 이 거울 생성을 지난다** — 안 지나면 read-swap 뒤 화면에서 리그가 사라지기
 * 때문이다. 예약을 각 호출부에 흩어 두면 새 경로가 생길 때마다 빠뜨린다(실제로 시즌 쪽 두
 * 곳이 빠져 있었다). 164 BE-5 가 `v1League` 를 걷어내면서 이 생성이 곧 리그 생성 자체가
 * 되므로, 그때도 이 자리는 그대로 단일 진입점으로 남는다.
 */
export async function createLeagueMirrorWithRosterSchedule(
  tx: Prisma.TransactionClient,
  data: Prisma.V1TournamentUncheckedCreateInput,
  schedule: { leagueId: string; startsOn: Date },
): Promise<void> {
  await tx.v1Tournament.create({ data });
  await scheduleLeagueRosterAutoConfirm(tx, schedule);
}

export async function scheduleLeagueRosterAutoConfirm(
  tx: Prisma.TransactionClient,
  input: { leagueId: string; startsOn: Date },
): Promise<void> {
  const generation = input.startsOn.toISOString();
  const payload = JSON.stringify({ leagueId: input.leagueId, expectedStartsOn: generation });
  const reminderAt = new Date(input.startsOn.getTime() - REMINDER_LEAD_MS);
  // **이미 지난 리마인더는 예약하지 않는다.** 시작이 24시간 안 남은 리그를 만들거나
  // 승계하면 `reminderAt` 이 과거가 되고, 아웃박스는 `available_at <= now` 를 곧바로 집어
  // 워커가 도는 즉시 발송한다 — 그러면 "시작까지 24시간 남았어요" 라는 문구가 **거짓**이
  // 된다(몇 분 뒤 시작하는 리그에 그렇게 알린다). 자동 확정 예약은 그대로 두므로 명단이
  // 비어 있으면 시작 시각에 채워지는 동작은 달라지지 않는다 — 사라지는 것은 사전 예고뿐,
  // 그리고 그건 애초에 줄 수 없었던 예고다.
  const rows: Array<{ type: string; businessKey: string; availableAt: Date }> = [
    ...(reminderAt.getTime() <= Date.now()
      ? []
      : [
          {
            type: LEAGUE_ROSTER_REMINDER_TYPE,
            businessKey: `league-roster-reminder:${input.leagueId}:${generation}`,
            availableAt: reminderAt,
          },
        ]),
    {
      type: LEAGUE_ROSTER_AUTOCONFIRM_TYPE,
      businessKey: `league-roster-autoconfirm:${input.leagueId}:${generation}`,
      availableAt: input.startsOn,
    },
  ];
  for (const row of rows) {
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
      VALUES (${randomUUID()}, ${row.businessKey}, 'TOURNAMENT', ${input.leagueId}, ${row.type}, ${payload}::jsonb, ${row.availableAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
    `;
  }
}

/**
 * D10 — 시즌 시작 시각에 **명단 미제출 팀**의 명단을 자동으로 채운다.
 *
 * ## 무엇을 만드나
 * 대회 참가 자격 명단(`V1TournamentPlayer`)이다. Task 163 이 다루는 **경기별 출석 명단**
 * (`V1GameLineup`/`V1GameParticipant`, 등번호가 붙는 그것)과 다른 층이다 — 이 잡이 만드는
 * 것은 "이 팀에서 이 리그를 뛸 수 있는 사람들" 이고, 경기별 명단은 그 안에서 다시 고른다.
 *
 * 실제 채우는 로직(`fillLeagueTeamRoster`)과 알림(`notifyLeagueRosterFillOutcomes`)은
 * `league-roster-autofill.ts`로 옮겨 `league-fixture-creation.ts`(대진 생성 경로)와
 * 공유한다 — #9 수정, 2026-09-19 QA 참고.
 */
export class LeagueRosterAutoConfirmService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    if (!isLeagueRosterAutoConfirmEnabled()) return;
    const { leagueId, expectedStartsOn } = this.payload(claim.payload);

    // BE-5: 리그의 정본은 통합 축이다. `startsOn` 은 거울이 `scheduledAt` 에 담는다.
    const league = await findTournamentOnSurface(tx, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: { id: true, title: true, scheduledAt: true },
    });
    if (league === null || league.scheduledAt === null) return;
    // 더 새 세대(시작일 변경)로 다시 예약됐으면 이 발화는 무시한다.
    if (league.scheduledAt.toISOString() !== expectedStartsOn) return;

    // 대진이 이미 있는 리그도 채운다 — 채운 명단은 시작 전 경기 명단에 곧바로 맞춰진다(Task 170 D1′).
    const outcomes: LeagueRosterFillOutcome[] = [];
    for (const registration of await this.pendingRegistrations(tx, leagueId)) {
      const outcome = await fillLeagueTeamRoster(tx, leagueId, registration);
      if (outcome.kind === 'filled') {
        await syncLeagueRosterLineups(tx, { leagueId, teamId: registration.teamId });
      }
      outcomes.push(outcome);
    }
    if (outcomes.length === 0) return;
    await notifyLeagueRosterFillOutcomes(tx, league, outcomes);
  };

  /**
   * **선수 row 가 아예 없는 confirmed 등록만.** 두 군데를 좁혔다:
   *
   * ① `status` — `notIn: ['cancelled','cancel_requested']` 는 `draft`·`submitted`·
   *    `awaiting_payment` 처럼 **아직 참가가 확정되지도 않은** 등록까지 끌어와, 결제도 안
   *    끝난 팀의 명단을 자동으로 채워 버렸다. 정본의 "미제출" 은 참가가 확정된 팀에만
   *    해당한다.
   * ② `players` — `none: { removedAt: null }` 은 "살아 있는 선수가 없다" 라서 **한 번
   *    올렸다가 전원 뺀 팀**도 포함했다. 그건 운영자가 손대서 비운 명단이지 미제출이
   *    아니다(2026-09-03 정책 확정: 대상 제외). `none: {}` 로 "선수 row 자체가 없다" 만
   *    남긴다.
   */
  private async pendingRegistrations(tx: Prisma.TransactionClient, leagueId: string) {
    const rows = await tx.v1TournamentRegistration.findMany({
      where: PENDING_ROSTER_REGISTRATION_WHERE(leagueId),
      select: { id: true, teamId: true },
    });
    return rows;
  }

  private payload(raw: unknown): { leagueId: string; expectedStartsOn: string } {
    const value = raw as { leagueId?: unknown; expectedStartsOn?: unknown } | null;
    if (typeof value?.leagueId !== 'string' || typeof value?.expectedStartsOn !== 'string') {
      throw new Error('LEAGUE_ROSTER_AUTOCONFIRM payload is malformed');
    }
    return { leagueId: value.leagueId, expectedStartsOn: value.expectedStartsOn };
  }
}

/**
 * D10 사전 리마인더 — 시즌 시작 **24시간 전**, 명단이 아직 비어 있는 팀의 팀장에게 1회.
 *
 * 자동 확정과 **같은 플래그**로 꺼진다: 리마인더만 나가고 확정이 안 되면 "곧 자동으로
 * 채워진다" 고 알려 놓고 아무 일도 안 일어나는 상태가 된다.
 */
export class LeagueRosterReminderService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    if (!isLeagueRosterAutoConfirmEnabled()) return;
    const value = claim.payload as { leagueId?: unknown; expectedStartsOn?: unknown } | null;
    if (typeof value?.leagueId !== 'string' || typeof value?.expectedStartsOn !== 'string') {
      throw new Error('LEAGUE_ROSTER_REMINDER payload is malformed');
    }
    const leagueId = value.leagueId;

    const league = await findTournamentOnSurface(tx, ['regular_league'], {
      where: { id: leagueId, deletedAt: null },
      select: { id: true, title: true, scheduledAt: true },
    });
    if (league === null || league.scheduledAt === null) return;
    if (league.scheduledAt.toISOString() !== value.expectedStartsOn) return;

    // 자동 확정과 **같은 조건**이어야 한다 — 리마인더가 더 넓으면 하루 뒤 아무 일도
    // 일어나지 않을 팀에게 "곧 자동으로 채워져요" 라고 알리게 된다.
    const pending = await tx.v1TournamentRegistration.findMany({
      where: PENDING_ROSTER_REGISTRATION_WHERE(leagueId),
      select: { id: true, teamId: true },
    });
    if (pending.length === 0) return;

    const owners = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: pending.map((row) => row.teamId) }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { teamId: true, userId: true },
    });
    const byTeam = new Map<string, string[]>();
    for (const row of owners) byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row.userId]);

    for (const registration of pending) {
      await tx.v1Notification.createMany({
        data: (byTeam.get(registration.teamId) ?? []).map((userId) => ({
          recipientUserId: userId,
          targetType: 'tournament' as const,
          targetId: league.id,
          title: '리그 명단을 제출해 주세요',
          body: `"${league.title}" 시작까지 24시간 남았어요. 명단을 제출하지 않으면 등록 가능한 팀원으로 자동 확정돼요.`,
          deepLink: `/leagues/${league.id}`,
          businessKey: `league-roster-reminder:${registration.id}:${userId}`,
        })),
        skipDuplicates: true,
      });
    }
  };
}
