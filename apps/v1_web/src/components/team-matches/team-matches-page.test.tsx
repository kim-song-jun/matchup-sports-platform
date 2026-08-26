import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
describe('경기 조건 — 값이 없는 항목', () => {
  // D7(2026-08-24 사용자 확정): 값이 비면 행을 숨기지 않고 '미정'을 적는다.
  // 리그 대진은 운영자가 만들기 때문에 경기방식·스타일·유니폼이 애초에 비어 있는데,
  // 그동안 값 칸이 통째로 공백이라 화면이 "정보 없음"이 아니라 "깨짐"처럼 보였다.
  it('경기방식·경기 스타일·유니폼 색상이 비어 있으면 값 자리에 미정을 적는다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, format: '', style: '', uniform: '' };

    renderPage(<TeamMatchDetailPageView model={model} />);

    // 세 항목이 비었으므로 '미정'이 최소 3개 — 행 자체는 사라지지 않아야 한다.
    expect(screen.getAllByText('미정').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('경기방식')).toBeInTheDocument();
    expect(screen.getByText('경기 스타일')).toBeInTheDocument();
    expect(screen.getByText('유니폼 색상')).toBeInTheDocument();
  });

  it('값이 있으면 그대로 보여주고 미정으로 덮어쓰지 않는다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, format: '5:5', style: '친선', uniform: '빨강' };

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('5:5')).toBeInTheDocument();
    expect(screen.getByText('빨강')).toBeInTheDocument();
  });
});

describe('리그전 배지', () => {
  const leagueBadge = () => screen.queryByRole('button', { name: /리그 상세로 이동/ });

  it('리그 소속이면 목록 카드에 리그전 배지가 보인다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    renderPage(<TeamMatchListPageView model={model} />);

    const badge = leagueBadge();
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('정규 리그');
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

/**
 * alpha 실측 결함(그룹 A, C-1) — 이미 대진이 확정되거나 끝난 리그 경기를 비로그인
 * 관전자가 열면 히어로가 "상대팀 · 모집 중 · 신청 후 승인"을 보여줬다. mode는
 * viewerState만 보고 'default'로 떨어지는데(비참여자는 항상 default), 히어로는
 * mode만 보고 문구를 정했기 때문 — 실제 상대팀 이름(approvedOpponentTeam)과 경기
 * 진행 상태(API status)는 이미 model에 있는데도 화면이 쓰지 않았다.
 */
describe('상세 히어로 — 상대가 정해졌거나 끝난 매치는 "모집 중"이 아니다', () => {
  it('상대팀이 승인 확정됐으면(승인 완료) 히어로가 실제 상대팀 이름을 보여준다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.status = 'closed';
    model.match.applicantTeams = [{ name: '브라보FC', meta: '승인된 상대팀', status: '승인 완료' }];
    model.statusLabel = '경기 종료';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('브라보FC')).toBeInTheDocument();
    // '경기 종료'는 히어로 서브 문구 + 데스크톱/모바일 CTA 카드 상태줄에도 같은 model.statusLabel을
    // 재사용해 여러 곳에 나온다(기존 CTA 카드도 동일 패턴 — 위 '무료초청' 테스트 참고).
    expect(screen.getAllByText('경기 종료').length).toBeGreaterThan(0);
    expect(screen.queryByText('모집 중')).not.toBeInTheDocument();
    expect(screen.queryByText('신청 후 승인')).not.toBeInTheDocument();
  });

  it('상대팀이 아직 없는 채로 마감됐으면(신청팀 0) "모집 마감"을 보여주고 "모집 중"은 보여주지 않는다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.status = 'closed';
    model.match.applicantTeams = [];
    model.statusLabel = '신청 마감';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('모집 마감')).toBeInTheDocument();
    expect(screen.queryByText('모집 중')).not.toBeInTheDocument();
  });

  it('아직 모집 중인 매치(status=open)는 예전처럼 "모집 중"을 그대로 보여준다(회귀 방지)', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.status = 'open';
    model.match.applicantTeams = [];

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('모집 중')).toBeInTheDocument();
  });
});

/**
 * 2026-08-25 사용자 보고 — 상세 우측 홈팀 카드의 "이상한 글씨들":
 * ① trustState 영문 원문("estimated")이 배지에 그대로 떴다 — API에 존재하지 않는
 *    gold/silver/bronze만 매핑하고 나머지를 원문 fall-through 하던 죽은 테이블이 원인.
 * ② 등급 미입력 매치(리그 대진 등 levelLabel 없음)는 값 없는 "등급" 배지가 떴다.
 * ③ 승인된 뷰어의 히어로 상대팀 자리에 팀 이름 대신 신청 상태("승인 완료")가 떴다.
 */
