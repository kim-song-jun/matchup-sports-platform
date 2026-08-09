// Task 13 QA gate — 실제 라우트(page.tsx)를 렌더링해 owner/manager/member 권한 게이팅,
// API 실패 상태, 409 버전 충돌 처리를 검증한다. 순수 함수 단위 테스트는
// `../../../components/team-schedules/team-schedules.view-model.test.ts`가 이미 담당하므로
// 여기서는 그 view-model이 실제 라우트/컴포넌트에 올바르게 배선됐는지만 확인한다.
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamDetail, V1TeamScheduleDetail, V1TeamScheduleSummary } from '@/types/api';
import TeamSchedulesPage from './page';
import TeamScheduleDetailPage from './[scheduleId]/page';
import TeamScheduleCreatePage from './new/page';

const scheduleApiMocks = vi.hoisted(() => ({
  useV1TeamDetail: vi.fn(),
  useV1TeamSchedules: vi.fn(),
  useV1TeamSchedule: vi.fn(),
  useV1SetMyScheduleAttendance: vi.fn(),
  useV1CancelTeamSchedule: vi.fn(),
  useV1CompleteTeamSchedule: vi.fn(),
  useV1TriggerScheduleReminder: vi.fn(),
  useV1CreateGuestRecruitment: vi.fn(),
  useV1UpdateGuestRecruitment: vi.fn(),
  useV1ApplyGuestRecruitment: vi.fn(),
  useV1CreateTeamSchedule: vi.fn(),
  useV1UpdateTeamSchedule: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...scheduleApiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/schedules',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function idleMutation() {
  return { mutate: vi.fn(), isPending: false };
}

function makeTeamDetail(role: string): V1TeamDetail {
  return {
    teamId: 'team-1',
    name: '성수 풋살 크루',
    status: 'active',
    visibility: 'public',
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-seoul', name: '서울', parentName: null },
    joinPolicy: 'approval_required',
    membersVisibilityEnabled: true,
    canViewMembers: true,
    profile: {
      logoUrl: null,
      coverImageUrl: null,
      introduction: '',
      activityAreaText: null,
      activityDays: [],
      activityFrequency: null,
      activityTimeSlots: [],
      activityTypes: [],
      activityMemo: null,
      activitySummary: null,
      skillLevelText: null,
      genderRule: '성별 무관',
      joinPolicy: 'approval_required',
      memberGoalCount: 20,
    },
    owner: { userId: 'user-owner', displayName: '김도윤', profileImageUrl: null },
    membersPreview: [],
    memberCount: 7,
    managerCount: 1,
    // V1TeamDetail.trust.trustState is strictly TrustState ('verified' | 'estimated' | 'sample').
    // Only the separate optional top-level V1TeamDetail.trustState widens to include 'none'.
    trust: { trustState: 'sample', score: null },
    viewer: {
      role,
      membershipId: role === 'none' ? null : 'membership-1',
      joinState: role === 'none' ? 'none' : 'active',
      canRequestJoin: role === 'none',
      disabledReason: null,
      manageRoute: null,
    },
  };
}

function scheduleSummary(overrides: Partial<V1TeamScheduleSummary> = {}): V1TeamScheduleSummary {
  return {
    id: 'sched-1',
    title: '정기 훈련',
    type: 'TRAINING',
    startAt: '2026-08-10T12:00:00.000Z',
    endAt: '2026-08-10T14:00:00.000Z',
    timezone: 'Asia/Seoul',
    capacity: 20,
    rsvpDeadlineAt: null,
    visibility: 'TEAM',
    state: 'SCHEDULED',
    version: 0,
    teamMatchId: null,
    matchConfirmed: null,
    goingCount: 5,
    waitlistedCount: 2,
    ...overrides,
  };
}

function scheduleDetail(overrides: Partial<V1TeamScheduleDetail> = {}): V1TeamScheduleDetail {
  return {
    ...scheduleSummary(),
    cancelReason: null,
    cancelledAt: null,
    guestRecruitment: null,
    myAttendance: null,
    attendees: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 모든 라우트가 공통으로 호출하는 훅에 안전한 기본값을 깔아둔다 — 각 테스트는
  // 자신이 실제로 검증하려는 훅만 덮어쓴다.
  scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('owner'), isError: false });
  scheduleApiMocks.useV1TeamSchedules.mockReturnValue({
    data: { items: [], nextCursor: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  scheduleApiMocks.useV1SetMyScheduleAttendance.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1CancelTeamSchedule.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1CompleteTeamSchedule.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1TriggerScheduleReminder.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1CreateGuestRecruitment.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1UpdateGuestRecruitment.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1ApplyGuestRecruitment.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1CreateTeamSchedule.mockReturnValue(idleMutation());
  scheduleApiMocks.useV1UpdateTeamSchedule.mockReturnValue(idleMutation());
});

// ── /teams/:id/schedules (목록) ───────────────────────────────────────────────

describe('TeamSchedulesPage — 목록 라우트 권한 게이팅', () => {
  beforeEach(() => {
    scheduleApiMocks.useV1TeamSchedules.mockReturnValue({
      data: { items: [scheduleSummary()], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('owner에게는 일정 만들기 CTA(모바일 FAB + 데스크톱 버튼)가 보인다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('owner'), isError: false });
    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);
    expect(screen.getAllByRole('link', { name: '일정 만들기' }).length).toBeGreaterThan(0);
  });

  it('manager에게도 일정 만들기 CTA가 보인다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('manager'), isError: false });
    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);
    expect(screen.getAllByRole('link', { name: '일정 만들기' }).length).toBeGreaterThan(0);
  });

  it('일반 member에게는 일정 만들기 CTA가 전혀 노출되지 않는다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('member'), isError: false });
    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);
    expect(screen.queryAllByRole('link', { name: '일정 만들기' })).toHaveLength(0);
  });

  // 상태값이 평문으로 렌더돼 다른 메타(종류·시각·참석)와 구분되지 않던 것을 배지로 바꿨다.
  // 이 저장소 규칙상 상태는 컬러만으로 전달하면 안 되므로, 배지 안에 텍스트 라벨이 남아야
  // 한다 — 색만 남기고 라벨을 지우면 여기서 깨진다.
  // 필터 칩도 .tm-badge 를 쓰므로 목록 컨테이너 안으로 범위를 좁힌다.
  const listStateBadge = (container: HTMLElement) =>
    container.querySelector('.tm-team-open-match-list .tm-badge');

  it('목록의 상태값은 텍스트 라벨을 유지한 배지로 렌더된다', async () => {
    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    const { container } = render(page);

    const badge = listStateBadge(container);
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('예정');
  });

  it('취소된 일정도 컬러가 아닌 텍스트로 상태를 알린다', async () => {
    scheduleApiMocks.useV1TeamSchedules.mockReturnValue({
      data: { items: [scheduleSummary({ state: 'CANCELLED' })], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    const { container } = render(page);

    const badge = listStateBadge(container);
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('취소됨');
  });

  it('목록 조회 실패 시 재시도 가능한 에러 상태를 보여준다', async () => {
    const refetch = vi.fn();
    scheduleApiMocks.useV1TeamSchedules.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const page = await TeamSchedulesPage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);

    const errorState = screen.getByRole('alert');
    expect(errorState).toHaveTextContent('일정을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

// ── /teams/:id/schedules/:scheduleId (상세) ───────────────────────────────────

describe('TeamScheduleDetailPage — 상세 라우트 권한 게이팅', () => {
  it('owner에게는 운영 관리 섹션(수정/취소)이 보인다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('owner'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    expect(screen.getByText('운영 관리')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '일정 수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일정 취소' })).toBeInTheDocument();
  });

  it('member에게는 운영 관리 섹션이 숨겨지고 대신 RSVP 컨트롤이 보인다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('member'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    expect(screen.queryByText('운영 관리')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '일정 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 취소' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '참석' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '미정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불참' })).toBeInTheDocument();
  });

  it('팀 소속이 아닌(role=none) 뷰어에게는 운영 관리와 RSVP 둘 다 숨겨진다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('none'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    expect(screen.queryByText('운영 관리')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참석' })).not.toBeInTheDocument();
  });

  it('참석 요약은 서버가 실제로 보내는 참석/대기 합계만 보여주고, 미정·불참 합계를 지어내지 않는다', async () => {
    // 회귀 테스트: 스케줄 읽기 경로(toSummary/detail)는 goingCount/waitlistedCount만
    // 반환한다. maybe/notGoing 합계는 PUT attendance/me 뮤테이션 응답에만 존재하는
    // 필드라, 상세 화면이 그 숫자를 지어내 보여주면(과거 결함) 서버가 절대 보내지 않은
    // 값을 사용자에게 보여주는 셈이다.
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('member'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail({ goingCount: 5, waitlistedCount: 2 }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    expect(screen.getByText(/참석 5명.*대기 2명/)).toBeInTheDocument();
    expect(screen.queryByText(/미정 ?\d+명/)).not.toBeInTheDocument();
    expect(screen.queryByText(/불참 ?\d+명/)).not.toBeInTheDocument();
  });

  it('상세 조회 실패 시 재시도 가능한 에러 상태를 보여준다', async () => {
    const refetch = vi.fn();
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('owner'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    const errorState = screen.getByRole('alert');
    expect(errorState).toHaveTextContent('일정을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('RSVP 중 409 VERSION_CONFLICT를 받으면 새로고침 안내 배너를 띄우고 상세를 다시 불러온다', async () => {
    const detailRefetch = vi.fn();
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('member'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail({ myAttendance: { status: 'GOING', version: 3, waitlistPosition: null } }),
      isLoading: false,
      isError: false,
      refetch: detailRefetch,
    });
    const conflictError = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'VERSION_CONFLICT',
      message: 'stale version',
      timestamp: new Date().toISOString(),
    });
    scheduleApiMocks.useV1SetMyScheduleAttendance.mockReturnValue({
      mutate: vi.fn((_body: unknown, callbacks: { onError: (err: unknown) => void }) => {
        callbacks.onError(conflictError);
      }),
      isPending: false,
    });

    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    fireEvent.click(screen.getByRole('button', { name: '불참' }));

    // 동일한 충돌 메시지가 상단 배너(conflictBanner)와 참석 카드의 필드 에러
    // (attendance.error) 두 곳에 동시에 렌더링되므로 getAllByText로 검증한다.
    const conflictMessages = await screen.findAllByText(/다른 곳에서 먼저 정보를 바꿨어요.*새로고침/);
    expect(conflictMessages.length).toBeGreaterThan(0);
    expect(detailRefetch).toHaveBeenCalledOnce();
  });

  it('일정 취소 중 409 IDEMPOTENCY_PAYLOAD_CONFLICT를 받아도 같은 새로고침 경로를 탄다', async () => {
    const detailRefetch = vi.fn();
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('owner'), isError: false });
    scheduleApiMocks.useV1TeamSchedule.mockReturnValue({
      data: scheduleDetail(),
      isLoading: false,
      isError: false,
      refetch: detailRefetch,
    });
    const conflictError = new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
      message: 'payload conflict',
      timestamp: new Date().toISOString(),
    });
    scheduleApiMocks.useV1CancelTeamSchedule.mockReturnValue({
      mutate: vi.fn((_body: unknown, callbacks: { onError: (err: unknown) => void }) => {
        callbacks.onError(conflictError);
      }),
      isPending: false,
    });

    const page = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    render(page);

    fireEvent.click(screen.getByRole('button', { name: '일정 취소' }));
    fireEvent.change(screen.getByLabelText('취소 사유'), { target: { value: '우천으로 취소' } });
    fireEvent.click(screen.getByRole('button', { name: '취소 확정' }));

    // 상단 배너와 취소 모달의 필드 에러 두 곳에 같은 메시지가 렌더링된다.
    const conflictMessages = await screen.findAllByText(/새로고침/);
    expect(conflictMessages.length).toBeGreaterThan(0);
    expect(detailRefetch).toHaveBeenCalledOnce();
  });
});

