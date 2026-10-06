import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TournamentsListPageClient as TournamentsPage } from './tournaments-list-client';

/**
 * 통합 목록의 유형 축(`?kind=`)이 **주소에서 서버까지 실제로 이어지는가**를 잠근다.
 *
 * 이게 끊기면 화면은 멀쩡해 보인다 — 세그먼트는 그려지고 클릭도 되며 주소도 바뀌는데,
 * 목록 내용만 그대로다. 눈으로는 "리그가 아직 없나 보다"로 읽혀서 결함으로 안 보인다.
 * 그래서 단언 대상은 세그먼트의 모양이 아니라 **서버에 나간 파라미터**다.
 */
const tournamentsMock = vi.fn();
let search = '';
const SWIMMING_ID = '10fe8a75-9824-4a09-824a-385b37266fff';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournaments: (...args: unknown[]) => tournamentsMock(...args),
  useV1AllTournaments: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useV1MasterSports: () => ({ data: [{ id: SWIMMING_ID, name: '수영' }] }),
}));

beforeEach(() => {
  search = '';
  tournamentsMock.mockReset();
  tournamentsMock.mockReturnValue({
    data: { items: [], pageInfo: { hasNext: false, nextCursor: null, totalCount: 0 } },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

describe('#1543 대회 목록 — 상태와 모순되지 않는 영역 이름', () => {
  describe.each([false, true])('결과 카드 있음: %s', (hasItems) => {
    it.each([
      [null, '전체'], ['draft', '준비 중'], ['in_progress', '진행 중'], ['completed', '종료'],
    ] as const)('%s 상태에서 영역·필터·결과 의미를 유지한다', (status, label) => {
      const params = new URLSearchParams({ sportId: SWIMMING_ID, genderCategory: 'male' });
      if (status) params.set('status', status);
      search = params.toString();
      tournamentsMock.mockReturnValue({
        data: {
          items: hasItems ? [{
            id: 'swimming-control', title: '수영 대조 대회', status: status ?? 'open',
            sport: { code: 'swimming', name: '수영' }, scheduledAt: null,
            registrationDeadlineAt: null, venue: null, coverImageUrl: null,
            teamCount: 8, confirmedCount: 0, entryFee: 0,
          }] : [],
          pageInfo: { hasNext: false, nextCursor: null, totalCount: hasItems ? 1 : 0 },
        },
        isPending: false, isError: false, isFetching: false, refetch: vi.fn(),
      });
      render(<TournamentsPage />);

      const region = screen.getByRole('region', { name: '대회 목록' });
      const headingId = region.getAttribute('aria-labelledby');
      expect(headingId).toBeTruthy();
      expect(document.querySelectorAll(`[id="${headingId}"]`)).toHaveLength(1);
      const accessibleHeading = document.getElementById(headingId!);
      expect(region).toContainElement(accessibleHeading);
      expect(accessibleHeading).toHaveTextContent(/^대회 목록$/);
      expect(tournamentsMock.mock.calls.at(-1)?.[0]).toMatchObject({
        kind: 'all', status: status ?? undefined, sportId: SWIMMING_ID, genderCategory: 'male',
      });
      const summary = `${status ? `${label} · ` : ''}수영 · 남성부`;
      expect(within(region).getByRole('link', { name: `필터 열기 — 현재 ${summary}` }))
        .toHaveAttribute('href', `/tournaments?${new URLSearchParams({ ...Object.fromEntries(params), filter: '1' })}`);
      if (hasItems) {
        const list = within(region).getByRole('list', { name: '대회 목록' });
        const detailHref = within(list).getByRole('link', { name: /수영 대조 대회/ }).getAttribute('href');
        expect(detailHref).toBeTruthy();
        const detailUrl = new URL(detailHref!, 'https://teameet.test');
        expect(detailUrl.origin).toBe('https://teameet.test');
        expect(detailUrl.pathname).toBe('/tournaments/swimming-control');
        expect(detailUrl.hash).toBe('');
        expect([...detailUrl.searchParams.entries()]).toEqual([
          ['from', `/tournaments?${params.toString()}`],
        ]);
        expect(within(region).queryByText('조건에 맞는 대회가 없어요')).not.toBeInTheDocument();
      } else {
        expect(within(region).getByText('조건에 맞는 대회가 없어요')).toBeInTheDocument();
        expect(within(region).getByRole('link', { name: '팀밋 대회 보기' }))
          .toHaveAttribute('href', '/events');
      }
    });
  });

  it('리그 유형에서도 중립 이름과 실제 kind 요청을 유지한다', () => {
    search = 'kind=league&status=completed';
    render(<TournamentsPage />);
    const region = screen.getByRole('region', { name: '대회 목록' });
    expect(within(region).getByRole('link', { name: '정규 리그' })).toHaveAttribute('aria-current', 'page');
    expect(tournamentsMock.mock.calls.at(-1)?.[0]).toMatchObject({ kind: 'league', status: 'completed' });
  });
});

describe('#1516 대회 목록 — 조건에 맞는 정상 빈 결과', () => {
  describe.each([false, true])('종목 선택: %s', (withSport) => {
    it.each([
      ['in_progress', '진행 중'],
      ['draft', '준비 중'],
      ['completed', '종료'],
      [null, '전체'],
    ] as const)('%s 상태의 요청·요약·빈 안내가 모순되지 않는다', (status, label) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (withSport) {
        params.set('sportId', SWIMMING_ID);
        params.set('genderCategory', 'male');
      }
      search = params.toString();
      render(<TournamentsPage />);

      expect(tournamentsMock.mock.calls.at(-1)?.[0]).toMatchObject({
        status: status ?? undefined,
        sportId: withSport ? SWIMMING_ID : undefined,
        genderCategory: withSport ? 'male' : undefined,
      });
      const summary = withSport
        ? `${status ? `${label} · ` : ''}수영 · 남성부`
        : label;
      expect(screen.getByRole('link', { name: `필터 열기 — 현재 ${summary}` })).toHaveAttribute(
        'href', `/tournaments?${new URLSearchParams({ ...Object.fromEntries(params), filter: '1' })}`,
      );
      expect(screen.getByText('조건에 맞는 대회가 없어요')).toBeInTheDocument();
      expect(screen.getByText('필터 조건을 바꾸거나 팀밋 대회를 확인해 보세요.')).toBeInTheDocument();
      expect(screen.queryByText(/모집 중인 대회가 없어요|대회 알림/)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '팀밋 대회 보기' })).toHaveAttribute('href', '/events');
    });
  });

  it('API 실패는 빈 결과로 안내하지 않고 실제 오류와 재시도를 보여준다', async () => {
    const refetch = vi.fn();
    tournamentsMock.mockReturnValue({
      data: undefined, isPending: false, isError: true, isFetching: false,
      error: new Error('대회 목록 연결에 실패했어요.'), refetch,
    });
    render(<TournamentsPage />);
    expect(screen.getByRole('region', { name: '대회 목록' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('대회 목록 연결에 실패했어요.');
    expect(screen.queryByText('조건에 맞는 대회가 없어요')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('응답을 기다리는 동안에는 빈 안내 대신 로딩 상태를 보여준다', () => {
    tournamentsMock.mockReturnValue({
      data: undefined, isPending: true, isError: false, isFetching: true, refetch: vi.fn(),
    });
    render(<TournamentsPage />);
    expect(screen.getByRole('region', { name: '대회 목록' })).toBeInTheDocument();
    expect(screen.getByLabelText('대회 목록 불러오는 중')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('조건에 맞는 대회가 없어요')).not.toBeInTheDocument();
  });
});

function kindSentToServer(): unknown {
  const lastCall = tournamentsMock.mock.calls.at(-1);
  return (lastCall?.[0] as { kind?: unknown } | undefined)?.kind;
}

describe('대회 목록 — 유형(kind) 축', () => {
  it('?kind=league 면 서버에 league 를 묻는다', () => {
    search = 'kind=league';
    render(<TournamentsPage />);
    expect(kindSentToServer()).toBe('league');
  });

  it('?kind=all 이면 서버에 all 을 묻는다 — 대회와 리그가 한 목록에 섞이는 표면', () => {
    search = 'kind=all';
    render(<TournamentsPage />);
    expect(kindSentToServer()).toBe('all');
  });

  it('쿼리가 없으면 전체를 묻는다 — 통합 목록이 기본 화면이다', () => {
    search = '';
    render(<TournamentsPage />);
    expect(kindSentToServer()).toBe('all');
  });

  it('모르는 값이 와도 목록이 비지 않는다 — 기본 표면으로 떨어진다', () => {
    search = 'kind=regular_league';
    render(<TournamentsPage />);
    expect(kindSentToServer()).toBe('all');
  });

  it('현재 유형이 세그먼트에 반영된다', () => {
    search = 'kind=league';
    render(<TournamentsPage />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute('aria-current', 'page');
  });

  /**
   * B안의 핵심은 **자리**다 — 유형 세그먼트가 목록 헤더 아래, 종목 칩과 한 덩어리에 있어야
   * "제목 → 유형 → 종목 → 카드"가 한 줄로 읽힌다. 예전처럼 화면 맨 위(목록 섹션 **밖**)로
   * 돌아가면 그 사이를 프로모 배너가 가른다. 그건 시각 변경이 아니라 정보구조 변경이라
   * 여기서 잠근다.
   */
  /**
   * **계약이 바뀌었다(2026-09-01 B안).** 종목 칩 줄이 필터 시트로 들어가고 그 자리에
   * **요약 한 줄**이 왔다 — 사용자가 *"세로 높이를 지금보다 늘리지 않는 것이 핵심"* 이라고
   * 못박아서, 새 줄을 얹지 않고 **교체**했다.
   *
   * 그래서 `role="group" name="종목 필터"` 는 이 화면에 더 이상 없다. 다만 **검사하려던
   * 의도는 그대로다**: 유형 세그먼트가 목록 섹션 안에 있고, 필터 줄보다 앞에 온다.
   */
  it('유형 세그먼트는 목록 섹션 안에, 필터 요약 줄보다 앞에 있다', () => {
    search = '';
    const { container } = render(<TournamentsPage />);
    const section = container.querySelector('#tournament-list');
    expect(section).not.toBeNull();

    const segment = within(section as HTMLElement).getByRole('navigation', { name: '대회 유형' });
    const filterSummary = section!.querySelector('.tm-competition-filter-summary');
    expect(filterSummary).not.toBeNull();

    // DOCUMENT_POSITION_FOLLOWING(4) = segment 뒤에 요약 줄이 온다
    expect(
      segment.compareDocumentPosition(filterSummary as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * 높이 조건은 **줄 수**로 지킨다 — 칩 줄을 지우고 요약 줄을 넣었으므로 둘이 동시에
   * 있으면 안 된다. 있으면 한 줄이 늘어난 것이고 사용자가 못박은 조건이 깨진다.
   */
  it('종목 칩 줄과 요약 줄이 동시에 있지 않다 — 교체지 추가가 아니다', () => {
    search = '';
    const { container } = render(<TournamentsPage />);
    const section = container.querySelector('#tournament-list') as HTMLElement;

    expect(section.querySelector('.tm-competition-filter-summary')).not.toBeNull();
    expect(section.querySelector('.tm-sport-chip-row')).toBeNull();
  });
});
