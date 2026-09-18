/**
 * Wave4 — 팀/마이팀 빈 상태(illustration + CTA), 로딩 스켈레톤, mock 데이터 유출 방지 회귀.
 *
 * (a) /teams 목록 빈 상태: 필터가 걸려 있을 때만 "전체 팀 보기" CTA
 * (b) /teams/:id/schedules 빈 상태: 운영자만 "일정 만들기" CTA
 * (c) /my/teams 로딩 중: KPI 0/0/0 + "소속 팀이 없어요" 대신 스켈레톤
 * (d) 목록 scope 문구: mock 문자열("서울 전체 · 팀 둘러보기")이 절대 렌더되지 않는다
 * (e) 팀 수정 폼 draft: 팀 데이터가 오기 전 mock 팀 이름("성수 러너스 FC")이 렌더되지 않는다
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { ScheduleListPageView } from '../team-schedules/team-schedules-page';
import type { ScheduleListViewModel } from '../team-schedules/team-schedules.types';
import { MyTeamsPageClient } from '../my/my-api-clients';
import { TeamListPageView } from './teams-page';
import { TeamListSsrView } from './teams-ssr-list';
import { TeamEditPageClient } from './teams-form-client';
import { deriveTeamScope } from './teams.card-model';
import { getTeamListViewModel } from './teams.view-model';
import type { TeamListViewModel } from './teams.types';

const apiMocks = vi.hoisted(() => ({
  useV1TeamDetail: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1CreateTeam: vi.fn(),
  useV1UpdateTeam: vi.fn(),
  useV1UploadImages: vi.fn(),
  useV1MyTeams: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function buildListModel(overrides: Partial<TeamListViewModel>): TeamListViewModel {
  const base = getTeamListViewModel();
  return { ...base, listLoading: false, teams: [], ...overrides };
}

describe('TeamListPageView — 조건에 맞는 팀이 없어요', () => {
  it('필터가 걸려 있을 때만 auth-welcome 일러스트 + "전체 팀 보기" CTA를 보여준다', () => {
    const { container, rerender } = rtlRender(
      <TeamListPageView
        model={buildListModel({
          filterCount: 1,
          chips: [
            { label: '전체', active: false },
            { label: '풋살', active: true },
          ],
        })}
      />,
    );

    expect(queryImageBySrc(container, '/illustrations/auth-welcome-640.webp')).not.toBeNull();
    expect(screen.getByRole('link', { name: '전체 팀 보기' })).toHaveAttribute('href', '/teams');

    rerender(
      <TeamListPageView
        model={buildListModel({
          filterCount: 0,
          chips: [{ label: '전체', active: true }],
        })}
      />,
    );

    expect(screen.queryByRole('link', { name: '전체 팀 보기' })).not.toBeInTheDocument();
  });
});

function buildScheduleListModel(overrides: Partial<ScheduleListViewModel>): ScheduleListViewModel {
  return {
    teamId: 'team-1',
    teamName: '테스트 팀',
    canManage: false,
    createHref: '/teams/team-1/schedules/new',
    view: 'list',
    onViewChange: () => undefined,
    typeFilter: 'all',
    onTypeFilterChange: () => undefined,
    stateFilter: 'all',
    onStateFilterChange: () => undefined,
    typeOptions: [{ value: 'all', label: '전체' }],
    stateOptions: [{ value: 'all', label: '전체' }],
    calendar: { monthLabel: '', weeks: [] },
    selectedDateKey: null,
    onSelectDate: () => undefined,
    onPrevMonth: () => undefined,
    onNextMonth: () => undefined,
    items: [],
    visibleItems: [],
    loading: false,
    error: false,
    onRetry: () => undefined,
    emptyTitle: '아직 등록된 일정이 없어요',
    emptySub: '일정을 만들면 여기에 표시돼요.',
    ...overrides,
  };
}

describe('ScheduleListPageView — 아직 등록된 일정이 없어요', () => {
  it('운영자에게는 landing-hero 일러스트 + "일정 만들기" CTA 링크를 보여준다', () => {
    const { container } = rtlRender(
      <ScheduleListPageView model={buildScheduleListModel({ canManage: true, createHref: '/teams/team-1/schedules/new' })} />,
    );

    expect(queryImageBySrc(container, '/illustrations/landing-hero-640.webp')).not.toBeNull();
    const ctaLinks = screen.getAllByRole('link', { name: '일정 만들기' });
    expect(ctaLinks.some((link) => link.getAttribute('href') === '/teams/team-1/schedules/new')).toBe(true);
  });

  it('일반 멤버에게는 CTA 없이 빈 상태만 보여준다', () => {
    rtlRender(<ScheduleListPageView model={buildScheduleListModel({ canManage: false })} />);

    expect(screen.queryByRole('link', { name: '일정 만들기' })).not.toBeInTheDocument();
  });
});

describe('MyTeamsPageClient — 로딩 중 스켈레톤', () => {
  it('query.isPending 동안 KPI 0/0/0 + "소속 팀이 없어요" 대신 스켈레톤을 보여준다', () => {
    apiMocks.useV1MyTeams.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: vi.fn() });

    const { container } = renderWithQuery(<MyTeamsPageClient />);

    expect(container.querySelector('.tm-skeleton-page')).not.toBeNull();
    expect(screen.queryByText('소속 팀이 없어요')).not.toBeInTheDocument();
  });
});

describe('팀 목록 scope — mock 문자열("서울 전체 · 팀 둘러보기") 유출 방지', () => {
  it('deriveTeamScope: 선택된 종목이 없으면 "전체 · 팀 둘러보기", 있으면 종목명을 담는다', () => {
    expect(deriveTeamScope()).toBe('전체 · 팀 둘러보기');
    expect(deriveTeamScope(undefined)).toBe('전체 · 팀 둘러보기');
    expect(deriveTeamScope('풋살')).toBe('풋살 · 팀 둘러보기');
    expect(deriveTeamScope()).not.toBe('서울 전체 · 팀 둘러보기');
  });

  it('SSR 목록은 mock scope("서울 전체 · 팀 둘러보기")를 렌더하지 않는다', () => {
    rtlRender(<TeamListSsrView teams={[]} sports={[]} />);

    expect(screen.queryByText('서울 전체 · 팀 둘러보기')).not.toBeInTheDocument();
    expect(screen.getAllByText('전체 · 팀 둘러보기').length).toBeGreaterThan(0);
  });
});

describe('TeamEditPageClient — 로딩 중 목업 노출 방지', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.useV1MasterSports.mockReturnValue({
      data: [{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }],
      isPending: false,
    });
    apiMocks.useV1MasterRegions.mockReturnValue({ data: [{ id: 'region-seoul', name: '서울', parentId: null, level: 1 }] });
    apiMocks.useV1UpdateTeam.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    apiMocks.useV1UploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('팀 데이터를 아직 못 받았으면 목업 팀 이름("성수 러너스 FC")을 입력창에 채우지 않고 스켈레톤을 보여준다', () => {
    apiMocks.useV1TeamDetail.mockReturnValue({ data: undefined, isError: false, isLoading: true });

    renderWithQuery(<TeamEditPageClient teamId="team-futsal" />);

    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('팀 정보를 불러오는 중이에요.');
  });

  it('팀 데이터가 도착하면 실제 팀 이름으로 폼을 채운다', () => {
    apiMocks.useV1TeamDetail.mockReturnValue({
      data: {
        name: '진짜 풋살 팀',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        region: { regionId: 'region-seoul', name: '서울', parentName: null },
        profile: {
          logoUrl: null,
          coverImageUrl: null,
          introduction: null,
          levelLabel: null,
          skillLevelText: null,
          genderRule: '성별 무관',
          activityDays: [],
          activityFrequency: null,
          activityTimeSlots: [],
          activityTypes: [],
          activityMemo: null,
          activityAreaText: null,
          memberGoalCount: 20,
          joinPolicy: 'approval_required',
        },
        memberCount: 12,
        membersVisibilityEnabled: false,
        version: 'version-1',
      },
      isError: false,
      isLoading: false,
    });

    renderWithQuery(<TeamEditPageClient teamId="team-futsal" />);

    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('진짜 풋살 팀')).toBeInTheDocument();
  });
});
