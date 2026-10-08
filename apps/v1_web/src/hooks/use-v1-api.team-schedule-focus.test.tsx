import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamScheduleDetailPageClient, TeamScheduleFormPageClient, TeamScheduleListPageClient } from '@/components/team-schedules/team-schedules-client';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1AuthMe, V1TeamDetail, V1TeamScheduleDetail, V1TeamScheduleSummary } from '@/types/api';
import { useV1SetMyScheduleAttendance, useV1TeamSchedule, useV1TeamSchedules, useV1UpdateTeamSchedule } from './use-v1-api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/schedules', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
const api = 'http://localhost/api/v1';
const teamId = 'team-1';
const scheduleId = 'schedule-1';
const team: V1TeamDetail = {
  teamId, name: '일정 동기화 팀', status: 'active', visibility: 'public',
  sport: { sportId: 'futsal', name: '풋살' }, region: null,
  membersVisibilityEnabled: true, canViewMembers: true,
  profile: { logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
    activitySummary: null, skillLevelText: null, joinPolicy: 'approval_required', memberGoalCount: 10 },
  owner: { userId: 'user-1', displayName: '팀장', profileImageUrl: null }, membersPreview: [], memberCount: 1,
  managerCount: 0, trust: { trustState: 'sample', score: null },
  viewer: { role: 'owner', membershipId: 'membership-1', joinState: 'active', canRequestJoin: false, disabledReason: null, manageRoute: null },
};
const me: V1AuthMe = { user: { id: 'user-1', email: null, onboardingStatus: 'completed' }, profile: { displayName: '팀장' } };
let serverTitle = '이전 훈련';
let serverGoing = false;
let serverVersion = 0;
let failure: 503 | 404 | null = null;
let visibility: DocumentVisibilityState = 'visible';
let lastUpdate: unknown;
const reads: string[] = [];
const clients: ReturnType<typeof createV1QueryClient>[] = [];
function summary(): V1TeamScheduleSummary {
  return { id: scheduleId, title: serverTitle, type: 'TRAINING', startAt: '2026-11-15T09:00:00Z',
    endAt: '2026-11-15T11:00:00Z', timezone: 'Asia/Seoul', capacity: 10, rsvpDeadlineAt: null,
    visibility: 'TEAM', state: 'SCHEDULED', version: serverVersion, teamMatchId: null, linkedMatch: null,
    matchConfirmed: null, goingCount: serverGoing ? 1 : 0, waitlistedCount: 0 };
}
function detail(): V1TeamScheduleDetail {
  return { ...summary(), cancelReason: null, cancelledAt: null, guestRecruitment: null,
    myAttendance: { status: serverGoing ? 'GOING' : 'NOT_GOING', version: serverGoing ? 1 : 0, waitlistPosition: null },
    attendees: [{ userId: 'user-1', nickname: '팀장', profileImageUrl: null,
      status: serverGoing ? 'GOING' : 'NOT_GOING', waitlistPosition: null }] };
}
function readFailure() {
  return HttpResponse.json({ status: 'error', statusCode: failure,
    code: failure === 404 ? 'NOT_FOUND_OR_ARCHIVED' : 'SERVICE_UNAVAILABLE', message: '일정을 조회할 수 없어요.' }, { status: failure ?? 503 });
}
const server = setupServer(
  http.get(`${api}/teams/${teamId}`, () => HttpResponse.json({ status: 'success', data: team })),
  http.get(`${api}/auth/me`, () => HttpResponse.json({ status: 'success', data: me })),
  http.get(`${api}/teams/${teamId}/schedules`, ({ request }) => {
    reads.push(request.url);
    return failure ? readFailure() : HttpResponse.json({ status: 'success', data: { items: [summary()], nextCursor: null } });
  }),
  http.get(`${api}/teams/${teamId}/schedules/${scheduleId}`, ({ request }) => {
    reads.push(request.url);
    return failure ? readFailure() : HttpResponse.json({ status: 'success', data: detail() });
  }),
  http.patch(`${api}/teams/${teamId}/schedules/${scheduleId}`, async ({ request }) => {
    const body: unknown = await request.json();
    lastUpdate = body;
    if (typeof body !== 'object' || body === null || !('title' in body) || typeof body.title !== 'string'
      || !('expectedVersion' in body) || !request.headers.get('Idempotency-Key')) return new HttpResponse(null, { status: 400 });
    if (body.expectedVersion !== serverVersion) return HttpResponse.json({ status: 'error', statusCode: 409,
      code: 'VERSION_CONFLICT', message: '다른 변경 사항이 있어요.' }, { status: 409 });
    serverTitle = body.title;
    serverVersion += 1;
    return HttpResponse.json({ status: 'success', data: { ...summary(), teamId, replayed: false } });
  }),
  http.put(`${api}/teams/${teamId}/schedules/${scheduleId}/attendance/me`, async ({ request }) => {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('status' in body) || body.status !== 'GOING'
      || !('expectedVersion' in body) || body.expectedVersion !== 0 || !request.headers.get('Idempotency-Key')) return new HttpResponse(null, { status: 400 });
    serverGoing = true;
    return HttpResponse.json({ status: 'success', data: { status: 'GOING', version: 1, waitlistPosition: null,
      counts: { going: 1, maybe: 0, notGoing: 0, waitlisted: 0 }, replayed: false } });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
function createTab(staleTime = Infinity) {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime, retry: false } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
async function switchVisibility(next: DocumentVisibilityState) {
  visibility = next;
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  serverTitle = '이전 훈련'; serverGoing = false; serverVersion = 0; failure = null; lastUpdate = undefined;
  reads.length = 0; visibility = 'visible';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  focusManager.setFocused(undefined);
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach((client) => client.clear()); server.resetHandlers();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe.each([{ cache: 'fresh', staleTime: Infinity }, { cache: 'stale', staleTime: 0 }])('schedule tab return with $cache cache', ({ staleTime }) => {
  it('refreshes saved title and RSVP in actual detail and filtered calendar without losing navigation', async () => {
    const actor = createTab(staleTime);
    const mutations = renderHook(() => ({ update: useV1UpdateTeamSchedule(teamId, scheduleId),
      rsvp: useV1SetMyScheduleAttendance(teamId, scheduleId), list: useV1TeamSchedules(teamId),
      detail: useV1TeamSchedule(teamId, scheduleId) }), { wrapper: actor.wrapper });
    const detailTab = createTab(staleTime);
    const calendarTab = createTab(staleTime);
    const detailUi = within(render(<TeamScheduleDetailPageClient teamId={teamId} scheduleId={scheduleId} />, { wrapper: detailTab.wrapper }).container);
    const calendarUi = within(render(<TeamScheduleListPageClient teamId={teamId} />, { wrapper: calendarTab.wrapper }).container);
    await waitFor(() => expect(detailUi.getByRole('heading', { name: '이전 훈련' })).toBeVisible());
    fireEvent.click(calendarUi.getByRole('tab', { name: '캘린더' }));
    fireEvent.click(calendarUi.getByRole('button', { name: '다음 달' }));
    fireEvent.click(calendarUi.getByRole('button', { name: '훈련' }));
    fireEvent.click(calendarUi.getByRole('button', { name: '예정' }));
    await waitFor(() => expect(calendarUi.getByText('이전 훈련')).toBeVisible());
    fireEvent.click(calendarUi.getByRole('button', { name: '15일, 일정 1건' }));
    await waitFor(() => expect(clients.every((client) => client.isFetching() === 0)).toBe(true));
    await switchVisibility('hidden');
    await act(async () => {
      await mutations.result.current.update.mutateAsync({ title: '새로운 훈련', expectedVersion: 0 });
      await mutations.result.current.rsvp.mutateAsync({ status: 'GOING', expectedVersion: 0 });
    });
    // Local mutation invalidation works, while the other clients still hold their old snapshots.
    await waitFor(() => expect(mutations.result.current.detail.data?.goingCount).toBe(1));
    await waitFor(() => expect(actor.client.isFetching()).toBe(0));
    expect(mutations.result.current.list.data?.items[0]?.title).toBe('새로운 훈련');
    expect(detailUi.getByRole('heading', { name: '이전 훈련' })).toBeVisible();
    expect(calendarUi.getByText('이전 훈련')).toBeVisible();
    reads.length = 0;
    await switchVisibility('visible');
    await waitFor(() => {
      expect(detailUi.getByRole('heading', { name: '새로운 훈련' })).toBeVisible();
      expect(detailUi.getByText('정원 1/10명')).toBeVisible();
      expect(detailUi.getByRole('button', { name: '참석 1' })).toBeVisible();
      expect(calendarUi.getByText('새로운 훈련')).toBeVisible();
    });
    expect(calendarUi.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    expect(calendarUi.getByRole('button', { name: '15일, 일정 1건' })).toHaveAttribute('aria-pressed', 'true');
    expect(calendarUi.getByText('2026년 11월')).toBeVisible();
    const listReads = reads.map((url) => new URL(url)).filter((url) => url.pathname.endsWith('/schedules'));
    expect(listReads).toHaveLength(1);
    expect(Object.fromEntries(listReads[0].searchParams)).toEqual({ limit: '100', type: 'TRAINING', state: 'SCHEDULED' });
    expect(reads.filter((url) => url.endsWith(`/${scheduleId}`))).toHaveLength(1);
  });
});

describe('schedule focus guards and real failure lifecycle', () => {
  it('keeps edit focus defaults, the unsaved draft and its original concurrency version', async () => {
    const tab = createTab();
    const ui = within(render(<TeamScheduleFormPageClient teamId={teamId} scheduleId={scheduleId} />, { wrapper: tab.wrapper }).container);
    await waitFor(() => expect(ui.getByRole('textbox', { name: '제목' })).toHaveValue('이전 훈련'));
    fireEvent.change(ui.getByRole('textbox', { name: '제목' }), { target: { value: '저장 전 초안' } });
    await switchVisibility('hidden'); serverTitle = '다른 탭 제목'; serverVersion = 1; failure = 503; reads.length = 0;
    await switchVisibility('visible');
    await waitFor(() => expect(tab.client.isFetching()).toBe(0));
    expect(reads).toEqual([]);
    expect(ui.getByRole('textbox', { name: '제목' })).toHaveValue('저장 전 초안');
    failure = null;
    fireEvent.click(ui.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(lastUpdate).toMatchObject({ title: '저장 전 초안', expectedVersion: 0 }));
    await waitFor(() => expect(tab.client.isFetching()).toBe(0));
    expect(ui.getByRole('textbox', { name: '제목' })).toHaveValue('저장 전 초안');
  });

  it('keeps disabled and missing-ID schedule queries idle even with focus opt-in', async () => {
    const { result } = renderHook(() => [useV1TeamSchedules('', undefined, { refetchOnWindowFocus: 'always' }),
      useV1TeamSchedule(teamId, '', { refetchOnWindowFocus: 'always' }),
      useV1TeamSchedules(teamId, undefined, { enabled: false, refetchOnWindowFocus: 'always' }),
      useV1TeamSchedule(teamId, scheduleId, { enabled: false, refetchOnWindowFocus: 'always' })], { wrapper: createTab().wrapper });
    await switchVisibility('hidden'); await switchVisibility('visible');
    expect(result.current.every((query) => query.fetchStatus === 'idle' && query.data === undefined)).toBe(true);
    expect(reads).toEqual([]);
  });

  it.each(['list', 'detail'] as const)('shows and retries a %s focus failure despite a cached schedule', async (surface) => {
    const tab = createTab();
    const ui = within(render(surface === 'list' ? <TeamScheduleListPageClient teamId={teamId} />
      : <TeamScheduleDetailPageClient teamId={teamId} scheduleId={scheduleId} />, { wrapper: tab.wrapper }).container);
    await waitFor(() => expect(ui.getAllByText('이전 훈련').length).toBeGreaterThan(0));
    await waitFor(() => expect(tab.client.isFetching()).toBe(0));
    await switchVisibility('hidden'); failure = 503;
    await switchVisibility('visible');
    await waitFor(() => expect(ui.getByRole('alert')).toHaveTextContent('일정을 불러오지 못했어요'));
    failure = null; serverTitle = '복구 훈련';
    fireEvent.click(ui.getByRole('button', { name: '다시 시도하기' }));
    await waitFor(() => { expect(ui.queryByRole('alert')).not.toBeInTheDocument(); expect(ui.getAllByText('복구 훈련').length).toBeGreaterThan(0); });
  });

  it('exposes a cached detail access revocation as the existing 404 permission exit', async () => {
    const tab = createTab();
    const ui = within(render(<TeamScheduleDetailPageClient teamId={teamId} scheduleId={scheduleId} />, { wrapper: tab.wrapper }).container);
    await waitFor(() => expect(ui.getByRole('heading', { name: '이전 훈련' })).toBeVisible());
    await waitFor(() => expect(tab.client.isFetching()).toBe(0));
    await switchVisibility('hidden'); failure = 404;
    await switchVisibility('visible');
    await waitFor(() => expect(ui.getByRole('alert')).toHaveTextContent('볼 수 없는 일정이에요'));
    expect(ui.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
    expect(ui.getByRole('link', { name: '팀 상세로 돌아가기' })).toHaveAttribute('href', `/teams/${teamId}`);
  });
});
