/**
 * 리그 순위 계산의 **입력을 만드는 한 곳**.
 *
 * ## 왜 뽑아냈나
 * 통합 화면(read-swap)에서 `tournaments-read.service.getOverallStandings()` 가 거울 행
 * (`kind = 'regular_league'`)을 받으면 **대회 축 계산으로는 빈 순위표가 나온다** — 거울에는
 * 조도 대진도 없기 때문이다. 리그 축에서 같은 값을 만들어야 하는데, 그 계산을
 * `LeagueMatchPublicService.standings()` 안에 두면 **두 벌이 된다.**
 *
 * 서비스를 주입받는 길은 막혀 있다: `LeagueMatchModule` 은 `exports` 가 없고,
 * `league-matches` 가 `tournaments` 를 7파일에서 참조해 **모듈을 import 하면 순환**이다.
 * 그래서 **Nest 모듈이 아니라 파일 단위**로 나눈다 — `tournaments/league-fixture-generator`
 * 가 이미 `../league-matches/round-robin-schedule` 을 그렇게 쓰고 있는 선례가 있다.
 *
 * ## ⚠️ 이 파일이 지켜야 하는 것 — VOID 를 통과시키지 않는다
 * 무효(VOID) 처리된 대진은 **취소와 마찬가지로 "더 이상 결과를 기다리지 않는" 상태**다.
 * `currentOfficialRevision.state` 를 직접 읽지 않으면 fact 가 없다는 이유로 `pending` 에
 * 섞이고, 그러면
 * - 진행률의 `remaining` 이 부풀어 **화면에 "진행률 60%" 같은 틀린 숫자**가 뜨고,
 * - 승강 확정 게이트("모든 대진이 확정됐는가")가 **영구히 막힌다.**
 *
 * fact 유무만으로는 *"아직 결과가 없어 미확정"* 과 *"결과가 있었지만 무효 처리됨"* 을
 * 구분할 수 없다 — 둘 다 fact 가 없다. **포인터가 가리키는 리비전의 state 를 읽어야 한다.**
 */

/**
 * `v1TeamMatch` 조회 결과가 이 모듈에 들어올 때의 **최소 모양**.
 *
 * **이 파일은 조회를 하지 않는다** — Prisma 를 모르고, 분류만 한다. 조회는 호출부의 몫이고
 * (`LeagueMatchPublicService.standings()` · `TournamentsReadService`), 그래서 두 호출부가
 * 서로 다른 select 를 쓰더라도 이 타입만 만족하면 같은 분류를 얻는다. **그 경계가 이 모듈이
 * 존재하는 이유다.**
 *
 * ⚠️ `game.currentOfficialRevision.state` 를 select 에서 빠뜨리면 무효(VOID)가 미확정으로
 * 섞인다 — 타입이 `null` 을 허용하므로 **컴파일은 통과한다.** 호출부가 지켜야 할 계약이다.
 */
export type LeagueTeamMatchRow = {
  id: string;
  hostTeamId: string;
  approvedApplicantTeamId: string | null;
  startAt: Date;
  status: string;
  game: {
    id: string;
    currentOfficialRevisionId: string | null;
    currentOfficialRevision: { state: string } | null;
  } | null;
};

export type LeagueFixtureBuckets = {
  confirmed: Array<{ homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }>;
  pending: Array<{ teamMatchId: string; homeTeamId: string; awayTeamId: string | null; startAt: Date }>;
  /** 취소된 대진 수. 집계에서 빠지므로 "팀마다 치른 경기 수가 다른" 이유를 화면이 설명할 수 있다. */
  cancelledCount: number;
  /** 무효(VOID) 처리된 대진 수. **confirmed·pending 어느 쪽에도 안 들어간다.** */
  voidedCount: number;
};

/**
 * 대진을 confirmed / pending / cancelled / voided 로 가른다. **순수 함수** — 조회는 호출부가 한다.
 *
 * 분류 규칙(순서가 의미를 갖는다):
 * 1. `status === 'cancelled'` → 취소. **fact 가 있어도 confirmed 로 세지 않는다** — 오심·오입력
 *    정정으로 취소한 경기가 순위표에 그대로 남으면 "정정이 반영되지 않는다" 로 읽힌다(R8).
 * 2. `currentOfficialRevision.state === 'VOID'` → 무효. 위 주석 참조.
 * 3. fact 가 없거나 상대 팀이 없다 → pending.
 * 4. 나머지 → confirmed.
 */
export function bucketLeagueFixtures(
  teamMatches: readonly LeagueTeamMatchRow[],
  factByGameId: ReadonlyMap<string, { homeScore: number; awayScore: number }>,
): LeagueFixtureBuckets {
  const confirmed: LeagueFixtureBuckets['confirmed'] = [];
  const pending: LeagueFixtureBuckets['pending'] = [];
  let cancelledCount = 0;
  let voidedCount = 0;

  for (const teamMatch of teamMatches) {
    if (teamMatch.status === 'cancelled') {
      cancelledCount += 1;
      continue;
    }
    if (teamMatch.game?.currentOfficialRevision?.state === 'VOID') {
      voidedCount += 1;
      continue;
    }
    const fact = teamMatch.game === null ? undefined : factByGameId.get(teamMatch.game.id);
    if (fact === undefined || teamMatch.approvedApplicantTeamId === null) {
      pending.push({
        teamMatchId: teamMatch.id,
        homeTeamId: teamMatch.hostTeamId,
        awayTeamId: teamMatch.approvedApplicantTeamId,
        startAt: teamMatch.startAt,
      });
      continue;
    }
    confirmed.push({
      homeTeamId: teamMatch.hostTeamId,
      awayTeamId: teamMatch.approvedApplicantTeamId,
      homeScore: fact.homeScore,
      awayScore: fact.awayScore,
    });
  }

  return { confirmed, pending, cancelledCount, voidedCount };
}

/**
 * 진행률 계산용 입력. **취소·무효는 분모에서도 빠진다** — 앞으로도 치러지지 않을 경기를
 * "남은 경기" 로 세면 진행률이 영원히 100% 에 못 닿는다.
 *
 * `played + remaining === total` 이 항상 성립하고, 그 total 은 **치를 수 있는 경기 수**다.
 */
export function leagueFixtureProgressInput(
  buckets: LeagueFixtureBuckets,
): ReadonlyArray<{ hasResult: boolean }> {
  return [
    ...buckets.confirmed.map(() => ({ hasResult: true })),
    ...buckets.pending.map(() => ({ hasResult: false })),
  ];
}
