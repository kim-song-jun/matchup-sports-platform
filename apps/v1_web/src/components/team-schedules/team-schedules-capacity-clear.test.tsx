import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Patch } from '@/lib/api-client';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1TeamDetail, V1TeamScheduleDetail } from '@/types/api';
import { TeamScheduleFormPageClient } from './team-schedules-client';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/capacity-team/schedules/capacity-schedule/edit',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ ...navigation, prefetch: vi.fn() }),
}));

const TEAM_ID = 'capacity-team';
const SCHEDULE_ID = 'capacity-schedule';
const SCHEDULE_PATH = `/teams/${TEAM_ID}/schedules/${SCHEDULE_ID}`;
const NOW = '2026-10-08T03:00:00Z';
const team: V1TeamDetail = {
  teamId: TEAM_ID, name: '합성 정원 팀', status: 'active', visibility: 'public',
  sport: { sportId: 'sport-futsal', name: '풋살' }, region: { regionId: 'region-seoul', name: '서울', parentName: null },
  joinPolicy: 'approval_required', membersVisibilityEnabled: true, canViewMembers: true,
  profile: { logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
    activitySummary: null, skillLevelText: null, genderRule: '성별 무관', joinPolicy: 'approval_required', memberGoalCount: 20 },
  owner: { userId: 'fixture-owner', displayName: '합성 팀장', profileImageUrl: null },
  membersPreview: [], memberCount: 7, managerCount: 1, trust: { trustState: 'sample', score: null },
  viewer: { role: 'manager', membershipId: 'fixture-manager', joinState: 'active', canRequestJoin: false, disabledReason: null, manageRoute: null },
};
function initialSchedule(): V1TeamScheduleDetail {
  return { id: SCHEDULE_ID, title: '정원 해제 훈련', type: 'TRAINING',
    startAt: '2026-10-10T01:00:00Z', endAt: '2026-10-10T02:00:00Z', timezone: 'Asia/Seoul',
    capacity: 1, rsvpDeadlineAt: null, visibility: 'TEAM', state: 'SCHEDULED', version: 1,
    teamMatchId: null, linkedMatch: null, matchConfirmed: null, goingCount: 0, waitlistedCount: 0,
    cancelReason: null, cancelledAt: null, guestRecruitment: null, myAttendance: null, attendees: null };
}
let stored = initialSchedule();
let failPatch = false;
const patchBodies: unknown[] = [];
const createBodies: unknown[] = [];
const readCapacities: Array<number | null> = [];
const clients: QueryClient[] = [];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: NOW });
const server = setupServer(
  http.get(`*/api/v1/teams/${TEAM_ID}`, () => ok(team)),
  http.get(`*/api/v1${SCHEDULE_PATH}`, () => {
    readCapacities.push(stored.capacity);
    return ok(stored);
  }),
  http.patch(`*/api/v1${SCHEDULE_PATH}`, async ({ request }) => {
    // 생략을 null로 정규화하지 않는다. 실제 wire body의 명시적 필드만 저장한다.
    const body: unknown = await request.json();
    patchBodies.push(body);
    if (failPatch) return HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '정원을 저장하지 못했어요.' }, { status: 503 });
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return new HttpResponse(null, { status: 400 });
    if (!('expectedVersion' in body) || body.expectedVersion !== stored.version) return new HttpResponse(null, { status: 409 });
    if ('capacity' in body) {
      if (body.capacity !== null && (typeof body.capacity !== 'number' || !Number.isInteger(body.capacity) || body.capacity < 1)) return new HttpResponse(null, { status: 422 });
      stored = { ...stored, capacity: body.capacity };
    }
    if ('title' in body && typeof body.title === 'string') stored = { ...stored, title: body.title };
    stored = { ...stored, version: stored.version + 1 };
    return ok({ ...stored, teamId: TEAM_ID, replayed: false });
  }),
  http.post(`*/api/v1/teams/${TEAM_ID}/schedules`, async ({ request }) => {
    createBodies.push(await request.json());
    return ok({ ...stored, id: 'created-schedule', capacity: null, teamId: TEAM_ID, replayed: false });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  clearStoredV1Session();
  stored = initialSchedule();
  failPatch = false;
  patchBodies.length = 0;
  createBodies.length = 0;
  readCapacities.length = 0;
  navigation.push.mockClear();
  navigation.replace.mockClear();
  navigation.back.mockClear();
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.resetHandlers();
  server.close();
  clearStoredV1Session();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function renderForm(scheduleId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><TeamScheduleFormPageClient teamId={TEAM_ID} scheduleId={scheduleId} /></QueryClientProvider>);
  return { ...view, client };
}
async function populatedEditor() {
  const view = renderForm(SCHEDULE_ID);
  await waitFor(() => expect(screen.getByRole('spinbutton', { name: /정원/ })).toHaveValue(1));
  return view;
}
async function save() {
  await userEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(SCHEDULE_PATH));
}

