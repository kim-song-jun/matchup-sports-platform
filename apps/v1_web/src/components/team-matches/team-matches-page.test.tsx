import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchCreatePageView, TeamMatchDetailPageView, TeamMatchListPageView } from './team-matches-page';
import { getTeamMatchCreateViewModel, getTeamMatchDetailViewModel, getTeamMatchListViewModel } from './team-matches.view-model';
import type { TeamMatchModel } from './team-matches.types';

// routerPush를 vi.hoisted로 모듈 스코프에 고정 — useRouter()가 매 렌더 새 vi.fn()을
// 반환하면 클릭 핸들러가 실제로 호출한 push를 테스트에서 단언할 방법이 없다.
const { routerPush, routerReplace } = vi.hoisted(() => ({ routerPush: vi.fn(), routerReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/team-match-1/edit',
  useRouter: () => ({ push: routerPush, replace: routerReplace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
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
    const media = container.querySelector<HTMLElement>('.tm-match-row-thumb');

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
    expect(hero?.style.backgroundPosition).toBe('center');
    expect(hero?.style.backgroundRepeat).toBe('no-repeat');
    expect(hero?.style.backgroundSize).toBe('cover');
  });
});

describe('취소된 팀매치 상세 (L31)', () => {
  function cancelledModel() {
    const model = getTeamMatchDetailViewModel('mine');
    return {
      ...model,
      mode: 'cancelled' as const,
      applyLabel: '취소된 팀매치예요',
      statusLabel: '취소됨',
      match: { ...model.match, apiStatus: 'cancelled' as const, closed: true, manageHref: '/team-matches/team-match-1/edit' },
    };
  }

  it('취소 안내 카드를 보이고 "참가 확정"·"승인 완료"·"매치 관리" 는 어디에도 없다', () => {
    renderPage(<TeamMatchDetailPageView model={cancelledModel()} />);

    expect(screen.getAllByText('취소된 팀매치예요').length).toBeGreaterThan(0);
    expect(screen.getByText('이 팀매치는 취소되어 진행되지 않아요.')).toBeInTheDocument();
    expect(screen.queryByText('참가 확정')).not.toBeInTheDocument();
    expect(screen.queryByText('승인 완료')).not.toBeInTheDocument();
    expect(screen.queryByText('매치 관리')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '매치 관리' })).not.toBeInTheDocument();
  });

  it('하단 CTA 는 비활성이고 채팅 버튼은 없다', () => {
    renderPage(<TeamMatchDetailPageView model={cancelledModel()} />);

    for (const button of screen.getAllByRole('button', { name: '취소된 팀매치예요' })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: /채팅/ })).not.toBeInTheDocument();
  });

  it('대조군 — 취소가 아닌 호스트 화면은 "매치 수정" 링크와 채팅을 그대로 가진다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.nextAction = { label: '매치 수정', href: '/team-matches/team-match-1/edit', tone: 'neutral' };
    model.onChat = vi.fn();
    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getAllByRole('link', { name: '매치 수정' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /채팅/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText('이 팀매치는 취소되어 진행되지 않아요.')).not.toBeInTheDocument();
  });
});

describe('team match pending chat guidance', () => {
  it('shows guidance after click without rendering persistent helper copy', () => {
    const model = getTeamMatchDetailViewModel('pending');
    model.chatLabel = '승인 후 채팅';

    renderPage(<TeamMatchDetailPageView model={model} />);

    const chatButtons = screen.getAllByRole('button', { name: '승인 후 채팅' });
    expect(screen.queryByText('승인 완료 후 이용할 수 있어요')).not.toBeInTheDocument();
    fireEvent.click(chatButtons[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('승인 완료 후 이용할 수 있어요');
  });
});

describe('team match description line breaks', () => {
  it('preserves line breaks on the detail page', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.description = '첫 번째 안내\n두 번째 안내';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText(/첫 번째 안내\s+두 번째 안내/)).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });

  it('preserves line breaks on the confirmation page', () => {
    const model = getTeamMatchCreateViewModel('confirm');
    model.draft.description = '첫 번째 안내\n두 번째 안내';

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByText(/첫 번째 안내\s+두 번째 안내/)).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });
});

describe('team match detail — recordEntry 렌더 순서', () => {
  // recordEntry가 히어로(.tm-team-vs-hero, 뒤로가기 포함) 앞으로 되돌아가면 모바일에서
  // 뒤로가기보다 진행 상황 카드가 먼저 보인다 — DOM 순서를 직접 비교해 그 회귀를 잡는다.
  it('recordEntry가 .tm-team-vs-hero 다음에 렌더된다', () => {
    const model = getTeamMatchDetailViewModel();
    const { container } = renderPage(
      <TeamMatchDetailPageView model={model} recordEntry={<div data-testid="record-entry-marker">진행 중</div>} />,
    );

    const hero = container.querySelector('.tm-team-vs-hero');
    const marker = screen.getByTestId('record-entry-marker');

    expect(hero).toBeInTheDocument();
    expect(hero!.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('platform-managed team match provenance', () => {
  it.each([false, true])('미배정 플랫폼 대진은 두 팀 자리를 보여준다 (마감=%s)', (closed) => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, platformManaged: true, hostTeamId: undefined,
      hostTeam: 'Teameet 운영', opponentTeam: null, closed, status: closed ? 'closed' : 'open' };
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const hero = within(container.querySelector('.tm-team-vs-hero') as HTMLElement);
    const row = within(container.querySelector('.tm-team-vs-row') as HTMLElement);
    expect(row.getByText('홈팀')).toBeInTheDocument();
    expect(row.getByText('어웨이팀')).toBeInTheDocument();
    expect(row.getAllByText(closed ? '미정' : '모집 중', { exact: true })).toHaveLength(2);
    expect(row.queryByText('Teameet 운영')).not.toBeInTheDocument();
    expect(row.queryByText('운영 주관')).not.toBeInTheDocument();
    expect(hero.getByText(closed ? '플랫폼 주관 · 참가팀 미정' : '플랫폼 주관 · 참가할 두 팀을 모집해요')).toBeInTheDocument();
  });

  it('공개 목록에서 팀 배정 후에도 플랫폼 주관 배지와 양 팀 이름을 함께 보여준다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{
      ...model.matches[0],
      platformManaged: true,
      hostTeam: '홈 유나이티드',
      opponentTeam: '어웨이 FC',
      status: 'closed',
      closed: true,
    }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);
    const card = container.querySelector('.tm-match-row');

    expect(within(card as HTMLElement).getByText('플랫폼 주관')).toBeInTheDocument();
    expect(card).toHaveTextContent('홈 유나이티드 vs 어웨이 FC');
  });

  it('플랫폼 주관 매치에 팀이 배정되면 실제 홈팀 카드와 팀 링크를 보여준다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match = {
      ...model.match,
      platformManaged: true,
      hostTeam: '홈 유나이티드',
      hostTeamId: 'team-home',
      hostTeamHref: '/teams/team-home',
    };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const hostCard = container.querySelector('.tm-host-team-card');

    expect(hostCard?.tagName).toBe('A');
    expect(hostCard).toHaveAttribute('href', '/teams/team-home');
    expect(hostCard).toHaveTextContent('홈팀 정보');
    expect(hostCard).not.toHaveTextContent('플랫폼 주관');
    expect(hostCard).toHaveTextContent('팀 보기');
    expect(screen.getByText('플랫폼 주관')).toBeInTheDocument();
  });

  it('플랫폼 주관 매치에 배정된 팀이 없으면 우측 팀 보기 영역을 비워 둔다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match = {
      ...model.match,
      platformManaged: true,
      hostTeam: 'Teameet 운영',
      hostTeamId: undefined,
      hostTeamHref: undefined,
      applicantTeams: [],
    };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const rightColumn = container.querySelector('.tm-team-match-detail-right');

    expect(rightColumn).not.toBeNull();
    expect(rightColumn!.querySelector('.tm-team-match-team-cards')).not.toBeInTheDocument();
    expect(rightColumn!.querySelector('.tm-team-match-cta-card')).toBeInTheDocument();
  });

  it('우측 팀 보기 영역에 홈팀과 들어온 신청팀을 모두 보여준다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match = {
      ...model.match,
      platformManaged: true,
      hostTeam: '마포 레인저스',
      hostTeamId: 'team-home',
      hostTeamHref: '/teams/team-home',
      applicantTeams: [
        {
          teamId: 'team-away',
          name: '한강 로버스',
          meta: '매너 4.7 · 승 9',
          status: '승인 완료',
          logoUrl: '/uploads/hangang-rovers.png',
          trustState: 'verified',
          href: '/teams/team-away',
          applicationId: 'application-away',
        },
        {
          name: '브라보FC',
          meta: '매너 4.8 · 12전',
          status: '승인 대기',
          href: '/teams/team-bravo',
          applicationId: 'application-bravo',
        },
      ],
    };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const rightColumn = container.querySelector('.tm-team-match-detail-right');
    const teamCards = within(rightColumn as HTMLElement);

    expect(teamCards.getByRole('link', { name: '마포 레인저스 팀 보기' })).toHaveAttribute('href', '/teams/team-home');
    expect(teamCards.getByRole('link', { name: '한강 로버스 팀 보기' })).toHaveAttribute('href', '/teams/team-away');
    expect(teamCards.getByRole('link', { name: '브라보FC 팀 보기' })).toHaveAttribute('href', '/teams/team-bravo');
    expect(teamCards.getByText('어웨이팀 정보')).toBeInTheDocument();
    expect(teamCards.getByText('신청팀 정보')).toBeInTheDocument();
    expect(teamCards.getByText('매너 4.7 · 승 9')).toBeInTheDocument();
    expect(teamCards.queryByText('승인된 상대팀')).not.toBeInTheDocument();
    expect(teamCards.getByRole('link', { name: '한강 로버스 팀 보기' }).querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('hangang-rovers.png'),
    );
  });
});

