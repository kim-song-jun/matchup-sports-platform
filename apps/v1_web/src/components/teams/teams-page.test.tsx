import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamDetailPageView, TeamFormPageView, TeamListPageView } from './teams-page';
import { getTeamListViewModel } from './teams.view-model';
import type { TeamDetailViewModel, TeamFormViewModel, TeamListViewModel } from './teams.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/edit',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TeamListPageView', () => {
  it('does not render sample team cards while the live team list is loading', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      listLoading: true,
      teams: [],
      summary: {
        ...base.summary,
        total: 0,
        recruiting: 0,
        nearby: undefined,
      },
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByLabelText('팀 목록 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByText(/내 주변\s+\d+/)).not.toBeInTheDocument();
  });

  it('renders team list cards from the explicit team fields without stale recruiting copy', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      summary: {
        ...base.summary,
        total: 1,
        recruiting: 1,
        nearby: undefined,
      },
      teams: [
        {
          id: 'team-live-1',
          name: '라이브 팀',
          logo: '라',
          sport: '풋살',
          sports: ['풋살'],
          region: '서울 성동구',
          members: 7,
          capacity: 0,
          status: 'open',
          statusLabel: '가입 신청 가능',
          tags: ['레벨 미설정'],
          genderRule: '성별 무관',
          intro: '짧은 소개',
          next: '수 · 주 1회 · 자유 참여/정기 모임 · ㅇㅇ',
        },
      ],
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByText('라이브 팀')).toBeInTheDocument();
    expect(screen.getByText('가입 신청 가능')).toBeInTheDocument();
    expect(screen.getByText('레벨 미설정')).toBeInTheDocument();
    expect(screen.getByText('짧은 소개')).toBeInTheDocument();
    expect(screen.queryByText('가입 신청은 운영진 승인 후 확정돼요.')).not.toBeInTheDocument();
    expect(screen.getByText('수 · 주 1회 · 자유 참여/정기 모임 · ㅇㅇ')).toBeInTheDocument();
    expect(screen.queryByText('자세히 보기 ›')).not.toBeInTheDocument();
    expect(screen.queryByText('팀 보기 ›')).not.toBeInTheDocument();
    expect(screen.queryByText('알림받기')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 21:00 정기전')).not.toBeInTheDocument();
  });
});

describe('TeamDetailPageView', () => {
  it('preserves line breaks in the team introduction', () => {
    const introduction = '첫 번째 소개\n두 번째 소개';
    const model: TeamDetailViewModel = {
      team: {
        id: 'team-live-1',
        name: '라이브 팀',
        logo: '라',
        logoUrl: null,
        coverImageUrl: null,
        sport: '풋살',
        sports: ['풋살'],
        region: '서울 성동구',
        members: 7,
        capacity: 12,
        status: 'open',
        statusLabel: '가입 신청 가능',
        tags: [],
        genderRule: '성별 무관',
        intro: introduction,
        next: '',
        description: introduction,
        activity: '',
        condition: '',
        schedule: '',
        city: '서울',
        county: '성동구',
        level: '초보-중수',
        membersList: [],
        memberAccess: {
          canView: false,
          enabled: false,
          message: '멤버 목록 비공개',
        },
      },
      mode: 'default',
    };

    render(<TeamDetailPageView model={model} />);

    const introNodes = screen.getAllByText((_, node) => node?.textContent === introduction);
    expect(introNodes).toHaveLength(2);
    introNodes.forEach((node) => {
      expect(node).toHaveStyle({ whiteSpace: 'pre-line' });
    });
  });
});

describe('TeamFormPageView', () => {
  it('renders and updates the team join policy control', () => {
    const onJoinPolicyChange = vi.fn();
    const model: TeamFormViewModel = {
      mode: 'edit',
      team: {
        name: '성수 풋살 크루',
        logoUrl: null,
        coverImageUrl: null,
        sport: '풋살',
        region: '서울 성동구',
        description: '주 1회 경기하는 팀입니다.',
        sports: ['풋살'],
        city: '서울',
        county: '성동구',
        level: '입문-중수',
        genderRule: '성별 무관',
        activityDays: [],
        activityFrequency: '',
        activityTimeSlots: [],
        activityTypes: [],
        activityMemo: '',
        capacity: 12,
      },
      form: {
        sportId: 'sport-1',
        regionId: 'region-1',
        regions: [{ id: 'region-1', name: '서울 성동구' }],
        sports: [{ id: 'sport-1', name: '풋살' }],
        joinPolicy: 'approval_required',
        membersVisibilityEnabled: true,
        onFieldChange: vi.fn(),
        onSportChange: vi.fn(),
        onRegionChange: vi.fn(),
        onJoinPolicyChange,
        onMembersVisibilityChange: vi.fn(),
        onSubmit: vi.fn(),
      },
    };

    render(<TeamFormPageView model={model} />);

    expect(screen.getByText('가입 신청 상태')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가입 신청 가능' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '가입 닫힘' }));

    expect(onJoinPolicyChange).toHaveBeenCalledWith('closed');
  });
});
