import { fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail, V1TournamentFixture, V1TournamentListItem } from '@/types/api';

export type PublicTournamentFixture = {
  tournamentId: string;
  tournamentTitle: string;
  sportName: string;
  fixture: V1TournamentFixture;
};

/** 공개 목록에 있는 대회만 조회한다. 리그 거울·draft와 관리용 API는 검색 자료가 아니다. */
export async function collectPublicTournamentFixtures(tournaments: V1TournamentListItem[]): Promise<PublicTournamentFixture[]> {
  const rows: PublicTournamentFixture[] = [];
  // 상세가 커질 수 있어 직렬 조회한다. 임의 개수 제한 없이 실제 공개 대진을 모두 싣는다.
  for (const item of tournaments) {
    if (item.kind === 'regular_league' || item.status === 'draft') continue;
    const detail = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(item.id)}`, { cache: 'no-store' });
    if (!detail) continue; // 목록 조회 뒤 비공개/삭제된 대회는 상세 API가 404로 차단한다.
    for (const fixture of detail.fixtures) rows.push({
      tournamentId: item.id, tournamentTitle: item.title, sportName: item.sport.name, fixture,
    });
  }
  return rows;
}