// 20건 컷오프 페이지네이션 결함 회귀 방지(2026-08-27 감사) — matches-page.test.tsx의
// 동일 계열 테스트와 짝을 이룬다.
describe('TeamMatchListPageView — 더 보기 (20건 컷오프 페이지네이션)', () => {
  it('hasNext=true면 "더 보기" 버튼을 보여준다', () => {
    const onLoadMore = vi.fn();
    const model = { ...getTeamMatchListViewModel(), hasNext: true, onLoadMore };
    renderPage(<TeamMatchListPageView model={model} />);

    const button = screen.getByRole('button', { name: '더 보기' });
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hasNext가 없으면(마지막 페이지) "더 보기" 버튼이 없다', () => {
    const model = { ...getTeamMatchListViewModel(), hasNext: false };
    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('loadMorePending 중에는 버튼이 "불러오는 중…"으로 바뀌고 비활성화된다', () => {
    const model = { ...getTeamMatchListViewModel(), hasNext: true, onLoadMore: vi.fn(), loadMorePending: true };
    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getByRole('button', { name: '불러오는 중…' })).toBeDisabled();
  });
});

/**
 * 마감된 팀매치도 경기 시작 전까지 목록에 남는다(team-matches.service.ts list()) —
 * 모집 중 카드와 구분되지 않으면 "밖에서는 모집중, 안에서는 신청 마감"(2026-09-07 제보)이
 * 그대로 재현된다.
 */
describe('TeamMatchListPageView — 신청 마감 카드 구분', () => {
  function modelWithSingleCard(status: 'open' | 'closed') {
    const base = getTeamMatchListViewModel();
    // `closed` 는 API status 만으로 정해지는 별도 필드다 — status 만 바꾸면 실제 응답과 어긋난다.
    return { ...base, matches: [{ ...base.matches[0], status, closed: status === 'closed' }] };
  }

  it('마감된 카드는 "신청 마감" 배지 + 흐림 처리로 구분한다', () => {
    const { container } = renderPage(<TeamMatchListPageView model={modelWithSingleCard('closed')} />);

    expect(screen.getAllByText('신청 마감').length).toBeGreaterThan(0);
    expect(container.querySelector('.tm-match-row.tm-card-closed')).not.toBeNull();
  });

  it('지정 종료 시각이 지난 matched 카드는 "종료 확인 중"으로 표시하고 마감 카드처럼 흐리지 않는다', () => {
    const base = getTeamMatchListViewModel();
    const model = {
      ...base,
      matches: [{
        ...base.matches[0],
        apiStatus: 'matched' as const,
        status: 'approved' as const,
        closed: true,
        live: false,
        completionPending: true,
      }],
    };

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getByText('종료 확인 중')).toBeInTheDocument();
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument();
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-match-row.tm-card-closed')).toBeNull();
  });

  // 행 카드 전환(2026-09-07) 후 목록의 열린 카드는 "모집 중"이 아니라 **"상대 모집 중"**을
  // 쓴다 — 목록 응답에 상대팀이 없어 그 자리가 늘 비어 있던 것을, 배지 한 칸으로 답한다.
  it('열린 카드는 "상대 모집 중" 배지를 쓰고 흐림 처리도 없다', () => {
    const { container } = renderPage(<TeamMatchListPageView model={modelWithSingleCard('open')} />);

    expect(screen.getAllByText('상대 모집 중').length).toBeGreaterThan(0);
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-card-closed')).toBeNull();
  });
});

/**
 * 행 카드 전환 (2026-09-07).
 *
 * 예전 카드는 위쪽 124px(카드의 44%)이 파란 VS 밴드였는데, 그 밴드의 "상대팀" 칸에 담을 값이
 * 없었다 — 목록 API 응답에 상대팀이 없다. 그래서 그 자리를 상태 배지가 차지했고, 시각 무게가
 * 가장 큰 영역이 정보를 가장 적게 담았다(alpha 실측: 390에서 카드 280px·한 화면 2.75장,
 * 같은 토글의 개인 탭은 131px·5.88장).
 *
 * 여기서 지키는 것은 세 가지다 — ① 개인 탭과 같은 행 카드를 쓴다 ② 팀 이름이 사라지지 않는다
 * ③ 없는 상대팀 이름을 만들어내지 않는다.
 */
describe('TeamMatchListPageView — 행 카드 (개인 탭과 같은 카드)', () => {
  function listWithOneCard() {
    const base = getTeamMatchListViewModel();
    return { ...base, matches: [base.matches[0]] };
  }

  it('개인 탭과 같은 .tm-match-row 를 쓰고, VS 밴드는 더 그리지 않는다', () => {
    const { container } = renderPage(<TeamMatchListPageView model={listWithOneCard()} />);

    expect(container.querySelector('.tm-match-row')).not.toBeNull();
    expect(container.querySelector('.tm-match-row-thumb')).not.toBeNull();
    // 밴드가 남아 있으면 카드 높이가 다시 2배가 된다.
    expect(container.querySelector('.tm-team-match-vs')).toBeNull();
  });

  it('VS 밴드가 담던 팀 이름은 행 카드로 옮겨 와 그대로 남는다', () => {
    const model = listWithOneCard();
    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const meta = container.querySelector('.tm-match-row-meta');
    expect(meta?.textContent).toContain(model.matches[0].hostTeam);
  });

  it('상대팀 이름을 만들어내지 않는다 — 카드에 "상대팀" 자리를 남기지 않는다', () => {
    // 목록 응답(V1TeamMatch)에는 상대팀이 없다. 예전 VS 밴드는 그 라벨만 띄워 두고
    // 값 자리에 상태 배지를 넣었다 — 있지도 않은 값을 위해 카드의 절반을 쓴 셈이다.
    const { container } = renderPage(<TeamMatchListPageView model={listWithOneCard()} />);
    const card = container.querySelector('.tm-match-row');
    expect(card).not.toBeNull();

    // 제목 안의 "…vs 상대팀 구합니다" 같은 문장은 호스트가 쓴 값이라 그대로 둔다.
    // 여기서 없어야 하는 것은 **라벨 자체를 그리는 요소** — 예전 밴드의 '홈팀'/'상대팀' 칸이다.
    const labels = [...card!.querySelectorAll('*')].map((el) => el.textContent?.trim());
    expect(labels).not.toContain('상대팀');
    expect(labels).not.toContain('홈팀');
  });

  it('상태 배지는 제목 줄이 아니라 신원 줄에 있다', () => {
    // 제목 줄에 인라인으로 두면 배지 폭만큼 제목이 잘린다 — 데스크톱 실측에서 본문 191px 중
    // 제목이 111px 였다. 팀매치는 거의 모든 카드에 배지가 붙어 매 카드가 그 대가를 치른다.
    const base = getTeamMatchListViewModel();
    const statuses = ['open', 'pending', 'approved', 'closed', 'mine'] as const;
    // `closed` 를 안 맞추면 status: 'closed' 인데 closed: false 인, 서버가 만들 수 없는
    // 조합으로 검증하게 된다 — 마감 배지·openLabel 회귀를 그대로 놓친다.
    const model = { ...base, matches: statuses.map((status, index) => ({ ...base.matches[0], id: `tm-${index}`, status, closed: status === 'closed' })) };
    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const cards = [...container.querySelectorAll('.tm-match-row')];
    expect(cards).toHaveLength(statuses.length);
    cards.forEach((card) => {
      expect(card.querySelectorAll('.tm-team-match-row-badges > .tm-badge').length).toBeGreaterThanOrEqual(1);
      expect(card.querySelectorAll('.tm-match-row-headline .tm-badge')).toHaveLength(0);
    });
  });

  it('플랫폼 주관·승인 완료·경기 종료가 겹쳐도 배지 줄과 팀 신원 줄을 분리한다', () => {
    const model = listWithOneCard();
    model.matches = [{
      ...model.matches[0],
      platformManaged: true,
      status: 'approved',
      closed: true,
      apiStatus: 'completed',
      hostTeam: '성수동우리동네오래된축구회최강연합팀',
    }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);
    const identity = container.querySelector('.tm-team-match-row-id');
    const badges = identity?.querySelector('.tm-team-match-row-badges');
    const host = identity?.querySelector('.tm-team-match-row-host');

    expect(badges).toHaveTextContent('플랫폼 주관');
    expect(badges).toHaveTextContent('승인 완료');
    expect(badges).toHaveTextContent('경기 종료');
    expect(badges?.querySelectorAll(':scope > .tm-badge')).toHaveLength(3);
    expect(host).toHaveTextContent(model.matches[0].hostTeam);
    expect(badges?.contains(host as Node)).toBe(false);
  });
});

