import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchCreatePageView, TeamMatchDetailPageView, TeamMatchListPageView } from './team-matches-page';
import { getTeamMatchCreateViewModel, getTeamMatchDetailViewModel, getTeamMatchListViewModel } from './team-matches.view-model';

// routerPush를 vi.hoisted로 모듈 스코프에 고정 — useRouter()가 매 렌더 새 vi.fn()을
// 반환하면 클릭 핸들러가 실제로 호출한 push를 테스트에서 단언할 방법이 없다.
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/team-match-1/edit',
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  routerPush.mockClear();
});

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
//
// 페이지 전체 textContent 에 '리그전' 이 있는지로 판정하지 않는다(2026-08-21 정정).
// 그 방식은 화면 어디든 '리그'로 끝나는 요소와 '전'으로 시작하는 요소가 나란히 놓이면
// 오탐한다 -- 실제로 매치 유형 세그먼트에 '리그' 탭이 생기자 바로 옆 '전체' 칩과 이어
// 붙어 '리그전체' 가 되면서 이 단언이 깨졌다(배지는 없는데도). 배지는 접근 가능한
// 이름을 가진 버튼이므로 그 역할로 정확히 겨냥한다.
describe('리그전 배지', () => {
  const leagueBadge = () => screen.queryByRole('button', { name: /리그 상세로 이동/ });

  it('리그 소속이면 목록 카드에 리그전 배지가 보인다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    renderPage(<TeamMatchListPageView model={model} />);

    const badge = leagueBadge();
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('리그전');
  });

  it('리그 소속이 아니면 목록 카드에 리그전 배지가 없다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: null }];

    renderPage(<TeamMatchListPageView model={model} />);

    expect(leagueBadge()).not.toBeInTheDocument();
  });

  // R3(2026-08-20): 목록 카드는 카드 전체가 이미 상세로 가는 <a>다. 배지를 또 <a>로
  // 만들면 <a> 안에 <a>가 중첩돼 브라우저가 바깥 태그를 조기에 닫아버린다 -- 그래서
  // button + preventDefault/stopPropagation로 구현했다. 이 두 테스트가 그 계약을 지킨다.
  it('목록 카드의 리그전 배지는 중첩 <a> 없이 button으로 렌더된다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    // 카드 자체의 href는 여전히 팀매치 상세를 가리킨다 -- 카드 링크는 유지.
    expect(container.querySelector('a[href="/team-matches/team-match-1"]')).not.toBeNull();
    // 리그 배지는 <a>가 아니어야 한다 -- 중첩 <a>면 이 셀렉터가 걸린다.
    expect(container.querySelector('a[href="/league-matches/lg-1"]')).toBeNull();
    expect(screen.getByRole('button', { name: '가을 리그 리그 상세로 이동' })).toBeInTheDocument();
  });

  it('목록 카드의 리그전 배지를 클릭하면 카드 자체 이동 없이 리그 상세로만 한 번 이동한다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    renderPage(<TeamMatchListPageView model={model} />);
    fireEvent.click(screen.getByRole('button', { name: '가을 리그 리그 상세로 이동' }));

    // stopPropagation이 실패해 카드 링크까지 같이 눌렸다면 team-matches 경로로도
    // push가 호출되거나 push가 두 번 호출된다 -- 정확히 리그 경로 한 번만 확인한다.
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/league-matches/lg-1');
  });

  it('상세에서는 리그명과 함께 리그 배지를 보여준다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = { leagueId: 'lg-1', title: '가을 리그' };

    renderPage(<TeamMatchDetailPageView model={model} />);

    // hostTeamCard가 모바일·데스크톱 레이아웃 두 곳에 동시 마운트되므로 배지도 2개.
    const badges = screen.getAllByRole('button', { name: '가을 리그 리그 상세로 이동' });
    expect(badges).toHaveLength(2);
    badges.forEach((badge) => expect(badge).toHaveTextContent('가을 리그'));
  });

  it('리그 소속이 아니면 상세에 리그 배지가 없다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = null;

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(container.querySelector('a[href^="/league-matches/"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /리그 상세로 이동/ })).not.toBeInTheDocument();
  });

  // R3 후속(2026-08-20, 오케스트레이터 지적): hostTeamCard 전체가 이미 팀 상세로 가는
  // Link인데 그 안의 리그 배지도 Link였다 -- 실제 중첩 <a>. 목록 카드(TeamMatchCard)와
  // 동일한 button 패턴으로 고쳤고, 이 두 테스트가 그 계약을 지킨다.
  it('상세 카드의 리그 배지는 중첩 <a> 없이 button으로 렌더되고, 카드 자체 href는 팀 경로로 유지된다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = { leagueId: 'lg-1', title: '가을 리그' };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    // hostTeamCard 자체 링크는 여전히 팀 상세를 가리킨다(fixture에 hostTeamHref가 없어 기본값 /teams).
    expect(container.querySelector('a[href="/teams"]')).not.toBeNull();
    // 리그 배지는 <a>가 아니어야 한다 -- 중첩 <a>면 이 셀렉터가 걸린다.
    expect(container.querySelector('a[href="/league-matches/lg-1"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: '가을 리그 리그 상세로 이동' })).toHaveLength(2);
  });

  it('상세 카드의 리그 배지를 클릭하면 카드 자체 이동 없이 리그 상세로만 한 번 이동한다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = { leagueId: 'lg-1', title: '가을 리그' };

    renderPage(<TeamMatchDetailPageView model={model} />);
    const [badge] = screen.getAllByRole('button', { name: '가을 리그 리그 상세로 이동' });
    fireEvent.click(badge);

    // stopPropagation이 실패해 hostTeamCard 링크까지 같이 눌렸다면 팀 경로로도 push가
    // 호출되거나 push가 두 번 호출된다 -- 정확히 리그 경로 한 번만 확인한다.
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/league-matches/lg-1');
  });
});

