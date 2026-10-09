import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
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
let teamFailure: 503 | null = null;
let teamReads = 0;
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
  };
}

const server = setupServer(
  http.get(`${api}/teams/${teamId}`, () => {
    teamReads += 1;
    return teamFailure
      ? HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.' }, { status: 503 })
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
  introduction = '처음 팀 소개예요'; teamFailure = null; teamReads = 0; visibility = 'visible';
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
  it('keeps the loaded team on screen and recovers on the next return', async () => {
    mountTab(0);
    await screen.findAllByText('처음 팀 소개예요');
    teamFailure = 503; teamReads = 0;
    await leaveAndReturn('focus');
    await waitFor(() => expect(teamReads).toBeGreaterThan(0));
    expect(screen.getAllByText('처음 팀 소개예요').length).toBeGreaterThan(0);
    teamFailure = null; introduction = '복구된 팀 소개예요';
    await leaveAndReturn('focus');
    await screen.findAllByText('복구된 팀 소개예요');
  });
});
