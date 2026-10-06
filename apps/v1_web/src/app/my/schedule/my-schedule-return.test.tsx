import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1MyScheduleItem, V1TeamDetail, V1TeamScheduleDetail } from '@/types/api';
import TeamScheduleDetailPage from '../../teams/[id]/schedules/[scheduleId]/page';
import MySchedulePage from './page';

const navigation = vi.hoisted(() => ({
  url: '/my/schedule',
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));
const api = vi.hoisted(() => ({
  useV1MySchedule: vi.fn(),
  useV1TeamDetail: vi.fn(),
  useV1TeamSchedule: vi.fn(),
  useV1AuthMe: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => new URL(navigation.url, 'https://teameet.test').pathname,
  useSearchParams: () => new URL(navigation.url, 'https://teameet.test').searchParams,
  useRouter: () => navigation,
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...api,
}));

const schedule: V1MyScheduleItem = {
  id: 'sched-1', title: '정기 훈련', type: 'TRAINING',
  startAt: '2026-10-10T12:00:00.000Z', endAt: '2026-10-10T14:00:00.000Z',
  timezone: 'Asia/Seoul', capacity: 20, rsvpDeadlineAt: null, visibility: 'TEAM',
  state: 'SCHEDULED', version: 0, teamMatchId: null, linkedMatch: null,
  matchConfirmed: null, goingCount: 5, waitlistedCount: 0,
  teamId: 'team-1', teamName: '성수 풋살 크루', myRole: 'member', myAttendanceStatus: 'GOING',
};
const detail: V1TeamScheduleDetail = {
  ...schedule, cancelReason: null, cancelledAt: null, guestRecruitment: null,
  myAttendance: null, attendees: null,
};
const team: V1TeamDetail = {
  teamId: 'team-1', name: '성수 풋살 크루', status: 'active', visibility: 'public',
  sport: { sportId: 'sport-futsal', name: '풋살' },
  region: { regionId: 'region-seoul', name: '서울', parentName: null },
  joinPolicy: 'approval_required', membersVisibilityEnabled: true, canViewMembers: true,
  profile: {
    logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [],
    activityMemo: null, activitySummary: null, skillLevelText: null, genderRule: '성별 무관',
    joinPolicy: 'approval_required', memberGoalCount: 20,
  },
  owner: { userId: 'user-owner', displayName: '팀장', profileImageUrl: null },
  membersPreview: [], memberCount: 7, managerCount: 1,
  trust: { trustState: 'sample', score: null },
  viewer: {
    role: 'member', membershipId: 'membership-1', joinState: 'active',
    canRequestJoin: false, disabledReason: null, manageRoute: null,
  },
};

function mount(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function navigate(href: string) {
  navigation.url = href;
  window.history.replaceState(null, '', href);
}

beforeEach(() => {
  vi.clearAllMocks();
  navigate('/my/schedule');
  api.useV1MySchedule.mockReturnValue({
    data: { items: [schedule], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn(),
  });
  api.useV1TeamDetail.mockReturnValue({ data: team, isError: false });
  api.useV1TeamSchedule.mockReturnValue({ data: detail, isLoading: false, isError: false, refetch: vi.fn() });
  api.useV1AuthMe.mockReturnValue({ data: undefined });
});

describe('MD-QA #26 — 내 일정 상세 복귀', () => {
  it('예정을 선택한 내 일정에서 기존 팀 일정 상세의 뒤로가기를 누르면 예정 선택을 유지한다', async () => {
    const list = mount(MySchedulePage());
    fireEvent.click(screen.getByRole('button', { name: '예정' }));
    expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');

    const detailHref = screen.getByRole('link', { name: /정기 훈련/ }).getAttribute('href');
    expect(detailHref).toBe('/teams/team-1/schedules/sched-1?from=%2Fmy%2Fschedule%3Fstatus%3Dscheduled');
    if (!detailHref) throw new Error('팀 일정 상세 링크가 없어요');
    list.unmount();
    navigate(detailHref);

    const schedulePage = await TeamScheduleDetailPage({ params: Promise.resolve({ id: 'team-1', scheduleId: 'sched-1' }) });
    const scheduleDetail = mount(schedulePage);
    expect(screen.getByRole('heading', { name: '정기 훈련' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '일정 수정' })).not.toBeInTheDocument();
    const back = screen.getByRole('link', { name: '뒤로가기' });
    expect(back).toHaveAttribute('href', '/my/schedule?status=scheduled');
    fireEvent.click(back);
    expect(navigation.replace).toHaveBeenLastCalledWith('/my/schedule?status=scheduled');
    scheduleDetail.unmount();

    navigate('/my/schedule?status=scheduled');
    mount(MySchedulePage());
    expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /정기 훈련/ })).toHaveTextContent('참석');
    expect(api.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50, status: 'scheduled' });
  });

  it.each([
    { status: 'scheduled', label: '예정', state: 'SCHEDULED' },
    { status: 'cancelled', label: '취소됨', state: 'CANCELLED' },
    { status: 'completed', label: '완료', state: 'COMPLETED' },
  ] as const)('status=$status로 직접 돌아오면 해당 선택과 조회 조건을 복원한다', ({ status, label, state }) => {
    navigate(`/my/schedule?status=${status}`);
    api.useV1MySchedule.mockReturnValue({
      data: { items: [{ ...schedule, state }], nextCursor: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    mount(MySchedulePage());

    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(api.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50, status });
    const href = screen.getByRole('link', { name: /정기 훈련/ }).getAttribute('href');
    expect(href).toBe(`/teams/team-1/schedules/sched-1?from=${encodeURIComponent(`/my/schedule?status=${status}`)}`);
  });

  it.each(['unknown', 'SCHEDULED', 'https://outside.test', ''])('알 수 없는 status=%s는 전체로 처리하고 상세 출처에서 제외한다', (status) => {
    navigate(`/my/schedule?status=${encodeURIComponent(status)}&view=calendar`);
    mount(MySchedulePage());

    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50 });
    expect(screen.getByRole('link', { name: /정기 훈련/ })).toHaveAttribute(
      'href', '/teams/team-1/schedules/sched-1?from=%2Fmy%2Fschedule%3Fview%3Dcalendar',
    );
  });

  it('외부 from은 뒤로가기와 다음 상세의 중첩 출처로 전달하지 않는다', () => {
    navigate('/my/schedule?status=scheduled&from=https%3A%2F%2Foutside.test');
    mount(MySchedulePage());

    expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /정기 훈련/ })).toHaveAttribute(
      'href', '/teams/team-1/schedules/sched-1?from=%2Fmy%2Fschedule%3Fstatus%3Dscheduled',
    );
    const back = screen.getByRole('link', { name: '뒤로가기' });
    expect(back).toHaveAttribute('href', '/my');
    fireEvent.click(back);
    expect(navigation.replace).toHaveBeenLastCalledWith('/my');
  });

  it('URL 반영 전에 상태를 연속으로 선택해도 최신 상태와 기존 중첩 출처를 상세에 담는다', () => {
    navigate('/my/schedule?view=calendar&from=%2Fmy');
    mount(MySchedulePage());

    // Router mock은 아직 URL을 반영하지 않아 실제 탐색이 대기 중인 순간을 재현한다.
    fireEvent.click(screen.getByRole('button', { name: '예정' }));
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.getByRole('button', { name: '완료' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50, status: 'completed' });
    expect(navigation.replace).toHaveBeenLastCalledWith(
      '/my/schedule?view=calendar&from=%2Fmy&status=completed', { scroll: false },
    );
    const detailHref = screen.getByRole('link', { name: /정기 훈련/ }).getAttribute('href');
    if (!detailHref) throw new Error('팀 일정 상세 링크가 없어요');
    const returnPath = new URL(detailHref, 'https://teameet.test').searchParams.get('from');
    expect(returnPath).toBe('/my/schedule?view=calendar&status=completed&from=%2Fmy');

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(api.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50 });
    expect(navigation.replace).toHaveBeenLastCalledWith('/my/schedule?view=calendar&from=%2Fmy', { scroll: false });
    expect(screen.getByRole('link', { name: /정기 훈련/ })).toHaveAttribute(
      'href', '/teams/team-1/schedules/sched-1?from=%2Fmy%2Fschedule%3Fview%3Dcalendar%26from%3D%252Fmy',
    );
  });
});