/**
 * 호스트가 보는 자기 매치의 마감 표시 (2026-09-07, 사용자 확정: "'내 매치' + 마감 둘 다").
 *
 * `statusToCardStatus()` 는 viewerState 를 API status 보다 먼저 본다 —
 * `if (viewerState === 'host_team') return 'mine'` 에서 끝나므로, 호스트에게는 그 매치가
 * matched/closed/cancelled/completed/expired 여도 카드 status 가 항상 `'mine'` 이었다.
 * 결과적으로 **매치를 만든 사람만 자기 매치가 마감된 줄 목록에서 알 수 없었다.**
 *
 * 그래서 모델에 `closed`(API status 만으로 판정) 를 따로 두고, 배지도 "나와의 관계"와
 * "매치 상태" 두 가지로 나눈다. 둘 다 해당하면 둘 다 붙는다.
 */
describe('TeamMatchListPageView — 호스트도 자기 매치의 마감을 본다', () => {
  function listWith(overrides: Partial<TeamMatchModel>) {
    const base = getTeamMatchListViewModel();
    return { ...base, matches: [{ ...base.matches[0], ...overrides }] };
  }

  it("호스트의 마감된 매치는 '내 매치'와 '신청 마감'을 함께 보여준다", () => {
    const { container } = renderPage(<TeamMatchListPageView model={listWith({ status: 'mine', closed: true })} />);

    expect(screen.getByText('내 매치')).toBeInTheDocument();
    expect(screen.getByText('신청 마감')).toBeInTheDocument();
    // 지면·썸네일도 함께 눌러야 스크롤 중에 걸린다 — 배지만으로는 놓친다.
    expect(container.querySelector('.tm-match-row.tm-card-closed')).not.toBeNull();
  });

  it('호스트의 아직 열린 매치는 마감 표시를 하지 않는다', () => {
    const { container } = renderPage(<TeamMatchListPageView model={listWith({ status: 'mine', closed: false })} />);

    expect(screen.getByText('내 매치')).toBeInTheDocument();
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-card-closed')).toBeNull();
  });

  it("관계가 없고 마감도 아닌 매치에만 '상대 모집 중'을 쓴다 — 관계 배지와 겹치지 않는다", () => {
    const mine = renderPage(<TeamMatchListPageView model={listWith({ status: 'mine', closed: false })} />);
    expect(mine.queryByText('상대 모집 중')).not.toBeInTheDocument();

    const open = renderPage(<TeamMatchListPageView model={listWith({ status: 'open', closed: false })} />);
    expect(open.getByText('상대 모집 중')).toBeInTheDocument();
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

  // 서버 update()는 모집 중이 아닌 팀매치의 어떤 필드도 받지 않는다 — 입력도 같이 잠근다.
  it.each([
    ['잠긴 팀매치는 입력·이미지 선택을 전부 잠근다', '만료된 팀매치는 수정할 수 없어요.', true],
    ['모집 중인 팀매치는 그대로 연다', null, false],
  ])('%s', (_name, lockedReason, locked) => {
    const model = getTeamMatchCreateViewModel('edit');
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
      lockedReason,
    };

    renderPage(<TeamMatchCreatePageView model={model} />);

    for (const label of ['매치 제목', '설명', '상세 주소', '날짜']) {
      if (locked) expect(screen.getByLabelText(label)).toBeDisabled();
      else expect(screen.getByLabelText(label)).not.toBeDisabled();
    }
    if (locked) expect(screen.getByLabelText(/배경 이미지 선택/)).toBeDisabled();
    else expect(screen.getByLabelText(/배경 이미지 선택/)).not.toBeDisabled();
  });
});

/**
 * [P3] 캡션(우상단 단계 이름)과 h1 이 같은 문구였다(3·4·5단계 "매치 정보"/"경기조건"/
 * "장소와 시간"이 캡션과 그대로 겹쳤다) — 이미 역할이 갈려 있던 1·2·6단계 문법(캡션은 단계
 * 이름, h1은 질문형)으로 통일한다.
 */
describe('TeamMatchCreatePageView — 단계 h1(질문형)과 캡션(단계 이름) 분리', () => {
  it('3단계(매치 정보): 캡션은 "매치 정보", h1 은 질문형 "어떤 매치인가요?"', () => {
    renderPage(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('info')} />);

    expect(screen.getByRole('heading', { level: 1, name: '어떤 매치인가요?' })).toBeInTheDocument();
    expect(screen.getByText('매치 정보')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '매치 정보' })).not.toBeInTheDocument();
  });

  it('4단계(경기조건): 캡션은 "경기조건", h1 은 질문형 "어떤 조건으로 경기하나요?"', () => {
    renderPage(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('condition')} />);

    expect(screen.getByRole('heading', { level: 1, name: '어떤 조건으로 경기하나요?' })).toBeInTheDocument();
    expect(screen.getByText('경기조건')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '경기조건' })).not.toBeInTheDocument();
  });

  it('5단계(장소와 시간): 캡션은 "장소와 시간", h1 은 질문형 "언제, 어디서 하나요?"', () => {
    renderPage(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('place-time')} />);

    expect(screen.getByRole('heading', { level: 1, name: '언제, 어디서 하나요?' })).toBeInTheDocument();
    expect(screen.getByText('장소와 시간')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: '장소와 시간' })).not.toBeInTheDocument();
  });

  it('1·2단계는 기존 문법(질문형 h1) 그대로 유지된다 — 회귀 가드', () => {
    renderPage(<TeamMatchCreatePageView model={getTeamMatchCreateViewModel('team')} />);
    expect(screen.getByRole('heading', { level: 1, name: '어떤 팀의 매치인가요?' })).toBeInTheDocument();
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

describe('팀매치 만들기 confirm 단계 — 마지막 행 표기 결함', () => {
  it('상세 주소가 아니라 장소를 라벨로 값을 보여주고, 상세 주소는 sub로 노출한다', () => {
    const model = getTeamMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, venue: '잠실 풋살파크 A구장', address: '서울 송파구 올림픽로 25, 3층 2번 코트' };

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByText('장소')).toBeInTheDocument();
    expect(screen.getByText('잠실 풋살파크 A구장')).toBeInTheDocument();
    expect(screen.getByText('서울 송파구 올림픽로 25, 3층 2번 코트')).toBeInTheDocument();
    expect(screen.queryByText('상세 주소')).not.toBeInTheDocument();
  });

  it('종료 시간이 비어 있으면 하이픈 없이 시작 시간까지만 보여준다', () => {
    const model = getTeamMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, date: '2026-09-05', startTime: '18:00', endTime: '' };

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByText('2026-09-05 18:00')).toBeInTheDocument();
    expect(screen.queryByText('2026-09-05 18:00-')).not.toBeInTheDocument();
  });
});

