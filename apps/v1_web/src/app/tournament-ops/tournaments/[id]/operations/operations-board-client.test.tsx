import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsBoardClient } from './operations-board-client';
import type { V1TournamentOperationsBoardItem, V1TournamentOperationsBoardPage } from '@/types/api';

const mocks = vi.hoisted(() => ({
  useV1TournamentOperationsBoard: vi.fn(),
  fetchV1TournamentOperationsBoardPage: vi.fn(),
  routerReplace: vi.fn(),
  useTournamentOpsRole: vi.fn(),
  assignFixtureField: vi.fn(),
  clearFixtureField: vi.fn(),
}));

// 런타임에는 `_gate.tsx` 가 이 화면을 항상 TournamentOpsRoleProvider 로 감싼다(셸 분기).
// 테스트는 provider 트리를 세우는 대신 역할만 갈아끼운다 — staff-client.test.tsx 와 같은 방식.
vi.mock('@/components/tournament-ops/role-context', () => ({
  useTournamentOpsRole: () => mocks.useTournamentOpsRole(),
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
  useV1TournamentFields: () => ({
    data: { items: [{ id: 'field-1', name: '1번 코트' }, { id: 'field-2', name: '2번 코트' }] },
  }),
  useV1AssignFixtureField: () => ({ mutate: mocks.assignFixtureField, isPending: false }),
  useV1ClearFixtureField: () => ({ mutate: mocks.clearFixtureField, isPending: false }),
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
  warnings: ['MISSING_SCORER', 'NO_FIELD_ASSIGNED'],
  version: 3,
  revisionId: null,
  stableRevision: 'hash-a',
};

/** 결선 무승부 → 승부차기로 끝난 경기. 알파 실측 데이터 형태 그대로(정규시간 0:0,
 *  승부차기 2:0, 실시간 확정 경로라 평평한 `{home,away,penalties}`). */
const ENDED_PENALTY_ITEM: V1TournamentOperationsBoardItem = {
  ...ITEM_A,
  fixtureId: 'fixture-2',
  round: '결승',
  fixtureNumber: 2,
  gameId: 'game-2',
  gameState: 'ENDED',
  warnings: [],
  currentScore: { home: 0, away: 0, penalties: { home: 2, away: 0 } },
  revisionId: 'rev-2',
  stableRevision: 'hash-b',
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
    mocks.assignFixtureField.mockReset();
    mocks.clearFixtureField.mockReset();
    mocks.useTournamentOpsRole.mockReturnValue('TOURNAMENT_DIRECTOR');
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
  });

  /* 이 두 테스트는 예전에 정반대를 못박고 있었다: 경기장 배정 UI 가 없어서 운영자가
     "경기장 미배정"·"담당자 미배정"을 끌 수단이 없었고, 해소 불가능한 경고가 상시 켜져
     있으면 조치가 필요한 경고까지 묻히므로 **화면에서 숨겼다**(필터 선택지에서도 뺐다).
     이제 이 화면에 배정 셀렉트가 있어 둘 다 해소 가능하므로 원래대로 되돌린다 —
     당시 주석도 "배정 UI 가 생기면 이 테스트를 뒤집어야 한다"고 적어 두었다. */
  it('shows the field/staff warnings now that the board can resolve them', () => {
    render(<OperationsBoardClient tournamentId="t-1" />);

    expect(screen.getAllByText('경기장 미배정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('담당자 미배정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('득점자 미기재').length).toBeGreaterThan(0);
  });

  /* 결과·승부차기 표시 — 이 보드에는 결과 칸이 아예 없어서, 결선 무승부를 승부차기로
     끝낸 경기도 "종료" 배지 하나로만 보였다(알파 실측: 서버에는 정규 0:0 · 승부차기 2:0
     이 저장돼 있는데 스태프 화면 어디에도 그 값이 없었다). 표와 카드 두 경로 모두
     같은 값을 그려야 한다 — 한쪽만 고치면 뷰포트에 따라 결과가 사라진다. */
  describe('결과·승부차기', () => {
    it('종료된 경기의 확정 스코어와 승부차기를 함께 보여준다', () => {
      mocks.useV1TournamentOperationsBoard.mockReturnValue({
        data: { ...PAGE, items: [ENDED_PENALTY_ITEM], liveWarnings: [] },
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      });
      render(<OperationsBoardClient tournamentId="t-1" />);

      // 데스크톱 표 + 모바일 카드 = 같은 값 두 벌
      expect(screen.getAllByText('0:0')).toHaveLength(2);
      expect(screen.getAllByText('승부차기 2:0')).toHaveLength(2);
    });

    /**
     * 이 셀은 승부차기 문구를 손으로 조립하고 있었다(`승부차기 {home}:{away}`). 그래서
     * 공용 포맷터에 선축을 넣어도 **이 화면만** 선축이 안 보였고, 같은 경기가 결과 검수
     * 리비전 타임라인에는 `선축 원정`이 뜨는데 운영 보드에는 안 뜨는 어긋남이 생겼다.
     */
    it('선축이 기록된 경기는 승부차기 옆에 선축도 보여준다', () => {
      mocks.useV1TournamentOperationsBoard.mockReturnValue({
        data: {
          ...PAGE,
          items: [
            {
              ...ENDED_PENALTY_ITEM,
              currentScore: { home: 0, away: 0, penalties: { home: 2, away: 0, firstKickSideKey: 'AWAY' } },
            },
          ],
          liveWarnings: [],
        },
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      });
      render(<OperationsBoardClient tournamentId="t-1" />);

      expect(screen.getAllByText('승부차기 2:0, 선축 원정')).toHaveLength(2);
    });

    // 선축이 없던 시절에 저장된 경기(그리고 중첩 백필 형태)는 모르는 것을 지어내지 않는다.
    it('선축이 없는 경기는 선축을 그리지 않는다', () => {
      mocks.useV1TournamentOperationsBoard.mockReturnValue({
        data: { ...PAGE, items: [ENDED_PENALTY_ITEM], liveWarnings: [] },
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      });
      render(<OperationsBoardClient tournamentId="t-1" />);

      expect(screen.queryByText(/선축/)).not.toBeInTheDocument();
    });

    it('아직 확정 결과가 없는 경기는 결과 칸을 비워 둔다 — 0:0 을 지어내지 않는다', () => {
      // ITEM_A 는 진행 중(currentScore: null)이다. 여기에 0:0 이 그려지면 운영자는
      // "득점 없이 끝난 경기"로 오독한다.
      render(<OperationsBoardClient tournamentId="t-1" />);

      expect(screen.queryByText('0:0')).not.toBeInTheDocument();
      expect(screen.queryByText(/승부차기/)).not.toBeInTheDocument();
    });
  });

  it('offers every stable warning code in the filter', () => {
    render(<OperationsBoardClient tournamentId="t-1" />);

    const select = screen.getByLabelText('경고') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('경기장 미배정');
    expect(labels).toContain('득점자 미기재');
  });

  /* 경기장 배정 — `V1TournamentFixture.fieldId` 의 유일한 쓰기 경로다.
     백엔드는 Task 18 부터 있었는데 호출부가 없어 alpha 의 픽스처가 전부 fieldId=null 이었고,
     그래서 필드 담당자는 담당 경기를 영영 가질 수 없었다. */
  describe('경기장 배정', () => {
    it('셀렉트에서 고르면 그 경기에 배정한다', async () => {
      const user = userEvent.setup();
      render(<OperationsBoardClient tournamentId="t-1" />);

      const selects = screen.getAllByLabelText('8강 1번 경기장') as HTMLSelectElement[];
      await user.selectOptions(selects[0], 'field-2');

      expect(mocks.assignFixtureField).toHaveBeenCalledWith(
        { fixtureId: 'fixture-1', fieldId: 'field-2' },
        expect.anything(),
      );
      expect(mocks.clearFixtureField).not.toHaveBeenCalled();
    });

    it('미배정을 고르면 배정 해제로 보낸다 — 빈 fieldId 로 배정하지 않는다', async () => {
      const user = userEvent.setup();
      render(<OperationsBoardClient tournamentId="t-1" />);

      const selects = screen.getAllByLabelText('8강 1번 경기장') as HTMLSelectElement[];
      await user.selectOptions(selects[0], '');

      expect(mocks.clearFixtureField).toHaveBeenCalledWith(
        { fixtureId: 'fixture-1' },
        expect.anything(),
      );
      expect(mocks.assignFixtureField).not.toHaveBeenCalled();
    });

    it('현재 배정된 필드를 선택값으로 반영한다', () => {
      render(<OperationsBoardClient tournamentId="t-1" />);

      const selects = screen.getAllByLabelText('8강 1번 경기장') as HTMLSelectElement[];
      expect(selects[0].value).toBe('field-1');
    });

    it('권한 없는 역할에게는 셀렉트 대신 읽기 전용 텍스트를 보여준다', () => {
      // 서버는 event_reverse 로 판정한다 — 필드 담당자는 거부되므로 누르면 403 나는
      // 컨트롤을 아예 만들지 않는다.
      mocks.useTournamentOpsRole.mockReturnValue('FIELD_OPERATOR');
      render(<OperationsBoardClient tournamentId="t-1" />);

      expect(screen.queryByLabelText('8강 1번 경기장')).not.toBeInTheDocument();
      expect(screen.getAllByText('1번 코트').length).toBeGreaterThan(0);
    });
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
