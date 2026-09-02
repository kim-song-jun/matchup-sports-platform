import { Prisma, V1GameSourceType } from '@prisma/client';

/**
 * 경기 운영 콘솔이 **이 게임이 어느 대회의 것인지**를 되찾는 단일 경로.
 *
 * ## 왜 필요한가
 * 콘솔은 게임에서 `tournamentFixtureId` 를 읽어 대회를 찾는다. 그런데 **리그 경기는 팀
 * 매치 기반**이라 그 값이 `null` 이다 — 그래서 콘솔의 결과 명령 경계가 리그 경기를
 * 통째로 404 로 튕겼고, 리그는 전용 결과 입력 모달을 따로 갖고 있어야 했다.
 * 정본 §4 가 "리그도 대회와 같은 콘솔을 쓴다" 로 확정했으므로 그 경계가 두 출처를 모두
 * 해석해야 한다.
 *
 * ## 리그의 "대회 id" 는 거울 id 다
 * 리그는 통합 축(`V1Tournament`)에 `kind='regular_league'` 거울을 갖는다. read-swap 이후
 * 그 거울 id 가 곧 리그 id 이므로, 팀 매치의 `leagueId` 를 그대로 `tournamentId` 로 쓴다.
 * 스태프 권한 검사도 그 id 로 걸린다 — **대회와 같은 함수를 지난다**(복사본을 만들지
 * 않는다). 리그 거울엔 배정이 보통 없지만, 플랫폼 관리자와 대회 운영자는 배정 없이도
 * 통과하는 것이 원래 규칙이라 그대로 성립한다.
 *
 * ## `fixtureId` 는 리그에서 null 이다 — 타입을 넓히지 않아도 된다
 * `GameActorScope.fixtureId` 는 optional 이고 `TournamentStaffPrincipal.fixtureId` 는
 * `string | null` 이다(실측). 그래서 리그 경기는 그 자리를 비운 채 기존 계약을 그대로
 * 지나간다.
 *
 * ## 대회 전용 로직까지 여기로 끌어오지 않는다
 * 브래킷 투영·순위 투영·징계·녹아웃 승부차기는 `tournamentFixtureId === null` 이면
 * 일찍 빠져나가는데, **그게 리그에 맞는 동작이다** — 리그는 브래킷이 없고 순위는
 * `league-standings.ts` 가 따로 센다. 그 자리들을 이 해석기로 바꾸면 없는 개념을
 * 억지로 만들게 된다.
 */
export type ResolvedGameSource =
  | { readonly kind: 'fixture'; readonly tournamentId: string; readonly fixtureId: string }
  | { readonly kind: 'teamMatch'; readonly tournamentId: string; readonly fixtureId: null; readonly teamMatchId: string };

/** 해석에 필요한 최소 게임 필드 — 호출자가 이미 잠근 행에서 그대로 넘긴다. */
export interface GameSourceRef {
  readonly sourceType: V1GameSourceType;
  readonly tournamentFixtureId: string | null;
  readonly teamMatchId: string | null;
}

/**
 * 해석할 수 없으면 `null` — 호출자가 404 로 바꾼다.
 *
 * 해석 못 하는 경우는 셋이다: ① 대진 행이 사라졌다 ② 팀 매치 행이 사라졌다
 * ③ **리그에 속하지 않은 친선 팀 매치**다. ③은 오류가 아니라 "콘솔이 다룰 대상이
 * 아니다" — 친선 경기는 대회 운영 권한 체계 밖이므로 여기서 열리면 안 된다.
 */
export async function resolveGameSource(
  tx: Prisma.TransactionClient,
  game: GameSourceRef,
): Promise<ResolvedGameSource | null> {
  if (game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE) {
    if (game.tournamentFixtureId === null) return null;
    const fixture = await tx.v1TournamentFixture.findUnique({
      where: { id: game.tournamentFixtureId },
      select: { tournamentId: true },
    });
    if (fixture === null) return null;
    return { kind: 'fixture', tournamentId: fixture.tournamentId, fixtureId: game.tournamentFixtureId };
  }

  // ⚠️ **fail-open 을 만들지 않는다.** "대회 대진이 아니면 전부 팀매치" 로 두면 enum 에
  // 이미 있는 `COMPETITION_FIXTURE`·`FRIENDLY_MATCH`(R1 expand 로 추가된 통합 후 이름)와
  // 앞으로 늘어날 값까지 조용히 팀매치로 해석한다 — 그 경기들엔 운영 규칙이 다르게 걸린다
  // (예: takeover 요구 여부). 아는 값만 통과시키고 나머지는 호출부가 404 로 닫는다.
  if (game.sourceType !== V1GameSourceType.TEAM_MATCH) return null;
  if (game.teamMatchId === null) return null;
  const teamMatch = await tx.v1TeamMatch.findUnique({
    where: { id: game.teamMatchId },
    select: { leagueId: true },
  });
  // 친선 팀 매치(leagueId === null)는 대회 운영 대상이 아니다 — 열어 주면 대회 스태프
  // 권한 체계 밖의 경기를 콘솔이 조작하게 된다.
  if (teamMatch === null || teamMatch.leagueId === null) return null;
  return { kind: 'teamMatch', tournamentId: teamMatch.leagueId, fixtureId: null, teamMatchId: game.teamMatchId };
}
