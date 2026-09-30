import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TacticsBoardClient } from './tactics-board-client';

/**
 * Task 180 H7 A안 — 전술보드는 팀 내부 도구다(정본 §3). 선수 풀은 팀원 전체, 번호는 팀 등번호,
 * 참석명단과 따로 논다. 편집기는 실물을 쓴다 — "칩 한 번 → 코트" 가 화면 끝까지 이어지는지가 계약이다.
 */

const apiMocks = vi.hoisted(() => ({
  useV1TacticsBoard: vi.fn(),
  useV1TeamMembers: vi.fn(),
  useV1SaveTacticsBoard: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/tactics/game-1',
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const TEAM_ID = 'team-1';
const GAME_ID = 'game-1';

const FUTSAL_CONFIG = {
  positions: [
    { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
    { code: 'FIXO', label: '픽소', short: 'FX' },
    { code: 'ALA', label: '아라', short: 'AL' },
    { code: 'PIVO', label: '피보', short: 'PV' },
  ],
  formations: [
    { code: '1-2-1', label: '다이아몬드', outfield: 4, slots: [
      { position: 'FIXO', x: 50, y: 35 }, { position: 'ALA', x: 20, y: 58 },
      { position: 'ALA', x: 80, y: 58 }, { position: 'PIVO', x: 50, y: 83 },
    ] },
    { code: '2-2', label: '박스', outfield: 4, slots: [
      { position: 'FIXO', x: 28, y: 38 }, { position: 'FIXO', x: 72, y: 38 },
      { position: 'PIVO', x: 28, y: 76 }, { position: 'PIVO', x: 72, y: 76 },
    ] },
    { code: '2-2-1', label: '박스 + 피보', outfield: 5, slots: [
      { position: 'FIXO', x: 27, y: 33 }, { position: 'FIXO', x: 73, y: 33 }, { position: 'ALA', x: 22, y: 59 },
      { position: 'ALA', x: 78, y: 59 }, { position: 'PIVO', x: 50, y: 85 },
    ] },
  ],
  minPlayers: 3,
  maxPlayers: 6,
};

function member(userId: string, displayName: string, jerseyNumber: number | null) {
  return { userId, displayName, jerseyNumber, role: 'member', status: 'active' };
}

function boardEntry(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1', displayName: '김선발', jerseyNumber: 7, position: null,
    positionX: 50, positionY: 40, started: true, goalkeeper: false, ...overrides,
  };
}

function boardData(overrides: Record<string, unknown> = {}) {
  return {
    gameSideId: 'side-1', sideKey: 'HOME', teamNameSnapshot: '성수 FC', formation: null, version: 1,
    updatedAt: null, updatedByUserId: null, starterCount: 0, benchCount: 0, entries: [],
    sportCode: 'futsal', playersPerSide: 5, lineupConfig: FUTSAL_CONFIG, ...overrides,
  };
}

function mockBoard(data: Record<string, unknown>) {
  apiMocks.useV1TacticsBoard.mockReturnValue({ isLoading: false, isError: false, error: null, refetch: vi.fn(), data });
}

function mockMembers(items: unknown[], viewerRole = 'manager') {
  apiMocks.useV1TeamMembers.mockReturnValue({ isLoading: false, isError: false, data: { items, viewerRole } });
}

let mutateAsync: ReturnType<typeof vi.fn>;
type SavedEntry = { userId: string | null; displayName: string; jerseyNumber: number | null; started: boolean; positionX: number | null; position: string | null; goalkeeper: boolean };
function savedInput() {
  return mutateAsync.mock.calls[0][0] as { formation: string | null; entries: SavedEntry[] };
}

beforeEach(() => {
  mutateAsync = vi.fn().mockResolvedValue({ version: 2 });
  apiMocks.useV1SaveTacticsBoard.mockReturnValue({ mutateAsync, isPending: false });
  mockMembers([]);
  mockBoard(boardData());
});

describe('TacticsBoardClient — 처음 여는 풋살 보드', () => {
  const roster = [member('u1', '선수01', 1), member('u2', '선수02', 2), member('u10', '팀장1', 10)];

  it('풋살 코트와 5:5 대형(필드 4명)만 보이고, 저장 전 판은 첫 대형으로 연다', () => {
    mockMembers(roster);
    mockBoard(boardData({ version: 0 }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    expect(screen.getByRole('application', { name: '코트 배치 보드' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^1-2-1\s/ })[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /^2-2\s/ })[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^2-2-1\s/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('5:5 경기예요. 필드 4명 대형만 보여요.')[0]).toBeInTheDocument();
  });

  it('팀원 전원이 대기 칩(등번호 순)이고, 한 번씩 누르면 GK → FX 순서로 코트에 앉아 그대로 저장된다', async () => {
    mockMembers([member('u10', '팀장1', 10), ...roster.slice(0, 2)]);
    mockBoard(boardData({ version: 0 }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    const chips = within(screen.getByRole('list', { name: '대기 3명' })).getAllByRole('button');
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      '선수01(1번) 코트에 놓기', '선수02(2번) 코트에 놓기', '팀장1(10번) 코트에 놓기',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '선수01(1번) 코트에 놓기' }));
    fireEvent.click(screen.getByRole('button', { name: '선수02(2번) 코트에 놓기' }));
    expect(screen.getByRole('button', { name: '선수01 (골키퍼), 등번호 1' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '대기 1명' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AL 자리, 비어 있음 — 다음에 놓일 자리' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전술 저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const input = savedInput();
    expect(input.formation).toBe('1-2-1');
    // 코트 밖 팀원(팀장1)은 싣지 않는다 — 팀원 목록에서 늘 다시 만들어진다.
    expect(input.entries.map((entry) => [entry.displayName, entry.started, entry.goalkeeper, entry.position])).toEqual([
      ['선수01', true, true, null],
      ['선수02', true, false, 'FIXO'],
    ]);
  });
});

describe('TacticsBoardClient — 번호는 팀 등번호', () => {
  it('저장 당시 번호(7)가 아니라 지금 팀 등번호(10)를 보이고, 그 번호로 저장한다', async () => {
    mockMembers([member('u1', '김선발', 10)]);
    mockBoard(boardData({ entries: [boardEntry()] }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    const token = screen.getByRole('button', { name: '김선발, 등번호 10' });
    expect(token).toHaveTextContent(/^10$/);

    // 대형을 고르면 코트 위 선수가 자리로 옮겨진다(확인 후) — 저장할 변경을 만든다.
    fireEvent.click(screen.getAllByRole('button', { name: /^1-2-1\s/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: '포메이션 바꾸기' }));
    fireEvent.click(screen.getByRole('button', { name: '전술 저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(savedInput().entries).toEqual([expect.objectContaining({ userId: 'u1', jerseyNumber: 10 })]);
  });
});

describe('TacticsBoardClient — 옛 저장 데이터 읽기', () => {
  // H7 이전 판: 대형 없음(자유 배치), 선발·배치됨 / 선발·배치 전 / 후보 세 가지가 섞여 있다.
  const legacy = boardData({
    sportCode: 'football', playersPerSide: 11,
    lineupConfig: { positions: [], formations: [], minPlayers: 7, maxPlayers: 11 },
    entries: [
      boardEntry(),
      boardEntry({ userId: 'u2', displayName: '박배치전', jerseyNumber: 8, positionX: null, positionY: null }),
      boardEntry({ userId: 'u3', displayName: '이후보', jerseyNumber: 9, started: false, positionX: null, positionY: null }),
    ],
  });

  it('자유 배치 좌표는 그대로 코트에, 나머지는 대기로 읽고 아무도 잃지 않는다', () => {
    mockMembers([member('u1', '김선발', 7), member('u2', '박배치전', 8), member('u3', '이후보', 9)]);
    mockBoard(legacy);
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    expect(screen.getByRole('application', { name: '피치 배치 보드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김선발, 등번호 7' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '대기 2명' })).getAllByRole('button').map((chip) => chip.getAttribute('aria-label')))
      .toEqual(['박배치전(8번) 피치에 놓기', '이후보(9번) 피치에 놓기']);
    expect(within(screen.getByRole('button', { name: /^포메이션 .*변경하기$/ })).getByText('자유 배치')).toBeInTheDocument();
  });

  it('저장하면 코트 위 선수만 선발로 남고, 옛 "배치 전" 선발은 대기(저장 안 함)가 된다', async () => {
    mockMembers([member('u1', '김선발', 7), member('u2', '박배치전', 8), member('u3', '이후보', 9)]);
    mockBoard(legacy);
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    fireEvent.click(screen.getByRole('button', { name: '김선발 배치 취소' }));
    fireEvent.click(screen.getByRole('button', { name: '전술 저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(savedInput()).toMatchObject({ formation: null, entries: [] });
  });
});

describe('TacticsBoardClient — 보는 사람', () => {
  it('일반 팀원은 코트와 대기 명단을 보기만 한다 — 놓기·빼기·저장이 없다', () => {
    mockMembers([member('u1', '김선발', 7), member('u2', '한대기', 3)], 'member');
    mockBoard(boardData({ entries: [boardEntry()] }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);

    expect(screen.getByRole('button', { name: '김선발, 등번호 7' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '대기 1명' })).getByText('한대기')).toBeInTheDocument();
    expect(screen.getByText('코트 1명 · 대기 1명.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /코트에 놓기$|배치 취소$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전술 저장' })).not.toBeInTheDocument();
  });

  it('보드에 게스트(userId 없음)로 있는 사람은 같은 이름의 팀원 칩을 또 만들지 않는다', () => {
    mockMembers([member('u1', '김선발', 7), member('u9', '한대기', 3)]);
    mockBoard(boardData({ entries: [boardEntry({ userId: null })] }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.queryByRole('button', { name: /^김선발\(/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한대기(3번) 코트에 놓기' })).toBeInTheDocument();
  });

  it('보드에 있는 사람과 이름만 같은 다른 팀원은 대기에 남는다', () => {
    mockMembers([member('u1', '김선발', 7), member('u2', '김선발', 11)]);
    mockBoard(boardData({ entries: [boardEntry()] }));
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.getByRole('button', { name: '김선발(11번) 코트에 놓기' })).toBeInTheDocument();
  });
});

describe('전술 조회 실패', () => {
  it.each([403, 404, 500])('첫 조회 %i 오류를 로딩 화면에 숨기지 않는다', (statusCode) => {
    apiMocks.useV1TacticsBoard.mockReturnValue({
      isLoading: false, isError: true, data: undefined, refetch: vi.fn(),
      error: new V1ApiError({ status: 'error', timestamp: '2026-09-19T00:00:00Z', statusCode, code: 'TACTICS_ERROR', message: '조회 실패' }),
    });
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.getByText(statusCode === 403 ? '이 팀의 전술은 볼 수 없어요' : '전술을 불러오지 못했어요')).toBeInTheDocument();
    if (statusCode === 403) expect(screen.getByText('전술보드는 그 팀의 팀원만 볼 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전술 저장' })).not.toBeInTheDocument();
    if (statusCode === 500) expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
  });

  it('팀원 조회 실패를 빈 명단으로 표시하지 않고 재시도할 수 있다', () => {
    const refetch = vi.fn();
    apiMocks.useV1TeamMembers.mockReturnValue({ isLoading: false, isError: true, data: undefined, error: new Error('연결 실패'), refetch });
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.getByText('팀원을 불러오지 못했어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '전술 저장' })).not.toBeInTheDocument();
  });
});
