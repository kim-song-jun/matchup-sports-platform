import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1AuthMe, V1TeamDetail } from '@/types/api';
import { TeamDetailPageClient } from './teams-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const api = 'http://localhost/api/v1';
const teamId = 'team-1';
const me: V1AuthMe = { user: { id: 'user-1', email: null, onboardingStatus: 'completed' }, profile: { displayName: '팀장' } };
let introduction = '처음 팀 소개예요';
let teamFailure: 401 | 403 | 404 | 503 | null = null;
let teamReads = 0;
let dissolved = false;
let visibility: DocumentVisibilityState = 'visible';

function team(): V1TeamDetail {
  return {
    teamId, name: '탭 동기화 팀', status: 'active', visibility: 'public',
    sport: { sportId: 'futsal', name: '풋살' }, region: null,
    membersVisibilityEnabled: true, canViewMembers: true,
    profile: { logoUrl: null, coverImageUrl: null, introduction, activityAreaText: null,
      activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
      activitySummary: null, skillLevelText: null, joinPolicy: 'approval_required', memberGoalCount: 10 },
    owner: { userId: 'user-1', displayName: '팀장', profileImageUrl: null }, membersPreview: [], memberCount: 1,
    managerCount: 0, trust: { trustState: 'sample', score: null },
    viewer: { role: 'owner', membershipId: 'membership-1', joinState: 'active', canRequestJoin: false, disabledReason: null, manageRoute: null },
    dissolution: dissolved ? { dissolvedAt: '2026-10-12T00:00:00Z', archivedBy: 'owner', restoreDeadlineAt: '2026-11-11T00:00:00Z', canRestore: true } : null,
  };
}