/**
 * 2026-08-23 alpha 실측 회귀 방지 — 팀매치 상세/목록이 "모르는 값"을 숫자로 지어내지 않는지.
 *
 * 원래 결함: 비용·매너·전적이 비어 있으면 화면 골격용 목업(140,000원 · 매너 4.8 · 승 23)이
 * 그대로 노출돼 **어느 매치를 열어도 같은 숫자**가 보였다. 1차 수정에서 이를 0으로 바꿨더니
 * 이번엔 모든 매치가 "매너 0 · 승 0"이 되고 costNote 없는 매치가 전부 '무료초청'으로 둔갑했다.
 * 최종 계약: 모르는 값은 null 이고, 화면은 그 줄·그룹을 **감춘다**.
 */
describe('값을 모를 때(null) 화면이 숫자를 지어내지 않는다', () => {
  it('상세: 매너·전적이 null 이면 그 줄을 감추고, 비용이 null 이면 비용 그룹 자체를 감춘다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.manner = null;
    model.match.wins = null;
    model.match.cost = null;
    model.match.opponentCost = null;

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText(/매너/)).not.toBeInTheDocument();
    expect(screen.queryByText('상대팀 부담금')).not.toBeInTheDocument();
    expect(screen.queryByText('총비용')).not.toBeInTheDocument();
    // 0원을 '무료'로 단정하던 자리도 사라져야 한다.
    expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
    expect(screen.queryByText('실제 청구 없어요')).not.toBeInTheDocument();
  });

  it('상세: 비용이 실제로 0원이면 무료초청 표기는 그대로 살아 있다(회귀 방지)', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.cost = 0;
    model.match.opponentCost = 0;

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getAllByText('무료초청').length).toBeGreaterThan(0);
    expect(screen.getByText('실제 청구 없어요')).toBeInTheDocument();
  });

  it('목록 카드: 비용이 null 이면 금액 대신 비용 미정을 보여주고 무료초청 배지를 붙이지 않는다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = model.matches.map((match) => ({ ...match, cost: null, opponentCost: null, manner: null, wins: null }));

    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getAllByText('비용 미정').length).toBeGreaterThan(0);
    expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
    expect(screen.queryByText(/매너/)).not.toBeInTheDocument();
  });
});
