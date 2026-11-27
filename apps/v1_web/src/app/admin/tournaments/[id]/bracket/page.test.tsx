import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import AdminTournamentBracketPage from './page';
import type { ReactNode } from 'react';
import type { UseBracketToolsInput } from '@/components/admin/bracket-canvas/use-bracket-tools';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  tournament: { data: undefined as unknown },
  registrations: { data: undefined as unknown, isError: false, error: null as unknown, refetch: vi.fn() },
  admin: { tournamentId: 't-1', role: 'PLATFORM_OPS', canWrite: true, showToast: vi.fn() },
  tools: { isEmpty: false, create: null as null | { key: string; label: string } },
  openCreate: vi.fn(),
  toolsInput: null as null | UseBracketToolsInput,
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
// 도구 줄의 계산과 그림은 각자의 시험이 있다 — 여기서는 페이지가 무엇을 어디에 엮는지만 본다.
vi.mock('@/components/admin/bracket-canvas/use-bracket-tools', () => ({
  useBracketTools: (input: UseBracketToolsInput) => {
    mocks.toolsInput = input;
    return { loading: false, isEmpty: mocks.tools.isEmpty, hasGroups: true, summary: '', unscheduledCount: 0, menus: { teamFill: [], match: [], timeVenue: [] }, create: mocks.tools.create, openCreate: mocks.openCreate, resetError: null, dialogs: null };
  },
}));
vi.mock('@/components/admin/bracket-canvas/bracket-tools-bar', () => ({
  BracketToolsBar: (props: { view: string; onViewChange: (view: 'canvas' | 'list') => void; children: ReactNode }) => (
    <div data-testid="tools-bar" data-view={props.view}>
      <div role="tablist" aria-label="대진 보기 방식">
        <button role="tab" aria-selected={props.view === 'canvas'} onClick={() => props.onViewChange('canvas')}>그림</button>
        <button role="tab" aria-selected={props.view === 'list'} onClick={() => props.onViewChange('list')}>목록</button>
      </div>
      {props.children}
    </div>
  ),
}));
vi.mock('@/components/admin/bracket-canvas/fixture-assignment-workspace', () => ({
  FixtureAssignmentWorkspace: ({ mode, onModeChange, children }: { mode: string | null; onModeChange: (next: null) => void; children: ReactNode }) => (
    <div data-testid="assignment-workspace" data-mode={mode ?? ''}><button type="button" onClick={() => onModeChange(null)}>패널 닫기</button>{children}</div>
  ),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { pool?: { key: string }; tournamentId: string; format: string | undefined; canWrite: boolean; registrations: unknown[]; registrationsState: { status: string; truncated: boolean; refetchFailed: boolean; onRetry: () => void }; controls: object }) => (
    <div data-testid="workspace" data-pool={props.pool?.key} data-format={props.format ?? ''} data-can-write={String(props.canWrite)} data-registrations={props.registrations.length} data-reg-status={props.registrationsState.status} data-reg-truncated={String(props.registrationsState.truncated)} data-has-controls={String(typeof props.controls === 'object')}>
      <button type="button" onClick={props.registrationsState.onRetry}>재시도</button>
    </div>
  ),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: (props: { controls: object }) => <div data-testid="mobile-screen" data-has-controls={String(typeof props.controls === 'object')} />,
}));
vi.mock('../bracket-tab', () => ({
  BracketTab: (props: { tournamentId: string; canWrite: boolean; unscheduledOnly: boolean; registrations: unknown[] }) => (
    <div data-testid="list" data-unscheduled={String(props.unscheduledOnly)} data-registrations={props.registrations.length}>{props.tournamentId}</div>
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
  mocks.tools.isEmpty = false;
  mocks.tools.create = { key: 'template', label: '템플릿으로 대진 만들기' };
  mocks.admin.canWrite = true;
});

afterEach(() => {
  cleanup();
  restoreViewport?.();
  restoreViewport = null;
});

describe('AdminTournamentBracketPage — 도구 줄과 [그림 | 목록]', () => {
  it.each(['league', 'knockout', 'group_knockout', 'league_knockouts'])('%s 대진: 배정 패널 안에 도구 줄이 한 번만 나오고 그 아래에 그림이 있다', format => {
    mocks.tournament.data = { format };
    render(<AdminTournamentBracketPage />);
    expect(screen.getAllByTestId('tools-bar')).toHaveLength(1);
    expect(screen.getByTestId('assignment-workspace')).toContainElement(screen.getByTestId('tools-bar'));
    expect(screen.getByTestId('tools-bar')).toContainElement(screen.getByTestId('workspace'));
  });

  it('기본은 그림이다: 작업 영역에 대회 방식·쓰기 권한·참가팀·보기 컨트롤을 넘기고 목록은 그리지 않는다', () => {
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '그림' })).toHaveAttribute('aria-selected', 'true');
    const workspace = screen.getByTestId('workspace');
    expect(workspace).toHaveAttribute('data-format', 'knockout');
    expect(workspace).toHaveAttribute('data-can-write', 'true');
    expect(workspace).toHaveAttribute('data-registrations', '2');
    expect(workspace).toHaveAttribute('data-has-controls', 'true');
    expect(screen.queryByTestId('list')).not.toBeInTheDocument();
  });

  it('?view=list 이면 목록 화면(BracketTab)을 그대로 보여 주고, 공개·확정 팀 수 props 는 넘기지 않는다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('tools-bar')).toHaveAttribute('data-view', 'list');
    expect(screen.getByRole('tab', { name: '목록' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('list')).toHaveTextContent('t-1');
    expect(screen.getByTestId('list')).toHaveAttribute('data-unscheduled', 'false');
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

  it('도구 줄의 시간 미정만 보기는 목록 화면에 그대로 전달된다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    act(() => mocks.toolsInput!.controls.setUnscheduledOnly(true));
    expect(screen.getByTestId('list')).toHaveAttribute('data-unscheduled', 'true');
  });

  it('대회 정보를 아직 못 받았으면 방식을 모른 채로 넘기고 참가팀은 빈 목록이며 배정 패널 없이 그린다', () => {
    mocks.tournament.data = undefined;
    mocks.registrations.data = undefined;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-format', '');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-registrations', '0');
    expect(screen.queryByTestId('assignment-workspace')).not.toBeInTheDocument();
  });

  it('시간·구장 일괄 배정 패널은 도구 줄이 정하고(onAssignmentModeChange) 패널 닫기가 비운다', () => {
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('assignment-workspace')).toHaveAttribute('data-mode', '');
    act(() => mocks.toolsInput!.onAssignmentModeChange('court'));
    expect(screen.getByTestId('assignment-workspace')).toHaveAttribute('data-mode', 'court');
    act(() => mocks.toolsInput!.onAssignmentModeChange('time'));
    expect(screen.getByTestId('assignment-workspace')).toHaveAttribute('data-mode', 'time');
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(screen.getByTestId('assignment-workspace')).toHaveAttribute('data-mode', '');
  });

  it('도구 줄에 대회·권한·역할과 같은 보기 컨트롤을 넘긴다', () => {
    render(<AdminTournamentBracketPage />);
    expect(mocks.toolsInput).toMatchObject({ tournamentId: 't-1', canWrite: true, role: 'PLATFORM_OPS' });
    expect(mocks.toolsInput!.registrations).toHaveLength(2);
  });
});

