import { MatchListPageView } from './matches-page';
import { buildSportSummary, countToday, statusToCardStatus, getStatus, toMatchCard } from './matches.card-model';
import { getMatchListViewModel } from './matches.view-model';
import type { V1Match } from '@/types/api';

/**
 * 매치 목록의 **서버 렌더 첫 화면**.
 *
 * 왜 필요한가: `/matches` 는 `<Suspense fallback={null}>` 로 감싼 클라이언트 컴포넌트였고,
 * `useSearchParams()` 때문에 정적 렌더에서 클라이언트로 떨어졌다. 그 결과 크롤러가 받는
 * HTML 에 매치가 한 건도 없었다(실측: h1 0개, 종목 단어 0회 — 목록 페이지가 통째로
 * 빈 껍데기). 검색엔진과 AI 는 이 화면을 "내용 없는 페이지"로 본다.
 *
 * 그래서 fallback 을 null 대신 **서버가 미리 그린 실제 목록**으로 바꾼다. 클라이언트가
 * 하이드레이션되면 필터·검색·더보기가 붙은 원래 화면으로 교체되므로 사용자가 보는 최종
 * 화면은 그대로이고, 로딩 순간에 빈 화면 대신 목록이 보이는 쪽이 오히려 낫다.
 *
 * 상호작용 핸들러(`search`·`onLoadMore`)는 넘기지 않는다 — 서버 컴포넌트는 클라이언트로
 * 함수를 건널 수 없고, 이 렌더의 목적은 **읽을 수 있는 콘텐츠**이지 동작이 아니다.
 */
export function MatchListSsrView({ matches }: { readonly matches: readonly V1Match[] }) {
  const base = getMatchListViewModel();
  const items = [...matches];

  return (
    <MatchListPageView
      model={{
        ...base,
        query: '',
        filterCount: 0,
        matches: items.map((item, index) => toMatchCard(item, base.matches[index] ?? base.matches[0])),
        sports: buildSportSummary(new URLSearchParams(), items, base),
        summary: {
          ...base.summary,
          count: items.length,
          today: countToday(items),
          urgent: items.filter((item) => statusToCardStatus(getStatus(item)) === 'open').length,
        },
      }}
    />
  );
}
