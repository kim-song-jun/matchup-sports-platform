/**
 * tournament-admin-shell.test.tsx
 *
 * 대회별 팝업 화면을 없애고 전역 팝업(/admin/popups) 하나로 합쳤다. 그래서 이 셸의 '팝업'
 * 항목은 대회 하위 탭이 아니라 **경로를 프리필한 전역 화면 링크**여야 한다 — 이 링크가
 * 사라지거나 옛 하위 경로로 되돌아가면 운영자는 그 대회의 팝업을 만들 길이 없어진다.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentAdminShell } from './tournament-admin-shell';

const { adminRoleMock } = vi.hoisted(() => ({ adminRoleMock: { value: 'ops' as 'owner' | 'ops' | 'support' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/tournament-1/info',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({
    data: {
      id: 'tournament-1',
      title: '서울 풋살 챔피언십',
      status: 'in_progress',
      sport: { code: 'futsal', name: '풋살' },
      operationCounts: { registrations: 3, fixtures: 4, announcements: 1 },
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'], adminRole: adminRoleMock.value } }),
  useV1ChangeTournamentStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useV1TournamentStaffAssignments: () => ({ data: { items: [] }, isPending: false, isError: false, error: null }),
}));

describe('TournamentAdminShell 섹션 내비', () => {
  it('팝업은 대회 하위 탭이 아니라 경로를 프리필한 전역 팝업 링크다', () => {
    render(<TournamentAdminShell id="tournament-1"><div /></TournamentAdminShell>);

    const popupLink = screen.getByRole('link', { name: /팝업/ });
    expect(popupLink).toHaveAttribute(
      'href',
      `/admin/popups?targetPath=${encodeURIComponent('/tournaments/tournament-1')}`,
    );
    // 대회 하위 팝업 라우트는 더 이상 존재하지 않는다.
    expect(popupLink.getAttribute('href')).not.toContain('/admin/tournaments/tournament-1/popups');
  });

  it("'개요'가 운영 그룹의 첫 항목이다 — 기본 랜딩이 여기다", () => {
    render(<TournamentAdminShell id="tournament-1"><div /></TournamentAdminShell>);

    const group = screen.getByRole('group', { name: '운영' });
    const labels = within(group).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels[0]).toBe('개요');
    expect(within(group).getByRole('link', { name: /개요/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/overview',
    );
  });

  it('조회 전용 관리자에게는 상태 변경 버튼을 열지 않는다', () => {
    // canWrite 를 capabilities 에서 역할 파생으로 옮겼다 — 옮긴 뒤에도 support 는
    // 상태를 못 바꿔야 한다(서버가 막더라도 화면이 눌리는 것처럼 보이면 결함이다).
    adminRoleMock.value = 'support';
    const readOnly = render(<TournamentAdminShell id="tournament-1"><div /></TournamentAdminShell>);
    expect(screen.queryByRole('button', { name: '대회 완료하기' })).not.toBeInTheDocument();
    readOnly.unmount();

    adminRoleMock.value = 'ops';
    render(<TournamentAdminShell id="tournament-1"><div /></TournamentAdminShell>);
    expect(screen.getByRole('button', { name: '대회 완료하기' })).toBeInTheDocument();
  });

  it('대회 하위 섹션은 그대로 대회 경로를 가리킨다', () => {
    render(<TournamentAdminShell id="tournament-1"><div /></TournamentAdminShell>);

    expect(screen.getByRole('link', { name: /신청 관리/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/tournament-1/registrations',
    );
  });
});
