import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffClient } from './staff-client';
import type { V1TournamentStaffAssignment, V1TournamentStaffRole } from '@/types/api';

const mocks = vi.hoisted(() => ({
  useTournamentOpsRole: vi.fn(),
  grantMutate: vi.fn(),
  revokeMutate: vi.fn(),
}));

vi.mock('@/components/tournament-ops/role-context', () => ({
  useTournamentOpsRole: () => mocks.useTournamentOpsRole(),
}));

const DIRECTOR_ROW: V1TournamentStaffAssignment = {
  id: 'assignment-director',
  tournamentId: 't-1',
  userId: 'director-user-id',
  role: 'TOURNAMENT_DIRECTOR',
  fieldId: null,
  fixtureIds: [],
  version: 0,
  expiresAt: null,
  revokedAt: null,
  grantedByUserId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  nickname: '디렉터윤',
};

const FIELD_OPERATOR_ROW: V1TournamentStaffAssignment = {
  id: 'assignment-field-op',
  tournamentId: 't-1',
  userId: 'field-op-user-id',
  role: 'FIELD_OPERATOR',
  fieldId: 'field-1',
  fixtureIds: [],
  version: 2,
  expiresAt: null,
  revokedAt: null,
  grantedByUserId: 'director-user-id',
  createdAt: '2026-08-01T00:00:00.000Z',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TournamentStaffAssignments: () => ({
    isPending: false,
    isError: false,
    data: { items: [DIRECTOR_ROW, FIELD_OPERATOR_ROW] },
    refetch: vi.fn(),
  }),
  useV1TournamentFields: () => ({ data: { items: [{ id: 'field-1', name: '1번 코트' }] } }),
  useV1Tournament: () => ({ data: { title: '가을 풋살 대회' } }),
  useV1GrantTournamentStaff: () => ({ mutate: mocks.grantMutate, isPending: false }),
  useV1RevokeTournamentStaff: () => ({ mutate: mocks.revokeMutate, isPending: false }),
}));

function setRole(role: V1TournamentStaffRole) {
  mocks.useTournamentOpsRole.mockReturnValue(role);
}

function optionLabelsOf(select: HTMLElement): string[] {
  return Array.from((select as HTMLSelectElement).options).map((option) => option.textContent);
}

describe('StaffClient', () => {
  beforeEach(() => {
    mocks.useTournamentOpsRole.mockReset();
    mocks.grantMutate.mockReset();
    mocks.revokeMutate.mockReset();
  });

  // 표가 담당자를 userId 앞 8자로만 보여줘 누가 누구인지 알 수 없었다. 닉네임이 있으면
  // 그것을 보여주고, 없을 때만 종전 식별자 조각으로 남긴다 — 닉네임이 공개 신원으로 쓸 수
  // 있는 유일한 값이므로 다른 값으로 대체하지 않는다.
  it('shows the staff nickname when the profile has one', () => {
    setRole('TOURNAMENT_DIRECTOR');
    render(<StaffClient tournamentId="t-1" />);

    // 모바일 카드와 데스크톱 표 두 경로가 같은 행을 그린다 — 둘 다 이름을 보여야 한다.
    expect(screen.getAllByText('디렉터윤')).toHaveLength(2);
    expect(screen.queryByText('director…')).not.toBeInTheDocument();
  });

  it('falls back to the identifier fragment when no nickname exists', () => {
    setRole('TOURNAMENT_DIRECTOR');
    render(<StaffClient tournamentId="t-1" />);

    // FIELD_OPERATOR_ROW 에는 nickname 이 없다 -> 두 경로 모두 userId 앞 8자로 남는다
    expect(screen.getAllByText('field-op…')).toHaveLength(2);
  });

  it('hides the grant button and every revoke action for a read-only support role', () => {
    setRole('SUPPORT_READONLY');
    render(<StaffClient tournamentId="t-1" />);

    expect(screen.queryByRole('button', { name: '스태프 배정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '해제' })).not.toBeInTheDocument();
  });

  it('lets a tournament director grant field_operator/support_readonly but not another director, and revoke the field operator but not the director row', async () => {
    setRole('TOURNAMENT_DIRECTOR');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    const optionLabels = optionLabelsOf(screen.getByLabelText('역할'));
    expect(optionLabels).toEqual(['필드 담당자', '지원(조회 전용)']);
    expect(optionLabels).not.toContain('대회 디렉터');

    // director row(assignment-director)에는 해제 버튼이 없어야 하고, field operator row에는 있어야 한다.
    expect(screen.queryAllByRole('button', { name: '해제' })).toHaveLength(1);
  });

  it('lets platform_ops grant a tournament_director and revoke any row', async () => {
    setRole('PLATFORM_OPS');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    const optionLabels = optionLabelsOf(screen.getByLabelText('역할'));
    expect(optionLabels).toEqual(['대회 디렉터', '필드 담당자', '지원(조회 전용)']);

    expect(screen.queryAllByRole('button', { name: '해제' })).toHaveLength(2);
  });

  it('submits a revoke with the target assignmentId, its observed expectedVersion, and the entered reason', async () => {
    setRole('PLATFORM_OPS');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getAllByRole('button', { name: '해제' })[1]);
    // "배정 해제"는 모달 제출 버튼과 (jsdom엔 항상 함께 렌더되는) 모바일 카드 행 버튼 양쪽에 존재하므로
    // alertdialog로 스코프해 모달의 제출 버튼만 특정한다.
    const modal = screen.getByRole('alertdialog');
    await user.type(within(modal).getByLabelText(/사유/), '현장 이탈로 인한 배정 해제');
    await user.click(within(modal).getByRole('button', { name: '배정 해제' }));

    expect(mocks.revokeMutate).toHaveBeenCalledWith(
      {
        assignmentId: FIELD_OPERATOR_ROW.id,
        payload: { expectedVersion: FIELD_OPERATOR_ROW.version, reason: '현장 이탈로 인한 배정 해제' },
      },
      expect.any(Object),
    );
  });

  it('requires a field for a field_operator grant before the submit button enables', async () => {
    setRole('PLATFORM_OPS');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    await user.selectOptions(screen.getByLabelText('역할'), 'FIELD_OPERATOR');
    await user.type(screen.getByLabelText(/사용자 ID/), '11111111-1111-4111-8111-111111111111');

    expect(screen.getByRole('button', { name: '배정하기' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/담당 필드/), 'field-1');
    expect(screen.getByRole('button', { name: '배정하기' })).toBeEnabled();
  });
});