describe('경기방식 프리셋 — 축구/풋살 외 종목은 축구 포맷으로 폴백하지 않는다', () => {
  it('러닝 팀은 11:11류 축구 프리셋 칩이 뜨지 않는다(직접입력만 남는다)', () => {
    const model = getTeamMatchCreateViewModel('condition');
    model.selectedSport = '러닝';

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.queryByRole('button', { name: '11:11' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9:9' })).not.toBeInTheDocument();
    // 경기방식 칩 그룹 안에는 '직접입력' 버튼만 남아야 한다.
    expect(screen.getByRole('group', { name: '경기방식' })).toBeInTheDocument();
  });

  it('축구 팀은 여전히 축구 프리셋(11:11 등)을 보여준다', () => {
    const model = getTeamMatchCreateViewModel('condition');
    model.selectedSport = '축구';

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByRole('button', { name: '11:11' })).toBeInTheDocument();
  });

  it('풋살 팀은 여전히 풋살 프리셋(5:5 등)을 보여준다', () => {
    const model = getTeamMatchCreateViewModel('condition');
    model.selectedSport = '풋살';

    renderPage(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByRole('button', { name: '5:5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '11:11' })).not.toBeInTheDocument();
  });
});

describe('리그전 배지', () => {
  /**
   * 리그 배지는 **정적 칩**이다(2026-09-09 B안 사용자 확정). 예전엔 카드(<a>) 안에 리그 상세로
   * 가는 button 을 중첩했고, 44px 터치 타깃 때문에 12px 조건 줄 안에서 혼자 튀었다.
   * 지금은 카드 탭 하나만 인터랙티브이고, 리그 순위표는 카드가 가는 리그 경기 상세가 안내한다.
   */
  const leagueBadges = () => screen.queryAllByText('정규 리그');

  it('리그 소속이면 목록 카드의 신원 줄에 정적 "정규 리그" 배지가 보이고 조건 줄에 리그명이 붙는다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], sport: '풋살', grade: '', format: '', gender: '', league: { leagueId: 'lg-1', title: '가을 리그' } }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const badge = container.querySelector('.tm-team-match-row-badges .tm-badge-grey');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('정규 리그');
    expect(container.querySelector('.tm-team-match-row-cond')).toHaveTextContent('풋살 · 가을 리그');
    expect(container.querySelector('.tm-team-match-row-cond-league')).toHaveTextContent('가을 리그');
  });

  it('리그 소속이 아니면 목록 카드에 리그 배지도 리그명도 없다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: null }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    expect(leagueBadges()).toHaveLength(0);
    expect(container.querySelector('.tm-team-match-row-cond-league')).toBeNull();
  });

  it('목록 카드 안에는 카드 링크 말고 누를 것이 없다 — 리그 배지는 button 도 <a> 도 아니다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], league: { leagueId: 'lg-1', title: '가을 리그' } }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const card = container.querySelector('a[href="/team-matches/team-match-1"]');
    expect(card).not.toBeNull();
    expect(card!.querySelectorAll('a, button')).toHaveLength(0);
    expect(container.querySelector('a[href="/league-matches/lg-1"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /리그 상세로 이동/ })).not.toBeInTheDocument();
  });

  /**
   * 리그 대진은 편성 시 어드민 명의의 '승인된 신청서'가 함께 만들어져(league-fixture-creation.ts)
   * 편성한 어드민에게 viewerState 'approved' 가 온다. 신청 개념이 없는 리그에서 '승인 완료' 는
   * "내 팀이 승인됐다" 가 아니고, 관계가 없는 뷰어에게 붙던 '상대 모집 중' 도 거짓이다
   * (상대는 이미 정해져 있다). 호스트 팀 관리자의 '내 매치' 만 남긴다.
   */
  it("리그 대진에는 '승인 완료'·'상대 모집 중' 이 붙지 않고, 호스트의 '내 매치' 만 남는다", () => {
    const league = { leagueId: 'lg-1', title: '가을 리그' };
    const model = getTeamMatchListViewModel();
    model.matches = [
      { ...model.matches[0], id: 'tm-approved', status: 'approved', league },
      { ...model.matches[0], id: 'tm-open', status: 'open', league },
      { ...model.matches[0], id: 'tm-mine', status: 'mine', league },
    ];

    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.queryByText('승인 완료')).not.toBeInTheDocument();
    expect(screen.queryByText('상대 모집 중')).not.toBeInTheDocument();
    expect(screen.getAllByText('내 매치')).toHaveLength(1);
    expect(leagueBadges()).toHaveLength(3);
  });

  it("친선 매치는 그대로 '승인 완료'·'상대 모집 중' 을 쓴다 — 리그 예외가 친선으로 새지 않는다", () => {
    const model = getTeamMatchListViewModel();
    model.matches = [
      { ...model.matches[0], id: 'tm-approved', status: 'approved', league: null },
      { ...model.matches[0], id: 'tm-open', status: 'open', league: null },
    ];

    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getByText('승인 완료')).toBeInTheDocument();
    expect(screen.getByText('상대 모집 중')).toBeInTheDocument();
  });

  /**
   * **카드가 "누구와 붙는지" 를 안 보여줬다.**
   *
   * 목록 응답에 상대팀이 없어 화면 어디에도 없던 정보다 — 그래서 행 카드는 신원 줄에
   * 홈팀만 적었다. `toListItem` 이 `approvedOpponentTeam` 을 싣게 되면서(추가 쿼리 없음)
   * 이제 "A vs B" 를 말할 수 있다. 상대가 아직 없으면 **붙이지 않는다** — 없는 사실을
   * 만들지 않는다.
   */
  it('상대가 확정되면 신원 줄이 홈팀 vs 상대팀을 말한다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], hostTeam: '홈 FC', opponentTeam: '상대 FC' }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const host = container.querySelector('.tm-team-match-row-host');
    expect(host).not.toBeNull();
    expect(host!.textContent).toContain('홈 FC vs 상대 FC');
  });

  it('상대가 아직 없으면 홈팀만 적는다 — 없는 상대를 만들지 않는다', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{ ...model.matches[0], hostTeam: '홈 FC', opponentTeam: null }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    const host = container.querySelector('.tm-team-match-row-host');
    expect(host!.textContent).toContain('홈 FC');
    expect(host!.textContent).not.toContain('vs');
  });

  /**
   * **리그 대진 카드를 흐리게 만들지 않는다.**
   *
   * 리그의 `closed` 는 "모집이 끝났다" 가 아니라 "상대가 정해져 있다" 는 뜻인데, 그 상태가
   * 원정팀 팀장·선수 전원에게 붙어 **자기 팀 경기가 마감·흐림으로** 보였다. 흐림은 클래스
   * 하나로 걸리므로 그 유무를 리그/친선 두 방향으로 잰다.
   */
  it('리그 대진 카드에는 마감 흐림을 걸지 않는다 — 친선은 그대로', () => {
    const league = getTeamMatchListViewModel();
    league.matches = [{ ...league.matches[0], closed: true, league: { leagueId: 'lg-1', title: '가을 리그' } }];
    const first = renderPage(<TeamMatchListPageView model={league} />);
    expect(first.container.querySelector('.tm-match-row')).not.toHaveClass('tm-card-closed');
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    first.unmount();

    const friendly = getTeamMatchListViewModel();
    friendly.matches = [{ ...friendly.matches[0], closed: true, league: null }];
    const second = renderPage(<TeamMatchListPageView model={friendly} />);
    expect(second.container.querySelector('.tm-match-row')).toHaveClass('tm-card-closed');
    expect(screen.getByText('신청 마감')).toBeInTheDocument();
  });

  /**
   * **`성별 미설정` 이 리그 카드에 항상 떴다.**
   *
   * 카드 모델이 빈 값을 문자열로 채워서, 조건 줄의 `filter(Boolean)` 가 **절대 안 걸렸다.**
   * 리그 대진은 성별 조건을 안 정하는 게 기본이라 모든 리그 카드에 그 말이 붙었다.
   * 두 방향을 함께 잰다 — 값이 있으면 조건 줄에 들어가고, 없으면 구분점째로 사라진다.
   */
  it('성별 조건이 없으면 조건 줄에서 빠지고, 있으면 들어간다', () => {
    const withGender = getTeamMatchListViewModel();
    withGender.matches = [{ ...withGender.matches[0], sport: '풋살', grade: '', format: '', gender: '성별 무관' }];
    const first = renderPage(<TeamMatchListPageView model={withGender} />);
    expect(first.container.querySelector('.tm-team-match-row-cond')!.textContent).toContain('풋살 · 성별 무관');
    first.unmount();

    const withoutGender = getTeamMatchListViewModel();
    withoutGender.matches = [{ ...withoutGender.matches[0], sport: '풋살', grade: '', format: '', gender: '' }];
    const second = renderPage(<TeamMatchListPageView model={withoutGender} />);
    const cond = second.container.querySelector('.tm-team-match-row-cond')!.textContent ?? '';
    expect(cond).toContain('풋살');
    expect(cond).not.toContain('성별 미설정');
    // 빈 값을 그대로 이으면 "풋살 · " 처럼 구분점만 남는다.
    expect(cond.trim().startsWith('풋살')).toBe(true);
    expect(cond.trim()).not.toMatch(/·\s*$/);
  });

  /**
   * 리그 경기에는 **상대팀 부담금이라는 개념이 없다** — `비용 미정` 이 영원히 미정으로
   * 남아 운영자가 안 채운 것처럼 읽힌다. 자리를 비우지는 않는다(푸터 좌우 배치가 무너지고,
   * '무료' 로 둔갑시키지 않으려던 원래 의도도 사라진다).
   */
  it('리그 대진의 비용 자리는 행동 라벨(경기 보기)로 바뀐다 — 친선은 그대로 비용 미정', () => {
    const league = getTeamMatchListViewModel();
    league.matches = [{ ...league.matches[0], opponentCost: null, league: { leagueId: 'lg-1', title: '가을 리그' } }];
    const first = renderPage(<TeamMatchListPageView model={league} />);
    expect(screen.getByText('경기 보기')).toHaveClass('tm-match-row-act');
    expect(screen.queryByText('리그 경기')).not.toBeInTheDocument();
    expect(screen.queryByText('비용 미정')).not.toBeInTheDocument();
    first.unmount();

    const friendly = getTeamMatchListViewModel();
    friendly.matches = [{ ...friendly.matches[0], opponentCost: null, league: null }];
    renderPage(<TeamMatchListPageView model={friendly} />);
    expect(screen.getByText('비용 미정')).toBeInTheDocument();
  });

  it('상세의 호스트 팀 카드는 매치 소속 리그를 팀 속성처럼 표시하지 않는다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, league: { leagueId: 'lg-1', title: '가을 리그' } };

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText('정규 리그 · 가을 리그')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="/league-matches/"]')).toBeNull();
    expect(container.querySelectorAll('.tm-host-team-card button')).toHaveLength(0);
  });

  it('리그 소속이 아니면 상세에 리그 배지가 없다', () => {
    const model = getTeamMatchDetailViewModel();
    model.match.league = null;

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(container.querySelector('a[href^="/league-matches/"]')).toBeNull();
    expect(screen.queryByText(/정규 리그/)).not.toBeInTheDocument();
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
 * 2026-09-26 alpha 감사 — CTA 상태줄 캡션이 항상 "신청 상태"였는데, 경기가 실제로 시작되면
 * model.statusLabel 값이 modelScheduleLabel()의 경기 상태로 바뀐다(경기 자체의 시간 상태 —
 * 신청 흐름과 무관한 축). 캡션은 값의 의미 축(statusLabelKind)을 따라야 한다.
 */
describe('상세 CTA 상태줄 캡션 — 값의 의미 축(신청/경기)에 따라 바뀐다', () => {
  it('경기가 진행 중이면(statusLabelKind=match) 캡션이 "경기 상태"다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.statusLabel = '진행 중';
    model.statusLabelKind = 'match';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getAllByText('경기 상태').length).toBeGreaterThan(0);
    expect(screen.queryByText('신청 상태')).not.toBeInTheDocument();
  });

  it('신청 흐름 상태(statusLabelKind 미지정)는 예전처럼 "신청 상태"를 보여준다(회귀 방지)', () => {
    // match.status는 기본 목업값(open)을 그대로 둔다 — 'closed'로 바꾸면 [P2] 중복 제거
    // 조건(mode==='default' && status==='closed')에 걸려 캡션 자체가 안 그려진다(아래
    // 별도 describe에서 그 경로를 검증한다). 이 테스트는 순수하게 캡션의 의미 축(신청/경기)
    // 판정만 본다.
    const model = getTeamMatchDetailViewModel('default');
    model.statusLabel = '신청 가능';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getAllByText('신청 상태').length).toBeGreaterThan(0);
    expect(screen.queryByText('경기 상태')).not.toBeInTheDocument();
  });
});

