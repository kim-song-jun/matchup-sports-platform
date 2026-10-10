import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchCreatePageView, MatchDetailPageView, MatchListPageView } from './matches-page';
import { applyLabel, getMatchCreateViewModel, getMatchDetailViewModel, getMatchListViewModel } from './matches.view-model';
import { getStatus, getViewerState, toMatchCard } from './matches.card-model';
import { toDetailMode } from './matches.mode';
import type { V1Match } from '@/types/api';

const navState = vi.hoisted(() => ({ pathname: '/matches/match-4', search: '' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(navState.search),
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

describe('MatchDetailPageView — 종료와 모집 마감 안내 분리 (#1587)', () => {
  function detail(overrides: Partial<V1Match> = {}) {
    const data: V1Match = {
      id: 'qa-completed-notice', title: '종료 안내 합성 매치', sportName: '풋살',
      placeName: '합성 구장', startsAt: '2026-10-02T09:00:00.000Z',
      endsAt: '2026-10-02T11:00:00.000Z', deadlineAt: '2026-10-02T08:00:00.000Z',
      capacityText: '1/2명', capacity: 2, participantCount: 1,
      status: 'completed', displayState: 'completed', viewerState: 'guest',
      hostParticipates: false, imageUrl: null, rulesText: null, ...overrides,
    };
    const status = getStatus(data);
    const viewer = getViewerState(data);
    const mode = toDetailMode(viewer, status);
    const fallback = getMatchDetailViewModel(mode);
    return {
      ...fallback, mode, completed: status === 'completed',
      noShow: status === 'completed' && data.viewer?.participantStatus === 'no_show',
      statusLabel: data.viewer?.participantStatus === 'no_show' ? '불참 기록' : undefined,
      applyLabel: applyLabel(viewer, status, false),
      match: {
        ...toMatchCard(data, fallback.match), description: '', place: null, rules: [],
        participants: [], applicationsHref: `/matches/${data.id}/applications`,
      },
    };
  }

  function bodies(container: HTMLElement) {
    const desktop = container.querySelector<HTMLElement>('.tm-match-detail-desktop-layout .tm-match-detail-body');
    const mobile = container.querySelector<HTMLElement>('.tm-match-detail-body.tm-hide-desktop');
    expect(desktop).not.toBeNull();
    expect(mobile).not.toBeNull();
    return [within(desktop!), within(mobile!)];
  }

  it.each([1, 2])('completed 비참가자 %i/2명은 양쪽 본문에 종료 안내와 신청 불가를 표시한다', (count) => {
    const model = detail({ participantCount: count, capacityText: `${count}/2명` });
    const { container } = render(<MatchDetailPageView model={model} />);
    for (const body of bodies(container)) {
      expect(body.getByText('종료된 매치예요')).toBeInTheDocument();
      expect(body.getByText('이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요.')).toBeInTheDocument();
      expect(body.queryByText('모집 완료')).not.toBeInTheDocument();
      expect(body.queryByText(/자리 남았어요/)).not.toBeInTheDocument();
    }
    expect(screen.getAllByText('종료').length).toBeGreaterThan(0);
    for (const button of screen.getAllByRole('button', { name: '신청 불가' })) expect(button).toBeDisabled();
  });

  it('raw completed보다 displayState completion_pending을 우선해 종료 확인 카드를 유지한다', () => {
    const { container } = render(<MatchDetailPageView model={detail({ displayState: 'completion_pending' })} />);
    for (const body of bodies(container)) {
      expect(body.getByText('경기 종료를 확인하고 있어요')).toBeInTheDocument();
      expect(body.queryByText('종료된 매치예요')).not.toBeInTheDocument();
      expect(body.queryByText('모집 완료')).not.toBeInTheDocument();
    }
  });

  it('실제 full 상태의 모집 완료 안내와 신청 불가를 유지한다', () => {
    const { container } = render(<MatchDetailPageView model={detail({ status: 'recruiting', displayState: 'full', participantCount: 2, capacityText: '2/2명' })} />);
    for (const body of bodies(container)) {
      expect(body.getByText('모집 완료')).toBeInTheDocument();
      expect(body.queryByText('종료된 매치예요')).not.toBeInTheDocument();
    }
    for (const button of screen.getAllByRole('button', { name: '신청 불가' })) expect(button).toBeDisabled();
  });

  it('시간 closed의 기존 마감 안내와 CTA를 유지한다', () => {
    const { container } = render(<MatchDetailPageView model={detail({ status: 'closed', displayState: 'closed' })} />);
    for (const body of bodies(container)) {
      expect(body.getByText('신청이 마감됐어요')).toBeInTheDocument();
      expect(body.getByText('마감 시각이 지나 더 이상 신청할 수 없어요. 다른 매치를 둘러봐 주세요.')).toBeInTheDocument();
      expect(body.queryByText('종료된 매치예요')).not.toBeInTheDocument();
    }
    for (const button of screen.getAllByRole('button', { name: '신청 마감' })) expect(button).toBeDisabled();
  });

  it.each([
    ['in_progress', '경기가 진행 중이에요'],
    ['completion_pending', '경기 종료를 확인하고 있어요'],
  ] as const)('%s의 기존 lifecycle 안내를 유지한다', (status, title) => {
    const { container } = render(<MatchDetailPageView model={detail({ status, displayState: status })} />);
    for (const body of bodies(container)) {
      expect(body.getByText(title)).toBeInTheDocument();
      expect(body.queryByText('종료된 매치예요')).not.toBeInTheDocument();
      expect(body.queryByText('모집 완료')).not.toBeInTheDocument();
    }
  });

  it('on_hold에는 일반 닫힘 카드를 추가하지 않는다', () => {
    const { container } = render(<MatchDetailPageView model={detail({ status: 'on_hold', displayState: 'on_hold' })} />);
    expect(screen.getAllByText('보류').length).toBeGreaterThan(0);
    for (const body of bodies(container)) {
      expect(body.queryByText('종료된 매치예요')).not.toBeInTheDocument();
      expect(body.queryByText('모집 완료')).not.toBeInTheDocument();
    }
  });

  it('운영만 하는 completed host는 신청자 관리 경로를 유지한다', () => {
    const model = detail({ viewerState: 'host' });
    render(<MatchDetailPageView model={model} />);
    expect(model.mode).toBe('mine');
    expect(screen.queryByText('종료된 매치예요')).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: '신청자 관리' })) expect(link).toHaveAttribute('href', '/matches/qa-completed-notice/applications');
  });

  it('completed participant는 기존 참여 완료 안내를 유지한다', () => {
    render(<MatchDetailPageView model={detail({ viewerState: 'participant' })} />);
    expect(screen.getAllByText('참여 완료').length).toBeGreaterThan(0);
    expect(screen.queryByText('종료된 매치예요')).not.toBeInTheDocument();
  });

  it('completed no_show participant는 기존 불참 안내를 유지한다', () => {
    render(<MatchDetailPageView model={detail({ viewer: { state: 'participant', participantId: 'qa-no-show', applicationId: null, participantStatus: 'no_show', canApply: false } })} />);
    expect(screen.getAllByText('불참으로 기록됐어요').length).toBeGreaterThan(0);
    expect(screen.queryByText('종료된 매치예요')).not.toBeInTheDocument();
    expect(screen.queryByText('참여 완료')).not.toBeInTheDocument();
  });

  it('requested viewer의 pending 우선순위와 신청 취소를 유지한다', () => {
    const model = { ...detail({ status: 'closed', displayState: 'closed', viewerState: 'requested' }), onApply: vi.fn() };
    render(<MatchDetailPageView model={model} />);
    expect(model.mode).toBe('pending');
    expect(screen.queryByText('종료된 매치예요')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: '신청 취소' })) expect(button).toBeEnabled();
  });
});

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

