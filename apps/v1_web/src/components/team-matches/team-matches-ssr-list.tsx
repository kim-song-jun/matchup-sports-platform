import { TeamMatchListPageView } from './team-matches-page';
import { buildSportChips, toTeamMatch } from './team-matches.card-model';
import { getTeamMatchListViewModel } from './team-matches.view-model';
import type { V1Sport, V1TeamMatch } from '@/types/api';

/**
 * 팀매치 목록의 **서버 렌더 첫 화면**. 이유와 트레이드오프는 `matches-ssr-list.tsx` 와 같다.
 */
export function TeamMatchListSsrView({
  matches,
  sports = [],
}: {
  readonly matches: readonly V1TeamMatch[];
  readonly sports?: readonly V1Sport[];
}) {
  const base = getTeamMatchListViewModel();
  const items = [...matches];
  const cards = items.map((item, index) => toTeamMatch(item, base.matches[index] ?? base.matches[0]));

  return (
    <TeamMatchListPageView
      model={{
        ...base,
        query: '',
        filterCount: 0,
        matches: cards,
        sports: buildSportChips({ base, params: new URLSearchParams(), matches: items, sports: [...sports] }),
        // base.summary 를 그대로 펼치면 목업 urgent 값이 새어 나간다 — 실제 카드 기준으로 다시 센다.
        summary: {
          ...base.summary,
          count: cards.length,
          today: cards.length,
          urgent: cards.filter((card) => card.status === 'open').length,
        },
      }}
    />
  );
}