describe('상세 홈팀 카드·히어로 — 표기 결함 회귀(2026-08-25)', () => {
  it('trustState=estimated 는 영문 원문이 아니라 "누적 중"으로 표기한다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.hostTeamTrustState = 'estimated';

    renderPage(<TeamMatchDetailPageView model={model} />);

    // hostTeamCard 는 모바일용·데스크톱용 두 위치에 렌더된다 — 개수는 세지 않는다.
    expect(screen.getAllByText('누적 중').length).toBeGreaterThan(0);
    expect(screen.queryByText('estimated')).not.toBeInTheDocument();
  });

  it('등급이 비어 있으면 값 없는 "등급" 배지를 만들지 않고 정보 행은 미정으로 채운다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.grade = '';

    renderPage(<TeamMatchDetailPageView model={model} />);

    // 빈 grade 는 배지 텍스트가 접미사만 남은 "등급"이 된다 — 그 노드가 없어야 한다.
    expect(screen.queryByText('등급')).not.toBeInTheDocument();
    expect(screen.getByText('실력등급')).toBeInTheDocument();
  });

  it('승인 완료(approved) 뷰어의 히어로에는 상태 문구 대신 승인된 팀 이름이 뜬다', () => {
    const model = getTeamMatchDetailViewModel('approved');
    model.match.applicantTeams = [{ name: '브라보FC', meta: '승인된 상대팀', status: '승인 완료' }];

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('브라보FC')).toBeInTheDocument();
  });
});