describe('MD-QA #54 실제 일정 폼·HTTP 정원 해제', () => {
  it('정원 1을 비워 저장한 뒤 새 조회로 다시 수정해도 빈 정원을 유지한다', async () => {
    const view = await populatedEditor();
    await userEvent.clear(screen.getByRole('spinbutton', { name: /정원/ }));
    await save();
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    const readsBeforeReload = readCapacities.length;
    view.unmount();
    view.client.clear();

    // 새 cache로 실제 GET을 다시 수행해 mutation 응답·이전 draft에 의존하지 않는다.
    renderForm(SCHEDULE_ID);
    const capacity = await screen.findByRole('spinbutton', { name: /정원/ });
    expect(readCapacities.length).toBeGreaterThan(readsBeforeReload);
    expect.soft(patchBodies[0]).toHaveProperty('capacity', null);
    expect.soft(readCapacities.at(-1)).toBeNull();
    expect(capacity).toHaveValue(null);
  });

  it.each([1, 12])('양의 정수 정원 %s는 숫자로 저장하고 재조회한다', async (capacity) => {
    const view = await populatedEditor();
    fireEvent.change(screen.getByRole('spinbutton', { name: /정원/ }), { target: { value: String(capacity) } });
    expect(screen.getByRole('spinbutton', { name: /정원/ })).toHaveValue(capacity);
    await save();
    expect(patchBodies[0]).toHaveProperty('capacity', capacity);
    expect(stored.capacity).toBe(capacity);
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    view.unmount();
    view.client.clear();
    renderForm(SCHEDULE_ID);
    expect(await screen.findByRole('spinbutton', { name: /정원/ })).toHaveValue(capacity);
  });

  it('다른 필드만 보내는 실제 PATCH의 생략된 정원은 기존 값을 유지한다', async () => {
    await v1Patch(SCHEDULE_PATH, { expectedVersion: 1, title: '제목만 변경한 훈련' }, { headers: { 'Idempotency-Key': 'be6ea7e2-ab0f-4804-9c25-1b617e693bfb' } });
    expect(patchBodies[0]).not.toHaveProperty('capacity');
    renderForm(SCHEDULE_ID);
    expect(await screen.findByRole('spinbutton', { name: /정원/ })).toHaveValue(1);
    expect(screen.getByRole('textbox', { name: '제목' })).toHaveValue('제목만 변경한 훈련');
    expect(readCapacities.at(-1)).toBe(1);
  });

  it('해제 PATCH 실패는 오류와 편집값을 유지하고 성공 이동하지 않는다', async () => {
    failPatch = true;
    await populatedEditor();
    await userEvent.clear(screen.getByRole('spinbutton', { name: /정원/ }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('정원을 저장하지 못했어요.');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: /정원/ })).toHaveValue(null);
    expect(stored.capacity).toBe(1);
  });

  it('새 일정의 빈 정원은 기존 선택 입력 계약대로 생략한다', async () => {
    renderForm();
    await userEvent.type(await screen.findByRole('textbox', { name: '제목' }), '정원 없는 새 훈련');
    fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '2026-10-10T10:00' } });
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '2026-10-10T11:00' } });
    await userEvent.click(screen.getByRole('button', { name: '일정 만들기' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/teams/${TEAM_ID}/schedules/created-schedule`));
    expect(createBodies[0]).not.toHaveProperty('capacity');
    expect(patchBodies).toHaveLength(0);
  });
});
