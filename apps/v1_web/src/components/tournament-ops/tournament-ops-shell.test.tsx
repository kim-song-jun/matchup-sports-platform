import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsShell } from './tournament-ops-shell';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: { value: '/tournament-ops/tournaments/t-1/operations' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.value,
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => HttpResponse.json({ status: 'success', timestamp: 't', data });
const requests: string[] = [];

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ request }) => {
    requests.push(new URL(request.url).search);
    return ok({
      items: [
        { fixtureId: 'f1', gameId: 'g1', revisionId: null },
        { fixtureId: 'f2', gameId: 'g2', revisionId: null },
        { fixtureId: 'f3', gameId: 'g3', revisionId: 'r3' },
      ],
      nextCursor: null,
      watermark: 'w',
      liveWarnings: [],
    });
  }),
  http.get('*/api/v1/tournament-ops/tournaments/:id/fields', () => ok({ items: [{ id: 'fld1', name: '구장 1', tournamentId: 't-1', scopeKey: 'fld1', sortOrder: 1, active: true, version: 1 }] })),
  http.get('*/api/v1/tournaments/:id', () =>
    ok({ id: 't-1', title: '겨울 풋살컵', kind: 'regular_tournament', fixtures: [{ id: 'fx-1', fixtureNumber: 3, fieldId: 'fld1' }], leagueFixtures: [] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  pathnameMock.value = '/tournament-ops/tournaments/t-1/operations';
  requests.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

function renderShell(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

type Props = Partial<React.ComponentProps<typeof TournamentOpsShell>>;
function shell(props: Props = {}) {
  return (
    <TournamentOpsShell tournamentId="t-1" role="PLATFORM_OPS" origin="admin" tournamentKind="regular_tournament" {...props}>
      <div data-testid="content">content</div>
    </TournamentOpsShell>
  );
}

const sidebar = () => screen.getByRole('complementary', { name: '대회 운영 사이드바' });
const menuLinks = (root: HTMLElement) => within(within(root).getByRole('navigation', { name: '주 메뉴' })).getAllByRole('link');

describe('TournamentOpsShell 메뉴', () => {
  it('메뉴는 운영 보드·결과·스태프·구장·영상 넷이고 옛 이름은 없다', async () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    renderShell(shell());

    const links = menuLinks(sidebar());
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/admin/live/t-1/operations',
      '/admin/live/t-1/results',
      '/admin/live/t-1/staff',
      '/admin/live/t-1/videos',
    ]);
    expect(links.map((l) => l.textContent)).toEqual([expect.stringMatching(/^운영 보드/), expect.stringMatching(/^결과/), '스태프·구장', '영상']);
    for (const old of ['결과 검토', '결과 정정', '경기 영상', '대회 관리', '스태프']) {
      expect(screen.queryByRole('link', { name: old })).not.toBeInTheDocument();
    }
  });

  it('결과 메뉴에 확정 대기 숫자가 붙고, 현재 화면은 옅은 배경으로 알린다', async () => {
    pathnameMock.value = '/admin/live/t-1/results';
    renderShell(shell());

    expect(await within(sidebar()).findByLabelText('확정 대기 2')).toHaveTextContent('2');
    const current = within(sidebar()).getByRole('link', { name: /^결과/ });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(requests[0]).toContain('status=ENDED');
  });

  it('지원의 결과 메뉴는 잠기고 이유가 보이며, 결과 목록은 읽지 않는다', async () => {
    renderShell(shell({ role: 'SUPPORT_READONLY', origin: 'home' }));

    const locked = within(sidebar()).getByText('결과').closest('button');
    expect(locked).toBeDisabled();
    expect(locked).toHaveAttribute('title', '결과 확정·고치기는 대회 운영자·플랫폼 운영자만 할 수 있어요.');
    expect(within(sidebar()).getByText('결과 확정·고치기는 대회 운영자·플랫폼 운영자만 할 수 있어요.')).toBeInTheDocument();
    expect(within(sidebar()).queryByLabelText(/확정 대기/)).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(0);
  });

  it('다른 대회 고르기는 플랫폼 운영자의 어드민 표면에만 있다', () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    const { unmount } = renderShell(shell());
    expect(within(sidebar()).getByRole('link', { name: '다른 대회 고르기' })).toHaveAttribute('href', '/admin/ops/tournaments?pick=1');
    unmount();

    pathnameMock.value = '/tournament-ops/tournaments/t-1/operations';
    const staffSurface = renderShell(shell({ origin: 'staff' }));
    expect(screen.queryByRole('link', { name: '다른 대회 고르기' })).not.toBeInTheDocument();
    staffSurface.unmount();

    pathnameMock.value = '/admin/live/t-1/operations';
    renderShell(shell({ role: 'TOURNAMENT_DIRECTOR', origin: 'home' }));
    expect(screen.queryByRole('link', { name: '다른 대회 고르기' })).not.toBeInTheDocument();
  });
});

