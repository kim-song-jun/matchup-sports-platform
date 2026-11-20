/** /teams 맨 위 "내 팀" 줄: 로그인했고 팀이 있을 때만, 검색·필터가 없을 때만 보인다. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams('') }));

const hookMocks = vi.hoisted(() => ({
  useV1TeamPages: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1Profile: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1RecentSearches: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecordSearch: vi.fn(() => ({ mutate: vi.fn() })),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { TeamListPageClient } from './teams-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const myTeam = {
  teamId: 'my-1', membershipId: 'm-1', name: '내가 속한 FC', role: 'owner', status: 'active', logoUrl: null,
  sport: { sportId: 's1', name: '풋살' }, region: null, memberCount: 8,
};

describe('TeamListPageClient — 내 팀 줄', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 0 } }] },
      isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: [], isPending: false });
    hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [] }, isPending: false, isError: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: [myTeam] });
  });

  it('내 팀이 있으면 맨 위에 팀 이름·종목·역할이 보이고 상세로 이어진다', () => {
    render(<TeamListPageClient />);
    const link = screen.getByRole('link', { name: /내가 속한 FC/ });
    expect(link.getAttribute('href')).toBe('/teams/my-1');
    expect(link.textContent).toContain('풋살 · 팀장');
    expect(hookMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: true });
  });

  it('내 팀 칩은 목록 카드와 같은 로고 크기(54px)이고, 이름·종목 줄에 한 줄 말줄임을 덮어쓰는 인라인 display 가 없다', () => {
    render(<TeamListPageClient />);
    const link = screen.getByRole('link', { name: /내가 속한 FC/ });

    // 로고는 목록 카드와 같은 lg(54px) — md(40px)라 칩이 작아 보였다.
    const avatar = link.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(avatar.style.width).toBe('54px');
    expect(avatar.style.height).toBe('54px');
    // 인라인 display:block 이 line-clamp-1(display:-webkit-box)을 덮어쓰면 긴 이름이 3줄로 늘어난다.
    const lines = link.querySelectorAll('.line-clamp-1');
    expect(lines).toHaveLength(2);
    lines.forEach((line) => expect((line as HTMLElement).style.display).toBe(''));
  });

  /**
   * 크기의 단일 소스는 `--tm-team-card-height` 하나다 — 목록 카드(.tm-team-card-compact)와 내 팀 칩이
   * 같은 변수를 min-height 로 쓰므로 한쪽만 바뀌어 높이가 어긋나지 않는다.
   */
  it('내 팀 칩과 목록 카드는 같은 높이 변수를 쓴다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

    expect(rule('.tm-team-list')).toMatch(/--tm-team-card-height:\s*116px/);
    expect(rule('.tm-team-card-compact')).toMatch(/min-height:\s*var\(--tm-team-card-height\)/);
    expect(rule('.tm-my-team-chip')).toMatch(/min-height:\s*var\(--tm-team-card-height\)/);
    expect(rule('.tm-my-team-chip')).toMatch(/box-sizing:\s*border-box/);
    // 예전 220px 폭 상한은 목록 카드(350px)보다 작게 만들던 원인이라 두지 않는다.
    expect(rule('.tm-my-team-chip')).not.toMatch(/max-width/);
  });

  it('모바일에서는 다음 카드가 살짝 보이게 48px 좁고, 팀이 하나뿐이면 목록 카드와 같은 전체 폭이다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const chip = css.match(/\n\.tm-my-team-chip\s*\{([^}]*)\}/)?.[1] ?? '';
    const only = css.match(/\n\.tm-my-team-chip:only-child\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(chip).toMatch(/flex:\s*0\s+0\s+calc\(100%\s*-\s*48px\)/);
    expect(only).toMatch(/flex-basis:\s*100%/);
  });

  it('태블릿·데스크톱에서는 목록 그리드 한 열과 같은 폭·간격이다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/desktop/teams.css'), 'utf8');

    // 2열(768~1439, 간격 16px) / 3열(≥1440, 간격 20px) — .tm-team-card-stack 과 같은 값이다.
    expect(css).toMatch(/\.tm-my-team-chip:only-child\s*\{\s*flex:\s*0\s+0\s+calc\(\(100%\s*-\s*16px\)\s*\/\s*2\)/);
    expect(css).toMatch(/\.tm-my-team-chip:only-child\s*\{\s*flex:\s*0\s+0\s+calc\(\(100%\s*-\s*40px\)\s*\/\s*3\)/);
    expect(css).toMatch(/\.tm-my-team-row\s*\{\s*gap:\s*20px/);
  });

  it('로그인하지 않았으면 내 팀을 묻지도 보이지도 않는다', () => {
    hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: undefined });
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
    expect(hookMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: false });
  });

  it.each(['q=마포', 'sort=latest', 'sportId=s1&genderRule=남'])('검색·필터(%s) 중에는 내 팀 줄을 걷는다', (search) => {
    searchParamsMock.value = new URLSearchParams(search);
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
  });

  it('속한 팀이 없으면 줄 자체를 그리지 않는다', () => {
    hookMocks.useV1MyTeams.mockReturnValue({ data: [] });
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
  });
});
