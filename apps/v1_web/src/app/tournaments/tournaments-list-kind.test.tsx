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

  it('쿼리가 없으면 전체를 묻는다 — 통합 목록이 기본 화면이다', () => {
    search = '';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('all');
  });

  it('모르는 값이 와도 목록이 비지 않는다 — 기본 표면으로 떨어진다', () => {
    search = 'kind=regular_league';
    render(<TournamentsListContent />);
    expect(kindSentToServer()).toBe('all');
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
    const { container } = render(<TournamentsListContent />);
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
    const { container } = render(<TournamentsListContent />);
    const section = container.querySelector('#tournament-list') as HTMLElement;

    expect(section.querySelector('.tm-competition-filter-summary')).not.toBeNull();
    expect(section.querySelector('.tm-sport-chip-row')).toBeNull();
  });
});
