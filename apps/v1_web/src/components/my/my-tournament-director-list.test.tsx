import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyTournamentStaffPageClient } from './my-tournament-staff-client';

const query = vi.hoisted(() => ({ data: { items: [] as unknown[] }, isLoading: false, isError: false }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1MyTournamentStaffAssignments: () => query }));

describe('assigned director tournament list', () => {
  it('shows only active director tournaments and links to the reused management screen', () => {
    const group = (id: string, role: string, expiresAt: string | null = null) => ({
      tournamentId: id, tournamentTitle: id, tournamentKind: 'regular_tournament', tournamentStatus: 'open',
      assignments: [{ id, role, expiresAt, fieldName: null }],
    });
    query.data = { items: [group('담당 대회', 'TOURNAMENT_DIRECTOR'), group('현장 담당', 'FIELD_OPERATOR'),
      group('조회 담당', 'SUPPORT_READONLY'), group('만료 대회', 'TOURNAMENT_DIRECTOR', '2000-01-01T00:00:00Z')] };
    render(<MyTournamentStaffPageClient directorsOnly />);
    // 운영 체험 링크는 대회 배정과 무관하다. 실제 관리 목적지만 범위 검사한다.
    const managementLinks = screen.getAllByRole('link').filter((link) =>
      link.getAttribute('href')?.startsWith('/tournament-management/tournaments/'),
    );
    expect(managementLinks).toHaveLength(1);
    expect(screen.getByRole('link', { name: '운영 콘솔 체험하기 (새 탭)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '주요 기능 보기 (새 탭)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /담당 대회/ })).toHaveAttribute('href', `/tournament-management/tournaments/${encodeURIComponent('담당 대회')}/overview`);
    expect(screen.queryByText('현장 담당')).not.toBeInTheDocument();
    expect(screen.queryByText('조회 담당')).not.toBeInTheDocument();
    expect(screen.queryByText('만료 대회')).not.toBeInTheDocument();
  });
});
