import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchCreatePageView, MatchDetailPageView, MatchListPageView } from './matches-page';
import { getMatchCreateViewModel, getMatchDetailViewModel, getMatchListViewModel } from './matches.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/matches/match-4',
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

describe('MatchDetailPageView — closed mode (참가한 적 없는 뷰어가 마감류 매치를 볼 때)', () => {
  it('참가 확정 배너/문구를 보여주지 않는다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByText('참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요.')).not.toBeInTheDocument();
  });

  it('채팅 CTA를 보여주지 않는다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByRole('button', { name: /채팅/ })).not.toBeInTheDocument();
  });

  it('중립(회색) 마감 안내 배너를 보여준다', () => {
    const model = getMatchDetailViewModel('closed');
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('모집 완료').length).toBeGreaterThan(0);
    expect(screen.getAllByText('이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요.').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailPageView — approved mode (실제 참가 확정자)', () => {
  it('참가 확정 배너를 정상적으로 보여준다', () => {
    const model = getMatchDetailViewModel('approved');
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요.').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailPageView — 히어로 액션', () => {
  it('이미지 우측 상단에는 공유만 노출한다', () => {
    render(<MatchDetailPageView model={getMatchDetailViewModel('default')} />);

    expect(screen.getAllByRole('button', { name: '공유' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '홈으로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림 목록' })).not.toBeInTheDocument();
  });
});

describe('MatchDetailPageView — host management actions', () => {
  it('매치 수정과 신청자 관리를 서로 다른 실제 경로로 제공한다', () => {
    const model = getMatchDetailViewModel('mine');
    model.match.id = 'match-hosted';
    model.match.editHref = '/matches/match-hosted/edit';
    model.match.applicationsHref = '/matches/match-hosted/applications';

    render(<MatchDetailPageView model={model} />);

    for (const link of screen.getAllByRole('link', { name: '매치 수정' })) {
      expect(link).toHaveAttribute('href', '/matches/match-hosted/edit');
    }
    for (const link of screen.getAllByRole('link', { name: '신청자 관리' })) {
      expect(link).toHaveAttribute('href', '/matches/match-hosted/applications');
    }
  });

  it('호스트가 아닌 상세에는 관리 액션을 노출하지 않는다', () => {
    render(<MatchDetailPageView model={getMatchDetailViewModel('default')} />);

    expect(screen.queryByRole('link', { name: '매치 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '신청자 관리' })).not.toBeInTheDocument();
  });
});

describe('MatchListPageView — 매치 카드 종목 배지', () => {
  it('실제 추천 로직 없이 첫 카드에도 가짜 "추천" 배지를 붙이지 않고 실제 종목명을 보여준다', () => {
    const model = getMatchListViewModel();
    render(<MatchListPageView model={model} />);

    // 첫 번째 매치 카드(match-1)는 풋살 — index===0이라는 이유만으로 "추천"으로 덮이면 안 된다.
    expect(screen.queryByText('추천')).not.toBeInTheDocument();
    expect(screen.getAllByText('풋살').length).toBeGreaterThan(0);
  });
});

// motion-audit 그룹6(F1 desktop card hover) — 데스크톱 매치 리스트 카드는 tm-pressable
// (:active 전용)만 쓰고 있어 마우스 hover 에 아무 피드백도 없었다(getAnimationsSnapshots
// count:0 3회 확인). 이미 존재하는 .tm-card-interactive:hover(box-shadow elevation,
// @media(hover:hover) 가드) 패턴을 카드에 붙이기만 하면 되는 국소 결함이다.
describe('MatchListPageView — 매치 카드 hover 피드백(motion-audit F1)', () => {
  it('카드 링크에 tm-card-interactive 가 붙어 데스크톱 hover 시 elevation 이 걸린다', () => {
    const model = getMatchListViewModel();
    const { container } = render(<MatchListPageView model={model} />);

    const card = container.querySelector('.tm-match-list-card');
    expect(card).not.toBeNull();
    expect(card).toHaveClass('tm-card-interactive');
    // tm-pressable(:active 눌림 피드백)은 그대로 남아 있어야 한다 — hover 추가가
    // 기존 press 피드백을 대체한 게 아니라 나란히 쓰는 것이다.
    expect(card).toHaveClass('tm-pressable');
  });
});

// team-matches-page.test.tsx의 동일 계열 회귀 방지(#5)를 matches 쪽에도 적용한다 —
// 로딩 중을 "조건에 맞는 매치가 없어요"로 잘못 그리던 결함(2026-08-27 감사).
describe('MatchListPageView — 로딩 중 EmptyState 오표시 방지', () => {
  it('isLoading=true면 매치가 0개여도 EmptyState 대신 스켈레톤을 그린다', () => {
    const model = { ...getMatchListViewModel(), matches: [], isLoading: true };
    const { container } = render(<MatchListPageView model={model} />);

    expect(screen.queryByText('조건에 맞는 매치가 없어요')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-skeleton')).toBeInTheDocument();
  });

  it('isLoading이 없고(로딩 완료) 매치가 0개면 EmptyState를 그린다', () => {
    const model = { ...getMatchListViewModel(), matches: [] };
    render(<MatchListPageView model={model} />);

    expect(screen.getByText('조건에 맞는 매치가 없어요')).toBeInTheDocument();
  });
});

// 20건 컷오프 페이지네이션 결함 회귀 방지(2026-08-27 감사) — 서버는 커서로 20건씩
// 자르는데 화면에 다음 페이지로 갈 방법이 없었다.
describe('MatchListPageView — 더 보기 (20건 컷오프 페이지네이션)', () => {
  it('hasNext=true면 "더 보기" 버튼을 보여준다', () => {
    const onLoadMore = vi.fn();
    const model = { ...getMatchListViewModel(), hasNext: true, onLoadMore };
    render(<MatchListPageView model={model} />);

    const button = screen.getByRole('button', { name: '더 보기' });
    button.click();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hasNext가 없으면(마지막 페이지) "더 보기" 버튼이 없다', () => {
    const model = { ...getMatchListViewModel(), hasNext: false };
    render(<MatchListPageView model={model} />);

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('loadMorePending 중에는 버튼이 "불러오는 중…"으로 바뀌고 비활성화된다', () => {
    const model = { ...getMatchListViewModel(), hasNext: true, onLoadMore: vi.fn(), loadMorePending: true };
    render(<MatchListPageView model={model} />);

    const button = screen.getByRole('button', { name: '불러오는 중…' });
    expect(button).toBeDisabled();
  });

  it('로딩 중(스켈레톤 표시)에는 hasNext여도 더 보기 버튼을 보여주지 않는다', () => {
    const model = { ...getMatchListViewModel(), matches: [], isLoading: true, hasNext: true };
    render(<MatchListPageView model={model} />);

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});

describe('MatchCreatePageView — 장소와 시간 단계', () => {
  it('경기와 신청 마감 날짜·시간을 네이티브 선택 필드로 제공한다', () => {
    const model = getMatchCreateViewModel('place-time');
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [{ id: 'region-gangnam', name: '강남구' }],
      onSelectSport: vi.fn(),
      onFieldChange: vi.fn(),
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByLabelText('날짜')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('시작 시간')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('종료 시간')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('신청 마감일')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('신청 마감시간')).toHaveAttribute('type', 'time');
  });
});

describe('MatchCreatePageView — confirm 단계 일시 표기 (종료 시간 미입력 시 하이픈 매달림 방지)', () => {
  it('종료 시간이 비어 있으면 하이픈 없이 시작 시간까지만 보여준다', () => {
    const model = getMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, date: '2026-09-05', startTime: '18:00', endTime: '' };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByText('2026-09-05 18:00')).toBeInTheDocument();
    expect(screen.queryByText('2026-09-05 18:00-')).not.toBeInTheDocument();
  });

  it('종료 시간이 있으면 하이픈으로 구간을 보여준다', () => {
    const model = getMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, date: '2026-09-05', startTime: '18:00', endTime: '20:00' };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByText('2026-09-05 18:00-20:00')).toBeInTheDocument();
  });
});

describe('MatchCreatePageView — 매치 수정 전체 필드', () => {
  it('생성 가능한 모든 매치 정보를 수정할 수 있게 노출한다', () => {
    const model = getMatchCreateViewModel('edit');
    model.selectedSport = '풋살';
    model.sports = ['축구', '풋살'];
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [{ id: 'region-gangnam', name: '강남구' }],
      onSelectSport: vi.fn(),
      onFieldChange: vi.fn(),
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    for (const label of [
      '종목', '제목', '설명', '최대 인원 선택', '최소 레벨', '최대 레벨',
      '규칙', '지역', '장소', '상세 주소', '날짜', '시작 시간', '종료 시간',
      '신청 마감일', '신청 마감시간',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('성별 조건')).toBeInTheDocument();
    expect(screen.getByText('대표 이미지')).toBeInTheDocument();
    expect(screen.getByLabelText('최대 인원 선택')).toContainHTML('<option value="100">100명</option>');
  });
});

// 2026-08-27 감사 M-A-personal-match-state: '매치 취소' 버튼은 lockedReason 게이트가 없어,
// 시작 시각이 지난(터미널) 매치에서도 눌리는 죽은 버튼이었다 — 서버 cancel()이 결국 409로
// 거부하는데도 화면은 아무 사전 신호를 주지 않았다.
describe('MatchCreatePageView — 매치 취소 버튼 잠금', () => {
  function editModel(lockedReason: string | null) {
    const model = getMatchCreateViewModel('edit');
    model.matchId = 'match-locked';
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [{ id: 'region-gangnam', name: '강남구' }],
      onSelectSport: vi.fn(),
      onFieldChange: vi.fn(),
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      lockedReason,
    };
    return model;
  }

  it('lockedReason이 있으면(시작 시각이 지난 매치 등) 매치 취소 버튼도 함께 비활성화한다', () => {
    render(<MatchCreatePageView model={editModel('완료·취소·종료된 매치는 수정할 수 없어요.')} />);

    expect(screen.getByRole('button', { name: '매치 취소' })).toBeDisabled();
  });

  it('lockedReason이 없으면 매치 취소 버튼은 눌린다', () => {
    render(<MatchCreatePageView model={editModel(null)} />);

    expect(screen.getByRole('button', { name: '매치 취소' })).not.toBeDisabled();
  });
});

describe('MatchListPageView — 빈 목록의 세로 정렬', () => {
  // 빈 상태를 화면 중앙에 놓으려면 컨테이너(.tm-list-empty)와 자식(.tm-empty-state-fill)이
  // **둘 다** 필요하다 — 하나만 있으면 예전처럼 상단에 붙는다. 그래서 짝으로 검증한다.
  it('결과가 0건이면 컨테이너에 tm-list-empty 가 붙고 빈 상태가 fill 로 렌더된다', () => {
    const model = { ...getMatchListViewModel(), matches: [], isLoading: false };
    const { container } = render(<MatchListPageView model={model} />);

    expect(container.querySelector('.tm-match-list')).toHaveClass('tm-list-empty');
    expect(container.querySelector('.tm-empty-state')).toHaveClass('tm-empty-state-fill');
  });

  it('카드가 있으면 tm-list-empty 를 붙이지 않는다 — 평소 목록 레이아웃을 건드리지 않는다', () => {
    const model = { ...getMatchListViewModel(), isLoading: false };
    const { container } = render(<MatchListPageView model={model} />);

    expect(model.matches.length).toBeGreaterThan(0);
    expect(container.querySelector('.tm-match-list')).not.toHaveClass('tm-list-empty');
  });

  it('로딩 중에는 붙이지 않는다 — 스켈레톤이 차지하는 자리를 흔들지 않는다', () => {
    const model = { ...getMatchListViewModel(), matches: [], isLoading: true };
    const { container } = render(<MatchListPageView model={model} />);

    expect(container.querySelector('.tm-match-list')).not.toHaveClass('tm-list-empty');
  });
});
