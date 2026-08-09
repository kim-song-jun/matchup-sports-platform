import { render, screen } from '@testing-library/react';
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
