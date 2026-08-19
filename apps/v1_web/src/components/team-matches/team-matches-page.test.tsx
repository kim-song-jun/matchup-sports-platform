import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TeamMatchCreatePageView, TeamMatchDetailPageView, TeamMatchListPageView } from './team-matches-page';
import { getTeamMatchCreateViewModel, getTeamMatchDetailViewModel, getTeamMatchListViewModel } from './team-matches.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/team-match-1/edit',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('team match images', () => {
  it('renders the API image with a local fallback on list cards', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], imageUrl: 'https://cdn.example.com/team-match.webp' }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);
    const media = container.querySelector<HTMLElement>('.tm-team-match-vs');

    expect(media?.style.backgroundImage).toContain('https://cdn.example.com/team-match.webp');
    expect(media?.style.backgroundImage).toContain('/mock/generated/team-huddle.webp');
  });

  it('renders the API image with a local fallback on the detail hero', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.imageUrl = '/uploads/team-match-cover.webp';

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const hero = container.querySelector<HTMLElement>('.tm-team-vs-hero');

    expect(hero?.style.backgroundImage).toContain('/uploads/team-match-cover.webp');
    expect(hero?.style.backgroundImage).toContain('/mock/generated/team-huddle.webp');
  });
});

describe('team match full edit', () => {
  it('shows immutable team context and every mutable field, including the cover image', () => {
    const model = getTeamMatchCreateViewModel('edit');
    model.selectedTeam = '다이나믹 FS';
    model.selectedSport = '풋살';
    model.form = {
      selectedTeamId: 'team-1',
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [{ id: 'region-gangnam', name: '서울 강남구' }],
      onSelectTeam: () => undefined,
      onSelectSport: () => undefined,
      onFieldChange: () => undefined,
      onRegionChange: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onSubmit: () => undefined,
    };

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByText('다이나믹 FS')).toBeInTheDocument();
    expect(screen.getAllByText('풋살').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/배경 이미지 선택/)).toBeInTheDocument();
    for (const label of [
      '매치 제목', '설명', '실력등급', '경기방식',
      '경기 스타일', '유니폼 색상', '장소',
      '상세 주소', '날짜', '시작 시간', '종료 시간', '신청 마감일', '신청 마감시간',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/총비용/)).toBeInTheDocument();
    expect(screen.getByLabelText(/상대팀 부담금/)).toBeInTheDocument();
    expect(screen.getByText('성별 조건')).toBeInTheDocument();
    expect(screen.getByText('지역')).toBeInTheDocument();
  });
});

describe('팀매치 만들기 진행 표시줄 — 클릭 이동', () => {
  it('각 단계가 클릭 가능한 버튼이고, 조사(으로/로)가 올바르게 붙는다', () => {
    const onGoToStep = vi.fn();
    const model = getTeamMatchCreateViewModel('team');
    model.form = {
      selectedTeamId: 'team-1',
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectTeam: () => undefined,
      onSelectSport: () => undefined,
      onFieldChange: () => undefined,
      onRegionChange: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onSubmit: () => undefined,
      onGoToStep,
    };

    renderPage(<TeamMatchCreatePageView model={model} />);

    // 받침 있는 라벨(팀 선택, 경기조건 등)은 "으로", 받침 없는 라벨(매치 정보)은 "로".
    expect(screen.getByRole('button', { name: '1단계 팀 선택으로 이동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3단계 매치 정보로 이동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4단계 경기조건으로 이동' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '5단계 장소와 시간으로 이동' }));
    expect(onGoToStep).toHaveBeenCalledWith('place-time');
  });

  it('onGoToStep이 없으면(정적 렌더) 예전처럼 읽기 전용 progressbar로 남는다', () => {
    const model = getTeamMatchCreateViewModel('team');
    model.form = {
      selectedTeamId: 'team-1',
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectTeam: () => undefined,
      onSelectSport: () => undefined,
      onFieldChange: () => undefined,
      onRegionChange: () => undefined,
      onBack: () => undefined,
      onNext: () => undefined,
      onSubmit: () => undefined,
    };

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /단계.*이동/ })).not.toBeInTheDocument();
  });
});

// 리그전 배지(2026-08-18). 배지가 조용히 사라지거나, 반대로 일반 팀매치에까지 붙는
// 회귀를 둘 다 잡는다 -- 한쪽만 단언하면 "항상 보임"/"항상 안 보임" 회귀를 놓친다.
describe('리그전 배지', () => {
  it('리그 소속이면 목록 카드에 리그전 배지가 보인다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    expect(container.textContent).toContain('리그전');
  });

  it('리그 소속이 아니면 목록 카드에 리그전 배지가 없다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: null }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    expect(container.textContent).not.toContain('리그전');
  });

  it('상세에서는 리그명과 함께 리그 홈으로 링크한다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = { leagueId: 'lg-1', title: '가을 리그' };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const link = container.querySelector<HTMLAnchorElement>('a[href="/league-matches/lg-1"]');

    // 링크가 있어야 리그 상세로 갈 수 있다 -- 이 화면 외에는 진입점이 없다.
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('가을 리그');
  });

  it('리그 소속이 아니면 상세에 리그 링크가 없다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = null;

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(container.querySelector('a[href^="/league-matches/"]')).toBeNull();
  });
});
