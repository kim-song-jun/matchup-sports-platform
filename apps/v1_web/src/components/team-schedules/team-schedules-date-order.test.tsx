import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1TeamDetail, V1TeamScheduleDetail, V1TeamScheduleMutationResult } from '@/types/api';
import { TeamScheduleFormPageClient } from './team-schedules-client';

// Only the Next navigation boundary is replaced; the form, date conversion and API hooks are real.
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/teams/date-order-team/schedules/date-order-schedule/edit',
  useSearchParams: () => new URLSearchParams(),
}));

const TEAM_ID = 'date-order-team';
const SCHEDULE_ID = 'date-order-schedule';
const team: V1TeamDetail = {
  teamId: TEAM_ID, name: '합성 날짜 검증 팀', status: 'active', visibility: 'public',
  sport: { sportId: 'sport-futsal', name: '풋살' }, region: { regionId: 'region-seoul', name: '서울', parentName: null },
  joinPolicy: 'approval_required', membersVisibilityEnabled: true, canViewMembers: true,
  profile: { logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
    activitySummary: null, skillLevelText: null, genderRule: '성별 무관', joinPolicy: 'approval_required', memberGoalCount: 20 },
  owner: { userId: 'fixture-owner', displayName: '합성 팀장', profileImageUrl: null },
  membersPreview: [], memberCount: 1, managerCount: 0, trust: { trustState: 'sample', score: null },
  viewer: { role: 'owner', membershipId: 'fixture-owner-member', joinState: 'active', canRequestJoin: false,
    disabledReason: null, manageRoute: `/teams/${TEAM_ID}/manage` },
};
const schedule: V1TeamScheduleDetail = {
  id: SCHEDULE_ID, title: '기존 훈련', type: 'TRAINING',
  startAt: '2026-10-10T01:00:00.000Z', endAt: '2026-10-10T02:00:00.000Z',
  timezone: 'Asia/Seoul', capacity: null, rsvpDeadlineAt: null, visibility: 'TEAM', state: 'SCHEDULED', version: 7,
  teamMatchId: null, linkedMatch: null, matchConfirmed: null, goingCount: 0, waitlistedCount: 0,
  cancelReason: null, cancelledAt: null, guestRecruitment: null, myAttendance: null, attendees: null,
};
const mutationResult: V1TeamScheduleMutationResult = { ...schedule, teamId: TEAM_ID, version: 8, replayed: false };
const writes: Array<{ method: string; body: unknown; idempotencyKey: string | null }> = [];
let detailReads = 0;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T10:00:00.000Z' });
async function save({ request }: { request: Request }) {
  writes.push({ method: request.method, body: await request.json(), idempotencyKey: request.headers.get('Idempotency-Key') });
  return ok(mutationResult);
}
const server = setupServer(
  http.get('*/api/v1/teams/:teamId', () => ok(team)),
  http.get('*/api/v1/teams/:teamId/schedules/:scheduleId', () => {
    detailReads += 1;
    return ok(schedule);
  }),
  http.post('*/api/v1/teams/:teamId/schedules', save),
  http.patch('*/api/v1/teams/:teamId/schedules/:scheduleId', save),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
let client: QueryClient;
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  clearStoredV1Session();
  writes.length = 0;
  detailReads = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  server.resetHandlers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
async function renderForm(mode: 'create' | 'edit') {
  render(<QueryClientProvider client={client}>
    <TeamScheduleFormPageClient teamId={TEAM_ID} scheduleId={mode === 'edit' ? SCHEDULE_ID : undefined} />
  </QueryClientProvider>);
  await screen.findByLabelText('제목');
  if (mode === 'edit') await waitFor(() => expect(screen.getByLabelText('시작 시각')).toHaveValue('2026-10-10T10:00'));
}
function setDates(endAt: string) {
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '날짜 수정 초안' } });
  fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '2026-10-10T10:00' } });
  fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: endAt } });
}

