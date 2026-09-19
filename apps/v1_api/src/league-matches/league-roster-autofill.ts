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
 * **명단 미제출 confirmed 등록**(`V1TournamentPlayer` 행이 0개)의 명단을 팀 멤버십에서
 * 채운다.
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
 * ## "멤버 전원" 이 아니라 "자격 통과 멤버 전원" 이다
 * 명단 추가에는 실명·생년월일·휴대폰(+성별부·전화인증·정원) 가드가 걸려 있다. 통과자가
 * **0명이면 명단을 만들지 않는다** — 빈 명단을 만들면 대진은 생기는데 뛸 사람이 없는
 * 상태가 되고, 운영자는 그 사실을 알 방법이 없다.
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
  let added = 0;
  for (const member of members) {
    const block = evaluateRosterCandidate({
      alreadyOnRoster: false,
      alreadyOnOtherTeamInTournament: takenUserIds.has(member.userId),
      tournamentMutable,
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
        // 자동 채움도 사람이 올린 것과 같은 심사 대기 상태로 들어간다 — 이 경로가 만들었다는
        // 이유로 자격을 통과시키면 어드민 심사가 그만큼 비어 버린다.
        eligibilityStatus: 'needs_review',
      },
    });
    added += 1;
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