// C2 — 상세 히어로 CTA가 '신청 취소'라고 적어두고 실제로는 다른 팀으로 **새 신청**을 보내던
// 결함의 화면 쪽 계약. 근거를 하나로 모으는 수정은 team-matches-client.tsx에서 했고, 여기서는
// ① 실행할 액션이 없으면 버튼이 눌리지 않는다 ② 눌렀을 때의 안내가 실제로 한 일과 일치한다
// 두 가지를 고정한다 — 둘 중 하나라도 깨지면 다시 "말과 행동이 다른 버튼"이 된다.
describe('팀매치 상세 히어로 CTA — 안내와 실제 동작', () => {
  it('신청 중인데 실행할 액션이 없으면 CTA가 눌리지 않는다', () => {
    const model = getTeamMatchDetailViewModel('pending');
    const label = '팀 운영진만 취소할 수 있어요';
    model.applyLabel = label;
    model.onApply = undefined;

    renderPage(<TeamMatchDetailPageView model={model} />);

    // 모바일 고정 바 + 데스크톱 스티키 카드 두 곳에 렌더된다 — 양쪽 다 비활성이어야 한다.
    const buttons = screen.getAllByRole('button', { name: label });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it('신청 중인 뷰어가 CTA를 누르면 모델이 준 액션을 실행하고 "취소했다"고 알린다', async () => {
    // 철회 mutation이 돌려주는 실제 응답 모양(V1TeamMatchApplicationResult) — 안내 문구는
    // 이 status에서 나온다.
    const onApply = vi.fn().mockResolvedValue({ applicationId: 'app-a', status: 'withdrawn' });
    const model = getTeamMatchDetailViewModel('pending');
    const label = '알파FC 신청 취소';
    model.applyLabel = label;
    model.onApply = onApply;

    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: label })[0]);

    // runHeroAction은 액션을 마이크로태스크로 미룬다(동기 throw까지 rejection으로 잡기 위해) —
    // 안내 문구가 뜰 때까지 기다린 뒤 실제 실행 여부를 확인한다.
    expect(await screen.findByText('신청을 취소했어요.')).toBeInTheDocument();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  // 유령 신청서가 남은 계정에서 실제로 도달하는 조합이다: 최신 신청서를 먼저 철회하면
  // viewerState는 'withdrawn'(→ mode 'default')인데 더 오래된 신청서가 아직 requested라
  // eligibility는 ALREADY_REQUESTED를 준다 → CTA는 '철회'를 실행한다. 문구를 mode에서 뽑던
  // 종전 코드는 이 상태에서 "신청을 완료했어요."라고 알렸다(신청한 적이 없는데).
  it('mode가 default여도 실제로 철회했으면 "취소했다"고 알린다', async () => {
    const onApply = vi.fn().mockResolvedValue({ applicationId: 'app-a', status: 'withdrawn' });
    const model = getTeamMatchDetailViewModel('default');
    const label = '알파FC 신청 취소';
    model.applyLabel = label;
    model.onApply = onApply;

    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: label })[0]);

    expect(await screen.findByText('신청을 취소했어요.')).toBeInTheDocument();
    expect(screen.queryByText('신청을 완료했어요.')).not.toBeInTheDocument();
  });

  // D2(2026-08-27) — 위 세 테스트는 결과 객체를 **손으로** 써 넣는다. 그래서 "안내 문구는
  // 서버가 준 status 에서 나온다"는 계약 중 절반(화면이 status 를 읽는다)만 잡히고, 나머지
  // 절반(**훅이 실제로 그 status 를 돌려준다**)은 어디서도 안 잡혔다 — 상세 클라이언트 스위트는
  // './team-matches-page' 를 통째로 stub 하므로 실제 배선을 지나지 않는다. 그 상태에서
  // useV1WithdrawTeamMatchApplication 의 반환을 void 로 바꾸거나 서버가 status 필드명을 바꾸면,
  // 모든 철회에서 안내가 조용히 사라지는데 어떤 테스트도 깨지지 않는다.
  //
  // 아래는 그 나머지 절반을 **컴파일 타임**에 못 박는다: 결과 객체를 리터럴이 아니라 훅이
  // resolve 하는 타입(mutateAsync 의 Awaited 반환)으로 선언한다. 훅 반환이 void 가 되거나
  // status 가 사라지면 이 파일이 **타입체크에서** 깨진다. 런타임 쪽은 그 값을 실제 화면
  // (TeamMatchDetailPageView → runHeroAction → applyResultMessage)에 통과시켜 확인한다.
  //
  // 훅 모듈은 타입 위치에서만 참조한다(`typeof import(...)`) — 런타임 import 가 없으므로
  // react-query/Provider 를 이 테스트에 끌고 오지 않는다.
  type V1Hooks = typeof import('@/hooks/use-v1-api');
  type ApplyResolved = Awaited<ReturnType<ReturnType<V1Hooks['useV1ApplyTeamMatch']>['mutateAsync']>>;
  type WithdrawResolved = Awaited<
    ReturnType<ReturnType<V1Hooks['useV1WithdrawTeamMatchApplication']>['mutateAsync']>
  >;

  it('훅이 resolve 하는 응답을 그대로 흘리면 신청·철회 문구가 각각 나온다', async () => {
    // 서버가 실제로 주는 값: createApplication → 'requested', withdrawApplication → 'withdrawn'
    // (team-matches.service.ts). 이 두 리터럴이 문구의 유일한 근거다.
    const applied: ApplyResolved = {
      applicationId: 'app-a',
      teamMatchId: 'team-match-1',
      applicantTeamId: 'team-alpha',
      status: 'requested',
      requiresApproval: true,
      requiresPayment: false,
    };
    const withdrawn: WithdrawResolved = {
      applicationId: 'app-a',
      teamMatchId: 'team-match-1',
      applicantTeamId: 'team-alpha',
      status: 'withdrawn',
    };

    const applyModel = getTeamMatchDetailViewModel('default');
    applyModel.applyLabel = '알파FC으로 신청';
    applyModel.onApply = vi.fn().mockResolvedValue(applied);
    const applyView = renderPage(<TeamMatchDetailPageView model={applyModel} />);
    fireEvent.click(screen.getAllByRole('button', { name: '알파FC으로 신청' })[0]);
    expect(await screen.findByText('신청을 완료했어요.')).toBeInTheDocument();
    applyView.unmount();

    const withdrawModel = getTeamMatchDetailViewModel('pending');
    withdrawModel.applyLabel = '알파FC 신청 취소';
    withdrawModel.onApply = vi.fn().mockResolvedValue(withdrawn);
    renderPage(<TeamMatchDetailPageView model={withdrawModel} />);
    fireEvent.click(screen.getAllByRole('button', { name: '알파FC 신청 취소' })[0]);
    expect(await screen.findByText('신청을 취소했어요.')).toBeInTheDocument();
    expect(screen.queryByText('신청을 완료했어요.')).not.toBeInTheDocument();
  });

  it('로그인·팀 만들기 리다이렉트처럼 신청도 철회도 아닌 액션은 성공 안내를 띄우지 않는다', async () => {
    // getApplyAction의 리다이렉트 분기는 아무것도 resolve하지 않는다 — 종전에는 mode가
    // 'default'라는 이유만으로 "신청을 완료했어요."가 떴다.
    const onApply = vi.fn().mockResolvedValue(undefined);
    const model = getTeamMatchDetailViewModel('default');
    const label = '로그인하고 신청하기';
    model.applyLabel = label;
    model.onApply = onApply;

    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));

    expect(screen.queryByText('신청을 완료했어요.')).not.toBeInTheDocument();
    expect(screen.queryByText('신청을 취소했어요.')).not.toBeInTheDocument();
  });
});
