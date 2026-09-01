import { TeamListPageView } from './teams-page';
import { buildTeamSportChips, toTeam } from './teams.card-model';
import { getTeamListViewModel } from './teams.view-model';
import type { V1Team } from '@/types/api';

/**
 * 팀 목록의 **서버 렌더 첫 화면**. 이유와 트레이드오프는 `matches-ssr-list.tsx` 와 같다 —
 * `<Suspense fallback={null}>` 때문에 크롤러가 빈 목록을 받고 있었다.
 *
 * 목록 항목의 활동 정보 보강(`withListActivityFallback`)은 팀마다 상세를 한 번 더 부르는
 * 클라이언트 전용 최적화라 여기서는 하지 않는다. 서버 렌더의 목적은 **읽을 수 있는 목록**
 * 이고, 활동 요약이 빠진 카드도 팀 이름·종목·지역을 그대로 담는다.
 */
export function TeamListSsrView({ teams }: { readonly teams: readonly V1Team[] }) {
  const base = getTeamListViewModel();
  const items = [...teams];
  const cards = items.map((item, index) => toTeam(item, base.teams[index] ?? base.teams[0]));

  return (
    <TeamListPageView
      model={{
        ...base,
        query: '',
        filterCount: 0,
        teams: cards,
        chips: buildTeamSportChips(items, base, new URLSearchParams()),
        summary: {
          ...base.summary,
          total: cards.length,
          recruiting: cards.filter((item) => item.status === 'open').length,
          nearby: undefined,
        },
      }}
    />
  );
}