/**
 * [P2] 신청한 적 없는 뷰어(mode==='default')가 이미 닫힌 팀매치를 볼 때, 하단 바가
 * 히어로의 상대팀 sub 문구(model.statusLabel)를 그대로 반복하던 것을 없앤다 — 히어로가
 * 이미 상대(사실)와 사유를 말했으니 하단 바에는 캡션+값 없이 버튼만 남는다.
 */
describe('상세 CTA 상태줄 — 신청한 적 없는 뷰어의 닫힌 매치는 하단 바 캡션을 반복하지 않는다', () => {
  it('히어로 상대팀 sub와 하단 바가 같은 문구를 두 번 반복하지 않는다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.status = 'closed';
    model.match.applicantTeams = [];
    model.statusLabel = '신청 마감';

    renderPage(<TeamMatchDetailPageView model={model} />);

    // 히어로(상대팀 없음 → '모집 마감' 라벨 + 매치 상태 배지)는 그대로 보여야 한다.
    expect(screen.getByText('모집 마감')).toBeInTheDocument();
    // 하단 바 캡션("신청 상태")은 사라지고, statusLabel 값도 딱 한 번만(히어로에서만) 보인다.
    expect(screen.queryByText('신청 상태')).not.toBeInTheDocument();
    expect(screen.getAllByText('신청 마감').length).toBe(1);
  });

  it('신청한 적 있는 뷰어(mode!=="default")는 기존처럼 하단 바 캡션을 그대로 보여준다(회귀 방지)', () => {
    const model = getTeamMatchDetailViewModel('pending');
    model.match.status = 'closed';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getAllByText('신청 상태').length).toBeGreaterThan(0);
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

  it('trustState=sample 은 실제 신뢰 신호가 아니므로 홈팀 카드에 노출하지 않는다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.hostTeamTrustState = 'sample';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText('sample')).not.toBeInTheDocument();
    expect(screen.queryByText('샘플')).not.toBeInTheDocument();
  });

  it('팀 카드에는 매치 출처·조건이 아니라 실제 팀 설정과 팀 평점을 표시한다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.platformManaged = true;
    model.match.hostTeamId = 'team-home';
    model.match.hostTeamHref = '/teams/team-home';
    model.match.sport = '매치 종목';
    model.match.grade = '매치 등급';
    model.match.hostTeamSportName = '풋살';
    model.match.hostTeamLevelLabel = '중급';
    model.match.hostTeamRatingScore = 4.5;
    model.match.hostTeamWins = 4;

    renderPage(<TeamMatchDetailPageView model={model} />);

    const teamCards = screen.getAllByLabelText(`${model.match.hostTeam} 팀 보기`);
    expect(teamCards.length).toBeGreaterThan(0);
    for (const card of teamCards) {
      expect(within(card).getByText('팀 평점 4.5 · 4승')).toBeInTheDocument();
      expect(within(card).getByText('풋살')).toBeInTheDocument();
      expect(within(card).getByText('중급')).toBeInTheDocument();
      expect(within(card).queryByText('플랫폼 주관')).not.toBeInTheDocument();
      expect(within(card).queryByText('매치 종목')).not.toBeInTheDocument();
      expect(within(card).queryByText('매치 등급등급')).not.toBeInTheDocument();
    }
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

  it('관리자 생성 매치의 홈팀으로 승인됐지만 상대팀이 없으면 모집 상태를 유지한다', () => {
    const model = getTeamMatchDetailViewModel('approved');
    model.match.applicantTeams = [];

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('모집 중')).toBeInTheDocument();
    expect(screen.getByText('신청 후 승인')).toBeInTheDocument();
    expect(screen.queryByText('참가 확정')).not.toBeInTheDocument();
  });
});