describe('AdminTournamentBracketPage — 폰(390)', () => {
  beforeEach(() => {
    restoreViewport?.();
    restoreViewport = installViewport(390);
  });

  it('보기가 하나다: view=list 여도 폰 보기를 그리고 목록은 그리지 않는다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('mobile-screen')).toHaveAttribute('data-has-controls', 'true');
    expect(screen.getByTestId('tools-bar')).toHaveAttribute('data-view', 'canvas');
    expect(screen.queryByTestId('list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
  });

  it('폭을 넓히면 같은 주소가 목록을 연다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.queryByTestId('list')).not.toBeInTheDocument();
    restoreViewport?.();
    cleanup();
    restoreViewport = installViewport(1280);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('list')).toBeInTheDocument();
  });
});

describe('AdminTournamentBracketPage — 빈 대진', () => {
  beforeEach(() => { mocks.tools.isEmpty = true; });

  it('그림 보기에서는 그림 대신 빈 상태와 「템플릿으로 대진 만들기」 하나가 나온다', () => {
    render(<AdminTournamentBracketPage />);
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 대진 만들기' }));
    expect(mocks.openCreate).toHaveBeenCalledTimes(1);
  });

  it('?view=list 는 목록을 그대로 보여 준다(빈 상태로 가로채지 않는다)', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('list')).toBeInTheDocument();
    expect(screen.queryByText('아직 대진이 없어요')).not.toBeInTheDocument();
  });

  it('「직접 조 만들기」는 ?view=list 로 가는 링크다(다른 쿼리는 유지, 조별 목록이 없는 league_knockouts 는 없다)', () => {
    mocks.searchParams = new URLSearchParams('highlight=f1');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('link', { name: '직접 조 만들기' })).toHaveAttribute('href', '/admin/tournaments/t-1/bracket?highlight=f1&view=list');
    expect(screen.queryByRole('button', { name: '직접 조 만들기' })).not.toBeInTheDocument();
    cleanup();
    mocks.tournament.data = { format: 'league_knockouts' };
    render(<AdminTournamentBracketPage />);
    expect(screen.queryByRole('link', { name: '직접 조 만들기' })).not.toBeInTheDocument();
  });

  it('폰의 빈 상태에는 목록으로 가는 길이 없다(폰은 목록이 없다)', () => {
    restoreViewport?.();
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '직접 조 만들기' })).not.toBeInTheDocument();
  });

  it('읽기 전용에는 만들기 버튼이 없다', () => {
    mocks.admin.canWrite = false;
    mocks.tools.create = null;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByText('아직 만들어진 대진이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /대진 만들기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '직접 조 만들기' })).not.toBeInTheDocument();
  });

  it.each([
    ['6팀 일반 토너먼트', { format: 'knockout', teamCount: 6 }, true],
    ['7팀 토너먼트', { format: 'knockout', teamCount: 7 }, false],
    ['이미 6강 방식', { format: 'knockout', teamCount: 6, sixTeamMode: true }, false],
    ['6팀이어도 리그', { format: 'league', teamCount: 6 }, false],
  ] as const)('%s: 「6강 방식을 먼저 정해요」 링크 = %s', (_name, tournament, shown) => {
    mocks.tournament.data = tournament;
    render(<AdminTournamentBracketPage />);
    const link = screen.queryByRole('link', { name: '6강 방식을 먼저 정해요' });
    if (shown) expect(link).toHaveAttribute('href', '/admin/tournaments/t-1/info?edit=rules');
    else expect(link).not.toBeInTheDocument();
  });
});

