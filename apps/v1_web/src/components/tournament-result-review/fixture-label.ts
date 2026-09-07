import type { V1TournamentOperationsBoardItem } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';

/**
 * **운영 목록의 경기 이름표.**
 *
 * 보드 아이템은 대회 축 필드(`round` · `fixtureNumber`)를 갖는데, **리그 대진에는 그 둘이
 * 없다** — `V1TeamMatch` 에 주차/번호 컬럼이 없어 서버가 `null` 을 내려준다. 그런데 화면이
 * 그걸 그대로 템플릿 리터럴에 넣어 **`"null번 경기"`** 가 찍히고, 부제는 구분자만 남은
 * **`" · 번 경기"`** 가 됐다(2026-09-06 alpha 실측).
 *
 * **없는 값을 만들어 내지 않는다.** 리그 대진은 생성 시 제목을 이미 "N주차 M경기" 로 붙인다
 * (`league-fixture-creation.ts`). 그러니 **있는 것을 제자리에서 읽는다** — 새 라벨 규칙을
 * 발명하지 않는다.
 *
 * 팀 이름은 대회 축에서만 온다(공개 리그 응답에 팀명이 없다). 그래서 리그는 제목이 곧 이름표다.
 */
export type FixtureLabel = {
  /** 큰 줄. 팀 이름을 알면 "홈 vs 원정", 리그면 대진 제목. */
  title: string;
  /** 작은 줄. 없으면 `null` — **빈 문자열이나 구분자만 남기지 않는다.** */
  subtitle: string | null;
};

export function buildLeagueFixtureTitles(
  leagueFixtures: readonly V1LeagueFixture[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const fixture of leagueFixtures ?? []) {
    // 리그 대진의 보드 `fixtureId` 는 팀매치 id 다.
    map.set(fixture.teamMatchId, fixture.title);
  }
  return map;
}

export function resolveFixtureLabel(
  item: Pick<V1TournamentOperationsBoardItem, 'fixtureId' | 'round' | 'fixtureNumber'>,
  teamNames: { home: string; away: string } | undefined,
  leagueTitles: ReadonlyMap<string, string>,
): FixtureLabel {
  const round = item.round as string | null;
  const fixtureNumber = item.fixtureNumber as number | null;
  const hasTournamentAxis = round !== null && fixtureNumber !== null;
  const leagueTitle = leagueTitles.get(item.fixtureId) ?? null;

  if (teamNames) {
    return {
      title: `${teamNames.home} vs ${teamNames.away}`,
      subtitle: hasTournamentAxis ? `${round} · ${fixtureNumber}번 경기` : leagueTitle,
    };
  }
  if (leagueTitle !== null) {
    return { title: leagueTitle, subtitle: null };
  }
  return {
    title: hasTournamentAxis ? `${fixtureNumber}번 경기` : '경기',
    subtitle: hasTournamentAxis ? `${round} · ${fixtureNumber}번 경기` : null,
  };
}