// H6 A-3: 예전 "매치 관리" 카드는 상대 확정 뒤 진행 체크리스트로 합쳐졌다 — 명단·결과 입구가 행 링크다.
describe('TeamMatchDetailPageView — 진행 체크리스트의 명단 행 (Task 179 · H6 A-3)', () => {
  const progress = { opponentName: '한강 로버스', confirmedAtLabel: '오늘 19:05', lineupSubmitted: false, lockNote: null };

  it('친선은 참석명단 행이 제출 여부를 말하고 명단 화면으로 간다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.progress = progress;
    model.lineupAction = { kind: 'attendance', href: '/team-matches/team-match-1/lineup' };

    renderPage(<TeamMatchDetailPageView model={model} />);

    const row = screen.getByRole('link', { name: /참석명단 제출/ });
    expect(row).toHaveAttribute('href', '/team-matches/team-match-1/lineup');
    expect(row).toHaveTextContent('제출 전');
    expect(screen.queryByText('매치 관리')).not.toBeInTheDocument();
  });

  it('리그 경기 명단은 제출 문구 없이 참가 명단 기준으로 두고, 조정 화면으로만 간다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.progress = { ...progress, lineupSubmitted: null };
    model.lineupAction = { kind: 'match-roster', href: '/teams/team-host/games/game-1/roster' };
    model.resultAction = { label: '경기 결과 보기', href: '/team-matches/team-match-1/result' };

    renderPage(<TeamMatchDetailPageView model={model} />);

    const row = screen.getByRole('link', { name: /경기 명단/ });
    expect(row).toHaveAttribute('href', '/teams/team-host/games/game-1/roster');
    expect(row).toHaveTextContent('참가 명단 기준');
    expect(screen.queryByText(/제출/)).not.toBeInTheDocument();
    // 경기 전에는 결과 행이 열리지 않는다 — 링크가 아니라 안내다.
    expect(screen.queryByRole('link', { name: /경기 결과 기록/ })).not.toBeInTheDocument();
    expect(screen.getByText('경기 후에 열려요')).toBeInTheDocument();
  });
});

describe('TeamMatchDetailPageView — 히어로 액션', () => {
  it('이미지 우측 상단에는 공유만 노출한다', () => {
    renderPage(<TeamMatchDetailPageView model={getTeamMatchDetailViewModel('default')} />);

    expect(screen.getAllByRole('button', { name: '공유' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '홈으로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림' })).not.toBeInTheDocument();
  });
});

describe('TeamMatchDetailPageView — 신청팀 후속 행동', () => {
  it('생성팀이 보고 있어도 승인된 상대팀이 없으면 모집 상태를 유지한다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.applicantTeams = [];

    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const hero = container.querySelector<HTMLElement>('.tm-team-vs-row');

    expect(hero).not.toBeNull();
    expect(within(hero!).getByText('모집 중')).toBeInTheDocument();
    expect(within(hero!).getByText('신청 후 승인')).toBeInTheDocument();
    expect(within(hero!).queryByText('신청팀')).not.toBeInTheDocument();
    expect(within(hero!).queryByText('승인 후 확정')).not.toBeInTheDocument();
  });

  it('신청팀 카드에서 실제 상대팀 상세로 이동할 수 있다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.applicantTeams = [{
      name: '브라보FC',
      meta: '매너 4.8 · 12전',
      status: '승인 대기',
      href: '/teams/team-bravo',
      applicationId: 'application-1',
    }];

    renderPage(<TeamMatchDetailPageView model={model} />);

    const links = screen.getAllByRole('link', { name: '브라보FC 팀 보기' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/teams/team-bravo');
  });

  it('신청팀이 없으면 빈 카드 대신 현재 상태를 설명한다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.applicantTeams = [];
    model.match.apiStatus = 'recruiting';

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByRole('heading', { name: '아직 신청한 팀이 없어요' })).toBeInTheDocument();
  });

  it('신청 목록을 받는 중이면 "신청 없음"을 먼저 말하지 않는다 — 알림으로 들어온 호스트가 잘못 읽는다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.applicantTeams = [];
    model.match.apiStatus = 'recruiting';
    model.applicationsPending = true;

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText('아직 신청한 팀이 없어요')).not.toBeInTheDocument();
  });

  // MD-QA #16: 생성팀 계정에서 상대팀 승인 완료 후에도 상세 상단이 실제 팀명 대신
  // '신청팀 / 승인 후 확정' placeholder에 고정돼 있었다.
  it('생성팀 뷰에서 상대팀 승인 완료 후에는 상단에 실제 상대팀 이름과 참가 확정 상태를 보여준다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.applicantTeams = [{
      name: '한강 로버스',
      meta: '승인된 상대팀',
      status: '승인 완료',
      href: '/teams/team-hangang',
      applicationId: 'application-1',
    }];

    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.getByText('참가 확정')).toBeInTheDocument();
    expect(screen.queryByText('승인 후 확정')).not.toBeInTheDocument();
  });

  it('⋯ 메뉴의 팀매치 취소는 확인 전에는 실행하지 않는다', async () => {
    const onCancel = vi.fn();
    const model = getTeamMatchDetailViewModel('mine');
    model.manageMenu = { edit: { href: '/team-matches/team-match-1/edit' }, history: [] };
    model.hostActions = [{
      label: '팀매치 취소',
      tone: 'danger',
      confirm: {
        title: '팀매치를 취소할까요?',
        message: '취소하면 되돌릴 수 없어요.',
        confirmLabel: '팀매치 취소',
      },
      onClick: onCancel,
    }];

    renderPage(<TeamMatchDetailPageView model={model} />);
    // 본문에는 취소 버튼이 없다(빨강 채움 제거) — ⋯ 메뉴 안에만 있다.
    expect(screen.queryByRole('button', { name: /팀매치 취소/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '매치 관리 메뉴' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /팀매치 취소/ }));

    expect(onCancel).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: '팀매치를 취소할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '팀매치 취소' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    // 확정하면 메뉴 시트도 닫힌다.
    expect(screen.queryByRole('dialog', { name: '매치 관리' })).not.toBeInTheDocument();
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
    applyModel.applyLabel = '알파FC로 신청';
    applyModel.onApply = vi.fn().mockResolvedValue(applied);
    const applyView = renderPage(<TeamMatchDetailPageView model={applyModel} />);
    fireEvent.click(screen.getAllByRole('button', { name: '알파FC로 신청' })[0]);
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

// 필터 시트 A안(드래그로 닫기) 배선 — DraggableFilterSheet에서 BottomSheet로 교체.
// 이 파일이 실제로 짜 넣은 건 onRequestClose → router.push(closeHref) 한 줄뿐이다
// (드래그 임계치 판정 자체는 bottom-sheet.test.tsx가 이미 검증한다). 잘못 배선하면
// (엉뚱한 href, push 대신 replace 등) 뒤로가기·URL 공유 성질이 조용히 깨지므로 그
// 배선만 좁게 검증한다 — ESC는 useModalA11y가 이미 물려주는 onClose 경로라 pointer
// 이벤트 폴리필 없이도 onRequestClose를 발화시킬 수 있다.
describe('팀매치 목록 필터 시트 — BottomSheet 배선(A안)', () => {
  function buildFilterSheetModel() {
    const model = getTeamMatchListViewModel();
    model.filterSheet = {
      open: true,
      closeHref: '/team-matches?filterOpen=false',
      resetHref: '/team-matches?filterReset=true',
      applyHref: '/team-matches?filterApply=true',
      sort: '',
      view: 'card',
      genderRule: '',
      levels: [],
      kind: '',
      sortOptions: [{ label: '추천순', value: 'recommended', href: '/team-matches?sort=recommended', active: true }],
      genderOptions: [{ label: '성별 무관', value: '성별 무관', href: '/team-matches?gender=all', active: true }],
      levelOptions: [{ label: '초급', value: 'beginner', href: '/team-matches?level=beginner' }],
      kindOptions: [{ label: '전체', value: '', href: '/team-matches?kind=all', active: true }],
    };
    return model;
  }

  it('filterSheet.open이 true면 dialog로 시트가 뜨고 scrim이 closeHref를 그대로 갖는다', () => {
    const model = buildFilterSheetModel();
    renderPage(<TeamMatchListPageView model={model} />);

    const dialog = screen.getByRole('dialog', { name: '팀매치 필터' });
    expect(dialog).toBeInTheDocument();

    const scrim = screen.getByRole('link', { name: '필터 닫기' });
    expect(scrim).toHaveAttribute('href', '/team-matches?filterOpen=false');
  });

  it('filterSheet.open이 false면 시트가 아예 마운트되지 않는다(로컬 open 상태를 새로 만들지 않는다)', () => {
    const model = buildFilterSheetModel();
    model.filterSheet!.open = false;
    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.queryByRole('dialog', { name: '팀매치 필터' })).not.toBeInTheDocument();
  });

  // 시트를 연 항목이 없는 진입(딥링크)이라 push 가 아니라 replace — 닫기가 항목을 더 쌓지 않는다.
  it('ESC로 닫으면 로컬 상태가 아니라 closeHref 로 네비게이션한다(replace)', () => {
    const model = buildFilterSheetModel();
    renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getByRole('dialog', { name: '팀매치 필터' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith('/team-matches?filterOpen=false');
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe('TeamMatchListPageView completed card', () => {
  it('labels a completed match as 경기 종료 instead of 신청 마감', () => {
    const model = getTeamMatchListViewModel();
    model.matches = [{
      ...model.matches[0],
      status: 'closed',
      closed: true,
      apiStatus: 'completed',
    }];

    const { container } = renderPage(<TeamMatchListPageView model={model} />);

    expect(screen.getByText('경기 종료')).toBeInTheDocument();
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-match-row.tm-card-closed')).not.toBeNull();
  });
});

// H6 A안 — 상세 맨 위 "지금 할 일" 카드. 호스트는 그 자리에서 승인·거절하고(확인 창 N-2), 신청 팀은
// 히어로 "우리 팀" 과 승인 대기 카드를, 상대 확정 뒤에는 양쪽이 진행 체크리스트를 본다.
describe('TeamMatchDetailPageView — 지금 할 일 카드 (H6)', () => {
  type Applicant = ReturnType<typeof getTeamMatchDetailViewModel>['match']['applicantTeams'][number];
  const applicant = (name: string, extra: Partial<Applicant> = {}): Applicant => ({
    name,
    meta: '팀 평점 4.5 · 3승',
    status: '승인 대기',
    applicationStatus: 'requested',
    applicationId: `app-${name}`,
    href: `/teams/${name}`,
    appliedByName: `${name} 팀장`,
    appliedAtLabel: '오늘 18:41',
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...extra,
  });
  function hostModel(teams: Applicant[]) {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.apiStatus = 'recruiting';
    model.match.applicantTeams = teams;
    return model;
  }

  it('호스트 — 신청 수가 히어로와 카드 맨 위에 보이고, 승인은 주 버튼·거절은 글자 버튼이다', () => {
    const model = hostModel([applicant('합정', { message: '저녁 경기 좋아요.' }), applicant('성수'), applicant('처리됨', { applicationStatus: 'rejected', status: '거절', onApprove: undefined, onReject: undefined })]);
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(within(container.querySelector<HTMLElement>('.tm-team-vs-row')!).getByText('신청 2팀 대기')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: '신청 2팀이 승인을 기다려요' });
    expect(within(card).getByText('지금 할 일')).toBeInTheDocument();
    expect(within(card).getByText('“저녁 경기 좋아요.”')).toBeInTheDocument();
    expect(within(card).getByText('합정 팀장 · 오늘 18:41 신청')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '합정 신청 승인' })).toHaveClass('tm-btn-primary');
    expect(within(card).getByRole('button', { name: '합정 신청 거절' })).toHaveClass('tm-btn-ghost');
    // 처리된 신청은 할 일이 아니다.
    expect(within(card).queryByText('처리됨')).not.toBeInTheDocument();
  });

  it('승인은 확인 창을 거치고, 나머지 신청 팀이 자동 종료된다고 이름까지 알린다', async () => {
    const hapjeong = applicant('합정');
    renderPage(<TeamMatchDetailPageView model={hostModel([hapjeong, applicant('성수')])} />);

    fireEvent.click(screen.getByRole('button', { name: '합정 신청 승인' }));
    expect(hapjeong.onApprove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: '합정을 상대팀으로 확정할까요?' });
    expect(dialog).toHaveTextContent('확정하면 되돌릴 수 없어요. 나머지 신청 1팀(성수)은 자동으로 종료되고 알림이 가요.');
    fireEvent.click(within(dialog).getByRole('button', { name: '승인하기' }));
    await waitFor(() => expect(hapjeong.onApprove).toHaveBeenCalledTimes(1));
  });

  it('신청이 1팀이면 확인 창에 자동 종료 문장이 없다', async () => {
    renderPage(<TeamMatchDetailPageView model={hostModel([applicant('합정')])} />);

    fireEvent.click(screen.getByRole('button', { name: '합정 신청 승인' }));
    const dialog = await screen.findByRole('dialog', { name: '합정을 상대팀으로 확정할까요?' });
    expect(dialog).toHaveTextContent('확정하면 되돌릴 수 없어요.');
    expect(dialog).not.toHaveTextContent('나머지');
  });

  it('거절도 확인 창을 거치고 닫기를 누르면 아무 일도 없다', async () => {
    const seongsu = applicant('성수');
    renderPage(<TeamMatchDetailPageView model={hostModel([applicant('합정'), seongsu])} />);

    fireEvent.click(screen.getByRole('button', { name: '성수 신청 거절' }));
    const dialog = await screen.findByRole('dialog', { name: '성수 신청을 거절할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '성수 신청을 거절할까요?' })).not.toBeInTheDocument());
    expect(seongsu.onReject).not.toHaveBeenCalled();
  });

  it('신청이 3팀 이상이면 2팀만 펼치고 나머지는 더 보기로 연다', () => {
    renderPage(<TeamMatchDetailPageView model={hostModel([applicant('A'), applicant('B'), applicant('C')])} />);

    expect(screen.queryByRole('button', { name: 'C 신청 승인' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '신청 1팀 더 보기' }));
    expect(screen.getByRole('button', { name: 'C 신청 승인' })).toBeInTheDocument();
  });

  it('신청 팀 — 히어로 상대팀 자리에 우리 팀과 승인 대기가 보이고, 신청 취소는 중립 톤이다', () => {
    const model = getTeamMatchDetailViewModel('pending');
    model.myApplicationTeam = { teamId: 'team-hapjeong', name: '합정 유나이티드' };
    model.applyLabel = '합정 유나이티드 신청 취소';
    model.onApply = vi.fn();
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    const hero = within(container.querySelector<HTMLElement>('.tm-team-vs-row')!);
    expect(hero.getByText('우리 팀')).toBeInTheDocument();
    expect(hero.getByText('합정 유나이티드')).toBeInTheDocument();
    expect(hero.getByText('승인 대기')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: '신청을 접수했어요' });
    expect(card).toHaveTextContent('홈팀이 승인하면 채팅과 참석명단이 열려요.');
    for (const button of screen.getAllByRole('button', { name: '합정 유나이티드 신청 취소' })) {
      expect(button).toHaveClass('tm-btn-neutral');
      expect(button).not.toHaveClass('tm-btn-warning');
    }
  });

  it('제3자 — 할 일 카드도 관리 메뉴도 없다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.apiStatus = 'recruiting';
    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText('지금 할 일')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '매치 관리 메뉴' })).not.toBeInTheDocument();
  });
});

