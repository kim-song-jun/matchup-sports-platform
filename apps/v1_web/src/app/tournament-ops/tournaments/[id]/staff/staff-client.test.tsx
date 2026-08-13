import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffClient } from './staff-client';
import type { V1TournamentStaffAssignment, V1TournamentStaffRole } from '@/types/api';

const mocks = vi.hoisted(() => ({
  useTournamentOpsRole: vi.fn(),
  grantMutate: vi.fn(),
  revokeMutate: vi.fn(),
  createFieldMutate: vi.fn(),
  // 테스트마다 필드 목록을 바꿀 수 있게 한다(빈 목록 케이스가 이 이슈의 핵심).
  fieldsResult: vi.fn(() => ({ data: { items: [{ id: 'field-1', name: '1번 코트' }] } })),
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
  useV1TournamentFields: () => mocks.fieldsResult(),
  useV1Tournament: () => ({ data: { title: '가을 풋살 대회' } }),
  useV1GrantTournamentStaff: () => ({ mutate: mocks.grantMutate, isPending: false }),
  useV1RevokeTournamentStaff: () => ({ mutate: mocks.revokeMutate, isPending: false }),
  useV1CreateTournamentField: () => ({ mutate: mocks.createFieldMutate, isPending: false }),
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
    mocks.createFieldMutate.mockReset();
    mocks.fieldsResult.mockReturnValue({ data: { items: [{ id: 'field-1', name: '1번 코트' }] } });
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

  // 예전에는 역할이 제목, 사람 이름이 부제였다 — 같은 역할이 여러 명이면 카드/행이
  // 전부 똑같아 보여서 "누가 배정됐는지"를 목록에서 못 읽었다. 이름이 위에 온다.
  it('leads each staff row with the person, not the role', () => {
    setRole('TOURNAMENT_DIRECTOR');
    render(<StaffClient tournamentId="t-1" />);

    for (const nameEl of screen.getAllByText('디렉터윤')) {
      const container = nameEl.parentElement;
      expect(container).not.toBeNull();
      const texts = Array.from(container!.querySelectorAll('p')).map((p) => p.textContent?.trim());
      expect(texts[0]).toBe('디렉터윤');
      expect(texts[1]).toBe('대회 디렉터');
    }
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

  /* 종전에는 담당 필드를 안 고르면 제출 버튼이 조용히 잠겨 있었다 — 왜 안 눌리는지
     알 방법이 없었다. 이제 버튼은 눌리고, 막힌 이유를 해요체로 말해 준다. */
  it('필드 담당자 배정에서 담당 필드를 안 고르면 이유를 알려주고 배정 요청은 나가지 않는다', async () => {
    setRole('PLATFORM_OPS');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    await user.selectOptions(screen.getByLabelText('역할'), 'FIELD_OPERATOR');
    await user.type(screen.getByLabelText(/사용자 ID/), '11111111-1111-4111-8111-111111111111');
    await user.click(screen.getByRole('button', { name: '배정하기' }));

    expect(screen.getByRole('alert')).toHaveTextContent('필드 담당자는 담당 경기장을 골라야 해요.');
    expect(mocks.grantMutate).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/담당 필드/), 'field-1');
    await user.click(screen.getByRole('button', { name: '배정하기' }));

    expect(mocks.grantMutate).toHaveBeenCalledTimes(1);
    expect(mocks.grantMutate.mock.calls[0][0]).toMatchObject({
      role: 'FIELD_OPERATOR',
      fieldId: 'field-1',
      userId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('사용자 ID 형식이 틀리면 이유를 알려주고 배정 요청은 나가지 않는다', async () => {
    setRole('PLATFORM_OPS');
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    await user.type(screen.getByLabelText(/사용자 ID/), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: '배정하기' }));

    expect(screen.getByRole('alert')).toHaveTextContent('올바른 UUID 형식이 아니에요');
    expect(mocks.grantMutate).not.toHaveBeenCalled();
  });

  /* #373 — 프론트에 필드 생성 호출부가 없어 필드가 영영 0건이었고, 그래서
     필드 담당자 배정을 끝낼 수 없었다. 등록 경로와 "왜 막혔는지" 안내가 이 화면의 계약이다. */
  it('플랫폼 운영자가 경기장을 등록하면 입력한 이름으로 생성 요청이 나간다', async () => {
    setRole('PLATFORM_OPS');
    mocks.fieldsResult.mockReturnValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.type(screen.getByLabelText('경기장 이름'), 'A구장');
    await user.click(screen.getByRole('button', { name: '경기장 추가' }));

    expect(mocks.createFieldMutate).toHaveBeenCalledTimes(1);
    expect(mocks.createFieldMutate.mock.calls[0][0]).toMatchObject({ name: 'A구장' });
  });

  it('등록된 경기장이 없으면 필드 담당자 배정이 왜 막혔는지 알려주고 제출을 잠근다', async () => {
    setRole('PLATFORM_OPS');
    mocks.fieldsResult.mockReturnValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<StaffClient tournamentId="t-1" />);

    await user.click(screen.getByRole('button', { name: '스태프 배정' }));
    await user.selectOptions(screen.getByLabelText('역할'), 'FIELD_OPERATOR');

    // 같은 문구가 섹션 안내에도 있으므로 모달로 범위를 좁혀 확인한다
    const modal = screen.getByRole('dialog');
    // 이유를 문구로 알려준다(색만으로 상태를 전달하지 않는다)
    // select 의 빈 option 에도 같은 문구가 있으므로, 도움말 문단(aria-describedby)만 겨냥한다
    const fieldSelect = within(modal).getByLabelText(/담당 필드/);
    const helpId = fieldSelect.getAttribute('aria-describedby');
    expect(helpId).toBeTruthy();
    expect(document.getElementById(helpId!)?.textContent).toMatch(/먼저 등록해 주세요/);
    // 고를 수 있는 것처럼 보이지 않게 select 자체도 잠근다
    expect(fieldSelect).toBeDisabled();
    // 제출을 눌러도 배정은 나가지 않고, 먼저 무엇을 해야 하는지 알려준다
    // (사용자 ID는 채워 둔다 — 검증 순서상 ID가 먼저라 비워 두면 그 사유가 먼저 나온다)
    await user.type(within(modal).getByLabelText(/사용자 ID/), '11111111-1111-4111-8111-111111111111');
    await user.click(within(modal).getByRole('button', { name: '배정하기' }));
    expect(within(modal).getByRole('alert')).toHaveTextContent('등록된 경기장이 없어');
    expect(mocks.grantMutate).not.toHaveBeenCalled();
  });
});
