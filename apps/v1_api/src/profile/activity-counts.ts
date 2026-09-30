import type { PrismaService } from '../prisma/prisma.service';

/**
 * 활동 집계의 "이번 달" — UTC 달의 [시작, 다음 달 시작). 마이 활동 요약·공개 프로필·홈 통계가 같은
 * 경계를 써야 두 화면의 "이번 달 경기"가 갈리지 않는다(Task 180 F85).
 */
export interface ActivityMonth {
  readonly monthStart: Date;
  readonly nextMonthStart: Date;
}

export function activityMonth(now: Date): ActivityMonth {
  return {
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    nextMonthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/** 이번 달에 **끝난** 개인 매치 참가 수. 신청만 했거나 취소·삭제된 매치는 세지 않는다. */
export function countMonthlyPersonalMatches(
  prisma: PrismaService,
  userId: string,
  { monthStart, nextMonthStart }: ActivityMonth,
): Promise<number> {
  return prisma.v1MatchParticipant.count({
    where: {
      userId,
      status: 'completed',
      match: { status: 'completed', deletedAt: null, startAt: { gte: monthStart, lt: nextMonthStart } },
    },
  });
}

/**
 * "이번 달 경기" — 마이 `GET /me/activity-summary` 의 `monthly.matchCount` 와 홈 `summary.monthlyMatches`
 * 가 같은 값이다: 끝난 개인 매치 참가 + 공식 경기(대회·리그·팀매치) 출전.
 */
export async function countMonthlyGames(prisma: PrismaService, userId: string, now: Date): Promise<number> {
  const month = activityMonth(now);
  const [personal, official] = await Promise.all([
    countMonthlyPersonalMatches(prisma, userId, month),
    countOfficialGameAppearances(prisma, userId, month),
  ]);
  return personal + official.monthly;
}

/**
 * 사용자에 연결된(`V1ParticipantIdentityLinkCurrent`) participant 들의 공식 경기 출전 수를
 * 누적/이번 달로 센다. `GET /users/:id/records`(public-user-records.service.ts)와 같은
 * "현재 공식 리비전만"(`resultRevision.game.currentOfficialRevisionId === resultRevision.id`
 * && `officialAt !== null`) 규칙을 쓴다 — 정정/무효 처리된 경기가 이중 계산되지 않게.
 *
 * 동의(consent) 게이트는 일부러 적용하지 않는다(사용자 결정) — 여기서 새는 건 "몇 번 뛰었는지"
 * 라는 집계 숫자뿐이고, 참가자 실명·경기 상세는 노출하지 않는다. 소속 팀도 팀 상세 페이지에서
 * 이미 공개 정보다. `GET /users/:id/records`의 개별 이벤트/실명 노출과는 노출 수준이 다르므로
 * 같은 게이트를 여기 적용할 이유가 없다 — 나중에 "왜 여기만 게이트가 없나"를 묻게 될 것이므로
 * 남긴다.
 *
 * 같은 경기가 여러 participant 행으로 잡혀도(예: 대회 도중 로스터가 갱신된 경우) gameId 기준
 * Set으로 중복 제거한다.
 *
 * 공식 경기 출전 수(경기 단위)와 참가한 **대회 수**(distinct tournament)를 한 번에 센다.
 *
 * 두 값을 굳이 한 쿼리로 묶은 이유: 프로필 GET 한 번에 두 번 왕복하지 않기 위해서다.
 * 그리고 여기서 세는 것은 **개수뿐**이라 `PublicUserRecordsService.loadEligibleRows()`
 * 같은 전체 기록 행(골·카드·MVP·상대팀…)을 끌어오지 않는다 -- 출전이 많은 사용자의
 * 프로필 조회마다 목록 전체를 메모리에 올리는 비용을 피한다.
 */
export async function countOfficialGameAppearances(
  prisma: PrismaService,
  userId: string,
  { monthStart, nextMonthStart }: ActivityMonth,
): Promise<{ total: number; monthly: number; tournamentTotal: number; tournamentMonthly: number }> {
  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { userId },
    select: { participantId: true },
  });
  if (links.length === 0) return { total: 0, monthly: 0, tournamentTotal: 0, tournamentMonthly: 0 };
  const participantIds = links.map((link) => link.participantId);

  const rows = await prisma.v1GameResultParticipant.findMany({
    // sourceType·officialAt 은 DB 에서 먼저 거른다 -- 링크가 많은 사용자일수록 아래
    // 루프까지 끌고 올 행이 불필요하게 커진다. "현재 공식 리비전인가"(컬럼 대 컬럼
    // 비교)만 where 로 표현할 수 없어 루프에 남는다. 이번 달 범위는 여기서 거르면
    // 안 된다 -- monthly 는 total 의 부분집합이라 같은 쿼리로 둘 다 세야 한다.
    where: {
      participantId: { in: participantIds },
      resultRevision: {
        officialAt: { not: null },
        // 공개 개인 기록과 같은 공식 게임 모집단. 팀매치를 빼면 개인 기록에는 3경기가
        // 보이는데 마이페이지 활동은 0회가 되어 같은 사용자의 두 화면이 모순된다.
        game: { sourceType: 'TEAM_MATCH' },
      },
    },
    select: {
      resultRevision: {
        select: {
          id: true,
          gameId: true,
          officialAt: true,
          game: {
            select: {
              currentOfficialRevisionId: true,
              sourceType: true,
              teamMatch: {
                select: {
                  id: true,
                  leagueId: true,
                  tournamentId: true,
                  tournament: { select: { kind: true } },
                  tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const totalGameIds = new Set<string>();
  const monthlyGameIds = new Set<string>();
  const totalTournamentIds = new Set<string>();
  const monthlyTournamentIds = new Set<string>();
  for (const row of rows) {
    const revision = row.resultRevision;
    // sourceType과 officialAt은 위 where가 이미 걸렀다 -- 여기서는
    // where 로 표현할 수 없는 "현재 공식 리비전인가"(컬럼 대 컬럼 비교)만 본다.
    // officialAt 은 스키마상 nullable 이라 아래 비교를 위해 타입만 좁힌다.
    if (revision.game.sourceType !== 'TEAM_MATCH') continue;
    const isCurrent = revision.game.currentOfficialRevisionId === revision.id;
    if (!isCurrent || revision.officialAt === null) continue;

    const isThisMonth = revision.officialAt >= monthStart && revision.officialAt < nextMonthStart;
    totalGameIds.add(revision.gameId);
    if (isThisMonth) monthlyGameIds.add(revision.gameId);

    const canonicalTeamMatch = revision.game.teamMatch;
    const canonicalTournamentId = revision.game.sourceType === 'TEAM_MATCH'
      && canonicalTeamMatch !== null
      && canonicalTeamMatch.leagueId === null
      && (canonicalTeamMatch.tournament?.kind === null || canonicalTeamMatch.tournament?.kind === 'regular_tournament')
      && canonicalTeamMatch.tournamentDetails !== null
      && canonicalTeamMatch.tournamentDetails.teamMatchId === canonicalTeamMatch.id
      && canonicalTeamMatch.tournamentDetails.tournamentId === canonicalTeamMatch.tournamentId
      ? canonicalTeamMatch.tournamentDetails.tournamentId
      : null;
    if (canonicalTournamentId !== null) {
      totalTournamentIds.add(canonicalTournamentId);
      if (isThisMonth) monthlyTournamentIds.add(canonicalTournamentId);
    }
  }

  return {
    total: totalGameIds.size,
    monthly: monthlyGameIds.size,
    tournamentTotal: totalTournamentIds.size,
    tournamentMonthly: monthlyTournamentIds.size,
  };
}