describe('TeamMatchDetailPageView — 매칭 뒤 진행 카드와 ⋯ 메뉴 (H6 A-3·manage-menu)', () => {
  function matchedHostModel() {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.apiStatus = 'matched';
    model.match.applicantTeams = [{ name: '합정 유나이티드', meta: '', status: '승인 완료', applicationStatus: 'approved', href: '/teams/hapjeong' }];
    model.onChat = vi.fn();
    model.lineupAction = { kind: 'attendance', href: '/team-matches/team-match-1/lineup' };
    model.progress = { opponentName: '합정 유나이티드', confirmedAtLabel: '오늘 19:05', lineupSubmitted: false, lockNote: '시간·장소는 상대팀이 정해진 뒤에는 바꿀 수 없어요. 바꿔야 하면 채팅으로 상의해요.' };
    model.nextAction = { label: '참석명단 관리', href: '/team-matches/team-match-1/lineup', tone: 'primary' };
    model.statusCaption = '경기 준비';
    model.statusLabel = '참석명단 제출 전';
    model.manageMenu = {
      edit: { lockedReason: '상대팀이 정해져서 바꿀 수 없어요. 바꿔야 하면 채팅으로 상의해요.' },
      history: [
        { key: 'a', name: '합정 유나이티드', statusLabel: '승인 완료', timeLabel: '오늘 19:05' },
        { key: 'b', name: '성수 FC', statusLabel: '자동 종료', timeLabel: '오늘 19:05' },
      ],
    };
    model.hostActions = [{ label: '팀매치 취소', description: '취소하면 합정 유나이티드에 알림이 가요.', tone: 'danger', onClick: vi.fn() }];
    return model;
  }

  it('호스트는 상대·진행 단계·수정 잠금 이유를 한 카드에서 보고, 하단 바는 참석명단 관리가 된다', () => {
    renderPage(<TeamMatchDetailPageView model={matchedHostModel()} />);

    const card = screen.getByRole('region', { name: '합정 유나이티드와 경기해요' });
    expect(within(card).getByText('상대팀 확정', { selector: '.tm-badge' })).toBeInTheDocument();
    expect(within(card).getByText('오늘 19:05')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /참석명단 제출/ })).toHaveTextContent('제출 전');
    expect(card).toHaveTextContent('시간·장소는 상대팀이 정해진 뒤에는 바꿀 수 없어요.');
    const barLinks = screen.getAllByRole('link', { name: '참석명단 관리' });
    expect(barLinks.length).toBeGreaterThan(0);
    for (const link of barLinks) expect(link).toHaveClass('tm-btn-primary');
    expect(screen.getAllByText('경기 준비').length).toBeGreaterThan(0);
  });

  it('⋯ 메뉴 — 매칭 뒤엔 수정 대신 잠긴 이유, 신청 기록 요약과 펼침, 취소 결과 안내를 보여 준다', async () => {
    renderPage(<TeamMatchDetailPageView model={matchedHostModel()} />);

    fireEvent.click(screen.getAllByRole('button', { name: '매치 관리 메뉴' })[0]);
    const menu = await screen.findByRole('dialog', { name: '매치 관리' });
    expect(within(menu).queryByRole('link', { name: /정보 수정/ })).not.toBeInTheDocument();
    expect(menu).toHaveTextContent('상대팀이 정해져서 바꿀 수 없어요.');
    const history = within(menu).getByRole('button', { name: /신청 기록/ });
    expect(history).toHaveTextContent('승인 완료 1팀 · 자동 종료 1팀');
    expect(history).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(history);
    expect(within(menu).getByText('성수 FC')).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /팀매치 취소/ })).toHaveTextContent('취소하면 합정 유나이티드에 알림이 가요.');
  });

  it('⋯ 메뉴 — 모집 중이면 정보 수정이 링크이고, 신청 기록이 없으면 그 행이 없다', async () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.match.apiStatus = 'recruiting';
    model.manageMenu = { edit: { href: '/team-matches/team-match-1/edit' }, history: [] };
    model.hostActions = [{ label: '모집 마감', description: '대기 중인 신청 2팀이 종료돼요.', tone: 'neutral', onClick: vi.fn() }];
    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: '매치 관리 메뉴' })[0]);
    const menu = await screen.findByRole('dialog', { name: '매치 관리' });
    expect(within(menu).getByRole('link', { name: /정보 수정/ })).toHaveAttribute('href', '/team-matches/team-match-1/edit');
    expect(within(menu).queryByRole('button', { name: /신청 기록/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: /모집 마감/ })).toHaveTextContent('대기 중인 신청 2팀이 종료돼요.');
  });

  it('상대가 확정된 참가팀(신청 팀 쪽)도 같은 자리에서 진행 상황을 본다 — 호스트용 잠금 안내는 없다', () => {
    const model = getTeamMatchDetailViewModel('approved');
    model.progress = { opponentName: '마포 FC', confirmedAtLabel: null, lineupSubmitted: true, lockNote: null };
    model.lineupAction = { kind: 'attendance', href: '/team-matches/team-match-1/lineup' };
    renderPage(<TeamMatchDetailPageView model={model} />);

    const card = screen.getByRole('region', { name: '마포 FC와 경기해요' });
    expect(within(card).getByRole('link', { name: /참석명단 제출/ })).toHaveTextContent('제출 완료');
    expect(card).not.toHaveTextContent('바꿀 수 없어요');
    expect(screen.queryByRole('button', { name: '매치 관리 메뉴' })).not.toBeInTheDocument();
  });
});

