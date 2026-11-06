import { http, HttpResponse } from 'msw';
import { canStartTournamentRegistration } from '@/lib/tournament-registration-availability';
import type { CompetitionDiscoveryItem } from '@/lib/competition-discovery';

export type CompetitionDiscoveryFixture = Omit<CompetitionDiscoveryItem, 'status'> & { status: CompetitionDiscoveryItem['status'] | 'on_hold'; isPublic?: boolean };

type Stage = 'ongoing' | 'recruiting' | 'preparing' | 'recruit_closed' | 'completed';
/** 서버 정렬 그룹 순서(`tournament-list-query.ts`): 진행 중 → 접수 중 → 준비 중 → 접수 마감 → 종료. */
const STAGE_ORDER: readonly Stage[] = ['ongoing', 'recruiting', 'preparing', 'recruit_closed', 'completed'];

function stageOf(item: CompetitionDiscoveryFixture): Stage {
  if (item.status === 'in_progress') return 'ongoing';
  if (item.status === 'completed') return 'completed';
  if (item.status === 'draft') return 'preparing';
  if (item.status === 'closed') return 'recruit_closed';
  return canStartTournamentRegistration({ ...item, teamCount: item.teamCount ?? 0 }) ? 'recruiting' : 'recruit_closed';
}

/** 테스트가 소유한 fixture에 새 목록 계약(상태 필터 + 상태 그룹 고정 정렬)을 적용하는 MSW 핸들러. 런타임에서는 사용하지 않는다. */
export function createCompetitionDiscoveryHandlers(api: string, fixtures: readonly CompetitionDiscoveryFixture[]) {
  return [http.get(`${api}/tournaments`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    const kind = query.get('kind') ?? 'tournament';
    const stage = query.get('stage');
    const items = fixtures.filter((item) => {
      const league = item.kind === 'regular_league';
      if (item.isPublic === false) return false;
      if (item.status === 'on_hold' || item.status === 'cancelled' || (item.status === 'draft' && !league)) return false;
      if (kind === 'league' && !league || kind === 'tournament' && league) return false;
      if (query.get('status') && item.status !== query.get('status')) return false;
      if (query.get('sportId') && item.sportId !== query.get('sportId')) return false;
      if (stage && stageOf(item) !== stage) return false;
      if (query.get('genderCategory')) {
        if (league || item.genderCategory !== query.get('genderCategory')) return false;
      }
      if (query.get('format') && (league || item.format !== query.get('format'))) return false;
      if (query.has('feeMin') && (league || item.entryFee < Number(query.get('feeMin')))) return false;
      if (query.has('feeMax') && (league || item.entryFee > Number(query.get('feeMax')))) return false;
      if ((query.has('dateFrom') || query.has('dateTo')) && !item.scheduledAt) return false;
      if (query.has('dateFrom') && new Date(item.scheduledEndAt ?? item.scheduledAt!).getTime() < new Date(`${query.get('dateFrom')}T00:00:00+09:00`).getTime()) return false;
      if (query.has('dateTo') && new Date(item.scheduledAt!).getTime() > new Date(`${query.get('dateTo')}T23:59:59.999+09:00`).getTime()) return false;
      return true;
    });
    const endedAt = (item: CompetitionDiscoveryFixture) => item.scheduledEndAt ?? item.scheduledAt ?? '';
    items.sort((a, b) => {
      const rank = STAGE_ORDER.indexOf(stageOf(a)) - STAGE_ORDER.indexOf(stageOf(b));
      if (rank !== 0) return rank;
      const [left, right] = stageOf(a) === 'completed' ? [endedAt(a), endedAt(b)] : [a.createdAt, b.createdAt];
      return right.localeCompare(left) || a.id.localeCompare(b.id);
    });
    const limit = Number(query.get('limit') ?? 20);
    const page = Number(query.get('page') ?? 1);
    const offset = query.has('page') ? (page - 1) * limit : query.has('cursor') ? Math.max(0, items.findIndex((item) => item.id === query.get('cursor')) + 1) : 0;
    const selected = items.slice(offset, offset + limit);
    const hasNext = offset + limit < items.length;
    return HttpResponse.json({ status: 'success', timestamp: new Date().toISOString(), data: {
      items: selected.map(({ isPublic: _visibility, ...item }) => ({ ...item, registrationOpen: canStartTournamentRegistration({ ...item, teamCount: item.teamCount ?? 0 }) })),
      pageInfo: { nextCursor: hasNext ? selected.at(-1)?.id ?? null : null, hasNext,
        ...(query.has('page') ? { page, total: items.length, totalPages: Math.ceil(items.length / limit), hasPrev: page > 1, limit } : query.has('withTotal') ? { total: items.length } : {}),
      },
    } });
  })];
}