/**
 * [P2] 대표 시나리오 — 마감 시각이 지나 닫힌 매치(lifecycleStatus==='closed', 정원 마감이
 * 아님)는 상태를 본문 상태 카드 한 곳에서만 말한다. 히어로 배지·부제의 마감 문구·하단 바
 * 캡션까지 7군데가 같은 뜻을 반복하던 것을 2군데(상태 카드 · 비활성 버튼 '신청 마감')로 줄인다.
 */
describe('MatchDetailPageView — 마감 시각이 지나 닫힌 매치 (P2 대표 시나리오)', () => {
  function closedByDeadlineModel() {
    const model = getMatchDetailViewModel('closed');
    model.match.lifecycleStatus = 'closed';
    model.match.current = 1;
    model.match.capacity = 5;
    // 기본 목업(match-4)은 정원 마감 시나리오라 deadline/deadlineDetail 이 캔드 문구
    // '모집 완료'다 — 마감 시각이 지난 시나리오를 격리해서 보려면 실제 포맷터가 주는
    // 값(9월 26일 (토) 16:40 / 지났어요)으로 갈아 끼운다.
    model.match.deadlineDetail = '9월 26일 (토) 16:40';
    model.match.deadline = '지났어요';
    return model;
  }

  it('부제는 호스트만 말하고 마감 문구를 반복하지 않는다', () => {
    const model = closedByDeadlineModel();
    render(<MatchDetailPageView model={model} />);

    const metas = document.querySelectorAll('.tm-match-detail-meta');
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      expect(meta.textContent).toBe(`${model.match.host} 호스트`);
    }
  });

  it('히어로 배지에는 상태를 반복하지 않는다 (종목·레벨·성별만 남는다)', () => {
    const model = closedByDeadlineModel();
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByText('모집 완료')).not.toBeInTheDocument();
  });

  it('상태는 본문 상태 카드 한 곳에서만, 마감 사유(마감 시각이 지남)를 정확히 말한다', () => {
    render(<MatchDetailPageView model={closedByDeadlineModel()} />);

    expect(screen.getAllByText('신청이 마감됐어요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('마감 시각이 지나 더 이상 신청할 수 없어요. 다른 매치를 둘러봐 주세요.').length).toBeGreaterThan(0);
  });

  it('하단 바에는 상태 캡션("신청 상태")을 반복하지 않고 버튼만 남는다', () => {
    render(<MatchDetailPageView model={closedByDeadlineModel()} />);

    expect(screen.queryByText('신청 상태')).not.toBeInTheDocument();
    expect(screen.getAllByText('신청 마감').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailPageView — approved mode (실제 참가 확정자)', () => {
  it('참가 확정 배너를 정상적으로 보여준다', () => {
    const model = getMatchDetailViewModel('approved');
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요.').length).toBeGreaterThan(0);
  });
});

describe('MatchListPageView — 참가비 자유 입력의 의미와 원문 (#1586)', () => {
  afterEach(() => { navState.pathname = '/matches/match-4'; navState.search = ''; });

  function list(costNote: string | null) {
    navState.pathname = '/matches';
    navState.search = 'q=qa&sportId=futsal';
    const base = getMatchListViewModel();
    const data: V1Match = {
      id: 'qa-cost-main', title: '비용 설명 합성 매치', sportName: '풋살', placeName: '합성 구장',
      startsAt: '2080-10-03T09:00:00.000Z', capacityText: '1/2명', capacity: 2,
      participantCount: 1, status: 'recruiting', levelLabel: '입문·초급', genderRule: '남',
      imageUrl: '/mock/generated/futsal-rooftop.webp', costNote,
    };
    const card = toMatchCard(data, base.matches[0]);
    return { ...base, matches: [card], nearbyMatches: [{ ...card, id: 'qa-cost-nearby', image: null }] };
  }

  function expectMetadata(container: HTMLElement, model: ReturnType<typeof list>, raw: string | null) {
    const card = model.matches[0];
    const note = raw ? `참가비 설명: ${raw}` : null;
    const row = container.querySelector<HTMLElement>('.tm-match-row');
    expect(row).not.toBeNull();
    expect(within(row!).getByText([card.sport, card.level, card.gender, note].filter(Boolean).join(' · '))).toBeInTheDocument();
    const rails = container.querySelectorAll<HTMLElement>('.tm-match-list-card');
    expect(rails).toHaveLength(2);
    for (const rail of rails) expect(within(rail).getByText([card.level, card.gender, note].filter(Boolean).join(' · '))).toBeInTheDocument();
    expect(container.textContent?.match(/참가비 설명:/g)?.length ?? 0).toBe(raw ? 3 : 0);
    const from = '/matches?q=qa&sportId=futsal';
    for (const link of container.querySelectorAll<HTMLAnchorElement>('.tm-match-row, .tm-match-list-card')) {
      expect(link.getAttribute('href')).toContain(`from=${encodeURIComponent(from)}`);
    }
  }

  it.each(['10000', '10,000원/1인', '무료', '구장비 현장 정산', 'USD 10'])('행·사진·인접 레일에 라벨과 %s 원문을 보존한다', (raw) => {
    const model = list(raw);
    const { container } = render(<MatchListPageView model={model} />);
    expectMetadata(container, model, raw);
    expect(model.matches[0].costNote).toBe(raw);
    if (raw === '10000') expect(container.textContent).not.toContain('10,000원');
  });

  it.each([null, ''])('값 %s는 라벨·단위·무료로 대체하지 않는다', (raw) => {
    const model = list(raw);
    const { container } = render(<MatchListPageView model={model} />);
    expectMetadata(container, model, raw);
    expect(container.textContent).not.toContain('무료');
  });

  it('연속 데이터 갱신에서도 최신 원문과 필터 출처 링크를 유지한다', () => {
    const first = list('10000');
    const { container, rerender } = render(<MatchListPageView model={first} />);
    for (const raw of ['10,000원/1인', '구장비 현장 정산', null]) {
      const model = list(raw);
      rerender(<QueryClientProvider client={new QueryClient()}><MatchListPageView model={model} /></QueryClientProvider>);
      expectMetadata(container, model, raw);
      expect(screen.getAllByText('비용 설명 합성 매치')).toHaveLength(3);
    }
  });
});

describe('MatchDetailPageView — 참가비(costNote)', () => {
  it('참가비를 적지 않았으면 참가비 행을 아예 숨긴다 (0원으로 단정하지 않는다)', () => {
    const model = getMatchDetailViewModel('default');
    expect(model.match.costNote).toBeNull();
    render(<MatchDetailPageView model={model} />);

    expect(screen.queryByText('참가비')).not.toBeInTheDocument();
  });

  it('참가비를 적었으면 참가비 행에 값을 보여준다', () => {
    const model = getMatchDetailViewModel('default');
    model.match.costNote = '10,000원/1인';
    render(<MatchDetailPageView model={model} />);

    expect(screen.getAllByText('참가비').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10,000원/1인').length).toBeGreaterThan(0);
  });

  /**
   * 리뷰에서 발견된 회귀: 상세 응답의 rulesText가 levelNote·genderRule·costNote를 합쳐
   * 내려오던 시절엔 "규칙" 카드가 참가비 텍스트를 그대로 다시 그렸다(참가비 행과 중복).
   * 백엔드를 rulesText=levelNote로 고친 뒤에는 규칙 카드와 참가비 행이 서로 다른 값을
   * 담아야 하고, 참가비 텍스트가 규칙 카드 쪽에 새어 나오면 안 된다.
   */
  it('참가비와 규칙이 둘 다 있어도 서로 다른 텍스트로 각자 한 번씩만 노출된다 (중복 노출 방지)', () => {
    const model = getMatchDetailViewModel('default');
    model.match.costNote = '10,000원/1인';
    const rulesText = '풋살화 착용\n\n지각 시 미리 연락';
    model.match.rules = [rulesText];
    render(<MatchDetailPageView model={model} />);

    // 참가비 행: 데스크톱·모바일 각 1회 = 2회. 규칙 카드에 새어 나왔다면 3회 이상이 된다.
    expect(screen.getAllByText('10,000원/1인').length).toBe(2);
    const rules = screen.getAllByText((_, element) =>
      element?.textContent === rulesText && element.children.length === 0,
    );
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule).toHaveStyle({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    }
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

  it('모바일 하단은 채팅과 신청자 관리만 한 줄에 두고 매치 수정은 상태 행으로 분리한다', () => {
    const model = getMatchDetailViewModel('mine');
    model.match.id = 'match-hosted';
    model.match.editHref = '/matches/match-hosted/edit';
    model.match.applicationsHref = '/matches/match-hosted/applications';
    model.onChat = vi.fn();

    const { container } = render(<MatchDetailPageView model={model} />);
    const mobileCta = container.querySelector('.tm-match-detail-fixed-cta');
    const mobileActions = mobileCta?.querySelector('.tm-match-detail-fixed-cta-actions');

    expect(mobileActions).toHaveClass('tm-match-detail-fixed-cta-actions-split');
    expect(mobileActions?.querySelectorAll('.tm-btn')).toHaveLength(2);
    expect(mobileActions?.textContent).toContain('채팅');
    expect(mobileActions?.textContent).toContain('신청자 관리');
    expect(mobileActions?.textContent).not.toContain('매치 수정');
    expect(mobileCta?.querySelector('.tm-match-detail-edit-link')).toHaveAttribute('href', '/matches/match-hosted/edit');
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

/**
 * 목록에는 이제 마감된 매치도 경기 시작 전까지 남는다(matches.service.ts list()) —
 * 남기기만 하고 모집 중 카드와 똑같이 그리면 "밖에서는 모집중, 안에서는 신청 마감"이라는
 * 원래 제보(2026-09-07)가 그대로 재현된다. 배지와 흐림 처리가 실제로 붙는지 본다.
 */
describe('MatchListPageView — 신청 마감 카드 구분', () => {
  // 기본 목업 목록에는 status 가 서로 다른 카드가 섞여 있어(open/pending/approved/full/mine)
  // "배지가 하나도 없다" 류 단언이 다른 카드 때문에 흔들린다 — 카드 하나짜리 모델로 좁힌다.
  function modelWithSingleCard(overrides: Partial<ReturnType<typeof getMatchListViewModel>['matches'][number]>) {
    const base = getMatchListViewModel();
    return { ...base, matches: [{ ...base.matches[0], ...overrides }] };
  }

  it('마감 시각이 지난 카드에 회색 "신청 마감" 배지를 붙이고 카드를 눌러 표시한다', () => {
    const { container } = render(
      <MatchListPageView model={modelWithSingleCard({ status: 'full', current: 2, capacity: 6 })} />,
    );

    expect(screen.getAllByText('신청 마감').length).toBeGreaterThan(0);
    expect(container.querySelector('.tm-match-row.tm-card-closed')).not.toBeNull();
  });

  it('정원이 찬 카드는 "모집 완료"로 구분한다 (자리가 날 수 있는 것과 기한이 끝난 것은 다르다)', () => {
    render(<MatchListPageView model={modelWithSingleCard({ status: 'full', current: 6, capacity: 6 })} />);

    expect(screen.getAllByText('모집 완료').length).toBeGreaterThan(0);
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
  });

  it('아직 신청할 수 있는 카드에는 마감 배지도 흐림 처리도 붙지 않는다', () => {
    const { container } = render(
      <MatchListPageView model={modelWithSingleCard({ status: 'open', current: 2, capacity: 6 })} />,
    );

    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    expect(screen.queryByText('모집 완료')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-card-closed')).toBeNull();
  });

  /**
   * [P2 Copilot 리뷰 회귀 방지] deadlineAt 자체가 없는 매치(예: 정원 마감이지 마감
   * 시각이 없는 경우)는 formatDeadlineDetail이 '경기 시작 전까지'로 떨어진다 — 닫힌
   * 카드 우하단에 그 문구를 그대로 노출하면 "닫혔다"는 배지와 "경기 시작 전까지"
   * (아직 열려 있다는 뜻)가 서로 모순된다. deadline 캡션이 비어 있으면(=deadlineAt
   * 없음) 실제 시각으로 바꾸지 않고 기존 actionLabel을 유지한다.
   */
  it('마감 시각 자체가 없는 닫힌 카드는 우하단에 "경기 시작 전까지"를 보여주지 않고 actionLabel을 유지한다', () => {
    render(
      <MatchListPageView
        model={modelWithSingleCard({ status: 'full', current: 6, capacity: 6, deadline: '', deadlineDetail: '경기 시작 전까지', actionLabel: '모집 완료' })}
      />,
    );

    expect(screen.queryByText('경기 시작 전까지')).not.toBeInTheDocument();
    expect(screen.getAllByText('모집 완료').length).toBeGreaterThan(0);
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

/**
 * [P3] 캡션(우상단 단계 이름)과 h1 이 같은 문구였다(2·3단계 "매치 정보"/"장소와 시간"이
 * 캡션과 그대로 겹쳤다) — 이미 역할이 갈려 있던 1·4단계 문법으로 통일한다: 캡션은 단계
 * 이름 그대로, h1 은 질문형.
 */
describe('MatchCreatePageView — 단계 h1(질문형)과 캡션(단계 이름) 분리', () => {
  it('2단계(정보): 캡션은 "매치 정보", h1 은 질문형 "어떤 매치인가요?"', () => {
    render(<MatchCreatePageView model={getMatchCreateViewModel('info')} />);

    expect(screen.getByRole('heading', { level: 1, name: '어떤 매치인가요?' })).toBeInTheDocument();
    expect(screen.getByText('매치 정보')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '매치 정보' })).not.toBeInTheDocument();
  });

  it('3단계(장소·시간): 캡션은 "장소와 시간", h1 은 질문형 "언제, 어디서 하나요?"', () => {
    render(<MatchCreatePageView model={getMatchCreateViewModel('place-time')} />);

    expect(screen.getByRole('heading', { level: 1, name: '언제, 어디서 하나요?' })).toBeInTheDocument();
    expect(screen.getByText('장소와 시간')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '장소와 시간' })).not.toBeInTheDocument();
  });

  it('1·4단계는 기존 문법(질문형 h1) 그대로 유지된다 — 회귀 가드', () => {
    render(<MatchCreatePageView model={getMatchCreateViewModel('sport')} />);
    expect(screen.getByRole('heading', { level: 1, name: '어떤 종목인가요?' })).toBeInTheDocument();
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

describe('MatchCreatePageView — 주최자 참가 선택', () => {
  it('기본값은 참가이며 스위치를 끄면 hostParticipates=false를 전달한다', () => {
    const model = getMatchCreateViewModel('info');
    const onFieldChange = vi.fn();
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectSport: vi.fn(),
      onFieldChange,
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    const toggle = screen.getByRole('switch', { name: '나도 참가해요' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(onFieldChange).toHaveBeenCalledWith('hostParticipates', false);
  });

  it('확인 단계에서 주최자 제외 상태를 용병 모집 문구로 보여준다', () => {
    const model = getMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, hostParticipates: false };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByText('참가하지 않아요')).toBeInTheDocument();
    expect(screen.getByText('용병만 모집하고 주최자는 운영만 해요')).toBeInTheDocument();
  });

  it('나도 참가해요가 켜져 있으면 최대 인원은 2명 아래로 내려가지 않는다', () => {
    const model = getMatchCreateViewModel('info');
    const onFieldChange = vi.fn();
    model.draft = { ...model.draft, capacity: 2, hostParticipates: true };
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectSport: vi.fn(),
      onFieldChange,
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByLabelText('최대 인원 선택')).toHaveValue('2');
    expect(screen.queryByRole('option', { name: '1명' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '인원 줄이기' }));
    expect(onFieldChange).toHaveBeenCalledWith('capacity', 2);
  });

  it('나도 참가해요를 켜는 순간 정원이 1명이면 2명으로 자동 조정한다', () => {
    const model = getMatchCreateViewModel('info');
    const onFieldChange = vi.fn();
    model.draft = { ...model.draft, capacity: 1, hostParticipates: false };
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectSport: vi.fn(),
      onFieldChange,
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    fireEvent.click(screen.getByRole('switch', { name: '나도 참가해요' }));
    expect(onFieldChange).toHaveBeenCalledWith('hostParticipates', true);
    expect(onFieldChange).toHaveBeenCalledWith('capacity', 2);
  });

  it('나도 참가해요를 켜도 정원이 이미 2명 이상이면 정원은 건드리지 않는다', () => {
    const model = getMatchCreateViewModel('info');
    const onFieldChange = vi.fn();
    model.draft = { ...model.draft, capacity: 5, hostParticipates: false };
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectSport: vi.fn(),
      onFieldChange,
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    fireEvent.click(screen.getByRole('switch', { name: '나도 참가해요' }));
    expect(onFieldChange).toHaveBeenCalledWith('hostParticipates', true);
    expect(onFieldChange).not.toHaveBeenCalledWith('capacity', expect.anything());
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

describe('MatchCreatePageView — 매치 수정 등록 화면 일치', () => {
  function editModel(step: 'sport' | 'info' | 'place-time' | 'confirm') {
    const model = getMatchCreateViewModel(step);
    model.mode = 'edit';
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
    return model;
  }

  it('등록 화면과 동일하게 종목 선택부터 4단계 진행 표시를 보여준다', () => {
    render(<MatchCreatePageView model={editModel('sport')} />);

    expect(screen.getByRole('progressbar', { name: '매치 수정 1단계/4단계' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '어떤 종목인가요?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /풋살/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('종목')).toBeNull();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
  });

  it('매치 정보와 장소·시간을 등록 화면과 같은 별도 단계로 분리한다', () => {
    const { unmount } = render(<MatchCreatePageView model={editModel('info')} />);

    expect(screen.getByRole('progressbar', { name: '매치 수정 2단계/4단계' })).toBeInTheDocument();
    expect(screen.getByLabelText('제목')).toBeInTheDocument();
    expect(screen.queryByLabelText('지역')).toBeNull();

    unmount();
    render(<MatchCreatePageView model={editModel('place-time')} />);

    expect(screen.getByRole('progressbar', { name: '매치 수정 3단계/4단계' })).toBeInTheDocument();
    expect(screen.getByLabelText('지역')).toBeInTheDocument();
    expect(screen.getByLabelText('장소')).toBeInTheDocument();
    expect(screen.queryByLabelText('제목')).toBeNull();
  });

  it('주최자가 참가하지 않으면 최대 인원은 1명까지 선택할 수 있고 감소 버튼도 1명 아래로 내리지 않는다', () => {
    const model = getMatchCreateViewModel('info');
    const onFieldChange = vi.fn();
    model.draft = { ...model.draft, capacity: 1, hostParticipates: false };
    model.form = {
      selectedSportId: 'sport-futsal',
      regionId: 'region-gangnam',
      regions: [],
      onSelectSport: vi.fn(),
      onFieldChange,
      onRegionChange: vi.fn(),
      onBack: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    };

    render(<MatchCreatePageView model={model} />);

    expect(screen.getByLabelText('최대 인원 선택')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: '인원 줄이기' }));
    expect(onFieldChange).toHaveBeenCalledWith('capacity', 1);
  });
});

// 2026-08-27 감사 M-A-personal-match-state: '매치 취소' 버튼은 lockedReason 게이트가 없어,
// 시작 시각이 지난(터미널) 매치에서도 눌리는 죽은 버튼이었다 — 서버 cancel()이 결국 409로
// 거부하는데도 화면은 아무 사전 신호를 주지 않았다.
describe('MatchCreatePageView — 매치 취소 버튼 잠금', () => {
  function editModel(lockedReason: string | null, step: 'info' | 'confirm' = 'confirm') {
    const model = getMatchCreateViewModel(step);
    model.mode = 'edit';
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

  it('매치 관리 동작은 마지막 확인 단계 전에는 노출하지 않는다', () => {
    render(<MatchCreatePageView model={editModel(null, 'info')} />);

    expect(screen.queryByRole('button', { name: '매치 취소' })).toBeNull();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
  });

  // 서버 update()는 잠긴 매치의 어떤 필드도 받지 않는다 — 입력이 열려 있으면 고친 뒤에야 409를 본다.
  it('lockedReason이 있으면 입력·토글도 잠그고, 이전 단계로는 이동할 수 있다', () => {
    render(<MatchCreatePageView model={editModel('완료·취소·종료된 매치는 수정할 수 없어요.', 'info')} />);

    expect(screen.getByRole('textbox', { name: '제목' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: '나도 참가해요' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전' })).not.toBeDisabled();
  });

  it('lockedReason이 없으면 입력·토글은 열려 있다', () => {
    render(<MatchCreatePageView model={editModel(null, 'info')} />);

    expect(screen.getByRole('textbox', { name: '제목' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: '나도 참가해요' })).not.toBeDisabled();
  });

  it('수정 관리 동작은 스크롤 본문에 두고 고정 footer는 변경 취소와 저장만 유지한다', () => {
    const model = editModel(null);
    model.form!.recruitingToggle = {
      label: '모집 마감',
      hint: '새 신청을 받지 않아요.',
      pending: false,
      onClick: vi.fn(),
    };

    const { container } = render(<MatchCreatePageView model={model} />);

    const shell = container.querySelector('.tm-match-create-shell');
    const management = container.querySelector('.tm-match-edit-management');
    const fixedActions = container.querySelector('.tm-create-fixed-cta-actions');

    expect(shell).toHaveClass('tm-create-shell-edit');
    expect(management).toContainElement(screen.getByRole('button', { name: '모집 마감' }));
    expect(management).toContainElement(screen.getByRole('button', { name: '매치 취소' }));
    expect(fixedActions).toContainElement(screen.getByRole('button', { name: '이전' }));
    expect(fixedActions).toContainElement(screen.getByRole('button', { name: '변경사항 저장' }));
    expect(fixedActions).not.toContainElement(screen.getByRole('button', { name: '매치 취소' }));
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


describe('개인 매치 참여 기능', () => {
  it('호스트도 상세에서 채팅으로 진입할 수 있다', () => {
    const onChat = vi.fn();
    const model = { ...getMatchDetailViewModel('mine'), onChat };
    render(<MatchDetailPageView model={model} />);
    const buttons = screen.getAllByRole('button', { name: '채팅' });
    buttons[0].click();
    expect(onChat).toHaveBeenCalledOnce();
  });
  it('완료 참가자에게 경기 전 안내를 보여주지 않는다', () => {
    render(<MatchDetailPageView model={{ ...getMatchDetailViewModel('approved'), completed: true }} />);
    expect(screen.getAllByText('참여 완료').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/경기 당일 늦지 않게/)).not.toBeInTheDocument();
  });

  it('불참으로 확인된 참가자에게는 참여 완료 대신 불참 안내와 불참 라벨을 보여준다', () => {
    const noShow = { ...getMatchDetailViewModel('approved'), completed: true, noShow: true, statusLabel: '불참 기록' };
    noShow.match.lifecycleStatus = 'completed';
    const { unmount } = render(<MatchDetailPageView model={noShow} />);
    expect(screen.getAllByText('불참으로 기록됐어요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('불참 기록').length).toBeGreaterThan(0);
    expect(screen.queryByText('참여 완료')).toBeNull();
    unmount();

    const attended = { ...getMatchDetailViewModel('approved'), completed: true, statusLabel: '참여 완료' };
    attended.match.lifecycleStatus = 'completed';
    render(<MatchDetailPageView model={attended} />);
    expect(screen.queryByText('불참으로 기록됐어요')).toBeNull();
    expect(screen.getAllByText('참여 완료').length).toBeGreaterThan(0);
  });

  it('시작했거나 끝난 매치는 남은 자리 안내를 내리고, 모집 중인 매치는 그대로 보인다', () => {
    const recruiting = getMatchDetailViewModel('mine');
    recruiting.match.lifecycleStatus = 'recruiting';
    const { unmount } = render(<MatchDetailPageView model={recruiting} />);
    expect(screen.getAllByText(/자리 남았어요/).length).toBeGreaterThan(0);
    unmount();

    for (const lifecycleStatus of ['in_progress', 'completion_pending', 'completed'] as const) {
      const settled = getMatchDetailViewModel('mine');
      settled.match.lifecycleStatus = lifecycleStatus;
      const view = render(<MatchDetailPageView model={settled} />);
      expect(screen.queryByText(/자리 남았어요/)).toBeNull();
      expect(screen.queryByText('마감 임박')).toBeNull();
      view.unmount();
    }
  });

  it('종료 확인이 가능한 호스트에게 더 이상 저장할 수 없는 수정 CTA를 보여주지 않는다', () => {
    const model = { ...getMatchDetailViewModel('mine'), canComplete: true };
    model.match.lifecycleStatus = 'completion_pending';
    render(<MatchDetailPageView model={model} />);
    expect(screen.queryByRole('link', { name: '매치 수정' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '참여 여부 확인' })).toHaveLength(2);
    expect(screen.getAllByText('종료 확인이 필요해요')).toHaveLength(2);
  });
});

// W5-V1 — 바닥 고정 규칙(.tm-filter-sheet > .tm-filter-actions)은 버튼 줄이 스크롤하는 시트의 직계 자식일 때만 걸린다.
describe('MatchListPageView — 필터 시트 버튼 줄', () => {
  it('[닫기][적용하기] 줄은 스크롤하는 시트(dialog)의 직계 자식이다', () => {
    const option = (label: string, value: string) => ({ label, value, href: `/matches?x=${value}` });
    const model = {
      ...getMatchListViewModel(),
      filterSheet: {
        open: true, closeHref: '/matches', resetHref: '/matches?reset=1', applyHref: '/matches?apply=1',
        sort: '' as const, view: 'card' as const, genderRule: '' as const, levels: [], regionId: '',
        sortOptions: [{ ...option('추천순', 'recommended'), value: 'recommended' as const, active: true }],
        genderOptions: [{ ...option('성별 무관', '성별 무관'), value: '성별 무관' as const }],
        levelOptions: [{ ...option('초급', 'beginner'), value: 'beginner' as const }],
        regionOptions: [option('전체', '')],
      },
    };
    render(<MatchListPageView model={model} />);

    const dialog = screen.getByRole('dialog', { name: '매치 필터' });
    const actions = within(dialog).getByRole('link', { name: '적용하기' }).parentElement;
    expect(dialog).toHaveClass('tm-filter-sheet');
    expect(actions).toHaveClass('tm-filter-actions');
    expect(actions?.parentElement).toBe(dialog);
    expect(within(actions!).getByRole('link', { name: '닫기' })).toBeInTheDocument();
  });
});

describe('MatchListPageView — 상세로 가는 카드는 지금 목록(검색어·필터)을 출처로 싣는다', () => {
  function listWithNearby() {
    const base = getMatchListViewModel();
    const card = base.matches[0];
    return {
      ...base,
      isLoading: false,
      matches: [
        { ...card, id: 'm-a', image: null },
        { ...card, id: 'm-b', image: '/mock/a.jpg' },
      ],
      nearbyMatches: [{ ...card, id: 'm-n', image: null }],
    };
  }
  const matchHrefs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/matches/m-"]'))
      .map((a) => a.getAttribute('href'))
      .sort();

  afterEach(() => {
    navState.pathname = '/matches/match-4';
    navState.search = '';
  });

  it('q·필터가 걸린 목록의 행·사진 레일·인접 레일 카드 href 에 그 URL 이 from 으로 들어간다', () => {
    navState.pathname = '/matches';
    navState.search = 'q=QA&sport=futsal';
    const { container } = render(<MatchListPageView model={listWithNearby()} />);

    const from = encodeURIComponent('/matches?q=QA&sport=futsal');
    expect(matchHrefs(container)).toEqual(
      ['m-a', 'm-b', 'm-b', 'm-n'].map((id) => `/matches/${id}?from=${from}`),
    );
  });

  it('대조군: 쿼리 없는 목록은 from 을 싣지 않는다(fallback 이 같은 목록)', () => {
    navState.pathname = '/matches';
    const { container } = render(<MatchListPageView model={listWithNearby()} />);

    expect(matchHrefs(container)).toEqual(['/matches/m-a', '/matches/m-b', '/matches/m-b', '/matches/m-n']);
  });
});

describe('MatchDetailPageView — desktop 제목 중복 정리 (#1588 A)', () => {
  const title = '(합성) 개인 매치 제목';
  const readCss = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  function detail(image: string | null = null) {
    const base = getMatchDetailViewModel();
    return { ...base, match: { ...base.match, id: 'title-fixture', title, host: '합성 호스트', image } };
  }

  afterEach(() => {
    navState.pathname = '/matches/match-4';
    navState.search = '';
  });

  it.each([null, '/uploads/title-fixture.webp'])('사진 %s: entity H1을 유지하고 hero H2만 desktop utility에 연결한다', (image) => {
    const { container } = render(<MatchDetailPageView model={detail(image)} />);
    const h1 = screen.getByRole('heading', { level: 1, name: title });
    const h2 = screen.getByRole('heading', { level: 2, name: title });
    const hero = container.querySelector('.tm-match-detail-hero');

    expect(h1.parentElement).toHaveClass('tm-desktop-page-head', 'tm-show-desktop');
    expect(h2).toHaveClass('tm-match-detail-title', 'tm-hide-desktop');
    expect(h2).not.toHaveAttribute('hidden');
    expect(h2).not.toHaveAttribute('aria-hidden');
    expect(hero).toContainElement(h2);
    expect(hero).not.toHaveClass('tm-hide-desktop');
    expect(h2.parentElement).not.toHaveClass('tm-hide-desktop');
    expect(hero?.querySelector('.tm-match-detail-meta')).not.toHaveClass('tm-hide-desktop');
    expect(hero?.querySelector('.tm-match-detail-sport-badge')).not.toHaveClass('tm-hide-desktop');
  });

  it('실제 CSS import chain의 1024px hide/show 계약을 사용한다 (jsdom viewport 실측 아님)', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    const desktopIndex = readFileSync(resolve(process.cwd(), 'src/app/desktop/index.css'), 'utf8');
    const shell = readCss('src/app/desktop/_shell.css');
    const globals = readCss('src/app/globals.css');

    expect(layout).toContain("import './desktop/index.css'");
    expect(desktopIndex).toMatch(/@import\s+"\.\/_shell\.css"/);
    expect(shell).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{\s*\.tm-hide-desktop\s*\{\s*display:\s*none\s*!important;\s*\}\s*\}/);
    expect(shell).toMatch(/\.tm-show-desktop\s*\{\s*display:\s*none;\s*\}/);
    expect(shell).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{\s*\.tm-show-desktop\s*\{\s*display:\s*block;\s*\}\s*\}/);
    const titleRule = globals.match(/\.tm-match-detail-title\s*\{([^}]*)\}/)?.[1];
    expect(titleRule).toBeDefined();
    expect(titleRule).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it('host 간격은 기본 8px을 유지하고 desktop에서만 숨긴 제목 뒤 여백을 정리한다', () => {
    const { container } = render(<MatchDetailPageView model={detail()} />);
    const hero = container.querySelector('.tm-match-detail-hero');
    const host = hero?.querySelector<HTMLElement>('.tm-match-detail-meta');
    const badges = hero?.querySelector('.tm-match-detail-sport-badge')?.parentElement;
    const globals = readCss('src/app/globals.css');
    const hostRule = globals.match(/\.tm-match-detail-overlay\s+\.tm-match-detail-meta\s*\{([^}]*)\}/)?.[1];

    expect(host).toHaveTextContent('합성 호스트 호스트');
    expect(host?.style.marginTop).toBe('');
    expect(badges?.style.marginBottom).toBe('8px');
    expect(hostRule).toMatch(/margin-top:\s*8px;/);
    expect(globals).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{\s*\.tm-match-detail-overlay\s+\.tm-match-detail-meta\s*\{[^}]*margin-top:\s*0(?:px)?;/);
  });

  it('Back/from·공유·배지·CTA를 실제 상세 view에 보존한다', async () => {
    const from = '/matches?q=QA&sport=futsal';
    navState.pathname = '/matches/title-fixture';
    navState.search = `from=${encodeURIComponent(from)}`;
    const onShare = vi.fn().mockResolvedValue(null);
    const { container } = render(<MatchDetailPageView model={{ ...detail(), backHref: from, onShare }} />);
    const desktopBack = container.querySelector('.tm-desktop-page-head .tm-desktop-back');
    const hero = container.querySelector<HTMLElement>('.tm-match-detail-hero');
    expect(hero).not.toBeNull();
    const mobileBack = within(hero!).getByRole('link', { name: '뒤로가기' });

    expect(desktopBack).toHaveAttribute('href', from);
    expect(mobileBack).toHaveAttribute('href', from);
    expect(mobileBack).toHaveClass('tm-hide-desktop');
    expect(container.querySelector('.tm-match-detail-sport-badge')).toHaveTextContent('풋살');
    expect(container.querySelector('.tm-match-detail-hero')).toHaveTextContent('모집 중');
    for (const cta of screen.getAllByRole('button', { name: '참가 신청' })) expect(cta).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '참가 신청' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '공유' }));
    await waitFor(() => expect(onShare).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
  });

  it('목록의 scope H2·카드 제목·from 링크에는 상세 제목 숨김을 적용하지 않는다', () => {
    navState.pathname = '/matches';
    navState.search = 'q=QA&sport=futsal';
    const base = getMatchListViewModel();
    const model = { ...base, matches: [{ ...base.matches[0], id: 'title-fixture', title }], nearbyMatches: [] };
    const { container } = render(<MatchListPageView model={model} />);
    const scopeHeading = screen.getByRole('heading', { level: 2, name: model.summary.label });
    const rowTitle = container.querySelector('.tm-match-row-title');

    expect(scopeHeading).not.toHaveClass('tm-hide-desktop');
    expect(rowTitle).toHaveTextContent(title);
    expect(rowTitle).not.toHaveClass('tm-hide-desktop');
    expect(rowTitle?.closest('a')).toHaveAttribute('href', `/matches/title-fixture?from=${encodeURIComponent('/matches?q=QA&sport=futsal')}`);
  });
});

describe('MatchDetailPageView — 일정·장소의 장소 카드', () => {
  function withPlace(place: NonNullable<ReturnType<typeof getMatchDetailViewModel>['match']['place']> | null) {
    const base = getMatchDetailViewModel('default');
    return { ...base, match: { ...base.match, place } };
  }
  const mobileBody = (container: HTMLElement) =>
    within(container.querySelector<HTMLElement>('.tm-match-detail-body.tm-hide-desktop')!);

  it('좌표가 있으면 이름·주소를 한 번만 보여 주고 길찾기 링크가 좌표 경로를 연다', () => {
    const { container } = render(
      <MatchDetailPageView
        model={withPlace({ name: '망원한강공원 풋살장', address: '서울 마포구 마포나루길 467', latitude: 37.5558, longitude: 126.8985, provider: 'kakao', providerPlaceId: 'k-1' })}
      />,
    );
    const body = mobileBody(container);
    expect(body.getAllByText('망원한강공원 풋살장')).toHaveLength(1);
    fireEvent.click(body.getByRole('button', { name: '길찾기' }));
    const sheet = within(screen.getByRole('dialog', { name: '길찾기' }));
    expect(sheet.getByRole('link', { name: /^카카오맵/ }).getAttribute('href')).toContain('37.5558,126.8985');
    expect(sheet.getByRole('link', { name: /^네이버 지도/ })).toBeInTheDocument();
    expect(body.getByRole('button', { name: /주소 복사/ })).toBeInTheDocument();
    expect(body.queryByText(/정확한 위치가 등록되지 않았어요/)).not.toBeInTheDocument();
  });

  it('좌표가 없으면 위치 미등록 안내와 이름 검색 링크만 보여 준다', () => {
    const { container } = render(
      <MatchDetailPageView model={withPlace({ name: '동네 운동장', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null })} />,
    );
    const body = mobileBody(container);
    expect(body.getByText(/정확한 위치가 등록되지 않았어요/)).toBeInTheDocument();
    expect(body.queryByRole('button', { name: '길찾기' })).not.toBeInTheDocument();
    fireEvent.click(body.getByRole('button', { name: '지도 앱에서 찾기' }));
    const sheet = within(screen.getByRole('dialog', { name: '지도 앱에서 찾기' }));
    expect(sheet.getByRole('link', { name: /^카카오맵/ }).getAttribute('href')).toContain(encodeURIComponent('동네 운동장'));
  });
});
