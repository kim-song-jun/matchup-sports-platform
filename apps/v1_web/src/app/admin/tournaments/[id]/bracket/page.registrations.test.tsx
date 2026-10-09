import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BracketTeamTray, type RegistrationsLoadState } from '@/components/admin/bracket-canvas/bracket-team-tray';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { installViewport } from '@/test/viewport';
import AdminTournamentBracketPage from './page';

const mocks = vi.hoisted(() => ({
  registrations: { data: undefined as unknown, isError: false, error: null as unknown, refetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/t-1/bracket',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../tournament-admin-context', () => ({
  useTournamentAdmin: () => ({ tournamentId: 't-1', canWrite: true, showToast: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: { format: 'knockout' } }),
  useV1AdminTournamentRegistrations: () => mocks.registrations,
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: () => null,
}));
vi.mock('../bracket-tab', () => ({ BracketTab: () => null }));
// 워크스페이스는 대진 조회가 얽혀 있어 트레이만 진짜로 세운다 — 페이지가 넘기는 값이 진짜 트레이에 닿는 경로를 본다.
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { registrations: V1AdminTournamentRegistration[]; registrationsState: RegistrationsLoadState }) => (
    <BracketTeamTray
      registrations={props.registrations}
      registrationsState={props.registrationsState}
      slots={[]}
      pendingRegistrationId={null}
      canWrite
      onPick={vi.fn()}
    />
  ),
}));

const team = { id: 'r1', teamId: 't1', teamName: '서울FC', status: 'confirmed' };

let restoreViewport: (() => void) | null = null;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.clearAllMocks();
  mocks.registrations.data = undefined;
  mocks.registrations.isError = false;
  mocks.registrations.error = null;
});

afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('대진 그림 — 캐시가 있는 상태의 재조회 실패', () => {
  it('받아 둔 목록이 비어 있으면 "참가팀 없음"으로 확정하지 않고 오류와 다시 시도를 보인다', () => {
    mocks.registrations.data = { items: [], truncated: false };
    mocks.registrations.isError = true;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('참가팀을 불러오지 못했어요.');
    expect(screen.queryByText('확정된 참가팀이 아직 없어요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mocks.registrations.refetch).toHaveBeenCalledTimes(1);
  });

  it('받아 둔 팀 목록은 그대로 두고 오류·다시 시도·"이전에 불러온 목록" 안내를 함께 보인다', () => {
    mocks.registrations.data = { items: [team], truncated: false };
    mocks.registrations.isError = true;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeEnabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('이전에 불러온 목록이에요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mocks.registrations.refetch).toHaveBeenCalledTimes(1);
  });

  it('재조회가 실패하지 않았다면 오류도 이전 목록 안내도 없다', () => {
    mocks.registrations.data = { items: [team], truncated: false };
    render(<AdminTournamentBracketPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('이전에 불러온 목록이에요.')).not.toBeInTheDocument();
  });
});
