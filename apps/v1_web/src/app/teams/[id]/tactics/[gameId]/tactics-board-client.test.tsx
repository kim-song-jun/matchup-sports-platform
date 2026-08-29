import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TacticsBoardClient } from './tactics-board-client';

/**
 * 전술보드의 **되돌릴 수 있는가**를 못박는다.
 *
 * 처음 판에는 "선발로"만 있고 반대 방향이 없었다 — 한 번 선발로 올린 선수를 후보로
 * 내릴 방법이 없었고, 피치에서 빼도 좌표만 지워질 뿐 선발 그대로였다. 잘못 올린 선수를
 * 못 내리면 그 화면은 못 쓴다(QA 에서 30초 안에 부딪히는 종류다).
 *
 * 함께 고정하는 것: 후보로 내릴 때 **좌표도 지워지는지**. 안 지우면 다시 선발로 올렸을 때
 * 옛 자리에서 되살아나 사용자가 놓은 적 없는 배치가 생긴다.
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

// AppChrome 의 뒤로가기가 useSearchParams 를 읽는데 테스트 환경엔 Next 라우터 컨텍스트가
// 없어 null 이 온다 — 이 테스트의 관심사가 아니라 최소한으로 대역을 세운다.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/tactics/game-1',
}));

// 피치 편집기는 SVG·포인터 좌표계라 이 테스트의 관심사가 아니다 — 받은 선발 명단만
// 드러내는 가벼운 대역으로 바꾼다(그래야 "선발/후보 왕복"만 관찰된다).
vi.mock('@/components/lineup/pitch-formation-editor', () => ({
  PitchFormationEditor: ({ starters }: { starters: Array<{ key: string; displayName: string }> }) => (
    <div data-testid="pitch">{starters.map((s) => s.displayName).join(',')}</div>
  ),
}));

/** AppChrome 이 알림 벨(useQuery)을 렌더하므로 provider 가 필요하다 — 저장소 관례와 같다. */
function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const TEAM_ID = 'team-1';
const GAME_ID = 'game-1';

function boardEntry(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    displayName: '김선발',
    jerseyNumber: 7,
    position: null,
    positionX: 50,
    positionY: 40,
    started: true,
    goalkeeper: false,
    ...overrides,
  };
}

let mutateAsync: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mutateAsync = vi.fn().mockResolvedValue({ version: 2 });
  apiMocks.useV1SaveTacticsBoard.mockReturnValue({ mutateAsync, isPending: false });
  apiMocks.useV1TeamMembers.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { items: [], viewerRole: 'manager' },
  });
  apiMocks.useV1TacticsBoard.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      gameSideId: 'side-1',
      sideKey: 'HOME',
      teamNameSnapshot: '성수 FC',
      formation: null,
      version: 1,
      updatedAt: null,
      updatedByUserId: null,
      starterCount: 1,
      benchCount: 1,
      entries: [boardEntry(), boardEntry({ userId: 'u2', displayName: '박후보', jerseyNumber: 9, started: false, positionX: null, positionY: null })],
    },
  });
});

describe('TacticsBoardClient — 선발과 후보를 오갈 수 있다', () => {
  it('선발에게는 "후보로", 후보에게는 "선발로" 가 나온다', () => {
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.getByRole('button', { name: '김선발 후보로 내리기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '박후보 선발로 올리기' })).toBeInTheDocument();
  });

  it('후보로 내리면 선발 명단에서 빠지고, 다시 선발로 올릴 수 있다', () => {
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.getByTestId('pitch')).toHaveTextContent('김선발');

    fireEvent.click(screen.getByRole('button', { name: '김선발 후보로 내리기' }));
    expect(screen.getByTestId('pitch')).not.toHaveTextContent('김선발');

    // 되돌아가는 길이 실제로 열려 있는지 — 여기서 막히면 처음 결함으로 되돌아간 것이다.
    fireEvent.click(screen.getByRole('button', { name: '김선발 선발로 올리기' }));
    expect(screen.getByTestId('pitch')).toHaveTextContent('김선발');
  });

  it('후보로 내리면 피치 좌표도 함께 지워진다', async () => {
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    fireEvent.click(screen.getByRole('button', { name: '김선발 후보로 내리기' }));
    fireEvent.click(screen.getByRole('button', { name: '전술 저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0] as {
      entries: Array<{ displayName: string; started: boolean; positionX: number | null }>;
    };
    const moved = payload.entries.find((entry) => entry.displayName === '김선발');
    expect(moved).toMatchObject({ started: false, positionX: null });
  });

  it('이미 보드에 있는 사람은 "팀원 추가" 목록에 다시 뜨지 않는다 (userId 가 없어도)', () => {
    // 보드 엔트리는 게스트를 위해 userId 가 nullable 이라, userId 로만 거르면 그런 엔트리가
    // 어떤 팀원과도 안 맞아 **이미 올라간 사람이 목록에 또 뜬다.** alpha 실화면에서 선발
    // 3명이 그대로 "추가" 목록에 남아 있는 것을 확인했다.
    apiMocks.useV1TeamMembers.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          { userId: 'u1', displayName: '김선발', role: 'member', status: 'active' },
          { userId: 'u9', displayName: '한대기', role: 'member', status: 'active' },
        ],
        viewerRole: 'manager',
      },
    });
    apiMocks.useV1TacticsBoard.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: {
        gameSideId: 'side-1',
        sideKey: 'HOME',
        teamNameSnapshot: '성수 FC',
        formation: null,
        version: 1,
        updatedAt: null,
        updatedByUserId: null,
        starterCount: 1,
        benchCount: 0,
        // userId 없이 저장된 엔트리 — 이름만으로 같은 사람임을 알아봐야 한다.
        entries: [boardEntry({ userId: null })],
      },
    });

    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.queryByRole('button', { name: '김선발 보드에 추가' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한대기 보드에 추가' })).toBeInTheDocument();
  });

  it('보드에 있는 사람과 이름이 같은 다른 팀원은 추가 목록에 남는다', () => {
    // 이름 대조를 무조건 걸면 동명이인이 아무 안내 없이 사라진다 — 중복 노출은 눈에
    // 보이지만 이건 안 보여서 더 나쁘다. userId 가 있는 엔트리는 id 로 정확히 판정한다.
    apiMocks.useV1TeamMembers.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          { userId: 'u1', displayName: '김선발', role: 'member', status: 'active' },
          // 같은 이름, 다른 사람.
          { userId: 'u2', displayName: '김선발', role: 'member', status: 'active' },
        ],
        viewerRole: 'manager',
      },
    });
    apiMocks.useV1TacticsBoard.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: {
        gameSideId: 'side-1',
        sideKey: 'HOME',
        teamNameSnapshot: '성수 FC',
        formation: null,
        version: 1,
        updatedAt: null,
        updatedByUserId: null,
        starterCount: 1,
        benchCount: 0,
        entries: [boardEntry({ userId: 'u1' })],
      },
    });

    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    // u1 은 이미 보드에 있으니 빠지고, 동명이인 u2 는 남아야 한다 — 둘 다 사라지면 회귀다.
    expect(screen.getAllByRole('button', { name: '김선발 보드에 추가' })).toHaveLength(1);
  });

  it('일반 팀원에게는 바꾸는 버튼도 저장 버튼도 없다', () => {
    apiMocks.useV1TeamMembers.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [], viewerRole: 'member' },
    });
    render(<TacticsBoardClient teamId={TEAM_ID} gameId={GAME_ID} />);
    expect(screen.queryByRole('button', { name: /후보로 내리기|선발로 올리기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전술 저장' })).not.toBeInTheDocument();
  });
});