// ── /teams/:id/schedules/new (생성 폼) ────────────────────────────────────────

describe('TeamScheduleCreatePage — 생성 폼 권한 게이팅', () => {
  it('manager가 아니면 폼 대신 권한 없음 안내를 보여준다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('member'), isError: false });
    const page = await TeamScheduleCreatePage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);

    expect(screen.getByText('일정을 관리할 권한이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 만들기' })).not.toBeInTheDocument();
  });

  it('manager에게는 실제 생성 폼이 보인다', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: makeTeamDetail('manager'), isError: false });
    const page = await TeamScheduleCreatePage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);

    expect(screen.queryByText('일정을 관리할 권한이 없어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일정 만들기' })).toBeInTheDocument();
  });

  // 이 라우트에 직접 진입하면(캐시된 team 쿼리가 없는 최초 로드) team.data 는 잠시 undefined 다.
  // 그 사이에도 폼이 렌더되면 안 된다 — 뷰어의 역할을 아직 모르는 상태에서 제출 가능한 폼을 내주는
  // fail-open 이기 때문이다. 이전 구현의 `Boolean(team.data) && !canManage` 는 이 구간에서
  // forbidden 을 false 로 만들어 폼을 그대로 노출했다. 그 표현식으로 되돌리면 이 테스트는 실패한다.
  it('팀 조회가 아직 끝나지 않았으면 폼을 내주지 않는다 (역할 미확정 구간 fail-closed)', async () => {
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: undefined, isError: false });
    const page = await TeamScheduleCreatePage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);

    expect(screen.queryByRole('button', { name: '일정 만들기' })).not.toBeInTheDocument();
  });

  it('팀 조회가 실패하면 폼 대신 재시도 가능한 에러 상태를 보여준다', async () => {
    const teamRefetch = vi.fn();
    scheduleApiMocks.useV1TeamDetail.mockReturnValue({ data: undefined, isError: true, refetch: teamRefetch });
    const page = await TeamScheduleCreatePage({ params: Promise.resolve({ id: 'team-1' }) });
    render(page);

    expect(screen.queryByRole('button', { name: '일정 만들기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(teamRefetch).toHaveBeenCalledOnce();
  });
});
