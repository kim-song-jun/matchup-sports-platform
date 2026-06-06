import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MatchCreatePageView, MatchDetailPageView, MatchListPageView, MatchStatePageView } from './matches-page';
import { getMatchCreateViewModel, getMatchDetailViewModel, getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';

describe('personal match Open Design contract', () => {
  it('renders list discovery, desktop filter rail, detail actions, and honest create/edit flows', () => {
    render(<MatchListPageView model={getMatchListViewModel()} />);

    const listPage = screen.getByTestId('matches-open-design');
    expect(listPage).toHaveClass('tm-matches-open-design');
    expect(listPage).toHaveClass('tm-matches-desktop-workbench');
    expect(within(listPage).getByRole('banner')).toHaveClass('tm-page-header');
    expect(within(listPage).getByText('운영 요약')).toBeInTheDocument();
    expect(within(listPage).getByText('모집 흐름')).toBeInTheDocument();
    expect(within(listPage).getByTestId('matches-filter-rail')).toHaveClass('tm-filter-rail');
    expect(within(listPage).getByRole('link', { name: /매치 만들기/ })).toHaveAttribute('href', '/matches/new');
    expect(within(listPage).getAllByRole('link', { name: /주말 풋살 초보 환영 매치/ })[0]).toHaveAttribute('href', '/matches/match-1');
    expect(within(listPage).getByRole('link', { name: '주말 풋살 초보 환영 매치 참가 신청' })).toHaveAttribute('href', '/matches/match-1?intent=apply');
    expect(within(listPage).getByRole('link', { name: '주말 풋살 초보 환영 매치 상세 보기' })).toHaveAttribute('href', '/matches/match-1');

    cleanup();
    render(<MatchDetailPageView model={getMatchDetailViewModel('mine')} />);
    const detailPage = screen.getByTestId('match-detail-open-design');
    expect(detailPage).toHaveClass('tm-match-detail-open-design');
    expect(detailPage).toHaveClass('tm-match-detail-desktop-stage');
    expect(within(detailPage).getByText('날짜와 시간')).toBeInTheDocument();
    expect(document.querySelector('.tm-match-detail-fixed-cta')).toHaveClass('tm-fixed-cta');
    expect(screen.getByRole('link', { name: '매치 관리' })).toHaveAttribute('href', '/matches/match-5/edit');
    expect(detailPage).not.toHaveTextContent('결제');
    expect(detailPage).not.toHaveTextContent('checkout');

    cleanup();
    render(<MatchCreatePageView model={getMatchCreateViewModel('edit')} />);
    const createPage = screen.getByTestId('match-create-open-design');
    expect(createPage).toHaveClass('tm-match-create-open-design');
    expect(createPage).toHaveClass('tm-match-create-desktop-lane');
    expect(within(createPage).getByText('매치 정보')).toBeInTheDocument();
    expect(document.querySelector('.tm-match-create-cta-row')).toHaveClass('tm-fixed-cta-row-weighted');
    expect(document.querySelector('.tm-match-create-action')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '변경사항 저장' })).toHaveAttribute('href', '/matches/match-1');
    expect(createPage).not.toHaveTextContent('결제');
    expect(createPage).not.toHaveTextContent('checkout');

    cleanup();
    const noop = () => undefined;
    const editWithCancel = getMatchCreateViewModel('edit');
    const editForm = {
      selectedSportId: 'sport-1',
      regionId: 'region-1',
      regions: [],
      onSelectSport: noop,
      onFieldChange: noop,
      onRegionChange: noop,
      onBack: noop,
      onNext: noop,
      onSubmit: noop,
      onCancel: noop,
    } satisfies NonNullable<ReturnType<typeof getMatchCreateViewModel>['form']>;
    render(<MatchCreatePageView model={{
      ...editWithCancel,
      backHref: '/matches/00000000-0000-4000-8000-000000000201',
      form: editForm,
    }} />);
    expect(screen.getByLabelText('뒤로가기')).toHaveAttribute('href', '/matches/00000000-0000-4000-8000-000000000201');
    expect(screen.getByRole('button', { name: '매치 취소' })).toHaveClass('tm-match-create-cancel-button');

    cleanup();
    const filterRender = render(<MatchStatePageView model={getMatchStateViewModel('filter')} />);
    expect(filterRender.container.querySelector('.tm-match-filter-open-design')).toHaveClass('tm-match-create-open-design');
    expect(filterRender.container.querySelector('.tm-match-filter-action')).toBeInTheDocument();

    cleanup();
    render(<MatchStatePageView model={getMatchStateViewModel('joined')} />);
    const joinedPage = screen.getByTestId('match-state-open-design');
    expect(joinedPage).toHaveClass('tm-match-joined-desktop-workbench');

    cleanup();
    render(<MatchStatePageView model={getMatchStateViewModel('empty')} />);
    const emptyPage = screen.getByTestId('match-state-open-design');
    expect(emptyPage).toHaveClass('tm-match-state-lane');
    expect(screen.getByRole('link', { name: '필터 초기화' })).toHaveAttribute('href', '/matches');

    cleanup();
    render(<MatchStatePageView model={getMatchStateViewModel('participants')} />);
    const participantsPage = screen.getByTestId('match-participants-open-design');
    expect(participantsPage).toHaveClass('tm-match-state-lane');
    expect(screen.getByRole('link', { name: '상세로 돌아가기' })).toHaveAttribute('href', '/matches/match-1');

    cleanup();
    render(<MatchCreatePageView model={getMatchCreateViewModel('complete')} />);
    const completePage = screen.getByTestId('match-complete-open-design');
    expect(completePage).toHaveClass('tm-match-create-open-design');
    expect(document.querySelector('.tm-match-create-action')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '목록 보기' })).toHaveAttribute('href', '/matches');
    expect(screen.getByRole('button', { name: '공유 준비 중' })).toBeDisabled();
  });
});
