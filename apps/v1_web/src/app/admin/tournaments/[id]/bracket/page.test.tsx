import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import AdminTournamentBracketPage from './page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  tournament: { data: undefined as unknown },
  registrations: { data: undefined as unknown, isError: false, error: null as unknown, refetch: vi.fn() },
  admin: { tournamentId: 't-1', canWrite: true, showToast: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/t-1/bracket',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('../tournament-admin-context', () => ({ useTournamentAdmin: () => mocks.admin }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => mocks.tournament,
  useV1AdminTournamentRegistrations: () => mocks.registrations,
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { tournamentId: string; format: string | undefined; canWrite: boolean; registrations: unknown[]; registrationsState: { status: string; truncated: boolean; refetchFailed: boolean; onRetry: () => void }; onShowList: () => void }) => (
    <div data-testid="workspace" data-format={props.format ?? ''} data-can-write={String(props.canWrite)} data-registrations={props.registrations.length} data-reg-status={props.registrationsState.status} data-reg-truncated={String(props.registrationsState.truncated)}>
      <button type="button" onClick={props.registrationsState.onRetry}>재시도</button>
      <button type="button" onClick={props.onShowList}>목록으로 이동</button>
    </div>
  ),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: () => null,
}));
vi.mock('../bracket-tab', () => ({
  BracketTab: (props: { tournamentId: string; canWrite: boolean; bracketPublishedAt: string | null | undefined }) => (
    <div data-testid="list" data-published={props.bracketPublishedAt ?? ''}>{props.tournamentId}</div>
  ),
}));

let restoreViewport: (() => void) | null = null;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.tournament.data = { format: 'knockout', registrationDeadlineAt: null, bracketPublishedAt: '2026-10-01T00:00:00.000Z', bracketPublishScheduledAt: null };
  mocks.registrations.data = { items: [{ id: 'r1' }, { id: 'r2' }], truncated: false };
  mocks.registrations.isError = false;
  mocks.registrations.error = null;
});

afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('AdminTournamentBracketPage — [그림 | 목록]', () => {
  it('기본은 그림이다: 작업 영역에 대회 방식·쓰기 권한·참가팀을 넘기고 목록은 그리지 않는다', () => {
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '그림' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '목록' })).toHaveAttribute('aria-selected', 'false');
    const workspace = screen.getByTestId('workspace');
    expect(workspace).toHaveAttribute('data-format', 'knockout');
    expect(workspace).toHaveAttribute('data-can-write', 'true');
    expect(workspace).toHaveAttribute('data-registrations', '2');
    expect(screen.queryByTestId('list')).not.toBeInTheDocument();
  });

  it('?view=list 이면 기존 목록 화면(BracketTab)을 그대로 보여 준다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '목록' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('list')).toHaveTextContent('t-1');
    expect(screen.getByTestId('list')).toHaveAttribute('data-published', '2026-10-01T00:00:00.000Z');
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
  });

  it('알 수 없는 view 값은 그림으로 본다', () => {
    mocks.searchParams = new URLSearchParams('view=foo');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
  });

  it('목록 탭을 누르면 주소에 view=list 를 남기고, 그림 탭은 view 만 지운다(다른 쿼리는 유지)', () => {
    const first = render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?view=list', { scroll: false });
    first.unmount();

    mocks.searchParams = new URLSearchParams('view=list&highlight=f1');
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '그림' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?highlight=f1', { scroll: false });
  });

  it('그림에서 쿼리가 비면 경로만 남긴다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '그림' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket', { scroll: false });
  });

  it('작업 영역의 목록 보기 요청도 같은 방식으로 목록으로 넘긴다', () => {
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('button', { name: '목록으로 이동' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?view=list', { scroll: false });
  });

  it('대회 정보를 아직 못 받았으면 방식을 모른 채로 넘기고 참가팀은 빈 목록이다', () => {
    mocks.tournament.data = undefined;
    mocks.registrations.data = undefined;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-format', '');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-registrations', '0');
  });
});

describe('AdminTournamentBracketPage — 신청 목록 조회 상태를 그림 화면에 넘긴다', () => {
  it('데이터가 없고 에러도 없으면 pending, 에러면 error(빈 목록으로 숨기지 않는다)', () => {
    mocks.registrations.data = undefined;
    const { unmount } = render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-reg-status', 'pending');
    unmount();
    mocks.registrations.isError = true;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-reg-status', 'error');
  });

  it('성공이면 success 이고 잘림 여부와 재시도(refetch)를 그대로 전달한다', () => {
    mocks.registrations.data = { items: [{ id: 'r1' }], truncated: true };
    render(<AdminTournamentBracketPage />);
    const workspace = screen.getByTestId('workspace');
    expect(workspace).toHaveAttribute('data-reg-status', 'success');
    expect(workspace).toHaveAttribute('data-reg-truncated', 'true');
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    expect(mocks.registrations.refetch).toHaveBeenCalledTimes(1);
  });
});