describe('TournamentOpsShell 돌아가기 줄', () => {
  it('데스크톱 사이드바 맨 위에 있고 본문 위에는 같은 링크가 따로 없다', () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    renderShell(shell());

    const top = within(sidebar()).getByRole('link', { name: '대회 관리로 돌아가기' });
    expect(top).toHaveAttribute('href', '/admin/tournaments/t-1');
    const order = [...sidebar().querySelectorAll('a')];
    expect(order[0]).toBe(top);
    expect(screen.getByTestId('content').closest('main')?.querySelector('a[href="/admin/tournaments/t-1"]')).toBeNull();
  });

  it('폰에서는 메뉴를 열지 않아도 돌아가기 링크가 막대 아래 고정 줄에 보인다', async () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    renderShell(shell());

    const links = screen.getAllByRole('link', { name: '대회 관리로 돌아가기' });
    const phoneLink = links.find((l) => !sidebar().contains(l));
    expect(phoneLink).toBeDefined();
    expect(phoneLink?.closest('main')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '대회 운영 메뉴' })).not.toBeInTheDocument();
  });

  it('리그는 리그 관리로, 종류를 모르는 동안은 어드민 링크를 숨긴다', () => {
    pathnameMock.value = '/admin/live/league-1/operations';
    const { unmount } = renderShell(shell({ tournamentId: 'league-1', tournamentKind: 'regular_league' }));
    for (const link of screen.getAllByRole('link', { name: '리그 관리로 돌아가기' })) expect(link).toHaveAttribute('href', '/admin/league-matches/league-1');
    unmount();

    renderShell(shell({ tournamentId: 'league-1', tournamentKind: undefined }));
    expect(screen.queryByRole('link', { name: /돌아가기/ })).not.toBeInTheDocument();
  });

  it('경기 콘솔에서는 운영 보드로 돌아가고, 구장과 번호를 옆에 알린다', async () => {
    pathnameMock.value = '/admin/live/t-1/fixtures/fx-1/operate';
    renderShell(shell());

    for (const link of screen.getAllByRole('link', { name: '운영 보드로 돌아가기' })) expect(link).toHaveAttribute('href', '/admin/live/t-1/operations');
    await waitFor(() => expect(screen.getAllByText('구장 1 · 3번 경기').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: '서비스로 돌아가기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 목록으로 돌아가기' })).not.toBeInTheDocument();
  });

  it('담당 경기에서 온 사람은 담당 경기 목록으로 돌아간다', () => {
    renderShell(shell({ role: 'PLATFORM_OPS', origin: 'staff' }));
    for (const link of screen.getAllByRole('link', { name: '담당 경기 목록으로 돌아가기' })) expect(link).toHaveAttribute('href', '/my/tournament-staff/t-1');
  });

  it('시트 배경이 앱 틀에 갇히지 않도록 전체 화면 표식을 단다', () => {
    const { container } = renderShell(shell());
    expect(container.firstElementChild).toHaveClass('tm-fullbleed-sheet-host');
  });
});

describe('TournamentOpsShell 폰 메뉴 시트', () => {
  it('☰ 를 누르면 아래에서 올라오는 시트에 메뉴 넷이 있고, 다시 누르면 닫힌다', async () => {
    pathnameMock.value = '/admin/live/t-1/operations';
    const user = userEvent.setup();
    renderShell(shell());

    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const dialog = await screen.findByRole('dialog', { name: '대회 운영 메뉴' });
    expect(menuLinks(dialog).map((l) => l.getAttribute('href'))).toEqual([
      '/admin/live/t-1/operations',
      '/admin/live/t-1/results',
      '/admin/live/t-1/staff',
      '/admin/live/t-1/videos',
      '/admin/ops/tournaments?pick=1',
    ]);
    expect(within(dialog).getByText('플랫폼 운영자')).toBeInTheDocument();
    const closeToggle = screen.getByRole('button', { name: '메뉴 닫기' });
    expect(closeToggle).toHaveAttribute('aria-expanded', 'true');
    // 막대와 돌아가기 줄은 시트 밖에 그대로 있다.
    expect(dialog.contains(closeToggle)).toBe(false);
    expect(screen.getAllByRole('link', { name: '대회 관리로 돌아가기' }).some((l) => !dialog.contains(l) && !sidebar().contains(l))).toBe(true);

    await user.click(closeToggle);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대회 운영 메뉴' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('시트의 닫기 버튼과 ESC 로 닫는다', async () => {
    const user = userEvent.setup();
    renderShell(shell());

    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
    const dialog = await screen.findByRole('dialog', { name: '대회 운영 메뉴' });
    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대회 운영 메뉴' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
    await screen.findByRole('dialog', { name: '대회 운영 메뉴' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '대회 운영 메뉴' })).not.toBeInTheDocument());
  });

  it('막대 제목은 지금 화면 이름이고, 경기 콘솔에서는 「경기 콘솔」이다', () => {
    pathnameMock.value = '/admin/live/t-1/results';
    const { unmount } = renderShell(shell());
    expect(screen.getByRole('banner')).toHaveTextContent('결과');
    unmount();

    pathnameMock.value = '/admin/live/t-1/fixtures/fx-1/operate';
    renderShell(shell());
    expect(screen.getByRole('banner')).toHaveTextContent('경기 콘솔');
  });
});

describe('TournamentOpsShell 한쪽 색 띠 금지', () => {
  it('어떤 요소에도 한쪽 테두리·inset 띠 클래스가 없다(메뉴를 연 상태 포함)', async () => {
    pathnameMock.value = '/admin/live/t-1/results';
    const user = userEvent.setup();
    const { container } = renderShell(shell());
    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const offenders = [...container.querySelectorAll('*'), ...document.body.querySelectorAll('*')]
      .map((el) => el.getAttribute('class') ?? '')
      .filter((cls) => /border-l|border-r-[2-9]|inset|before:/.test(cls));
    expect(offenders).toEqual([]);
  });
});

describe('TournamentOpsShell 대회 아바타 (Task 180 G13 F54)', () => {
  it('이름이 괄호로 시작해도 아바타는 첫 글자("Q")를 보여 준다', () => {
    const { container } = renderShell(shell({ tournamentTitle: '(QA0929) 마포 주말 리그' }));
    const avatars = [...container.querySelectorAll('span[aria-hidden="true"]')].filter((node) => node.children.length === 0);
    expect(avatars.some((node) => node.textContent === 'Q')).toBe(true);
    expect(avatars.some((node) => node.textContent === '(')).toBe(false);
  });
});
