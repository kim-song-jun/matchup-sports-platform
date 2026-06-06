import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TeamMatchCreatePageView, TeamMatchDetailPageView, TeamMatchListPageView, TeamMatchStatePageView } from './team-matches-page';
import {
  getTeamMatchCreateViewModel,
  getTeamMatchDetailViewModel,
  getTeamMatchListViewModel,
  getTeamMatchStateViewModel,
} from './team-matches.view-model';

describe('team match Open Design contract', () => {
  it('renders list discovery, desktop filter rail, detail actions, and honest create/edit flows', () => {
    render(<TeamMatchListPageView model={getTeamMatchListViewModel()} />);

    const listPage = screen.getByTestId('team-matches-open-design');
    expect(listPage).toHaveClass('tm-team-matches-open-design');
    expect(listPage).toHaveClass('tm-team-matches-desktop-workbench');
    expect(within(listPage).getByRole('banner')).toHaveClass('tm-page-header');
    expect(within(listPage).getByText('운영 요약')).toBeInTheDocument();
    expect(within(listPage).getByText('비교 대기')).toBeInTheDocument();
    expect(within(listPage).getByTestId('team-matches-filter-rail')).toHaveClass('tm-filter-rail');
    expect(within(listPage).getByRole('link', { name: /팀매치 만들기/ })).toHaveAttribute('href', '/team-matches/new');
    const firstTeamMatchCard = within(listPage).getAllByRole('article', { name: /FC 발빠른놈들 vs 상대팀 구합니다/ })[0];
    expect(firstTeamMatchCard).toHaveClass('tm-team-match-card-scan');
    expect(firstTeamMatchCard.querySelector('.tm-team-match-scoreboard')).toBeInTheDocument();
    expect(firstTeamMatchCard.querySelector('.tm-team-match-card-body')).toBeInTheDocument();
    expect(within(firstTeamMatchCard).getByText('FC 발빠른놈들')).toHaveClass('tm-team-match-team-name');
    expect(within(firstTeamMatchCard).getByRole('link', { name: 'FC 발빠른놈들 vs 상대팀 구합니다 신청팀 검토' })).toHaveAttribute('href', '/team-matches/team-match-1?intent=apply');
    expect(within(firstTeamMatchCard).getByRole('link', { name: 'FC 발빠른놈들 vs 상대팀 구합니다 상세 보기' })).toHaveAttribute('href', '/team-matches/team-match-1');

    cleanup();
    render(<TeamMatchDetailPageView model={getTeamMatchDetailViewModel('mine')} />);
    const detailPage = screen.getByTestId('team-match-detail-open-design');
    expect(detailPage).toHaveClass('tm-team-match-detail-open-design');
    expect(within(detailPage).getByText('경기정보')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '매치 관리' })).toHaveAttribute('href', '/team-matches/team-match-4/edit');
    expect(screen.getByRole('link', { name: '매치 관리' }).parentElement?.parentElement).toHaveClass('tm-team-match-detail-action');
    expect(detailPage).not.toHaveTextContent('도착 인증');
    expect(detailPage).not.toHaveTextContent('평가');
    expect(detailPage).not.toHaveTextContent('스코어');

    cleanup();
    render(<TeamMatchStatePageView model={getTeamMatchStateViewModel('filter')} />);
    const filterPage = screen.getByTestId('team-match-filter-open-design');
    expect(filterPage).toHaveClass('tm-team-match-create-desktop-lane');
    expect(document.querySelector('.tm-team-match-filter-action')).toBeInTheDocument();
    expect(document.querySelector('.tm-team-match-filter-cta-row')).toHaveClass('tm-fixed-cta-row-weighted');

    cleanup();
    render(<TeamMatchStatePageView model={getTeamMatchStateViewModel('empty')} />);
    const emptyPage = screen.getByTestId('team-match-state-open-design');
    expect(emptyPage).toHaveClass('tm-team-match-state-lane');
    expect(screen.getByRole('link', { name: '필터 초기화' })).toHaveAttribute('href', '/team-matches');

    cleanup();
    render(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('complete')} />);
    const completePage = screen.getByTestId('team-match-complete-open-design');
    expect(completePage).toHaveClass('tm-team-match-create-desktop-lane');
    expect(screen.getByRole('link', { name: '목록 보기' })).toHaveAttribute('href', '/team-matches');
    expect(screen.getByRole('button', { name: '공유 준비 중' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: '상세 보기' })).not.toBeInTheDocument();
    expect(screen.queryByText('팀 채팅에 공유')).not.toBeInTheDocument();
    expect(within(completePage).getByText('팀 채팅 공유 준비 중')).toBeInTheDocument();
    expect(within(completePage).getByText('초대 링크 준비 중')).toBeInTheDocument();
    expect(within(completePage).getByText('후보 발송 준비 중')).toBeInTheDocument();

    cleanup();
    render(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('edit')} />);
    const createPage = screen.getByTestId('team-match-create-open-design');
    expect(createPage).toHaveClass('tm-team-match-create-open-design');
    expect(createPage).toHaveClass('tm-team-match-create-desktop-lane');
    expect(within(createPage).getByText('매치 정보')).toBeInTheDocument();
    expect(document.querySelector('.tm-team-match-create-action')).toBeInTheDocument();
    expect(document.querySelector('.tm-team-match-create-cta-row')).toHaveClass('tm-fixed-cta-row-weighted');
    expect(screen.getByRole('link', { name: '변경사항 저장' })).toHaveAttribute('href', '/team-matches/team-match-1');
    expect(createPage).not.toHaveTextContent('도착 인증');
    expect(createPage).not.toHaveTextContent('평가');
    expect(createPage).not.toHaveTextContent('스코어');

    cleanup();
    const noop = () => undefined;
    const editWithCancel = getTeamMatchCreateViewModel('edit');
    render(<TeamMatchCreatePageView model={{
      ...editWithCancel,
      form: {
        selectedTeamId: 'team-1',
        selectedSportId: 'sport-1',
        regionId: 'region-1',
        regions: [],
        onSelectTeam: noop,
        onSelectSport: noop,
        onFieldChange: noop,
        onRegionChange: noop,
        onBack: noop,
        onNext: noop,
        onSubmit: noop,
        onCancel: noop,
      },
    }} />);
    cleanup();
    render(<TeamMatchCreatePageView model={{
      ...editWithCancel,
      backHref: '/team-matches/00000000-0000-4000-8000-000000000306',
      form: {
        selectedTeamId: 'team-1',
        selectedSportId: 'sport-1',
        regionId: 'region-1',
        regions: [],
        onSelectTeam: noop,
        onSelectSport: noop,
        onFieldChange: noop,
        onRegionChange: noop,
        onBack: noop,
        onNext: noop,
        onSubmit: noop,
      },
    }} />);
    expect(screen.getByLabelText('뒤로가기')).toHaveAttribute('href', '/team-matches/00000000-0000-4000-8000-000000000306');
    cleanup();
    render(<TeamMatchCreatePageView model={{
      ...editWithCancel,
      form: {
        selectedTeamId: 'team-1',
        selectedSportId: 'sport-1',
        regionId: 'region-1',
        regions: [],
        onSelectTeam: noop,
        onSelectSport: noop,
        onFieldChange: noop,
        onRegionChange: noop,
        onBack: noop,
        onNext: noop,
        onSubmit: noop,
        onCancel: noop,
      },
    }} />);
    expect(screen.getByRole('button', { name: '팀매치 취소' })).toHaveClass('tm-team-match-create-cancel-button');
  });
});
