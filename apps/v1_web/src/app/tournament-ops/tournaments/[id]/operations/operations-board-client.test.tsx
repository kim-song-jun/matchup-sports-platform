import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsBoardClient } from './operations-board-client';
import type { V1TournamentOperationsBoardItem, V1TournamentOperationsBoardPage } from '@/types/api';

const mocks = vi.hoisted(() => ({
  useV1TournamentOperationsBoard: vi.fn(),
  fetchV1TournamentOperationsBoardPage: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournament-ops/tournaments/t-1/operations',
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TournamentOperationsBoard: (...args: unknown[]) => mocks.useV1TournamentOperationsBoard(...args),
  fetchV1TournamentOperationsBoardPage: (...args: unknown[]) => mocks.fetchV1TournamentOperationsBoardPage(...args),
  useV1TournamentFields: () => ({ data: { items: [{ id: 'field-1', name: '1번 코트' }] } }),
  useV1Tournament: () => ({
    data: {
      title: '가을 풋살 대회',
      fixtures: [{ id: 'fixture-1', homeTeamName: '레드팀', awayTeamName: '블루팀' }],
    },
  }),
}));

const ITEM_A: V1TournamentOperationsBoardItem = {
  fixtureId: 'fixture-1',
  tournamentId: 't-1',
  round: '8강',
  fixtureNumber: 1,
  gameId: 'game-1',
  gameState: 'LIVE',
  fieldId: 'field-1',
  fieldName: '1번 코트',
  homeRegistrationId: 'reg-home',
  awayRegistrationId: 'reg-away',
  scheduledAt: '2026-08-10T05:00:00.000Z',
  currentScore: null,
  warnings: ['MISSING_SCORER'],
  version: 3,
  revisionId: null,
  stableRevision: 'hash-a',
};

const PAGE: V1TournamentOperationsBoardPage = {
  items: [ITEM_A],
  nextCursor: 'cursor-2',
  watermark: 'wm-1',
  liveWarnings: [{ fixtureId: 'fixture-1', warnings: ['NO_STAFF_ASSIGNED'] }],
};

describe('OperationsBoardClient', () => {
  beforeEach(() => {
    mocks.useV1TournamentOperationsBoard.mockReset();
    mocks.fetchV1TournamentOperationsBoardPage.mockReset();
    mocks.routerReplace.mockReset();
    mocks.useV1TournamentOperationsBoard.mockReturnValue({
      data: PAGE,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it('renders a fixture row joined with its public team names, game state, and both stable + live warnings', () => {
    render(<OperationsBoardClient tournamentId="t-1" />);

    expect(screen.getAllByText('레드팀 vs 블루팀').length).toBeGreaterThan(0);
    expect(screen.getAllByText('진행 중').length).toBeGreaterThan(0);
    // MISSING_SCORER 는 "골에 득점자가 안 적힘"이지 기록 담당 스태프 부재가 아니다.
    // 결과 검토 화면과 같은 라벨을 쓴다.
    expect(screen.getAllByText('득점자 미기재').length).toBeGreaterThan(0);
    expect(screen.getAllByText('담당자 미배정').length).toBeGreaterThan(0);
  });

  // 데스크톱 표와 모바일 카드가 같은 행을 그리는데 경기 번호 표기가 갈려 있었다
  // (표: "8강 1경기" / 카드: "8강 · 1번 경기"). "N경기"는 "그 라운드의 N번째 경기"로
  // 오독되지만 fixtureNumber 는 대회 전체 연번이다 — 두 경로 모두 같은 표기를 쓴다.
  it('labels the fixture number identically in the desktop table and the mobile card', () => {
    render(<OperationsBoardClient tournamentId="t-1" />);

    // 데스크톱 표: 번호만 단독 노드
    expect(screen.getByText('8강 · 1번 경기')).toBeInTheDocument();
    // 모바일 카드: 같은 표기 뒤에 일정이 이어붙는다
    expect(screen.getByText(/8강 · 1번 경기 ·/)).toBeInTheDocument();
    // 옛 표기는 어느 경로에도 남아 있으면 안 된다
    expect(screen.queryByText(/8강 1경기/)).not.toBeInTheDocument();
  });

  it('updates the URL (deep link) when a filter changes, and does not lose the filter selection across an incremental data refresh', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OperationsBoardClient tournamentId="t-1" />);

    const statusSelect = screen.getByLabelText('경기 상태') as HTMLSelectElement;
    await user.selectOptions(statusSelect, 'LIVE');

    expect(mocks.routerReplace).toHaveBeenCalledWith(
      '/tournament-ops/tournaments/t-1/operations?status=LIVE',
      { scroll: false },
    );
    expect(statusSelect.value).toBe('LIVE');

    // 백그라운드 폴링이 새 스냅샷 객체로 갈아끼워도(참조가 바뀌어도) 방금 고른 필터 선택은 사라지지
    // 않아야 한다 — 필터는 쿼리 데이터가 아니라 컴포넌트 로컬 상태이기 때문이다.
    mocks.useV1TournamentOperationsBoard.mockReturnValue({
      data: { ...PAGE, watermark: 'wm-2' },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    rerender(<OperationsBoardClient tournamentId="t-1" />);

    expect((screen.getByLabelText('경기 상태') as HTMLSelectElement).value).toBe('LIVE');
  });

  it('appends the next cursor page below the existing items instead of replacing them', async () => {
    const user = userEvent.setup();
    mocks.fetchV1TournamentOperationsBoardPage.mockResolvedValue({
      items: [{ ...ITEM_A, fixtureId: 'fixture-2', round: '4강' }],
      nextCursor: null,
      watermark: 'wm-3',
      liveWarnings: [],
    });

    render(<OperationsBoardClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '더 보기' }));

    expect(mocks.fetchV1TournamentOperationsBoardPage).toHaveBeenCalledWith(
      expect.anything(),
      't-1',
      expect.objectContaining({ cursor: 'cursor-2' }),
    );
    // 기존 fixture-1 행은 그대로 남아 있고, 새로 불러온 fixture-2(4강) 행이 추가된다.
    expect(screen.getAllByText('레드팀 vs 블루팀').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4강/).length).toBeGreaterThan(0);
    // 더 이상 다음 페이지가 없으므로 "더 보기" 버튼은 사라진다.
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});
