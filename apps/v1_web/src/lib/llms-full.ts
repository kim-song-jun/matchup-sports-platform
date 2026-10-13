import { collectPublicMatchInventory, collectPublicTournamentFixtures, fetchPublicPages, type PublicTournamentFixture } from '@/lib/public-competition-discovery';
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
  tournamentFixtures?: PublicTournamentFixture[] | null;
  unavailableSources?: string[];
};

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
    settle('대회', () => fetchPublicPages<V1TournamentListItem>('/tournaments', { cache: 'no-store' })),
    settle('리그', () => fetchPublicPages<V1PublicLeagueListItem>('/league-matches', { cache: 'no-store' })),
    settle('이벤트', () => fetchPublicPages<V1TournamentCampaignListItem>('/tournaments/campaigns')),
    collectPublicMatchInventory<V1Match>('/matches'),
    collectPublicMatchInventory<V1TeamMatch>('/team-matches'),
    settle('팀', () => fetchPublicPages<V1Team>('/teams')),
  ]);
  const fixtures = tournaments === null ? { items: null, failedSources: ['/tournaments'] }
    : await collectPublicTournamentFixtures(tournaments);
  return { tournaments, leagues, campaigns, teams,
    matches: matches.items, teamMatches: teamMatches.items, tournamentFixtures: fixtures.items,
    unavailableSources: [...matches.failedSources, ...teamMatches.failedSources, ...fixtures.failedSources],
  };
}
