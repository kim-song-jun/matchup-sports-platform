import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentsListPageClient as TournamentsPage } from './tournaments-list-client';

/**
 * 대회 목록의 페이지 이동은 **화면 폭에 따라 서버에 다른 것을 묻는다** — 데스크톱은
 * `page`, 모바일은 `cursor`. 그 분기가 무너지면 화면은 멀쩡해 보이는데(둘 다 카드 20개)
 * 데스크톱에서 3페이지를 눌러도 1페이지가 나오거나, 모바일에서 스크롤할 때마다 목록이
 * 통째로 갈아끼워진다. 여기서 잠그는 건 그 계약이다.
 */
const tournamentsMock = vi.fn();
const navigation = vi.hoisted(() => ({ search: '', replace: vi.fn() }));

/* `useSearchParams` 는 App Router 의 컨텍스트에서 값을 읽는다 — 컴포넌트를 직접 render 하는
   이 테스트에는 그 provider 가 없어 훅이 null 을 돌려준다(실제 페이지에서는 절대 null 이
   아니고 타입도 non-null 이다). 여기서 막는 건 그 환경 차이지 제품 동작이 아니다.
   쿼리 없는 `/tournaments` = 지금의 기본 표면이므로 빈 파라미터로 둔다. */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournaments: (...args: unknown[]) => tournamentsMock(...args),
  useV1AllTournaments: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useV1MasterSports: () => ({ data: [] }),
}));

function card(id: string) {
  return {
    id,
    title: `대회 ${id}`,
    status: 'open',
    sport: { code: 'futsal', name: '풋살' },
    scheduledAt: null,
    registrationDeadlineAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 8,
    confirmedCount: 0,
    entryFee: 0,
    entryFeeConfigured: true,
  };
}

function listResult(over: {
  items: ReturnType<typeof card>[];
  pageInfo: Record<string, unknown>;
  isFetching?: boolean;
}) {
  return {
    data: { items: over.items, pageInfo: over.pageInfo },
    isPending: false,
    isError: false,
    error: null,
    isFetching: over.isFetching ?? false,
    refetch: vi.fn(),
  };
}

