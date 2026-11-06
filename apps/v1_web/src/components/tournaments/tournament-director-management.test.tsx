import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentDirectorManagement } from './tournament-director-management';

const state = vi.hoisted(() => ({ data: { items: [] as unknown[] }, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1MyTournamentStaffAssignments: () => state }));
vi.mock('@/app/admin/tournaments/[id]/tournament-admin-shell', () => ({
  TournamentManagementContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('director management entry', () => {
  it.each([
    { tournamentId: 'other', role: 'TOURNAMENT_DIRECTOR', expiresAt: null },
    { tournamentId: 'own', role: 'FIELD_OPERATOR', expiresAt: null },
    { tournamentId: 'own', role: 'SUPPORT_READONLY', expiresAt: null },
    { tournamentId: 'own', role: 'TOURNAMENT_DIRECTOR', expiresAt: '2000-01-01T00:00:00Z' },
  ])('does not render a management action for invalid authority %j', (a) => {
    state.data = { items: [{ tournamentId: a.tournamentId, tournamentKind: 'regular_tournament', assignments: [a] }] };
    render(<TournamentDirectorManagement id="own"><button>대회 수정</button></TournamentDirectorManagement>);
    expect(screen.queryByRole('button', { name: '대회 수정' })).not.toBeInTheDocument();
    expect(screen.getByText('담당 대회 디렉터 권한이 필요해요')).toBeInTheDocument();
  });

  it('opens only the assigned director tournament', () => {
    state.data = { items: [{ tournamentId: 'own', tournamentKind: 'regular_tournament', assignments: [{ role: 'TOURNAMENT_DIRECTOR', expiresAt: null }] }] };
    render(<TournamentDirectorManagement id="own"><button>대회 수정</button></TournamentDirectorManagement>);
    expect(screen.getByRole('button', { name: '대회 수정' })).toBeInTheDocument();
  });
});
