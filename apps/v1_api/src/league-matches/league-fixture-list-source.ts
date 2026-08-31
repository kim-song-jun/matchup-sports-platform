import { resolveIsForfeit } from './league-match-forfeit.service';

/**
 * 리그 **일정 목록**을 만드는 한 곳.
 *
 * ## 왜 뽑아냈나
 * 통합 화면(read-swap)에서 대회 상세(`/tournaments/:id`)가 거울 행
 * (`kind = 'regular_league'`)을 받으면 **대회 축 대진으로는 빈 일정**이 나온다 — 거울에는
 * `V1TournamentFixture` 행이 하나도 없기 때문이다(그 행을 만드는 코드가 전부
 * `TOURNAMENT_KINDS` 게이트 뒤에 있다). 리그 축에서 같은 목록을 만들어야 하는데, 그 매핑을
 * `LeagueMatchPublicService.detail()` 안에 둔 채로 대회 쪽에 한 벌 더 쓰면 **두 벌이 된다.**
 *
 * 서비스를 주입받는 길은 막혀 있다: `LeagueMatchModule` 은 `exports` 가 없고,
 * `league-matches` 가 `tournaments` 를 여러 파일에서 참조해 **모듈을 import 하면 순환**이다.
 * 그래서 **Nest 모듈이 아니라 파일 단위**로 나눈다 — `league-standings-source.ts`(순위 입력)가
 * 같은 이유로 먼저 그렇게 나뉘었고, 이 파일은 그 자매다.
 *
 * ## ⚠️ 순위 쪽 모듈(`league-standings-source.ts`)을 재사용하지 않는 이유
 * `bucketLeagueFixtures` 는 **순위에 세는 대진이 무엇인가**에 답한다 — 취소·무효를 카운터로
 * 접고, confirmed 항목에서 `teamMatchId`·`startAt`·`placeName` 을 **버린다.** 일정 목록은
 * 정확히 그 버린 것들이 필요하고, **취소·무효 대진도 목록에는 보여야 한다**(화면이
 * "취소됨"·"집계 제외"로 적는다). 두 모듈은 같은 테이블을 읽지만 **다른 질문에 답한다.**
 */

/** `v1TeamMatch` 조회 결과가 이 모듈에 들어올 때의 **최소 모양**. */
export type LeagueFixtureListRow = {
  id: string;
  title: string;
  hostTeamId: string;
  approvedApplicantTeamId: string | null;
  startAt: Date;
  placeName: string;
  status: string;
  game: { id: string; currentOfficialRevisionId: string | null } | null;
};

/**
 * 확정 사실 조회 결과의 최소 모양.
 *
 * ⚠️ **`resultRevision` 은 키가 필수다**(값만 nullable 이 아니라 키 자체가 있어야 한다) —
 * 몰수 판정(`resolveIsForfeit`)이 그것을 읽는다. select 에서 빼면 **몰수가 조용히 전부
 * false 가 되는 게 아니라 대입이 컴파일에 실패한다.** 그게 이 타입이 존재하는 이유다.
 */
export type LeagueFixtureFactRow = {
  homeScore: number;
  awayScore: number;
  resultRevision: Parameters<typeof resolveIsForfeit>[0];
};

/** 공개 응답의 리그 대진 한 줄. 프론트 `V1LeagueFixture` 와 같은 모양이다. */
export type LeagueFixtureListItem = {
  teamMatchId: string;
  title: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: Date;
  placeName: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isForfeit: boolean;
};

/**
 * 대진 행 + 확정 사실 → 공개 일정 목록. **순수 함수** — 조회는 호출부가 한다.
 *
 * 두 가지를 지킨다:
 * - **미확정 대진의 점수는 `null`** 이다. `0` 으로 채우면 화면이 0:0 무승부로 읽는다.
 * - **몰수는 boolean 하나로만** 나간다. 사유 원문은 운영자가 쓴 자유 텍스트라 공개 응답에
 *   싣지 않는다 — 스코어만 보면 실제 1:0 승리와 구분되지 않으니 표식은 필요하고,
 *   그 표식이 사유를 노출해서는 안 된다.
 */
export function toLeagueFixtureList(
  fixtures: readonly LeagueFixtureListRow[],
  factByGameId: ReadonlyMap<string, LeagueFixtureFactRow>,
): LeagueFixtureListItem[] {
  return fixtures.map((fixture) => {
    const fact = fixture.game === null ? undefined : factByGameId.get(fixture.game.id);
    return {
      teamMatchId: fixture.id,
      title: fixture.title,
      homeTeamId: fixture.hostTeamId,
      awayTeamId: fixture.approvedApplicantTeamId,
      startAt: fixture.startAt,
      placeName: fixture.placeName,
      status: fixture.status,
      homeScore: fact?.homeScore ?? null,
      awayScore: fact?.awayScore ?? null,
      isForfeit: fact === undefined ? false : resolveIsForfeit(fact.resultRevision),
    };
  });
}

/** 두 호출부가 같은 select 를 손으로 적지 않도록 모아 둔다 — 필드가 늘면 여기만 고친다. */
export const LEAGUE_FIXTURE_LIST_SELECT = {
  id: true,
  title: true,
  hostTeamId: true,
  approvedApplicantTeamId: true,
  startAt: true,
  placeName: true,
  status: true,
  game: { select: { id: true, currentOfficialRevisionId: true } },
} as const;

/**
 * 확정 사실 select. **`resultRevision` 을 빼지 마라** — 위 `LeagueFixtureFactRow` 참조.
 * 사유 원문(`reason`/`outcomeReason`)은 여기서만 읽고 boolean 으로 환산해 내보낸다.
 */
export const LEAGUE_FIXTURE_FACT_SELECT = {
  gameId: true,
  homeScore: true,
  awayScore: true,
  resultRevision: { select: { reason: true, outcomeReason: true } },
} as const;