/** 이 앱의 데스크톱 분기점(1024px)에 대한 matchMedia 응답만 바꾼다. */
function setViewport(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isDesktop && query.includes('1024px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

describe('대회 목록 — 데스크톱 페이지네이션 / 모바일 무한 스크롤', () => {
  beforeEach(() => {
    tournamentsMock.mockReset();
    navigation.search = '';
    navigation.replace.mockReset();
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('데스크톱: 서버에 page 를 보내고 cursor 는 보내지 않는다', () => {
    setViewport(true);
    tournamentsMock.mockReturnValue(
      listResult({
        items: [card('t-1')],
        pageInfo: { nextCursor: null, hasNext: true, page: 1, total: 45, totalPages: 3, hasPrev: false },
      }),
    );

    render(<TournamentsPage />);

    const params = tournamentsMock.mock.calls[0][0];
    expect(params.page).toBe(1);
    expect(params).not.toHaveProperty('cursor');
  });

  it('모바일: 서버에 cursor 를 보내고 page 는 보내지 않는다', () => {
    setViewport(false);
    tournamentsMock.mockReturnValue(
      listResult({ items: [card('t-1')], pageInfo: { nextCursor: 'c-1', hasNext: true } }),
    );

    render(<TournamentsPage />);

    const params = tournamentsMock.mock.calls[0][0];
    expect(params).not.toHaveProperty('page');
    expect(params).toHaveProperty('cursor');
  });

  it('데스크톱: 페이지 번호 버튼을 누르면 그 페이지를 다시 묻는다', async () => {
    setViewport(true);
    tournamentsMock.mockReturnValue(
      listResult({
        items: [card('t-1')],
        pageInfo: { nextCursor: null, hasNext: true, page: 1, total: 45, totalPages: 3, hasPrev: false },
      }),
    );

    render(<TournamentsPage />);
    await userEvent.click(screen.getByRole('button', { name: '3페이지' }));

    const lastParams = tournamentsMock.mock.calls.at(-1)?.[0];
    expect(lastParams.page).toBe(3);
  });

  it('데스크톱: 전체 건수와 현재 구간을 보여준다', () => {
    setViewport(true);
    tournamentsMock.mockReturnValue(
      listResult({
        items: [card('t-1')],
        pageInfo: { nextCursor: null, hasNext: true, page: 2, total: 45, totalPages: 3, hasPrev: true },
      }),
    );

    render(<TournamentsPage />);

    expect(screen.getByText(/전체 45건 중 21–40/)).toBeInTheDocument();
  });

  it('데스크톱에는 "더 보기" 버튼을 두지 않는다', () => {
    setViewport(true);
    tournamentsMock.mockReturnValue(
      listResult({
        items: [card('t-1')],
        pageInfo: { nextCursor: 'c-1', hasNext: true, page: 1, total: 45, totalPages: 3, hasPrev: false },
      }),
    );

    render(<TournamentsPage />);

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('모바일: 다음 페이지가 있으면 "더 보기"가 남아 있다(observer 없는 환경의 대체 경로)', () => {
    setViewport(false);
    tournamentsMock.mockReturnValue(
      listResult({ items: [card('t-1')], pageInfo: { nextCursor: 'c-1', hasNext: true } }),
    );

    render(<TournamentsPage />);

    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument();
  });

  it('모바일: 마지막 페이지면 "더 보기"가 사라진다', () => {
    setViewport(false);
    tournamentsMock.mockReturnValue(
      listResult({ items: [card('t-1')], pageInfo: { nextCursor: null, hasNext: false } }),
    );

    render(<TournamentsPage />);

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('URL 반영을 기다리는 빠른 페이지 선택도 최신 페이지와 상세 복귀 주소를 유지한다', async () => {
    // Given: 라우터가 아직 URL을 반영하지 않은 데스크톱 목록.
    setViewport(true);
    navigation.search = 'kind=league&status=in_progress';
    tournamentsMock.mockImplementation(({ page }: { page: number }) => listResult({
      items: [card(`page-${page}`)],
      pageInfo: { page, total: 45, totalPages: 3, hasNext: page < 3, nextCursor: null },
    }));
    render(<TournamentsPage />);
    const user = userEvent.setup();

    // When: URL 응답 전에 2, 3페이지를 연속 선택한다.
    await user.click(screen.getByRole('button', { name: '2페이지' }));
    await user.click(screen.getByRole('button', { name: '3페이지' }));

    // Then: 마지막 선택을 표시하며 필터를 포함한 from도 같은 페이지를 가리킨다.
    expect(screen.getByText(/전체 45건 중 41–45/)).toBeInTheDocument();
    const detailHref = screen.getByRole('link', { name: /대회 page-3/ }).getAttribute('href');
    expect(new URL(detailHref ?? '', 'https://teameet.example').searchParams.get('from'))
      .toBe('/tournaments?kind=league&status=in_progress&page=3');
    expect(navigation.replace.mock.calls.at(-1)?.[0]).toBe('/tournaments?kind=league&status=in_progress&page=3');
  });

  it('동일 목록 인스턴스의 URL이 바뀌면 새 페이지를 읽고 필터 변경에서는 첫 페이지를 읽는다', async () => {
    // Given: 2페이지를 보고 있는 목록.
    setViewport(true);
    navigation.search = 'kind=league&page=2';
    tournamentsMock.mockImplementation(({ page }: { page: number }) => listResult({
      items: [card(`page-${page}`)],
      pageInfo: { page, total: 45, totalPages: 3, hasNext: page < 3, nextCursor: null },
    }));
    const view = render(<TournamentsPage />);
    expect(screen.getByText(/전체 45건 중 21–40/)).toBeInTheDocument();

    // When: 외부 URL 이동이나 Back으로 새 조회 조건이 도착한다.
    navigation.search = 'kind=league&page=3';
    view.rerender(<TournamentsPage />);
    expect(screen.getByText(/전체 45건 중 41–45/)).toBeInTheDocument();
    navigation.search = 'kind=tournament';
    view.rerender(<TournamentsPage />);

    // Then: 이전 페이지 draft가 새 필터의 첫 페이지를 덮지 않는다.
    expect(screen.getByText(/전체 45건 중 1–20/)).toBeInTheDocument();
  });

  it.each(['0', '-2', '2.5', 'text', 'Infinity', '1e2', '9007199254740992'])('잘못된 page=%s는 첫 페이지를 표시하고 상세 복귀 URL에서도 제거한다', (page) => {
    // Given: 신뢰할 수 없는 URL page 입력.
    setViewport(true);
    navigation.search = `kind=league&page=${page}`;
    tournamentsMock.mockImplementation(({ page: selectedPage }: { page: number }) => listResult({
      items: [card(`page-${selectedPage}`)],
      pageInfo: { page: selectedPage, total: 45, totalPages: 3, hasNext: true, nextCursor: null },
    }));

    // When: 목록을 마운트한다.
    render(<TournamentsPage />);

    // Then: 서버가 거절하는 page를 보내지 않고 안전한 첫 페이지와 복귀 주소를 표시한다.
    expect(screen.getByText(/전체 45건 중 1–20/)).toBeInTheDocument();
    const href = screen.getByRole('link', { name: /대회 page-1/ }).getAttribute('href');
    expect(new URL(href ?? '', 'https://teameet.example').searchParams.get('from')).toBe('/tournaments?kind=league');
  });

  it('모바일: URL에 데스크톱 page가 있어도 cursor만 보내고 누적 목록을 유지한다', async () => {
    // Given: 데스크톱 링크를 연 모바일 목록.
    setViewport(false);
    navigation.search = 'kind=league&page=2';
    tournamentsMock.mockReturnValue(listResult({ items: [card('t-1')], pageInfo: { nextCursor: 'c-1', hasNext: true } }));
    render(<TournamentsPage />);
    tournamentsMock.mockReturnValue(listResult({ items: [card('t-2')], pageInfo: { nextCursor: null, hasNext: false } }));

    // When: 다음 커서 결과를 불러온다.
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));

    // Then: page를 서버로 보내지 않고 이전 카드에 이어 붙인다.
    expect(tournamentsMock.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: 'c-1' });
    expect(tournamentsMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('page');
    expect(screen.getByText('대회 t-1')).toBeInTheDocument();
    expect(screen.getByText('대회 t-2')).toBeInTheDocument();
  });

  it('모바일: 다음 페이지를 불러오면 앞 페이지에 이어 붙인다(교체하지 않는다)', async () => {
    setViewport(false);
    tournamentsMock.mockReturnValue(
      listResult({ items: [card('t-1')], pageInfo: { nextCursor: 'c-1', hasNext: true } }),
    );

    const view = render(<TournamentsPage />);

    // "더 보기" 이후에는 훅이 2페이지를 돌려준다 — 실제 흐름과 같다.
    tournamentsMock.mockReturnValue(
      listResult({ items: [card('t-2')], pageInfo: { nextCursor: null, hasNext: false } }),
    );
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));
    view.rerender(<TournamentsPage />);

    expect(screen.getByText('대회 t-1')).toBeInTheDocument();
    expect(screen.getByText('대회 t-2')).toBeInTheDocument();
  });
});
