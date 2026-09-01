import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TournamentsListContent } from './page';

/**
 * 통합 목록의 유형 축(`?kind=`)이 **주소에서 서버까지 실제로 이어지는가**를 잠근다.
 *
 * 이게 끊기면 화면은 멀쩡해 보인다 — 세그먼트는 그려지고 클릭도 되며 주소도 바뀌는데,
 * 목록 내용만 그대로다. 눈으로는 "리그가 아직 없나 보다"로 읽혀서 결함으로 안 보인다.
 * 그래서 단언 대상은 세그먼트의 모양이 아니라 **서버에 나간 파라미터**다.
 */
const tournamentsMock = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournaments: (...args: unknown[]) => tournamentsMock(...args),
  useV1AllTournaments: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useV1MasterSports: () => ({ data: [] }),
}));

beforeEach(() => {
  tournamentsMock.mockReset();
  tournamentsMock.mockReturnValue({
    data: { items: [], pageInfo: { hasNext: false, nextCursor: null, totalCount: 0 } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

function kindSentToServer(): unknown {
  const lastCall = tournamentsMock.mock.calls.at(-1);
  return (lastCall?.[0] as { kind?: unknown } | undefined)?.kind;
}

describe('대회 목록 — 유형(kind) 축', () => {
  it('?kind=league 면 서버에 league 를 묻는다', () => {
    search = 'kind=league';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('league');
  });

  it('?kind=all 이면 서버에 all 을 묻는다 — 대회와 리그가 한 목록에 섞이는 표면', () => {
    search = 'kind=all';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('all');
  });

  it('쿼리가 없으면 지금까지처럼 대회만 묻는다 (리다이렉트 전 기본값)', () => {
    search = '';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('tournament');
  });

  it('모르는 값이 와도 목록이 비지 않는다 — 기본 표면으로 떨어진다', () => {
    search = 'kind=regular_league';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('tournament');
  });

  it('현재 유형이 세그먼트에 반영된다', () => {
    search = 'kind=league';
    render(<TournamentsListContent />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute('aria-current', 'page');
  });

  /**
   * B안의 핵심은 **자리**다 — 유형 세그먼트가 목록 헤더 아래, 종목 칩과 한 덩어리에 있어야
   * "제목 → 유형 → 종목 → 카드"가 한 줄로 읽힌다. 예전처럼 화면 맨 위(목록 섹션 **밖**)로
   * 돌아가면 그 사이를 프로모 배너가 가른다. 그건 시각 변경이 아니라 정보구조 변경이라
   * 여기서 잠근다.
   */
  it('유형 세그먼트는 목록 섹션 안에, 종목 필터보다 앞에 있다', () => {
    search = '';
    const { container } = render(<TournamentsListContent />);
    const section = container.querySelector('#tournament-list');
    expect(section).not.toBeNull();

    const segment = within(section as HTMLElement).getByRole('navigation', { name: '대회 유형' });
    const sportFilter = within(section as HTMLElement).getByRole('group', { name: '종목 필터' });

    // DOCUMENT_POSITION_FOLLOWING(4) = segment 뒤에 sportFilter 가 온다
    expect(segment.compareDocumentPosition(sportFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