describe('AdminTournamentBracketPage — 신청 목록 조회 상태를 그림 화면에 넘긴다', () => {
  it('그림에서 단계를 바꾸면 해당 단계의 첫 편성을 열고 편성을 따로 고를 수 있다', () => {
    mocks.tournament.data = { format: 'league_knockouts', stagePlan: { stages: [
      { key: 'pre', name: '예선', pools: [{ key: 'a', name: 'A조', format: 'league' }] },
      { key: 'finals', name: '본선', pools: [
        { key: 'upper', name: '상위', format: 'knockout' }, { key: 'lower', name: '하위', format: 'knockout' },
      ] },
    ] } };
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pool', 'a');
    fireEvent.change(screen.getByRole('combobox', { name: '단계' }), { target: { value: 'finals' } });
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pool', 'upper');
    fireEvent.change(screen.getByRole('combobox', { name: '편성' }), { target: { value: 'lower' } });
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pool', 'lower');
  });

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

  it('캐시된 참가 목록이 있으면 재조회 오류 중에도 목록 화면에 참가팀을 그대로 넘긴다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    mocks.registrations.data = { items: Array.from({ length: 12 }, (_, index) => ({ id: `r${index + 1}`, status: 'confirmed' })), truncated: false };
    mocks.registrations.isError = true;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('list')).toHaveAttribute('data-registrations', '12');
  });
});
