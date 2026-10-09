/**
 * 뷰포트 분기가 페이지에 실제로 걸려 있는지 — 768 미만은 모바일 컨테이너, 이상은 작업 영역(툴바 포함).
 * 두 컴포넌트 자체는 각자의 테스트가 검증하므로 여기서는 stub 으로 바꾸고 "누가 어떤 props 로 마운트되는가"만 본다.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import AdminTournamentBracketPage from './page';

const { adminState } = vi.hoisted(() => ({ adminState: { canWrite: true } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/admin/tournaments/t-1/bracket',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../tournament-admin-context', () => ({
  useTournamentAdmin: () => ({ tournamentId: 't-1', role: 'platform_ops', canWrite: adminState.canWrite, showToast: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: { id: 't-1', format: 'knockout', bracketPublishedAt: null, bracketPublishScheduledAt: null, registrationDeadlineAt: null } }),
  useV1AdminTournamentRegistrations: () => ({
    data: { items: [{ id: 'r1', status: 'confirmed', teamName: 'A팀' }, { id: 'r2', status: 'waitlisted', teamName: 'B팀' }], truncated: false },
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { canWrite: boolean; registrations: unknown[] }) => (
    <div data-testid="desktop-workspace" data-can-write={String(props.canWrite)} data-registrations={props.registrations.length} />
  ),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: (props: { tournamentId: string; canWrite: boolean; registrations: unknown[]; registrationsState: { status: string } }) => (
    <div
      data-testid="mobile-screen"
      data-tournament-id={props.tournamentId}
      data-can-write={String(props.canWrite)}
      data-registrations={props.registrations.length}
      data-registrations-status={props.registrationsState.status}
    />
  ),
}));
vi.mock('../bracket-tab', () => ({ BracketTab: () => <div data-testid="list-tab" /> }));

let restoreViewport: (() => void) | null = null;
beforeEach(() => {
  adminState.canWrite = true;
});
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('어드민 대진 페이지 — 뷰포트 분기', () => {
  it('390 에서는 모바일 컨테이너만 마운트되고 구조 편집 작업 영역은 마운트되지 않는다', () => {
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    const mobile = screen.getByTestId('mobile-screen');
    expect(mobile).toHaveAttribute('data-tournament-id', 't-1');
    expect(mobile).toHaveAttribute('data-can-write', 'true');
    expect(mobile).toHaveAttribute('data-registrations', '2');
    expect(mobile).toHaveAttribute('data-registrations-status', 'success');
    expect(screen.queryByTestId('desktop-workspace')).not.toBeInTheDocument();
  });

  it('1280 에서는 작업 영역만 마운트된다', () => {
    restoreViewport = installViewport(1280);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('desktop-workspace')).toHaveAttribute('data-can-write', 'true');
    expect(screen.queryByTestId('mobile-screen')).not.toBeInTheDocument();
  });

  it('지원(읽기 전용) 어드민은 모바일에서도 canWrite=false 로 넘어간다', () => {
    adminState.canWrite = false;
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('mobile-screen')).toHaveAttribute('data-can-write', 'false');
  });

  it('[그림|목록] 탭은 모바일에서도 보인다 — 구조 편집은 목록 뷰로 계속 갈 수 있다', () => {
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '목록' })).toBeInTheDocument();
  });
});
