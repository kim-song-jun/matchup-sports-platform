import { fetchPublicV1 } from '@/lib/seo';
import type { V1Match, V1Team, V1TeamMatch, V1TournamentListItem } from '@/types/api';
import type { V1PublicLeagueListItem } from '@/types/league-match';
import type { V1TournamentCampaignListItem } from '@/types/tournament-campaign';

/**
 * `/llms-full.txt` 에 싣는 공개 데이터 묶음.
 *
 * 섹션마다 `null` 은 "조회 실패"이고 `[]` 는 "지금 해당 항목 없음"이다 — 렌더러는 실패한
 * 섹션을 통째로 빼고, 빈 섹션은 "없음"이라고 적는다. 둘을 섞으면 장애가 난 순간 AI 가
 * "팀밋엔 모집 중인 매치가 없다"를 사실로 학습한다.
 */
export type LlmsFullSnapshot = {
  tournaments: V1TournamentListItem[] | null;
  leagues: V1PublicLeagueListItem[] | null;
  campaigns: V1TournamentCampaignListItem[] | null;
  matches: V1Match[] | null;
  teamMatches: V1TeamMatch[] | null;
  teams: V1Team[] | null;
};

const PAGE_SIZE = 50;
// 한 섹션이 문서를 독점하지 않게 하는 상한. 팀은 prod 기준 68개(2026-09-27)라 전부 실린다.
const MAX_PAGES = 4;

type Paged<T> = { items: T[]; nextCursor?: string | null; pageInfo?: { hasNext: boolean; nextCursor: string | null } };

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const result: Paged<T> | null = await fetchPublicV1<Paged<T>>(`${path}?${query.toString()}`);
    // 목록 엔드포인트의 404 는 "0건"이 아니라 경로가 없다는 뜻이다(예: API 가 아직 옛 버전) — 실패로 올린다.
    if (!result) throw new Error(`목록 엔드포인트 404: ${path}`);
    items.push(...result.items);
    // 목록마다 커서 위치가 다르다: pageInfo 가 있으면 그쪽이 정본이고 최상위 nextCursor 는 null 이다.
    cursor = result.pageInfo
      ? (result.pageInfo.hasNext ? result.pageInfo.nextCursor : null)
      : (result.nextCursor ?? null);
    if (!cursor) break;
  }
  return items;
}

async function settle<T>(label: string, load: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`[seo] llms-full.txt ${label} 조회 실패 — 해당 섹션 없이 내보낸다`, error);
    return null;
  }
}

export async function collectLlmsFullSnapshot(): Promise<LlmsFullSnapshot> {
  const [tournaments, leagues, campaigns, matches, teamMatches, teams] = await Promise.all([
    settle('대회', () => fetchAllPages<V1TournamentListItem>('/tournaments')),
    settle('리그', () => fetchAllPages<V1PublicLeagueListItem>('/league-matches')),
    settle('이벤트', () => fetchAllPages<V1TournamentCampaignListItem>('/tournaments/campaigns')),
    settle('개인 매치', () => fetchAllPages<V1Match>('/matches')),
    settle('팀 매치', () => fetchAllPages<V1TeamMatch>('/team-matches')),
    settle('팀', () => fetchAllPages<V1Team>('/teams')),
  ]);
  return { tournaments, leagues, campaigns, matches, teamMatches, teams };
}
