import type { V1VisibilityMode } from '@prisma/client';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import { resolveIsForfeit } from './league-forfeit-result';

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
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
  startAt: Date;
  placeName: string;
  status: string;
  game: {
    id: string;
    currentOfficialRevisionId: string | null;
    visibilityPolicy: { mode: V1VisibilityMode } | null;
  } | null;
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
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Slot assignment remains observable while team identity is privacy-masked. */
  homeAssigned: boolean;
  awayAssigned: boolean;
  startAt: Date;
  placeName: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isForfeit: boolean;
  /**
   * 점수가 **정책상 가려진** 상태. `homeScore === null` 만으로는 "아직 결과가 없다" 와
   * 구분되지 않아 화면이 '결과 대기' 라고 거짓말한다 — 결과는 확정돼 있고 공개만 안 될 뿐이다.
   */
  scoreHidden: boolean;
};

/**
 * 대진 행 + 확정 사실 → 공개 일정 목록. **순수 함수** — 조회는 호출부가 한다.
 *
 * 세 가지를 지킨다:
 * - **가시성 정책(D-06)을 경기 상세와 같은 기준으로 적용한다.** `publicLiveEnabled` 는
 *   호출부가 읽어 넘긴다(순수 함수 유지). 가려진 점수는 `null` + `scoreHidden: true` 로
 *   나가야 화면이 "아직 결과 없음" 과 구분해 적을 수 있다.
 * - **미확정 대진의 점수는 `null`** 이다. `0` 으로 채우면 화면이 0:0 무승부로 읽는다.
 * - **몰수는 boolean 하나로만** 나간다. 사유 원문은 운영자가 쓴 자유 텍스트라 공개 응답에
 *   싣지 않는다 — 스코어만 보면 실제 1:0 승리와 구분되지 않으니 표식은 필요하고,
 *   그 표식이 사유를 노출해서는 안 된다.
 */
export function toLeagueFixtureList(
  fixtures: readonly LeagueFixtureListRow[],
  factByGameId: ReadonlyMap<string, LeagueFixtureFactRow>,
  publicLiveEnabled: boolean,
): LeagueFixtureListItem[] {
  return fixtures.map((fixture) => {
    const game = fixture.game;
    const fact = game === null ? undefined : factByGameId.get(game.id);
    // 확정된 사실이 있을 때만 "가렸다" 고 말한다 — 결과가 아직 없는 경기까지 `scoreHidden`
    // 으로 표시하면 화면이 "예정" 을 "점수 비공개" 로 바꿔 읽는다.
    const scoreHidden =
      fact !== undefined && hidesScore(game?.visibilityPolicy?.mode ?? 'HIDDEN', publicLiveEnabled);
    return {
      teamMatchId: fixture.id,
      title: fixture.title,
      homeTeamId: fixture.hostTeamId,
      awayTeamId: fixture.approvedApplicantTeamId,
      homeAssigned: fixture.hostTeamId !== null,
      awayAssigned: fixture.approvedApplicantTeamId !== null,
      startAt: fixture.startAt,
      placeName: fixture.placeName,
      status: fixture.status,
      homeScore: scoreHidden ? null : fact?.homeScore ?? null,
      awayScore: scoreHidden ? null : fact?.awayScore ?? null,
      // 몰수 뱃지는 "1:0 으로 확정됐다" 를 그대로 말한다 — 숫자만 가리고 뱃지를 남기면
      // 가린 적이 없는 것과 같다.
      isForfeit: scoreHidden || fact === undefined ? false : resolveIsForfeit(fact.resultRevision),
      scoreHidden,
    };
  });
}

/**
 * 실효 가시성 모드가 **확정 점수까지** 가리는가. 경기 상세(`resolvePublicScorePresentation`)가
 * `showOfficialResult` 에 대해 내리는 판정과 같은 답이어야 한다 — 이 목록은 언제나 확정
 * 리비전의 사실만 싣기 때문이다. `official_only` 는 확정 전 숫자만 감추므로 여기선 공개다.
 *
 * `hidden` 은 경기 상세에서 404 지만 **목록에서는 행을 지우지 않는다**(점수만 가린다).
 * 주차 라벨과 '다음 경기' 강조가 이 배열의 길이·순서에서 파생되므로, 행을 빼면 같은 경기의
 * 주차가 보는 사람마다 달라진다.
 */
function hidesScore(policyMode: V1VisibilityMode, publicLiveEnabled: boolean): boolean {
  const mode = effectivePublicVisibilityMode(policyMode, publicLiveEnabled);
  return mode === 'status_only' || mode === 'hidden';
}

/**
 * **"이 리그의 대진은 무엇이고 어떤 순서인가"** — 리그 축 팀매치 목록의 단일 술어.
 *
 * ## 왜 필요한가 (2026-09-03 실측)
 * 같은 질문에 답하는 조회가 **세 벌**이었고 서로 달랐다:
 *
 * | 리더 | where | orderBy |
 * |---|---|---|
 * | 대회 상세 `/tournaments/:id` | `{ leagueId }` | `startAt asc` |
 * | 공개 일정 `/tournaments/:id/schedule` | `{ leagueId, deletedAt: null }` | `startAt asc, id asc` |
 * | 리그 자기 페이지 | `{ leagueId }` | `startAt asc` |
 *
 * `deletedAt` 차이는 **오늘은 관측되지 않는다** — 이 컬럼을 non-null 로 쓰는 코드 경로가
 * 0건이다(전수 확인). 소프트 삭제가 실제로 구현되는 날 세 화면이 갈린다.
 *
 * **`id` tie-break 부재는 지금도 실재하는 문제다.** 같은 `startAt` 대진들(하루에 여러 경기를
 * 넣는 `timing` 이 정확히 그 모양을 만든다)의 순서가 DB 반환 순서에 맡겨져 있고,
 * **커서 페이지네이션을 붙이는 순간 그게 중복·누락으로 바뀐다.** 운영 콘솔이 그 커서를
 * 붙이므로 여기서 결정적 순서를 못 박는다.
 *
 * ## 무엇을 공유하고 무엇을 공유하지 않나
 * 공유하는 것은 **어느 행이 이 리그의 대진인가와 그 순서**뿐이다. `select` 는 공유하지
 * 않는다 — 운영 콘솔은 게임 상태·버전·확정 리비전·라인업·에스컬레이션을 묻고, 위 세
 * 화면은 공개 일정 표시(점수·몰수)를 묻는다. 이 파일이 `league-standings-source.ts` 를
 * 재사용하지 않는 이유와 같다: **같은 테이블, 다른 질문.**
 */
export function leagueFixtureListWhere(leagueId: string): { leagueId: string; deletedAt: null } {
  return { leagueId, deletedAt: null };
}

/**
 * 결정적 정렬. `startAt` 만으로는 같은 날 같은 시각 경기들의 순서가 흔들린다 —
 * `id` 가 최종 tie-break 이고, 커서도 같은 튜플을 쓴다.
 */
export function leagueFixtureListOrder(): [{ startAt: 'asc' }, { id: 'asc' }] {
  // `as const` 배열 상수로 두면 Prisma 의 `orderBy`(가변 배열 타입)에 대입되지 않는다.
  // 함수로 두면 호출부마다 새 배열을 받아 그 문제도 없고 공유 의도도 그대로다.
  return [{ startAt: 'asc' }, { id: 'asc' }];
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
  // `visibilityPolicy` 를 빼면 매퍼가 모드를 **볼 수 없어** 가려야 할 점수를 그대로 싣는다.
  game: { select: { id: true, currentOfficialRevisionId: true, visibilityPolicy: { select: { mode: true } } } },
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
