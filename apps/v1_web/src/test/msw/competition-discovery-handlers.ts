import { http, HttpResponse } from 'msw';
import { canStartTournamentRegistration } from '@/lib/tournament-registration-availability';
import type { CompetitionDiscoveryItem } from '@/lib/competition-discovery';

export type CompetitionDiscoveryFixture = Omit<CompetitionDiscoveryItem, 'status'> & { status: CompetitionDiscoveryItem['status'] | 'on_hold'; isPublic?: boolean };

/** 테스트가 소유한 fixture에 새 목록 계약을 적용하는 MSW 핸들러. 런타임에서는 사용하지 않는다. */
export function createCompetitionDiscoveryHandlers(api: string, fixtures: readonly CompetitionDiscoveryFixture[]) {
  return [http.get(`${api}/tournaments`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    const kind = query.get('kind') ?? 'tournament';
    const phase = query.get('phase');
    const registration = query.get('sort') === 'deadline' ? 'open' : query.get('registration');
    const items = fixtures.filter((item) => {
      const league = item.kind === 'regular_league';
      if (item.isPublic === false) return false;
      if (item.status === 'on_hold' || item.status === 'cancelled' || (item.status === 'draft' && !league)) return false;
      if (kind === 'league' && !league || kind === 'tournament' && league) return false;
      if (query.get('status') && item.status !== query.get('status')) return false;
      if (query.get('sportId') && item.sportId !== query.get('sportId')) return false;
      if (phase === 'upcoming' && !['draft', 'open', 'closed'].includes(item.status)) return false;
      if (phase === 'ongoing' && item.status !== 'in_progress') return false;
      if (phase === 'completed' && item.status !== 'completed') return false;
      const open = canStartTournamentRegistration({ ...item, teamCount: item.teamCount ?? 0 });
      if (registration && open !== (registration === 'open')) return false;
      if (query.get('genderCategory')) {
        const gender = query.get('genderCategory') === 'unspecified' ? null : query.get('genderCategory');
        if (league || item.genderCategory !== gender) return false;
      }
      if (query.get('format') && (league || item.format !== query.get('format'))) return false;
      if (query.has('feeMin') && (league || item.entryFee < Number(query.get('feeMin')))) return false;
      if (query.has('feeMax') && (league || item.entryFee > Number(query.get('feeMax')))) return false;
      if ((query.has('dateFrom') || query.has('dateTo')) && !item.scheduledAt) return false;
      if (query.has('dateFrom') && new Date(item.scheduledEndAt ?? item.scheduledAt!).getTime() < new Date(`${query.get('dateFrom')}T00:00:00+09:00`).getTime()) return false;
      if (query.has('dateTo') && new Date(item.scheduledAt!).getTime() > new Date(`${query.get('dateTo')}T23:59:59.999+09:00`).getTime()) return false;
      return true;
    });
    const field = query.get('sort') === 'deadline' ? 'registrationDeadlineAt' : query.get('sort') === 'scheduled' ? 'scheduledAt' : undefined;
    items.sort((a, b) => {
      if (field && a[field] !== b[field]) {
        if (!a[field]) return 1;
        if (!b[field]) return -1;
        return a[field]!.localeCompare(b[field]!);
      }
      return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
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