describe('MD-QA #53 — 실제 일정 폼·API 훅·HTTP 날짜 순서', () => {
  it.each([
    ['create', '2026-10-10T09:00'], ['create', '2026-10-10T10:00'],
    ['edit', '2026-10-10T09:00'], ['edit', '2026-10-10T10:00'],
  ] as const)('%s 종료 %s는 POST/PATCH와 성공 이동을 막고 수정한 값을 유지한다', async (mode, endAt) => {
    // Given: 권한 있는 팀장의 실제 폼에 역전 또는 동일 시각을 입력한다.
    await renderForm(mode);
    setDates(endAt);

    // When: 실제 저장 버튼을 누른다.
    await userEvent.click(screen.getByRole('button', { name: mode === 'edit' ? '저장' : '일정 만들기' }));
    await waitFor(() => expect(client.isMutating()).toBe(0));

    // Then: 기존 오류 표면에서 종료 시각 문제를 알리고 HTTP나 성공 이동을 실행하지 않는다.
    expect(await screen.findByRole('alert')).toHaveTextContent('종료 시각은 시작 시각보다 늦어야 해요.');
    expect(writes).toEqual([]);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('종료 시각')).toHaveValue(endAt);
    expect(screen.getByLabelText('제목')).toHaveValue('날짜 수정 초안');
  });

  it.each(['create', 'edit'] as const)('%s는 시계 시간이 더 이른 다음 날 종료를 정상 DTO로 저장한다', async (mode) => {
    // Given: 시작 다음 날 오전 9시는 시작 당일 오전 10시보다 실제로 늦다.
    await renderForm(mode);
    setDates('2026-10-11T09:00');

    // When: 실제 폼의 저장을 실행한다.
    await userEvent.click(screen.getByRole('button', { name: mode === 'edit' ? '저장' : '일정 만들기' }));

    // Then: 기존 KST 변환과 수정 버전·idempotency 계약을 유지하고 실제 성공 경로로 이동한다.
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/teams/${TEAM_ID}/schedules/${SCHEDULE_ID}`));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ method: mode === 'edit' ? 'PATCH' : 'POST', idempotencyKey: expect.any(String),
      body: expect.objectContaining({ title: '날짜 수정 초안', startAt: '2026-10-10T01:00:00.000Z', endAt: '2026-10-11T00:00:00.000Z',
        ...(mode === 'edit' ? { expectedVersion: 7 } : { type: 'TRAINING', timezone: expect.any(String) }) }),
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('유효한 시간의 버전 충돌은 실제 오류를 표시하고 재조회 뒤에도 편집 초안을 유지한다', async () => {
    // Given: 저장 버전이 다른 곳에서 갱신됐지만 사용자는 유효한 새 시간과 제목을 편집했다.
    await renderForm('edit');
    setDates('2026-10-11T09:00');
    const initialReads = detailReads;
    server.use(http.patch('*/api/v1/teams/:teamId/schedules/:scheduleId', async ({ request }) => {
      writes.push({ method: request.method, body: await request.json(), idempotencyKey: request.headers.get('Idempotency-Key') });
      return HttpResponse.json({ status: 'error', statusCode: 409, code: 'VERSION_CONFLICT', message: 'Schedule changed elsewhere' }, { status: 409 });
    }));

    // When: 실제 PATCH가 버전 충돌을 반환한다.
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    // Then: 성공 이동 없이 기존 충돌 메시지와 재조회·dirty draft 보호가 유지된다.
    expect(await screen.findByRole('alert')).toHaveTextContent('최신 내용으로 새로고침했어요.');
    await waitFor(() => expect(detailReads).toBe(initialReads + 1));
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual(expect.objectContaining({ expectedVersion: 7 }));
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('종료 시각')).toHaveValue('2026-10-11T09:00');
    expect(screen.getByLabelText('제목')).toHaveValue('날짜 수정 초안');
  });

  it.each(['create', 'edit'] as const)('%s는 기존 일반 멤버의 관리 권한 차단을 유지한다', async (mode) => {
    // Given: API의 현재 팀 역할이 일반 멤버다.
    server.use(http.get('*/api/v1/teams/:teamId', () => ok({ ...team, viewer: { ...team.viewer, role: 'member', manageRoute: null } })));

    // When: 실제 생성/수정 consumer에 접근한다.
    render(<QueryClientProvider client={client}>
      <TeamScheduleFormPageClient teamId={TEAM_ID} scheduleId={mode === 'edit' ? SCHEDULE_ID : undefined} />
    </QueryClientProvider>);

    // Then: 편집 폼과 쓰기·성공 이동이 열리지 않는다.
    await screen.findByText('일정을 관리할 권한이 없어요');
    expect(screen.queryByLabelText('제목')).not.toBeInTheDocument();
    expect(writes).toEqual([]);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
