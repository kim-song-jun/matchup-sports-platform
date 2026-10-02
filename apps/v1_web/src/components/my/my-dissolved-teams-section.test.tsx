/**
 * 마이 > 팀 > 해체한 팀(Task 180 H3 결정 "30일 안 팀장 복구, 그 뒤 운영팀 문의") — 실제 훅이 MSW 상태형
 * 서버와 주고받는다. 복구 가능 여부는 서버 `canRestore` 를 따르고, 목록을 받은 뒤 경계를 넘긴 경우
 * 서버의 409 를 받아 문의 안내로 바뀌는지 본다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1TeamDissolutionMswHandlers, dissolvedTeamItem } from '@/test/msw/team-dissolution-handlers';
import { MyTeamsPageClient } from './my-api-clients';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
  usePathname: () => '/my/teams',
}));

const IN_WINDOW = dissolvedTeamItem({ teamId: 'team-recent', name: '망원 새벽 FC' });
const EXPIRED = dissolvedTeamItem({
  teamId: 'team-old',
  name: '성산 주말 풋살',
  dissolvedAt: '2026-08-01T03:00:00.000Z',
  canRestore: false,
});
const OPS_ARCHIVED = dissolvedTeamItem({ teamId: 'team-ops', name: '합정 야간 FC', dissolvedAt: '2026-09-28T03:00:00.000Z', archivedBy: 'admin' });

let server: ReturnType<typeof setupServer>;
let mock: ReturnType<typeof createV1TeamDissolutionMswHandlers>;

function start(dissolvedTeams: typeof IN_WINDOW[]) {
  mock = createV1TeamDissolutionMswHandlers({ dissolvedTeams });
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/me/teams', () => HttpResponse.json({ status: 'success', data: { items: [] }, timestamp: '2026-10-01T00:00:00.000Z' })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks();
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyTeamsPageClient />
    </QueryClientProvider>,
  );
}

async function teamCard(name: string) {
  const title = await screen.findByText(name);
  return within(title.closest('li') as HTMLElement);
}

function restoreCalls() {
  return mock.state.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/restore')).map((r) => r.path);
}

describe('내 팀 — 해체한 팀과 30일 복구', () => {
  it('30일 안의 팀은 기한을 알리고, 확인 뒤 복구해 그 팀으로 간다', async () => {
    start([IN_WINDOW]);
    renderPage();

    expect(await screen.findByRole('heading', { name: '해체한 팀' })).toBeInTheDocument();
    const card = await teamCard('망원 새벽 FC');
    expect(card.getByText('10/20 (화) 15:00까지 복구할 수 있어요.')).toBeInTheDocument();
    expect(card.queryByRole('link', { name: '운영팀에 문의하기' })).not.toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: '망원 새벽 FC 복구' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '복구' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/teams/team-recent?from=%2Fmy%2Fteams'));
    expect(restoreCalls()).toEqual(['/api/v1/teams/team-recent/restore']);
  });

  it('30일이 지난 팀은 복구 버튼 대신 운영팀 문의로 안내한다', async () => {
    start([EXPIRED]);
    renderPage();

    const card = await teamCard('성산 주말 풋살');
    expect(card.getByText('복구 기간(30일)이 지났어요. 다시 열어야 하면 운영팀에 문의해 주세요.')).toBeInTheDocument();
    expect(card.getByRole('link', { name: '운영팀에 문의하기' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(card.queryByRole('button', { name: /복구/ })).not.toBeInTheDocument();
  });

  it('목록을 받은 뒤 기한이 지나면 서버 거절 이유를 보여 주고 문의 안내로 바뀐다', async () => {
    start([IN_WINDOW]);
    renderPage();

    const card = await teamCard('망원 새벽 FC');
    mock.state.dissolvedTeams = [{ ...IN_WINDOW, canRestore: false }];
    fireEvent.click(card.getByRole('button', { name: '망원 새벽 FC 복구' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '복구' }));

    expect(await card.findByRole('alert')).toHaveTextContent('해체하고 30일이 지나 직접 복구할 수 없어요');
    expect(await card.findByRole('link', { name: '운영팀에 문의하기' })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('운영팀이 보관한 팀은 기간 안이어도 복구 버튼 대신 운영팀 문의로 안내하고, 팀장이 해체한 팀은 그대로 복구할 수 있다', async () => {
    start([OPS_ARCHIVED, IN_WINDOW]);
    renderPage();

    const ops = await teamCard('합정 야간 FC');
    expect(ops.getByText(/9월 28일 \(월\) 운영팀 보관/)).toBeInTheDocument();
    expect(ops.getByText('운영팀이 보관한 팀이라 직접 복구할 수 없어요. 다시 열어야 하면 운영팀에 문의해 주세요.')).toBeInTheDocument();
    expect(ops.getByRole('link', { name: '운영팀에 문의하기' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(ops.queryByRole('button', { name: /복구/ })).not.toBeInTheDocument();

    const own = await teamCard('망원 새벽 FC');
    expect(own.getByRole('button', { name: '망원 새벽 FC 복구' })).toBeInTheDocument();
  });

  it('목록을 받은 뒤 운영팀이 보관했으면 403 이유를 보여 주고 문의 안내로 바뀐다', async () => {
    start([IN_WINDOW]);
    renderPage();

    const card = await teamCard('망원 새벽 FC');
    mock.state.dissolvedTeams = [{ ...IN_WINDOW, archivedBy: 'admin', canRestore: false, restoreDeadlineAt: null }];
    fireEvent.click(card.getByRole('button', { name: '망원 새벽 FC 복구' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '복구' }));

    expect(await card.findByRole('alert')).toHaveTextContent('운영팀이 보관한 팀은 직접 복구할 수 없어요');
    expect(await card.findByText('운영팀이 보관한 팀이라 직접 복구할 수 없어요. 다시 열어야 하면 운영팀에 문의해 주세요.')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('해체한 팀이 없으면 섹션을 그리지 않는다', async () => {
    start([]);
    renderPage();

    expect(await screen.findByText('소속 팀이 없어요')).toBeInTheDocument();
    await waitFor(() => expect(mock.state.requests.some((r) => r.path === '/api/v1/me/dissolved-teams')).toBe(true));
    expect(screen.queryByRole('heading', { name: '해체한 팀' })).not.toBeInTheDocument();
  });
});
