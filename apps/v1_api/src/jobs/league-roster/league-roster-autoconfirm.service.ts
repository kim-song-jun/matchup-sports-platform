import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Prisma, V1TournamentStatus } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import {
  evaluateRosterCandidate,
  normalizeGender,
} from '../../tournaments/tournament-players.service';
import { isPhoneVerificationEnforced } from '../../verification/phone-verification-access';
import { findTournamentOnSurfaceOrThrow } from '../../tournaments/tournament-surface-lookup';

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
 * 곳이 빠져 있었다). 164 BE-5 가 `v1League` 를 걷어내면 이 거울 생성이 곧 리그 생성 자체가
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

interface AutoConfirmOutcome {
  /**
   * 이 팀에 무슨 일이 있었나. **`skipped` 배열로 대신 표현하지 않는다** — 예전에는
   * "대회가 끝나서 아무것도 안 했다" 를 `skipped: [{ userId: '-' }]` 센티널로 담았는데,
   * 알림이 그걸 **"팀원 1명이 제외됐다"** 로 집계해 팀장에게 거짓 문구를 보냈다.
   * 사람이 제외된 것과 팀 전체가 대상이 아닌 것은 다른 사건이라 종류로 가른다.
   */
  readonly kind: 'filled' | 'skipped_terminal' | 'no_eligible';
  readonly registrationId: string;
  readonly teamId: string;
  readonly added: number;
  readonly skipped: ReadonlyArray<{ readonly userId: string; readonly reason: string }>;
}

/**
 * D10 — 시즌 시작 시각에 **명단 미제출 팀**의 명단을 자동으로 채운다.
 *
 * ## 무엇을 만드나
 * 대회 참가 자격 명단(`V1TournamentPlayer`)이다. Task 163 이 다루는 **경기별 출석 명단**
 * (`V1GameLineup`/`V1GameParticipant`, 등번호가 붙는 그것)과 다른 층이다 — 이 잡이 만드는
 * 것은 "이 팀에서 이 리그를 뛸 수 있는 사람들" 이고, 경기별 명단은 그 안에서 다시 고른다.
 *
 * ## "멤버 전원" 이 아니라 "자격 통과 멤버 전원" 이다
 * 명단 추가에는 실명·생년월일·휴대폰(+성별부·전화인증·정원) 가드가 걸려 있고, 그건 사용자가
 * 없앤 적 없는 규칙이다. 크론이 그걸 우회하면 **실명 없는 선수·여성부의 남성**이 명단에
 * 올라간다. 그래서 화면·수동 추가와 **같은 함수**(`evaluateRosterCandidate`)로 거른다 —
 * 크론이 자체 판정을 만들면 화면이 "등록 불가" 라고 말한 사람을 크론이 올리게 된다.
 *
 * 통과자가 **0명이면 명단을 만들지 않는다.** 빈 명단을 만들면 대진은 생기는데 뛸 사람이
 * 없는 상태가 되고, 운영자는 그 사실을 알 방법이 없다.
 */
export class LeagueRosterAutoConfirmService {
  private readonly logger = new Logger(LeagueRosterAutoConfirmService.name);

