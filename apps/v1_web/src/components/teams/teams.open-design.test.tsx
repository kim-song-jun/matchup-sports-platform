import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TeamDetailPageView, TeamFormPageView, TeamListPageView, TeamMembersPageView, TeamStatePageView } from './teams-page';
import { toServiceFacingTeamIntro } from './teams-service-copy';
import { getTeamDetailViewModel, getTeamFormViewModel, getTeamListViewModel, getTeamStateViewModel } from './teams.view-model';

function expectNoInternalServiceCopy(container: HTMLElement) {
  expect(container).not.toHaveTextContent(/\bv1\b|API|contract|route|fixture|smoke|coverage|계약/i);
}

describe('teams Open Design contract', () => {
  it('removes internal seed markers from team introduction copy', () => {
    const intro = toServiceFacingTeamIntro({
      introduction: '커버 가입 마감 팀 seed coverage',
      regionName: '강남구',
      sportName: '러닝',
    });

    expect(intro).toBe('커버 가입 마감 팀');
    expect(intro).not.toMatch(/\bv1\b|API|contract|route|fixture|smoke|coverage|seed|계약/i);
  });

  it('renders team browse, detail, create, and honest trust signals', () => {
    render(<TeamListPageView model={getTeamListViewModel()} />);

    const listPage = screen.getByTestId('teams-open-design');
    expectNoInternalServiceCopy(listPage);
    expect(listPage).toHaveClass('tm-teams-open-design');
    expect(listPage).toHaveClass('tm-teams-desktop-workbench');
    expect(within(listPage).getByRole('banner')).toHaveClass('tm-page-header');
    expect(within(listPage).getByText('팀 운영 요약')).toBeInTheDocument();
    expect(within(listPage).getByText('모집 현황')).toBeInTheDocument();
    expect(within(listPage).getByTestId('teams-filter-rail')).toHaveClass('tm-filter-rail');
    expect(within(listPage).getByRole('link', { name: /팀 만들기/ })).toHaveAttribute('href', '/teams/new');
    expect(within(listPage).getByRole('link', { name: '성수 러너스 FC 가입 검토' })).toHaveAttribute('href', '/teams/team-1?intent=join');
    expect(within(listPage).getByRole('link', { name: '성수 러너스 FC 팀 보기' })).toHaveAttribute('href', '/teams/team-1');
    expect(within(listPage).getAllByText('검증됨')[0]).toBeInTheDocument();
    expect(within(listPage).getByText('추정')).toBeInTheDocument();
    expect(within(listPage).getByText('샘플')).toBeInTheDocument();

    cleanup();
    render(<TeamDetailPageView model={getTeamDetailViewModel('mine')} />);
    const detailPage = screen.getByTestId('team-detail-open-design');
    expectNoInternalServiceCopy(detailPage);
    expect(detailPage).toHaveClass('tm-team-detail-open-design');
    expect(within(detailPage).getByText('팀 기본 정보')).toBeInTheDocument();
    expect(within(detailPage).getAllByText('검증됨').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '팀 관리' }).parentElement).toHaveClass('tm-team-detail-action');

    cleanup();
    render(<TeamFormPageView model={getTeamFormViewModel('create')} />);
    const formPage = screen.getByTestId('team-form-open-design');
    expect(formPage).toHaveClass('tm-team-form-open-design');
    expect(formPage).toHaveClass('tm-team-form-desktop-lane');
    expect(within(formPage).getByText('새 팀을 만들어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '팀 만들기' }).parentElement).toHaveClass('tm-team-form-cta-row');

    cleanup();
    render(<TeamFormPageView model={getTeamFormViewModel('edit')} />);
    const editFormPage = screen.getByTestId('team-form-open-design');
    expect(editFormPage).toHaveClass('tm-team-form-open-design');
    expect(editFormPage).toHaveClass('tm-team-form-desktop-lane');
    expect(screen.getByRole('button', { name: '저장' }).parentElement).toHaveClass('tm-team-form-cta-row');

    cleanup();
    render(<TeamStatePageView model={getTeamStateViewModel('filter')} />);
    const filterPage = screen.getByTestId('team-filter-open-design');
    expect(filterPage).toHaveClass('tm-team-form-open-design');
    expect(filterPage).toHaveClass('tm-team-filter-open-design');
    expect(document.querySelector('.tm-team-filter-action')).toBeInTheDocument();

    cleanup();
    render(<TeamStatePageView model={getTeamStateViewModel('search')} />);
    const searchPage = screen.getByTestId('team-state-open-design');
    expect(searchPage).toHaveClass('tm-team-state-desktop-lane');

    cleanup();
    render(<TeamMembersPageView model={{
      teamName: '송파 풋살 모임',
      summary: { total: 4, managers: 1, pending: 1 },
      members: [],
      requests: [],
    }} />);
    const membersPage = screen.getByTestId('team-members-open-design');
    expect(membersPage).toHaveClass('tm-team-members-desktop-lane');
  });
});
