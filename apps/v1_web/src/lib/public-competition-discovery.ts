import { fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail, V1TournamentFixture, V1TournamentListItem } from '@/types/api';

export type PublicTournamentFixture = {
  tournamentId: string;
  tournamentTitle: string;
  sportName: string;
  fixture: V1TournamentFixture;
};

export type PublicDiscoveryResult<T> = { items: T[] | null; failedSources: string[] };
type Paged<T> = { items: T[]; nextCursor?: string | null; pageInfo?: { hasNext: boolean; nextCursor: string | null } };

export async function fetchPublicPages<T>(path: string, options: { cache?: 'no-store'; status?: string } = {}): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const query = new URLSearchParams({ limit: '50' });
    if (options.status) query.set('status', options.status);
    if (cursor) query.set('cursor', cursor);
    const result = await fetchPublicV1<Paged<T>>(`${path}?${query}`, options.cache ? { cache: options.cache } : {});
    if (!result) throw new Error(`목록 엔드포인트 404: ${path}`);
    items.push(...result.items);
    cursor = result.pageInfo ? (result.pageInfo.hasNext ? result.pageInfo.nextCursor : null) : (result.nextCursor ?? null);
    if (result.pageInfo?.hasNext && !cursor) throw new Error(`다음 공개 목록 커서 누락: ${path}`);
    if (cursor) {
      if (seen.has(cursor)) throw new Error(`공개 목록 커서 반복: ${path}`);
      seen.add(cursor);
    }
  } while (cursor);
  return items;
}

/** 기본 탐색의 7일 제한 밖 기록도 공개 API의 동일 권한·삭제 필터를 통해서만 조회한다. */
export async function collectPublicMatchInventory<T extends { id?: string; matchId?: string; teamMatchId?: string }>(path: '/matches' | '/team-matches'): Promise<PublicDiscoveryResult<T>> {
  const rows = new Map<string, T>();
  const failedSources: string[] = [];
  let successes = 0;
  // expired는 과거 시작 경기 전체, completed/cancelled는 미래 일정인 확정·취소 행까지 보완한다.
  for (const status of [undefined, 'completed', 'cancelled', 'expired']) {
    const source = status ? `${path}?status=${status}` : path;
    try {
      const items = await fetchPublicPages<T>(path, { cache: 'no-store', status });
      successes += 1;
      for (const item of items) {
        const id = item.teamMatchId ?? item.matchId ?? item.id;
        if (id) rows.set(id, item);
      }
    } catch (error) {
      console.error(`[seo] 공개 경기 목록 조회 실패: ${source}`, error);
      failedSources.push(source);
    }
  }
  return { items: successes ? [...rows.values()] : null, failedSources };
}

/** 공개 목록에 있는 대회만 조회한다. 리그 거울·draft와 관리용 API는 검색 자료가 아니다. */
export async function collectPublicTournamentFixtures(tournaments: V1TournamentListItem[]): Promise<PublicDiscoveryResult<PublicTournamentFixture>> {
  const rows: PublicTournamentFixture[] = [];
  const failedSources: string[] = [];
  let successes = 0;
  // 최신 공개 목록으로 대상 판정을 끝낸 뒤 상세는 300초 캐시를 재사용한다.
  for (const item of tournaments) {
    if (item.kind === 'regular_league' || item.status === 'draft') continue;
    const source = `/tournaments/${encodeURIComponent(item.id)}`;
    try {
      const detail = await fetchPublicV1<V1TournamentDetail>(source);
      successes += 1;
      if (!detail) continue;
      for (const fixture of detail.fixtures) rows.push({
        tournamentId: item.id, tournamentTitle: item.title, sportName: item.sport.name, fixture,
      });
    } catch (error) {
      console.error(`[seo] 공개 대회 경기 조회 실패: ${source}`, error);
      failedSources.push(source);
    }
  }
  return { items: successes || failedSources.length === 0 ? rows : null, failedSources };
}
