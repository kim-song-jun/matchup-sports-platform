import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AdminMatchesPageView,
  AdminNotificationsPageView,
  AdminReviewsPageView,
  AdminTeamMatchesPageView,
  AdminTeamsPageView,
} from '@/components/community/admin-function-pages';
import { AdminAuditPageView, AdminDashboardPageView } from '@/components/community/admin-page';
import {
  toAdminMatchesPageModel,
  toAdminNotificationsPageModel,
  toAdminReviewsPageModel,
  toAdminTeamMatchesPageModel,
  toAdminTeamsPageModel,
} from '@/components/community/admin.function-view-model';
import { toAdminActivityModel } from '@/components/community/admin.view-model';
import {
  activityModel,
  createdMatches,
  dashboardModel,
  expectCustomerErpCopy,
  expectRuntimeLinksOnly,
  joinRequests,
  notifications,
  pendingReviews,
  profile,
  teamMatches,
  teams,
} from './admin.test-fixtures';

describe('admin customer ERP contract', () => {
  it('renders a customer-facing operations ERP from real v1 user workflows', () => {
    render(<AdminDashboardPageView model={dashboardModel()} />);

    const dashboard = screen.getByTestId('admin-open-design');
    expect(dashboard).toHaveClass('tm-admin-open-design');
    expect(dashboard).toHaveClass('tm-admin-desktop-workbench');
    expect(within(dashboard).getByText('운영 워크스페이스')).toBeInTheDocument();
    expect(within(dashboard).getByText('운영 담당자')).toBeInTheDocument();
    expect(within(dashboard).getByText('오늘 처리할 업무')).toBeInTheDocument();
    expect(within(dashboard).getByText('개인 매치 현황')).toBeInTheDocument();
    expect(within(dashboard).getByText('팀매치 현황')).toBeInTheDocument();
    expect(within(dashboard).getByText('팀 현황')).toBeInTheDocument();
    expect(within(dashboard).getByRole('link', { name: /민준 가입 요청/ })).toHaveAttribute('href', '/my/teams/team-1/members');
    expect(within(dashboard).getByRole('link', { name: /성수 볼러즈 vs 마포 FC 리뷰 미작성/ })).toHaveAttribute('href', '/my/reviews/team_match/team-match-completed-1');
    expect(within(dashboard).getByRole('link', { name: /지원 알림/ })).toHaveAttribute('href', '/notifications');
    expect(within(dashboard).getByRole('link', { name: /개인 매치 만들기/ })).toHaveAttribute('href', '/matches/new');
    expect(within(dashboard).getByRole('link', { name: /팀 매치 만들기/ })).toHaveAttribute('href', '/team-matches/new');
    expect(within(dashboard).getByRole('link', { name: /팀매치 수정/ })).toHaveAttribute('href', '/team-matches/team-match-1/edit');
    expect(within(dashboard).getByRole('link', { name: /멤버\/요청/ })).toHaveAttribute('href', '/my/teams/team-1/members');
    expectCustomerErpCopy(dashboard);
    expectRuntimeLinksOnly(dashboard);

    const dashboardNav = screen.getByLabelText('운영 워크스페이스 메뉴');
    expect(within(dashboardNav).getByText('teameet 운영')).toBeInTheDocument();
    expect(within(dashboardNav).getByRole('link', { name: /워크스페이스/ })).toHaveAttribute('href', '/admin');
    expect(within(dashboardNav).getByRole('link', { name: /개인 매치/ })).toHaveAttribute('href', '/admin/matches');
    expect(within(dashboardNav).getByRole('link', { name: /^팀매치$/ })).toHaveAttribute('href', '/admin/team-matches');
    expect(within(dashboardNav).getByRole('link', { name: /팀 운영/ })).toHaveAttribute('href', '/admin/teams');
    expect(within(dashboardNav).getByRole('link', { name: /리뷰/ })).toHaveAttribute('href', '/admin/reviews');
    expect(within(dashboardNav).getByRole('link', { name: /알림/ })).toHaveAttribute('href', '/admin/notifications');
    expect(within(dashboardNav).getByRole('link', { name: /업무 이력/ })).toHaveAttribute('href', '/admin/audit');
    expect(within(dashboardNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();

    cleanup();
    render(<AdminAuditPageView model={activityModel()} />);
    const audit = screen.getByTestId('admin-audit-open-design');
    expect(within(audit).getByText('업무 이력')).toBeInTheDocument();
    expect(within(audit).getByText('최근 업무 흐름')).toBeInTheDocument();
    expect(within(audit).getByRole('table', { name: '업무 이력' })).toBeInTheDocument();
    expect(within(audit).getByRole('link', { name: /마포 FC 상대팀 모집/ })).toHaveAttribute('href', '/team-matches/team-match-1');
    expectCustomerErpCopy(audit);
    expectRuntimeLinksOnly(audit);
  });

  it('does not render ERP work panels when customer operation data fails to load', () => {
    render(<AdminDashboardPageView model={dashboardModel('error')} />);

    const dashboard = screen.getByTestId('admin-open-design');
    expect(within(dashboard).getByRole('alert')).toHaveTextContent('운영 데이터를 불러오지 못했습니다');
    expect(within(dashboard).queryByLabelText('업무 요약')).not.toBeInTheDocument();
    expect(within(dashboard).queryByText('오늘 처리할 업무')).not.toBeInTheDocument();
    expectCustomerErpCopy(dashboard);

    cleanup();
    render(<AdminAuditPageView model={activityModel('error')} />);

    const audit = screen.getByTestId('admin-audit-open-design');
    expect(within(audit).getByRole('alert')).toHaveTextContent('운영 데이터를 불러오지 못했습니다');
    expect(within(audit).queryByRole('table', { name: '업무 이력' })).not.toBeInTheDocument();
    expectCustomerErpCopy(audit);
  });

  it('sorts customer ERP activity history by raw event time instead of formatted display text', () => {
    const model = toAdminActivityModel({
      profile,
      createdMatches: [{ ...createdMatches[0], id: 'match-old', matchId: 'match-old', title: '2월 개인 매치', startsAt: '2026-02-01T00:00:00.000Z' }],
      teamMatches: [],
      notifications: [{ ...notifications[0], notificationId: 'notification-new', title: '10월 운영 알림', createdAt: '2026-10-01T00:00:00.000Z' }],
      pendingReviews: [],
      states: ['ready'],
    });

    expect(model.items.at(0)?.title).toBe('10월 운영 알림');
    expect(model.items.at(1)?.title).toBe('2월 개인 매치');
  });

  it('does not show review zero-state while pending reviews are still loading', () => {
    render(<AdminReviewsPageView model={toAdminReviewsPageModel({ profile, pendingReviews: [], states: ['loading'] })} />);

    const reviewsPage = screen.getByTestId('admin-reviews-open-design');
    expect(within(reviewsPage).getByRole('status')).toHaveTextContent('리뷰 관리 화면을 준비하고 있습니다');
    expect(within(reviewsPage).queryByText('0개 리뷰 대기')).not.toBeInTheDocument();
    expect(within(reviewsPage).queryByText('작성할 리뷰가 없습니다.')).not.toBeInTheDocument();
  });

  it('ships separate admin function routes backed by editable v1 workflows', () => {
    const routes = [
      'src/app/admin/page.tsx',
      'src/app/admin/matches/page.tsx',
      'src/app/admin/team-matches/page.tsx',
      'src/app/admin/teams/page.tsx',
      'src/app/admin/reviews/page.tsx',
      'src/app/admin/notifications/page.tsx',
      'src/app/admin/audit/page.tsx',
    ];

    for (const route of routes) expect(existsSync(route)).toBe(true);

    render(<AdminMatchesPageView model={toAdminMatchesPageModel({ profile, matches: createdMatches, states: ['ready'] })} />);
    const matchesPage = screen.getByTestId('admin-matches-open-design');
    expect(within(matchesPage).getByText('개설한 개인 매치')).toBeInTheDocument();
    expect(within(matchesPage).getByRole('link', { name: /개인 매치 만들기/ })).toHaveAttribute('href', '/matches/new');
    expect(within(matchesPage).getByRole('link', { name: /성수 풋살장 동네 5:5 상세/ })).toHaveAttribute('href', '/matches/match-1');
    expect(within(matchesPage).getByRole('link', { name: /성수 풋살장 동네 5:5 수정/ })).toHaveAttribute('href', '/matches/match-1/edit');
    expectCustomerErpCopy(matchesPage);
    expectRuntimeLinksOnly(matchesPage);

    cleanup();
    render(<AdminTeamMatchesPageView model={toAdminTeamMatchesPageModel({ profile, teamMatches, states: ['ready'] })} />);
    const teamMatchesPage = screen.getByTestId('admin-team-matches-open-design');
    expect(within(teamMatchesPage).getByText('팀매치 처리')).toBeInTheDocument();
    expect(within(teamMatchesPage).getByRole('link', { name: /팀매치 만들기/ })).toHaveAttribute('href', '/team-matches/new');
    expect(within(teamMatchesPage).getByRole('link', { name: /마포 FC 상대팀 모집 상세/ })).toHaveAttribute('href', '/team-matches/team-match-1');
    expect(within(teamMatchesPage).getByRole('link', { name: /마포 FC 상대팀 모집 수정/ })).toHaveAttribute('href', '/team-matches/team-match-1/edit');
    expectCustomerErpCopy(teamMatchesPage);
    expectRuntimeLinksOnly(teamMatchesPage);

    cleanup();
    render(<AdminTeamsPageView model={toAdminTeamsPageModel({ profile, teams, joinRequests, states: ['ready'] })} />);
    const teamsPage = screen.getByTestId('admin-teams-open-design');
    expect(within(teamsPage).getByText('팀 관리')).toBeInTheDocument();
    expect(within(teamsPage).getByRole('link', { name: /팀 만들기/ })).toHaveAttribute('href', '/teams/new');
    expect(within(teamsPage).getByRole('link', { name: /성수 볼러즈 팀 홈/ })).toHaveAttribute('href', '/my/teams/team-1');
    expect(within(teamsPage).getByRole('link', { name: /성수 볼러즈 멤버\/요청/ })).toHaveAttribute('href', '/my/teams/team-1/members');
    expectCustomerErpCopy(teamsPage);
    expectRuntimeLinksOnly(teamsPage);

    cleanup();
    render(<AdminReviewsPageView model={toAdminReviewsPageModel({ profile, pendingReviews, states: ['ready'] })} />);
    const reviewsPage = screen.getByTestId('admin-reviews-open-design');
    expect(within(reviewsPage).getByText('리뷰 관리')).toBeInTheDocument();
    expect(within(reviewsPage).getByRole('link', { name: /리뷰 목록/ })).toHaveAttribute('href', '/my/reviews');
    expect(within(reviewsPage).getByRole('link', { name: /성수 볼러즈 vs 마포 FC 리뷰 작성/ })).toHaveAttribute('href', '/my/reviews/team_match/team-match-completed-1');
    expectCustomerErpCopy(reviewsPage);
    expectRuntimeLinksOnly(reviewsPage);

    cleanup();
    render(<AdminNotificationsPageView model={toAdminNotificationsPageModel({ profile, notifications, states: ['ready'] })} />);
    const notificationsPage = screen.getByTestId('admin-notifications-open-design');
    expect(within(notificationsPage).getByText('알림 관리')).toBeInTheDocument();
    expect(within(notificationsPage).getByRole('link', { name: /알림 전체 보기/ })).toHaveAttribute('href', '/notifications');
    expect(within(notificationsPage).getByRole('link', { name: /팀매치 신청 도착 확인/ })).toHaveAttribute('href', '/team-matches/team-match-1');
    expect(within(notificationsPage).getByRole('link', { name: /지원 알림 확인/ })).toHaveAttribute('href', '/notifications');
    expectCustomerErpCopy(notificationsPage);
    expectRuntimeLinksOnly(notificationsPage);
  });

  it('keeps customer ERP activity rows stacked through the narrow tablet boundary', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');

    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.tm-admin-table\s*\{[\s\S]*?overflow-x: visible;[\s\S]*?\.tm-admin-table-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?min-width: 0;/);
  });

  it('styles the ERP desktop shell as a service workspace instead of an internal dark console', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');

    expect(css).toMatch(/\.tm-desktop-nav-admin\s*\{[\s\S]*?background:\s*var\(--static-white\);[\s\S]*?color:\s*var\(--text-strong\);/);
    expect(css).toMatch(/\.tm-desktop-nav-admin\s+\.tm-desktop-tab-list\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(css).toMatch(/\.tm-admin-operations-grid\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*14px;/);
    expect(css).toMatch(/\.tm-admin-domain\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/);
    expect(css).toMatch(/\.tm-admin-kpi-grid,[\s\S]*?\.tm-admin-domain-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\);/);
    expect(css).toMatch(/@media \(min-width:\s*1181px\)[\s\S]*?\.tm-admin-function-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(720px,\s*1fr\)\s*minmax\(300px,\s*380px\);/);
    expect(css).toMatch(/\.tm-admin-function-table\s*\{[\s\S]*?grid-template-columns:\s*minmax\(220px, 1\.3fr\) minmax\(150px, \.8fr\) minmax\(220px, 1fr\) minmax\(190px, auto\);/);
  });
});