const server = setupServer(
  http.get(`${api}/teams/${teamId}`, () => {
    teamReads += 1;
    return teamFailure
      ? HttpResponse.json({ status: 'error', statusCode: teamFailure, code: 'TEAM_READ_FAILED', message: '팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: teamFailure })
      : HttpResponse.json({ status: 'success', data: team() });
  }),
  http.get(`${api}/auth/me`, () => HttpResponse.json({ status: 'success', data: me })),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

function mountTab(staleTime: number) {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime, retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  render(<TeamDetailPageClient teamId={teamId} />, { wrapper });
  return client;
}
async function leaveAndReturn(event: 'visibilitychange' | 'focus') {
  if (event === 'visibilitychange') {
    visibility = 'hidden';
    await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
    visibility = 'visible';
    await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
  } else {
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
beforeEach(() => {
  introduction = '처음 팀 소개예요'; teamFailure = null; teamReads = 0; dissolved = false; visibility = 'visible';
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  focusManager.setFocused(undefined);
});
afterEach(() => {
  cleanup(); server.resetHandlers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe.each([{ cache: 'fresh', staleTime: Infinity }, { cache: 'stale', staleTime: 0 }])(
  'team detail tab return with $cache cache', ({ staleTime }) => {
    it.each(['visibilitychange', 'focus'] as const)('shows an introduction saved in another tab on %s', async (event) => {
      mountTab(staleTime);
      await screen.findAllByText('처음 팀 소개예요');
      introduction = '다른 탭에서 고친 팀 소개예요';
      await leaveAndReturn(event);
      await screen.findAllByText('다른 탭에서 고친 팀 소개예요');
      expect(screen.queryAllByText('처음 팀 소개예요')).toHaveLength(0);
    });
  },
);

describe('team detail background refetch failure', () => {
  it('shows the completed refetch error with cached content and recovers through one explicit retry GET', async () => {
    const client = mountTab(0);
    await screen.findAllByText('처음 팀 소개예요');
    teamFailure = 503; teamReads = 0;
    await leaveAndReturn('focus');
    // The request count alone does not prove the response finished or the error reached the consumer.
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    expect(screen.getAllByText('처음 팀 소개예요').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'))[0]).toBeVisible();
    const [retry] = screen.getAllByRole('button', { name: '다시 불러오기' });
    if (!retry) throw new Error('The completed refetch failure must offer a retry.');
    teamFailure = null; introduction = '복구된 팀 소개예요';
    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    server.use(http.get(`${api}/teams/${teamId}`, async () => {
      teamReads += 1;
      await responseReady;
      return HttpResponse.json({ status: 'success', data: team() });
    }));
    teamReads = 0;
    await act(async () => { fireEvent.click(retry); fireEvent.click(retry); });
    await waitFor(() => expect(teamReads).toBe(1));
    expect(screen.getAllByText('처음 팀 소개예요').length).toBeGreaterThan(0);
    await act(async () => { releaseResponse?.(); });
    await screen.findAllByText('복구된 팀 소개예요');
    expect(screen.queryAllByText('처음 팀 소개예요')).toHaveLength(0);
    expect(screen.queryAllByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toHaveLength(0);
    expect(teamReads).toBe(1);
  });

  it('preserves keyboard focus through a pending retry and repeated real failure', async () => {
    const user = userEvent.setup();
    const client = mountTab(0);
    await screen.findAllByText('처음 팀 소개예요');
    teamFailure = 503;
    await leaveAndReturn('focus');
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    const [retry] = screen.getAllByRole('button', { name: '다시 불러오기' });
    if (!retry) throw new Error('The completed refetch failure must offer a retry.');
    retry.focus();
    expect(retry).toHaveFocus();

    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    server.use(http.get(`${api}/teams/${teamId}`, async () => {
      teamReads += 1;
      await responseReady;
      return teamFailure
        ? HttpResponse.json({ status: 'error', statusCode: teamFailure, code: 'TEAM_READ_FAILED', message: '팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: teamFailure })
        : HttpResponse.json({ status: 'success', data: team() });
    }));
    teamReads = 0;
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])?.fetchStatus).toBe('fetching');
    });
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveTextContent('조회 중...');
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(teamReads).toBe(1);

    await act(async () => { releaseResponse?.(); });
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(retry).toBeEnabled();
    expect(retry).not.toHaveAttribute('aria-disabled');
    expect(retry).toHaveTextContent('다시 불러오기');
    expect(screen.getAllByText('처음 팀 소개예요').length).toBeGreaterThan(0);

    teamFailure = null;
    introduction = '키보드로 복구한 팀 소개예요';
    await user.keyboard(' ');
    await screen.findAllByText('키보드로 복구한 팀 소개예요');
    expect(screen.queryAllByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toHaveLength(0);
    expect(teamReads).toBe(2);
  });

  it('keeps the cached refresh error compact inside both actual team detail layouts', async () => {
    const client = mountTab(0);
    await screen.findAllByText('처음 팀 소개예요');
    teamFailure = 503;
    await leaveAndReturn('focus');
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });

    for (const layoutSelector of ['.tm-team-detail-desktop-main', '.tm-team-detail-body']) {
      const content = screen.getAllByText('처음 팀 소개예요').find((element) => element.closest(layoutSelector));
      const layout = content?.closest<HTMLElement>(layoutSelector);
      if (!layout) throw new Error(`The existing team introduction must remain inside ${layoutSelector}.`);
      const alert = within(layout).getByRole('alert');
      expect(alert).toHaveTextContent('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      expect(alert).not.toHaveClass('tm-empty-state');
      expect(alert).toHaveStyle({ padding: 'var(--spacing-4)' });
      expect(within(alert).getByRole('button', { name: '다시 불러오기' })).toBeEnabled();
    }
  });

  it.each([401, 403, 404] as const)('hides cached team content and owner actions after a completed %s refetch', async (status) => {
    const client = mountTab(0);
    await screen.findAllByText('처음 팀 소개예요');
    await screen.findAllByRole('link', { name: /^팀 정보 수정/ });
    teamFailure = status;
    await leaveAndReturn('focus');
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    expect(await screen.findByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeVisible();
    expect(screen.queryAllByText('처음 팀 소개예요')).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /^팀 정보 수정/ })).toHaveLength(0);
  });

  it('shows the actual first-load failure without rendering a cached or sample team', async () => {
    teamFailure = 503;
    mountTab(0);
    expect(await screen.findByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeVisible();
    expect(screen.queryAllByText('처음 팀 소개예요')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  });

  it('preserves the first-load error retry focus without cached data through repeated failure', async () => {
    const user = userEvent.setup();
    teamFailure = 503;
    const client = mountTab(0);
    await screen.findByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ data: undefined, status: 'error', fetchStatus: 'idle' });
    });
    const retry = screen.getByRole('button', { name: '다시 불러오기' });
    retry.focus();
    expect(retry).toHaveFocus();

    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    server.use(http.get(`${api}/teams/${teamId}`, async () => {
      teamReads += 1;
      await responseReady;
      return teamFailure
        ? HttpResponse.json({ status: 'error', statusCode: teamFailure, code: 'TEAM_READ_FAILED', message: '팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: teamFailure })
        : HttpResponse.json({ status: 'success', data: team() });
    }));
    teamReads = 0;
    await user.keyboard('{Enter}');
    try {
      await waitFor(() => {
        expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ data: undefined, status: 'pending', fetchStatus: 'fetching' });
      });
      expect(retry).toBeInTheDocument();
      expect(retry).toHaveFocus();
      expect(retry).toHaveAttribute('aria-disabled', 'true');
      expect(retry).toHaveTextContent('조회 중...');
      expect(screen.queryAllByText('처음 팀 소개예요')).toHaveLength(0);
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(teamReads).toBe(1);
    } finally {
      await act(async () => { releaseResponse?.(); });
    }
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ data: undefined, status: 'error', fetchStatus: 'idle' });
    });
    expect(retry).toBeInTheDocument();
    expect(retry).toHaveFocus();
    expect(retry).not.toHaveAttribute('aria-disabled');
    expect(retry).toHaveTextContent('다시 불러오기');
    expect(screen.getByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeVisible();

    teamFailure = null;
    introduction = '첫 로딩을 재시도해 복구한 팀 소개예요';
    await user.keyboard('{Enter}');
    await screen.findAllByText('첫 로딩을 재시도해 복구한 팀 소개예요');
    expect(screen.queryAllByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toHaveLength(0);
    expect(teamReads).toBe(2);
  });

  it('hides a cached dissolved team and its restore entry when a real refetch denies access', async () => {
    dissolved = true;
    const client = mountTab(0);
    await screen.findByRole('link', { name: '해체한 팀에서 복구하기' });
    teamFailure = 403;
    await act(async () => {
      await client.refetchQueries({ queryKey: [...v1Keys.team(teamId), 'detail'] });
    });
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    expect(await screen.findByText('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeVisible();
    expect(screen.queryByText('해체된 팀')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '해체한 팀에서 복구하기' })).not.toBeInTheDocument();
  });

  it('keeps a cached dissolved refresh error compact inside its actual content wrapper', async () => {
    dissolved = true;
    const client = mountTab(0);
    await screen.findByRole('link', { name: '해체한 팀에서 복구하기' });
    teamFailure = 503;
    await act(async () => {
      await client.refetchQueries({ queryKey: [...v1Keys.team(teamId), 'detail'] });
    });
    await waitFor(() => {
      expect(client.getQueryState([...v1Keys.team(teamId), 'detail'])).toMatchObject({ status: 'error', fetchStatus: 'idle' });
    });
    const layout = screen.getByRole('heading', { name: '탭 동기화 팀' }).closest<HTMLElement>('.tm-content-enter');
    if (!layout) throw new Error('The cached dissolved team must retain its actual content wrapper.');
    const alert = within(layout).getByRole('alert');
    expect(alert).toHaveTextContent('팀 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(alert).not.toHaveClass('tm-empty-state');
    expect(alert).toHaveStyle({ padding: 'var(--spacing-4)' });
    expect(within(alert).getByRole('button', { name: '다시 불러오기' })).toBeEnabled();
    expect(within(layout).getByRole('link', { name: '해체한 팀에서 복구하기' })).toBeVisible();
  });
});