  readonly handler: GameOperationHandler = async (claim, tx) => {
    if (!isLeagueRosterAutoConfirmEnabled()) return;
    const { leagueId, expectedStartsOn } = this.payload(claim.payload);

    const league = await tx.v1League.findUnique({
      where: { id: leagueId },
      select: { id: true, title: true, startsOn: true, state: true },
    });
    if (league === null) return;
    // 더 새 세대(시작일 변경)로 다시 예약됐으면 이 발화는 무시한다.
    if (league.startsOn.toISOString() !== expectedStartsOn) return;

    // 대진이 이미 생성된 리그는 건드리지 않는다 — 그 시점엔 신청이 닫혀 자동 확정 대상이
    // 없고, 명단을 뒤늦게 바꾸면 이미 만들어진 대진의 전제가 흔들린다.
    const fixtureCount = await tx.v1TeamMatch.count({ where: { leagueId, deletedAt: null } });
    if (fixtureCount > 0) return;

    const outcomes: AutoConfirmOutcome[] = [];
    for (const registration of await this.pendingRegistrations(tx, leagueId)) {
      outcomes.push(await this.fillRoster(tx, leagueId, registration));
    }
    if (outcomes.length === 0) return;
    await this.notify(tx, league, outcomes);
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

  private async fillRoster(
    tx: Prisma.TransactionClient,
    leagueId: string,
    registration: { id: string; teamId: string },
  ): Promise<AutoConfirmOutcome> {
    // 원시 `v1Tournament` 조회 금지(v1-surface-check) — 이 잡은 **정규 리그만** 다루므로
    // 표면 헬퍼가 그 종류 조건까지 함께 걸어 준다. 리그가 아닌 id 가 들어오면 여기서
    // TOURNAMENT_NOT_FOUND 로 끊긴다.
    const tournament = await findTournamentOnSurfaceOrThrow(tx, ['regular_league'], {
      where: { id: leagueId },
      select: { maxPlayers: true, genderCategory: true, status: true },
    });
    const members = await tx.v1TeamMembership.findMany({
      where: { teamId: registration.teamId, status: 'active' },
      // 정원을 넘으면 **가입 순 상위 N명** — 임의로 자르지 않는다.
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: {
        userId: true,
        user: {
          select: {
            phone: true,
            phoneVerifiedAt: true,
            profile: { select: { realName: true, birthDate: true, gender: true } },
          },
        },
      },
    });

    // 감사 finding #50 과 같은 규칙 — **같은 리그의 다른 팀 명단에 이미 있는 사람**은
    // 넣지 않는다. 수동 등록 경로(`tournament-players.service.ts`)가 지키는 불변식인데,
    // 자동 확정이 이걸 `false` 로 고정해 두면 양 팀에 동시 소속된 사용자가 **두 팀 공식
    // 명단에 함께** 올라간다 — 그것도 사람 손을 거치지 않고 조용히.
    //
    // 한 번에 읽고 Set 으로 판정한다(멤버마다 쿼리하면 팀 인원수만큼 왕복한다). 이 잡은
    // 리그의 미제출 팀들을 **순서대로** 처리하므로, 앞 팀에서 방금 넣은 사람도 이 집합에
    // 들어와야 한다 — 그래서 `fillRoster` 호출마다 다시 읽는다.
    const takenUserIds = new Set(
      (
        await tx.v1TournamentPlayer.findMany({
          where: {
            removedAt: null,
            registrationId: { not: registration.id },
            registration: { tournamentId: leagueId },
          },
          select: { userId: true },
        })
      ).flatMap((row) => (row.userId === null ? [] : [row.userId])),
    );

    // 끝난 리그는 명단을 만들지 않는다. 예약(생성 시점)과 실행(시즌 시작) 사이에 리그가
    // 완료·취소될 수 있고, 그때 선수 row 를 새로 세우면 끝난 대회의 기록이 바뀐다.
    //
    // **`isRosterMutableTournamentStatus` 를 그대로 쓰지 않는다.** 그 집합은
    // `open`·`closed`·`in_progress` 인데, 리그 거울은 `draft` 로 생성되고
    // (`STATUS_BY_LEAGUE_STATE[draft]`) 이 잡은 **대진 생성보다 먼저** 돈다 — 즉 참가 신청을
    // 연 적 없는 리그는 시작 시점에도 `draft` 다. 그 집합을 그대로 쓰면 D10 이 가장 흔한
    // 경로에서 아무 일도 하지 않는다. 여기서 막아야 하는 것은 "아직 안 열린" 이 아니라
    // "이미 끝난" 이다.
    const tournamentMutable =
      tournament.status !== V1TournamentStatus.completed &&
      tournament.status !== V1TournamentStatus.cancelled;
    if (!tournamentMutable) {
      // 알림을 보내지 않는다(아래 notify 가 이 kind 를 거른다). 팀장이 잘못한 것이 없고
      // 할 수 있는 일도 없다 — 사유는 로그에만 남긴다.
      this.logger.warn(
        `league-roster-autoconfirm: 리그 ${leagueId} 상태 ${tournament.status} — 등록 ${registration.id} 건너뜀`,
      );
      return {
        kind: 'skipped_terminal',
        registrationId: registration.id,
        teamId: registration.teamId,
        added: 0,
        skipped: [],
      };
    }

    const skipped: Array<{ userId: string; reason: string }> = [];
    let added = 0;
    for (const member of members) {
      const block = evaluateRosterCandidate({
        alreadyOnRoster: false,
        alreadyOnOtherTeamInTournament: takenUserIds.has(member.userId),
        // **`isRosterMutableTournamentStatus(...)` 로 바꾸지 마라.** 그 헬퍼는 `draft` 를
        // 가변으로 보지 않는데, 리그 거울은 draft 로 생성되고 이 잡은 대진 생성보다 먼저
        // 돈다 — 헬퍼로 "통일" 하면 신청을 연 적 없는 리그에서 D10 이 통째로 죽는다.
        // 계산 근거는 위 `tournamentMutable` 주석 참조(통합 스펙이 양방향으로 잡는다).
        tournamentMutable,
        // 대상 조회(`PENDING_ROSTER_REGISTRATION_WHERE`)가 `status: 'confirmed'` 로 이미
        // 좁혔으므로 여기 도달한 등록은 취소 계열이 아니다. 조건 목록을 한 곳에 모아 두기
        // 위해 그대로 넘긴다(수동 경로의 같은 자리와 같은 관례).
        registrationMutable: true,
        rosterCount: added,
        maxPlayers: tournament.maxPlayers,
        member: {
          realName: member.user.profile?.realName?.trim() ?? null,
          birthDate: member.user.profile?.birthDate?.trim() ?? null,
          phone: member.user.phone?.trim() ?? null,
          gender: normalizeGender(member.user.profile?.gender),
          phoneVerifiedAt: member.user.phoneVerifiedAt,
        },
        genderCategory: tournament.genderCategory,
        phoneEnforced: isPhoneVerificationEnforced(),
      });
      if (block !== null) {
        skipped.push({ userId: member.userId, reason: block.listReason });
        continue;
      }
      await tx.v1TournamentPlayer.create({
        data: {
          registrationId: registration.id,
          userId: member.userId,
          realName: member.user.profile!.realName!.trim(),
          birthDateSnapshot: member.user.profile!.birthDate!.trim(),
          genderSnapshot: normalizeGender(member.user.profile?.gender),
          // 자동 등록도 사람이 올린 것과 같은 심사 대기 상태로 들어간다 — 크론이 만들었다는
          // 이유로 자격을 통과시키면 어드민 심사가 그만큼 비어 버린다.
          eligibilityStatus: 'needs_review',
        },
      });
      added += 1;
    }

    if (added > 0) {
      // `roster_auto_confirmed_at` 은 raw SQL 로 쓴다 — 이 컬럼은 이번 마이그레이션에서
      // 추가됐고, 생성된 Prisma 클라이언트는 모노레포 전체가 공유해 이 세션에서 재생성할
      // 수 없다(CI 가 생성한다). 값 자체는 단순한 타임스탬프라 raw 로 충분하다.
      await tx.$executeRaw`
        UPDATE v1_tournament_registrations
        SET roster_auto_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${registration.id} AND roster_auto_confirmed_at IS NULL
      `;
    }
    return {
      kind: added > 0 ? 'filled' : 'no_eligible',
      registrationId: registration.id,
      teamId: registration.teamId,
      added,
      skipped,
    };
  }

  private async notify(
    tx: Prisma.TransactionClient,
    league: { id: string; title: string },
    outcomes: readonly AutoConfirmOutcome[],
  ): Promise<void> {
    // 대회가 끝나 아무것도 하지 않은 팀에는 알리지 않는다 — 팀장이 잘못한 것도, 할 수 있는
    // 일도 없다. (예전엔 이 케이스가 센티널로 섞여 들어와 "1명 제외" 로 잘못 통보됐다.)
    const notifiable = outcomes.filter((outcome) => outcome.kind !== 'skipped_terminal');
    if (notifiable.length === 0) return;

    const owners = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: notifiable.map((o) => o.teamId) }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { teamId: true, userId: true },
    });
    const ownersByTeam = new Map<string, string[]>();
    for (const row of owners) {
      ownersByTeam.set(row.teamId, [...(ownersByTeam.get(row.teamId) ?? []), row.userId]);
    }

    for (const outcome of notifiable) {
      const total = outcome.added + outcome.skipped.length;
      // 통보는 **성공만 말하지 않는다.** 제외된 사람이 있으면 몇 명이 왜 빠졌는지 함께
      // 준다 — 팀장이 "왜 우리 팀만 인원이 적지" 를 화면 어디에서도 알 수 없으면 안 된다.
      const reasonSummary = summarizeReasons(outcome.skipped);
      const body =
        outcome.added > 0
          ? `"${league.title}" 명단이 자동으로 확정됐어요. 팀원 ${total}명 중 ${outcome.added}명이 등록됐어요.${reasonSummary}`
          : `"${league.title}" 명단을 자동으로 확정하지 못했어요. 등록 가능한 팀원이 없어요.${reasonSummary}`;
      for (const userId of ownersByTeam.get(outcome.teamId) ?? []) {
        // `V1Notification` 에는 type 컬럼이 없다 — 문구는 여기서 만들어 넣는다
        // (`team-match-completion-notification.service.ts` 와 같은 방식).
        // businessKey 가 **재발송을 막는다**: 같은 시즌에 잡이 두 번 돌아도 알림은 1건이다.
        await tx.v1Notification.createMany({
          data: [
            {
              recipientUserId: userId,
              targetType: 'tournament' as const,
              targetId: league.id,
              title: outcome.added > 0 ? '리그 명단이 자동 확정됐어요' : '리그 명단을 자동 확정하지 못했어요',
              body,
              deepLink: `/leagues/${league.id}`,
              businessKey: `league-roster-autoconfirm:${outcome.registrationId}:${userId}`,
            },
          ],
          skipDuplicates: true,
        });
      }
    }
  }

  private payload(raw: unknown): { leagueId: string; expectedStartsOn: string } {
    const value = raw as { leagueId?: unknown; expectedStartsOn?: unknown } | null;
    if (typeof value?.leagueId !== 'string' || typeof value?.expectedStartsOn !== 'string') {
      throw new Error('LEAGUE_ROSTER_AUTOCONFIRM payload is malformed');
    }
    return { leagueId: value.leagueId, expectedStartsOn: value.expectedStartsOn };
  }
}

/** 제외 사유를 사람이 읽는 한 문장으로. 개인 식별자는 담지 않는다(팀장에게 가는 알림이다). */
function summarizeReasons(skipped: ReadonlyArray<{ reason: string }>): string {
  if (skipped.length === 0) return '';
  const counts = new Map<string, number>();
  for (const row of skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(([reason, count]) => `${reason} ${count}명`);
  return ` 제외: ${parts.join(', ')}.`;
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

    const league = await tx.v1League.findUnique({
      where: { id: leagueId },
      select: { id: true, title: true, startsOn: true },
    });
    if (league === null) return;
    if (league.startsOn.toISOString() !== value.expectedStartsOn) return;

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
