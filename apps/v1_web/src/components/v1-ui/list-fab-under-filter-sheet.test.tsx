import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchListPageView } from '@/components/matches/matches-page';
import { getMatchListViewModel } from '@/components/matches/matches.view-model';
import { TeamMatchListPageView } from '@/components/team-matches/team-matches-page';
import { getTeamMatchListViewModel } from '@/components/team-matches/team-matches.view-model';
import { TeamListPageView } from '@/components/teams/teams-page';
import { getTeamListViewModel } from '@/components/teams/teams.view-model';
import { useShellOverrideForRoute } from './shell-override';

const nav = vi.hoisted(() => ({ pathname: '/teams' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** 앱 셸이 그리는 것과 같은 저장소(useShellOverrideForRoute)에서 FAB 슬롯을 읽는다. */
function ShellFloatingSlot({ pathname }: { pathname: string }) {
  return <div data-testid="shell-fab">{useShellOverrideForRoute(pathname).floatingSlot}</div>;
}

const sheetBase = { closeHref: '/x', resetHref: '/x', applyHref: '/x', sort: '' as const, genderRule: '' as const, levels: [], genderOptions: [], levelOptions: [] };

const pages = [
  {
    name: '팀 목록', pathname: '/teams', fab: '팀 만들기',
    view: (open: boolean) => {
      const model = getTeamListViewModel();
      return <TeamListPageView model={{ ...model, filterSheet: { ...sheetBase, open, regionId: '', sortOptions: [], regionOptions: [] } }} />;
    },
  },
  {
    name: '매치 목록', pathname: '/matches', fab: '매치 만들기',
    view: (open: boolean) => {
      const model = getMatchListViewModel();
      return <MatchListPageView model={{ ...model, filterSheet: { ...sheetBase, open, view: 'card', regionId: '', sortOptions: [], regionOptions: [] } }} />;
    },
  },
  {
    name: '팀매치 목록', pathname: '/team-matches', fab: '팀매치 만들기',
    view: (open: boolean) => {
      const model = getTeamMatchListViewModel();
      return <TeamMatchListPageView model={{ ...model, filterSheet: { ...sheetBase, open, view: 'card', kind: '', sortOptions: [], kindOptions: [] } }} />;
    },
  },
];

describe.each(pages)('$name — 필터 시트와 만들기 버튼', ({ pathname, fab, view }) => {
  function renderPage(open: boolean) {
    nav.pathname = pathname;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ShellFloatingSlot pathname={pathname} />{view(open)}</QueryClientProvider>);
  }

  it('시트가 열려 있는 동안에는 목록의 만들기 버튼(FAB)을 셸에 올리지 않는다', () => {
    renderPage(true);

    expect(screen.getByTestId('shell-fab')).toBeEmptyDOMElement();
  });

  it('대조군 — 시트가 닫혀 있으면 만들기 버튼이 그대로 있다', () => {
    renderPage(false);

    const link = screen.getByTestId('shell-fab').querySelector('a');
    expect(link?.textContent || link?.getAttribute('aria-label')).toContain(fab);
  });
});
