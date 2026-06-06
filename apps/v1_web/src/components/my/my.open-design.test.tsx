import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocationSettingsPageClient, SportsSettingsPageClient, WithdrawalPageClient } from './my-api-clients';
import {
  LegalPageView,
  MyHomePageView,
  MyMatchesPageView,
  MyTeamDetailPageView,
  MyTeamMembersPageView,
  MyTeamsPageView,
  NotificationSettingsPageView,
  SettingsPageView,
} from './my-page';
import {
  getMyMatchesModel,
  getMyTeamDetailModel,
  myHomeModel,
  myTeamsModel,
  notificationSettingsModel,
  settingsModel,
} from './my.view-model';

vi.mock('@/components/auth/logout-button', () => ({
  LogoutButton: () => <button type="button">로그아웃</button>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-v1-api', () => {
  const query = (data: unknown) => ({ data, isError: false, isLoading: false });
  const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });

  return {
    useV1ApproveTeamJoinApplication: mutation,
    useV1ChangeTeamMembershipRole: mutation,
    useV1MasterRegions: () => query([
      { id: 'region-seoul', name: '서울', level: 1, parentId: null },
      { id: 'region-gangnam', name: '강남구', level: 2, parentId: 'region-seoul', parent: { name: '서울' } },
    ]),
    useV1MasterSports: () => query([
      { id: 'sport-football', name: '축구', levels: [{ id: 'level-entry', name: '입문' }] },
      { id: 'sport-futsal', name: '풋살', levels: [{ id: 'level-entry', name: '입문' }] },
      { id: 'sport-running', name: '러닝', levels: [{ id: 'level-entry', name: '입문' }, { id: 'level-beginner', name: '초보' }] },
      { id: 'sport-swimming', name: '수영', levels: [{ id: 'level-entry', name: '입문' }] },
    ]),
    useV1MyActivitySummary: () => query(null),
    useV1MyTeamMatches: () => query({ items: [] }),
    useV1MyTeams: () => query({ items: [] }),
    useV1Notifications: () => query({ items: [] }),
    useV1Profile: () => query({
      userId: 'user-host',
      sports: [{ sportId: 'sport-running', levelId: 'level-entry' }],
      regions: [{ regionId: 'region-gangnam', primary: true }],
    }),
    useV1RejectTeamJoinApplication: mutation,
    useV1RemoveTeamMembership: mutation,
    useV1ResolveLocation: mutation,
    useV1Reviews: () => query({ items: [] }),
    useV1Settings: () => query(null),
    useV1TeamDetail: () => query(null),
    useV1TeamJoinApplications: () => query({ items: [] }),
    useV1TeamMembers: () => query({ items: [] }),
    useV1UpdateMyPreferences: mutation,
    useV1UpdateMyRegion: mutation,
    useV1UpdateProfile: mutation,
    useV1UpdateSettings: mutation,
    useV1WithdrawalRequest: mutation,
  };
});

describe('my and settings Open Design contract', () => {
  it('renders account dashboard and settings without discovery-style intro', () => {
    render(<MyHomePageView model={myHomeModel} />);

    const myPage = screen.getByTestId('my-open-design');
    expect(myPage).toHaveClass('tm-my-open-design');
    expect(myPage).toHaveClass('tm-my-desktop-workbench');
    expect(within(myPage).getByText('김정민')).toBeInTheDocument();
    expect(within(myPage).getByText('활동 요약')).toBeInTheDocument();
    expect(within(myPage).getByText('운영 메뉴')).toBeInTheDocument();
    expect(within(myPage).getByText('계정 작업')).toBeInTheDocument();
    expect(within(myPage).getByRole('link', { name: /계정 설정/ })).toHaveAttribute('href', '/my/settings');
    expect(myPage).not.toHaveTextContent('Hero');

    render(<SettingsPageView model={settingsModel} />);
    const settingsPage = screen.getByTestId('settings-open-design');
    expect(settingsPage).toHaveClass('tm-settings-open-design');
    expect(within(settingsPage).getByText('알림 설정')).toBeInTheDocument();
    expect(within(settingsPage).getByText('회원 탈퇴')).toBeInTheDocument();
  });

  it('renders sports settings with a desktop-safe form lane and action bar', () => {
    render(<SportsSettingsPageClient />);

    const form = screen.getByTestId('sports-settings-open-design');
    expect(form).toHaveClass('tm-sports-settings-desktop-lane');
    expect(within(form).getByText('운동 정보를 따로 저장합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '운동 정보 저장' }).parentElement).toHaveClass('tm-sports-settings-action');
  });

  it('renders notification and legal settings with non-destructive utility selectors', () => {
    render(<NotificationSettingsPageView model={notificationSettingsModel} />);
    const notifications = screen.getByTestId('notification-settings-open-design');
    expect(notifications).toHaveClass('tm-notification-settings-desktop-lane');
    expect(screen.queryByTestId('withdrawal-open-design')).not.toBeInTheDocument();

    render(<LegalPageView model={settingsModel} />);
    const legal = screen.getByTestId('legal-settings-open-design');
    expect(legal).toHaveClass('tm-legal-settings-desktop-lane');
  });

  it('renders my team detail without a desktop CTA overlaying recent team matches', () => {
    render(<MyTeamDetailPageView model={getMyTeamDetailModel()} />);

    const detail = screen.getByTestId('my-team-detail-open-design');
    expect(detail).toHaveClass('tm-my-team-detail-desktop-lane');
    expect(within(detail).getByText('최근 팀 매치')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 채팅' }).parentElement?.parentElement).toHaveClass('tm-my-team-detail-action');
  });

  it('renders my match and team management routes as desktop workbenches instead of a stretched mobile list', () => {
    render(<MyMatchesPageView model={getMyMatchesModel('created')} />);
    const created = screen.getByTestId('my-matches-open-design');
    expect(created).toHaveClass('tm-my-matches-desktop-workbench');
    expect(within(created).getByText('전체')).toBeInTheDocument();

    render(<MyTeamsPageView model={myTeamsModel} />);
    const teams = screen.getByTestId('my-teams-open-design');
    expect(teams).toHaveClass('tm-my-teams-desktop-workbench');

    render(<MyTeamMembersPageView model={{
      teamName: '송파 풋살 모임',
      summary: [
        { label: '전체', value: 2, unit: '명' },
        { label: '운영진', value: 1, unit: '명' },
        { label: '검토', value: 1, unit: '명' },
      ],
      members: [],
      requests: [],
    }} />);
    const members = screen.getByTestId('my-team-members-open-design');
    expect(members).toHaveClass('tm-my-team-members-desktop-workbench');
  });

  it('renders profile, location, and withdrawal actions as desktop-safe static action lanes', () => {
    render(<LocationSettingsPageClient />);
    const location = screen.getByTestId('location-settings-open-design');
    expect(location).toHaveClass('tm-location-settings-desktop-lane');
    expect(screen.getByRole('button', { name: '활동 지역 저장' }).parentElement).toHaveClass('tm-location-settings-action');

    render(<WithdrawalPageClient />);
    const withdrawal = screen.getByTestId('withdrawal-open-design');
    expect(withdrawal).toHaveClass('tm-withdrawal-desktop-lane');
    expect(screen.getByRole('button', { name: '탈퇴 요청' }).parentElement).toHaveClass('tm-withdrawal-action');
  });
});
