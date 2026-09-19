import { Logger } from '@nestjs/common';
import { Prisma, V1TournamentStatus } from '@prisma/client';
import { evaluateRosterCandidate, normalizeGender } from '../tournaments/tournament-players.service';
import { isPhoneVerificationEnforced } from '../verification/phone-verification-access';
import { findTournamentOnSurfaceOrThrow } from '../tournaments/tournament-surface-lookup';

const logger = new Logger('LeagueRosterAutofill');

export interface LeagueRosterFillOutcome {
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
 * **명단 미제출 confirmed 등록**(`V1TournamentPlayer` 행이 아예 없는 등록)의 명단을 팀
 * 멤버십에서 채운다.
 *
 * `jobs/league-roster/league-roster-autoconfirm.service.ts`(D10 — 시즌 시작 시각 크론)에서
 * 옮겨왔다. 원래는 그 크론만 이 로직을 불렀는데, **대진 생성이 그 시각보다 먼저 일어나면**
 * (시즌 시작 전에 전체 일정을 미리 짜 두는 것은 흔한, 정상적인 운영 순서다)
 * `league-fixture-creation.ts`의 `leagueTeamRosterEntries()`가 명단이 비어 있다고 보고
 * `team.memberships`(계정 없는 스냅샷)로 폴백한다. 되돌리는 동기화
 * (`league-roster-sync.ts`의 `syncLeagueRosterLineups`)는 "아직 시작 안 한 경기"에만
 * 적용되므로, 그 경기가 크론이 돌기 전에 이미 진행·종료되면 영영 못 고친다(실사용자
 * 발견 버그, 2026-09-19 QA #9).
 *
 * 그래서 대진 생성 경로(`league-fixture-creation.ts`의 `loadLeagueTeamRosters`)도 크론을
 * 기다리지 않고 **이 함수를 직접, 즉시** 호출한다 — 자격 검증은 화면·크론과 완전히
 * 같은 함수(`evaluateRosterCandidate`)를 그대로 쓰므로 두 호출부가 서로 다른 사람을
 * 명단에 올리는 일은 없다.
 *
 * ## 호출부 계약 — "행이 **아예** 없는" 등록만 넘겨야 한다
 * "선수가 0명" 을 활성 선수(`removedAt: null`) 기준으로 재지 않는다 — 그러면 **한 번
 * 올렸다가 팀장이 전원 뺀 팀**과 "애초에 명단을 낸 적이 없는 팀" 이 똑같이 보인다. 앞쪽은
 * 운영자가 손대서 비운 것이지 미제출이 아니다(2026-09-03 정책 확정: 자동 채움 대상에서
 * 제외). 그래서 호출부가 "이 등록에 `V1TournamentPlayer` 행이 하나라도 있었던 적이
 * 있는가"(크론의 `players: { none: {} }`, `loadLeagueTeamRosters` 의
 * `_count.players === 0`) 를 직접 판정하고, **행이 정말 하나도 없을 때만** 이 함수를
 * 불러야 한다. 이 함수 자신은 그 판정을 다시 하지 않는다.
 *
 * ## "멤버 전원" 이 아니라 "자격 통과 멤버 전원" 이다
 * 명단 추가에는 실명·생년월일·휴대폰(+성별부·전화인증·정원) 가드가 걸려 있다. 통과자가
 * **0명이면 명단을 만들지 않는다** — 빈 명단을 만들면 대진은 생기는데 뛸 사람이 없는
 * 상태가 되고, 운영자는 그 사실을 알 방법이 없다.
 *
 * ## 왜 `create` 를 멤버마다 부르지 않는가
 * `(registrationId, userId)` 유니크 제약은 `removedAt` 과 무관하게 전역이다. 위 호출부
 * 계약을 지켜도, **크론과 이 함수가 같은 등록을 동시에 채우려는 경쟁**은 여전히 남는다
 * (실사용자 발견: 마지막 선수를 빼는 트랜잭션 안에서 명단 동기화가 같은 유저를 다시
 * 채우려다 유니크 위반 → 트랜잭션 전체가 롤백돼 **선수 삭제 자체가 취소됐다**). 아래에서
 * 자격 통과자를 모았다가 `createMany({ skipDuplicates: true })` 로 한 번에 넣으면, 이미
 * 있는 행(어느 경로가 먼저 만들었든)은 예외 없이 조용히 건너뛰고 실제로 새로 들어간
 * 수만 돌려준다 — Postgres 의 `ON CONFLICT DO NOTHING` 이라 동시 트랜잭션에서도 안전하다.
 */
export async function fillLeagueTeamRoster(
  tx: Prisma.TransactionClient,
  leagueId: string,
  registration: { id: string; teamId: string },
): Promise<LeagueRosterFillOutcome> {
  // 원시 `v1Tournament` 조회 금지(v1-surface-check) — 이 함수는 **정규 리그만** 다루므로
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
  // 넣지 않는다. 한 번에 읽고 Set 으로 판정한다(멤버마다 쿼리하면 팀 인원수만큼 왕복한다).
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

  // 끝난 리그는 명단을 만들지 않는다 — 예약(또는 대진 생성)과 실행 사이에 리그가
  // 완료·취소될 수 있고, 그때 선수 row 를 새로 세우면 끝난 대회의 기록이 바뀐다.
  //
  // **`isRosterMutableTournamentStatus` 를 그대로 쓰지 않는다.** 그 집합은
  // `open`·`closed`·`in_progress` 인데, 리그 거울은 `draft` 로 생성되고 대진 생성은 참가
  // 신청을 연 적 없는 리그에서도 일어난다 — 그 집합을 그대로 쓰면 이 함수가 가장 흔한
  // 경로에서 아무 일도 하지 않는다. 여기서 막아야 하는 것은 "아직 안 열린" 이 아니라
  // "이미 끝난" 이다.
  const tournamentMutable =
    tournament.status !== V1TournamentStatus.completed &&
    tournament.status !== V1TournamentStatus.cancelled;
  if (!tournamentMutable) {
    logger.warn(
      `league-roster-autofill: 리그 ${leagueId} 상태 ${tournament.status} — 등록 ${registration.id} 건너뜀`,
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
  const candidates: Array<{
    userId: string;
    realName: string;
    birthDateSnapshot: string;
    genderSnapshot: string | null;
  }> = [];
  for (const member of members) {
    const block = evaluateRosterCandidate({
      alreadyOnRoster: false,
      alreadyOnOtherTeamInTournament: takenUserIds.has(member.userId),
      tournamentMutable,
      registrationMutable: true,
      rosterCount: candidates.length,
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
    candidates.push({
      userId: member.userId,
      realName: member.user.profile!.realName!.trim(),
      birthDateSnapshot: member.user.profile!.birthDate!.trim(),
      genderSnapshot: normalizeGender(member.user.profile?.gender),
    });
  }

  // 위 클래스 doc 참고 — 멤버마다 `create` 하지 않고 한 번에 `skipDuplicates` 로 넣는다.
  // `added` 는 이 호출에서 **실제로 새로 들어간 행 수**다(경쟁으로 일부가 조용히
  // 건너뛰어졌다면 `candidates.length` 보다 작을 수 있다 — 그 경우 `skipped` 에는 안
  // 잡힌다. 자격 미달이 아니라 이미 있어서 넘어간 것이라 사유가 다르고, 극히 드문
  // 경쟁 상황이라 팀장 알림 문구 한 줄을 더 늘릴 만큼의 가치가 없다고 판단했다).
  let added = 0;
  if (candidates.length > 0) {
    const result = await tx.v1TournamentPlayer.createMany({
      data: candidates.map((candidate) => ({
        registrationId: registration.id,
        userId: candidate.userId,
        realName: candidate.realName,
        birthDateSnapshot: candidate.birthDateSnapshot,
        genderSnapshot: candidate.genderSnapshot,
        // 자동 채움도 사람이 올린 것과 같은 심사 대기 상태로 들어간다 — 이 경로가 만들었다는
        // 이유로 자격을 통과시키면 어드민 심사가 그만큼 비어 버린다.
        eligibilityStatus: 'needs_review' as const,
      })),
      skipDuplicates: true,
    });
    added = result.count;
  }

  if (added > 0) {
    // `roster_auto_confirmed_at` 은 raw SQL 로 쓴다 — 이 컬럼은 생성된 Prisma 클라이언트가
    // 모노레포 전체에서 공유되어 이 세션에서 재생성할 수 없다(CI 가 생성한다). 값 자체는
    // 단순한 타임스탬프라 raw 로 충분하다.
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

/**
 * 방금 채운 결과를 팀장·매니저에게 알린다. D10 크론
 * (`jobs/league-roster/league-roster-autoconfirm.service.ts`)의 `notify()` 였던 것을
 * 여기로 옮겼다 — 대진 생성 경로(`league-fixture-creation.ts`)도 이제 같은 함수로 채우니,
 * 알림도 같은 함수를 써야 **어느 경로로 채워졌든 팀장이 같은 문구를 받는다.**
 * `businessKey` 가 중복도 막는다: 크론과 대진 생성이 같은 등록·같은 유저를 각자 알리려
 * 해도 실제로는 1건만 나간다.
 */
export async function notifyLeagueRosterFillOutcomes(
  tx: Prisma.TransactionClient,
  league: { id: string; title: string },
  outcomes: readonly LeagueRosterFillOutcome[],
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
    const reasonSummary = summarizeSkipReasons(outcome.skipped);
    const body =
      outcome.added > 0
        ? `"${league.title}" 명단이 자동으로 확정됐어요. 팀원 ${total}명 중 ${outcome.added}명이 등록됐어요.${reasonSummary}`
        : `"${league.title}" 명단을 자동으로 확정하지 못했어요. 등록 가능한 팀원이 없어요.${reasonSummary}`;
    for (const userId of ownersByTeam.get(outcome.teamId) ?? []) {
      // `V1Notification` 에는 type 컬럼이 없다 — 문구는 여기서 만들어 넣는다
      // (`team-match-completion-notification.service.ts` 와 같은 방식).
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

/** 제외 사유를 사람이 읽는 한 문장으로. 개인 식별자는 담지 않는다(팀장에게 가는 알림이다). */
function summarizeSkipReasons(skipped: ReadonlyArray<{ reason: string }>): string {
  if (skipped.length === 0) return '';
  const counts = new Map<string, number>();
  for (const row of skipped) counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(([reason, count]) => `${reason} ${count}명`);
  return ` 제외: ${parts.join(', ')}.`;
}
