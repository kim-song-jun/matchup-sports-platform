/**
 * 경기 상세로 가는 링크. **대회와 정규 리그는 라우트가 다르다.**
 *
 * - 대회: `/tournaments/:tournamentId/matches/:fixtureId` — `fixtureId` 는 `V1TournamentFixture.id`
 * - 정규 리그: `/league-matches/:leagueId/fixtures/:teamMatchId` — 리그 경기는 `V1TeamMatch` 다
 *
 * 두 축이 **같은 일정 응답 모양**을 쓰기 때문에 이 갈림이 필요하다. 서버는 리그 대진을
 * 대회 일정 행으로 변환해 내려주는데(`toLeagueScheduleRow`), 그 행의 `fixtureId` 에는
 * **팀 매치 id** 가 들어 있다. 그래서 대회 패턴으로 링크하면
 * `GET /tournaments/:id/matches/:fixtureId` 가 **두 겹으로 404** 가 난다 — 그 조회가
 * `TOURNAMENT_KINDS` 로 리그를 배제하고, 통과하더라도 리그 거울에는
 * `V1TournamentFixture` 가 **0행**이다.
 *
 * **판정은 `kind === 'regular_league'` 여야 한다.** `isLeagueCompetition` 을 쓰면 안 된다 —
 * 그 헬퍼는 `format === 'league'` 인 **리그 방식 대회**도 true 로 주는데, 그건 진짜 대회라
 * 대회 축 대진을 갖고 있고 기존 링크가 정상 동작한다. 그것까지 리그 라우트로 보내면
 * 멀쩡하던 화면이 깨진다.
 */
export function fixtureDetailHref(input: {
  /** `V1Tournament.kind === 'regular_league'` 인가. `format` 으로 판정하지 않는다. */
  readonly isRegularLeague: boolean;
  /** 대회 id 또는 리그 id. */
  readonly competitionId: string;
  /** 대회면 `V1TournamentFixture.id`, 리그면 `V1TeamMatch.id`. */
  readonly fixtureId: string;
}): string {
  const competition = encodeURIComponent(input.competitionId);
  const fixture = encodeURIComponent(input.fixtureId);
  return input.isRegularLeague
    ? `/league-matches/${competition}/fixtures/${fixture}`
    : `/tournaments/${competition}/matches/${fixture}`;
}