describe('TeamMatchDetailPageView — 여러 팀 팀장의 신청 팀 선택 시트 (H6 N-1)', () => {
  it('신청 버튼이 팀 선택 시트를 열고, 고른 팀과 한마디로 신청한다', async () => {
    const submit = vi.fn(async () => ({ status: 'requested' }));
    const model = getTeamMatchDetailViewModel('default');
    model.applyLabel = '신청하기';
    model.applyTeamPicker = {
      teams: [
        { teamId: 'a', name: '합정 유나이티드', roleLabel: '팀장', eligible: true, reason: null },
        { teamId: 'b', name: '성수 FC', roleLabel: '매니저', eligible: true, reason: null },
        { teamId: 'c', name: '망원 축구단', roleLabel: '팀장', eligible: false, reason: '이 팀매치와 종목이 다른 팀이에요' },
      ],
      defaultTeamId: 'b',
      submit,
    };
    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: '신청하기' })[0]);
    const sheet = await screen.findByRole('dialog', { name: '어느 팀으로 신청할까요?' });
    expect(within(sheet).getByRole('radio', { name: /성수 FC/ })).toBeChecked();
    expect(within(sheet).getByRole('radio', { name: /망원 축구단/ })).toBeDisabled();
    expect(sheet).toHaveTextContent('이 팀매치와 종목이 다른 팀이에요');

    fireEvent.click(within(sheet).getByRole('radio', { name: /합정 유나이티드/ }));
    fireEvent.change(within(sheet).getByLabelText(/홈팀에 한마디/), { target: { value: '  저녁 경기 좋아요.  ' } });
    fireEvent.click(within(sheet).getByRole('button', { name: '합정 유나이티드로 신청하기' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith('a', '저녁 경기 좋아요.'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '어느 팀으로 신청할까요?' })).not.toBeInTheDocument());
  });

  it('신청이 실패하면 시트를 닫지 않고 이유를 보여 준다', async () => {
    const model = getTeamMatchDetailViewModel('default');
    model.applyLabel = '신청하기';
    model.applyTeamPicker = {
      teams: [
        { teamId: 'a', name: 'A팀', roleLabel: '팀장', eligible: true, reason: null },
        { teamId: 'b', name: 'B팀', roleLabel: '팀장', eligible: true, reason: null },
      ],
      defaultTeamId: 'a',
      submit: vi.fn(async () => { throw new Error('이미 다른 팀으로 신청했어요.'); }),
    };
    renderPage(<TeamMatchDetailPageView model={model} />);

    fireEvent.click(screen.getAllByRole('button', { name: '신청하기' })[0]);
    const sheet = await screen.findByRole('dialog', { name: '어느 팀으로 신청할까요?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'A팀으로 신청하기' }));

    expect(await within(sheet).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '어느 팀으로 신청할까요?' })).toBeInTheDocument();
  });
});

// W2-V8(alpha 확인) — 취소된 팀매치의 "취소됨"이 상대팀 이름 아래 캡션 자리에 있어 매치가 아니라
// 상대 팀의 상태처럼 읽혔다. 매치 상태는 히어로 맨 위 배지, 상대팀 캡션은 팀 상태만.
describe('TeamMatchDetailPageView — 히어로의 매치 상태 자리 (W2-V8)', () => {
  const opponentColumn = (container: HTMLElement) => within(container.querySelector<HTMLElement>('.tm-team-vs-row > div:last-child')!);

  it('취소된 팀매치는 "취소됨"을 상대팀 캡션이 아니라 히어로 배지로 말한다', () => {
    const model = getTeamMatchDetailViewModel('mine');
    model.mode = 'cancelled';
    model.statusLabel = '취소됨';
    model.match.applicantTeams = [{ name: '합정 유나이티드', meta: '', status: '승인 완료', applicationStatus: 'approved' }];
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    const hero = container.querySelector<HTMLElement>('.tm-team-vs-hero')!;
    expect(within(hero).getByText('취소됨', { selector: '.tm-badge' })).toBeInTheDocument();
    expect(opponentColumn(container).getByText('합정 유나이티드')).toBeInTheDocument();
    expect(opponentColumn(container).queryByText('취소됨')).not.toBeInTheDocument();
    expect(opponentColumn(container).queryByText('참가 확정')).not.toBeInTheDocument();
  });

  it('신청한 적 없는 뷰어가 끝난 매치를 보면 경기 상태는 배지, 상대팀 캡션은 참가 확정이다', () => {
    const model = getTeamMatchDetailViewModel('default');
    model.match.status = 'closed';
    model.statusLabel = '경기 종료';
    model.match.applicantTeams = [{ name: '합정 유나이티드', meta: '', status: '승인 완료' }];
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(within(container.querySelector<HTMLElement>('.tm-team-vs-hero')!).getByText('경기 종료', { selector: '.tm-badge' })).toBeInTheDocument();
    expect(opponentColumn(container).getByText('참가 확정')).toBeInTheDocument();
    expect(opponentColumn(container).queryByText('경기 종료')).not.toBeInTheDocument();
  });

  it('대조군 — 승인 대기 중인 신청 팀은 배지 없이 캡션이 팀 상태(승인 대기)다', () => {
    const model = getTeamMatchDetailViewModel('pending');
    model.myApplicationTeam = { teamId: 't', name: '합정 유나이티드' };
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);

    expect(container.querySelector('.tm-team-vs-hero .tm-badge')).toBeNull();
    expect(opponentColumn(container).getByText('승인 대기')).toBeInTheDocument();
  });
});
