import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OperationFlagTogglePanel } from './operation-flag-toggle-panel';
import type { V1GameOperationFlag, V1GameOperationFlagKey, V1GameOperationFlagValue } from '@/types/api';

// ── Fixtures ─────────────────────────────────────────────────────────────
type FlagState = Record<V1GameOperationFlagKey, V1GameOperationFlagValue>;

const OFF_STATE: FlagState = {
  PUBLIC_LIVE: 'off',
  DIRECTOR_OFFICIALIZE: 'off',
};

function makeFlag(key: V1GameOperationFlagKey, value: V1GameOperationFlagValue): V1GameOperationFlag {
  return {
    key,
    value,
    version: 3,
    ownerActor: 'platform_ops',
    updatedByUserId: 'admin-1',
    rollbackValue: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

let flagState: FlagState = OFF_STATE;
let gateEnabled = true;

// mutate 는 키별로 분리해 어느 토글이 실제로 호출됐는지 검증할 수 있게 한다.
const mutateByKey = new Map<V1GameOperationFlagKey, ReturnType<typeof vi.fn>>();
function mutateFor(key: V1GameOperationFlagKey) {
  if (!mutateByKey.has(key)) mutateByKey.set(key, vi.fn());
  return mutateByKey.get(key)!;
}

vi.mock('@/hooks/use-v1-api', () => ({
  useV1SimplifiedOperationFlagGateStatus: () => ({
    data: {
      enabled: gateEnabled,
      version: 1,
      updatedByUserId: 'admin-1',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    isPending: false,
    isError: false,
  }),
  useV1SetSimplifiedOperationFlagGate: () => ({ mutate: vi.fn(), isPending: false }),
  useV1OperationFlag: (key: V1GameOperationFlagKey) => ({
    data: makeFlag(key, flagState[key]),
    isPending: false,
    isError: false,
  }),
  useV1SimplifiedToggleOperationFlag: (key: V1GameOperationFlagKey) => ({
    mutate: mutateFor(key),
    isPending: false,
  }),
}));

describe('OperationFlagTogglePanel', () => {
  beforeEach(() => {
    flagState = { ...OFF_STATE };
    gateEnabled = true;
    mutateByKey.clear();
  });

  it('두 토글 모두 순서·잠김 없이 항상 활성 상태로 렌더된다 (독립 킬스위치)', () => {
    render(<OperationFlagTogglePanel />);

    expect(screen.getByRole('button', { name: '실시간 점수 공개 켜기' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '결과 확정 권한 켜기' })).not.toBeDisabled();
  });

  it('간소 전환 모드가 꺼져 있으면 두 토글 버튼 모두 비활성이 된다', () => {
    gateEnabled = false;
    render(<OperationFlagTogglePanel />);

    expect(screen.getByRole('button', { name: '실시간 점수 공개 켜기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '결과 확정 권한 켜기' })).toBeDisabled();
  });

  it('PUBLIC_LIVE를 켜면 status_only 강등과 무관한 "켜짐" 효과 설명이 확인 모달에 뜨고, 확인 시 simplifiedPatchFlag가 off->on으로 호출된다', async () => {
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '실시간 점수 공개 켜기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '실시간 점수 공개 켜기' });

    expect(within(dialog).getByText(/관전자 화면.*점수와 경기 시계를 그대로 보여줘요/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/사유/), '알파 검증 완료');
    await user.click(within(dialog).getByRole('button', { name: '켜기' }));

    expect(mutateFor('PUBLIC_LIVE')).toHaveBeenCalledTimes(1);
    const [payload] = mutateFor('PUBLIC_LIVE').mock.calls[0];
    expect(payload).toEqual({ expectedVersion: 3, value: 'on', reason: '알파 검증 완료' });
  });

  it('DIRECTOR_OFFICIALIZE가 켜져 있을 때 끄면 결과 확정이 거부된다는 경고가 확인 모달에 뜨고, 확인 시 on->off로 호출된다', async () => {
    flagState = { ...OFF_STATE, DIRECTOR_OFFICIALIZE: 'on' };
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '결과 확정 권한 끄기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '결과 확정 권한 끄기' });

    expect(within(dialog).getByText(/디렉터의 결과 확정 요청이 거부돼요/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/사유/), '운영 중단 필요');
    await user.click(within(dialog).getByRole('button', { name: '끄기' }));

    expect(mutateFor('DIRECTOR_OFFICIALIZE')).toHaveBeenCalledTimes(1);
    const [payload] = mutateFor('DIRECTOR_OFFICIALIZE').mock.calls[0];
    expect(payload).toEqual({ expectedVersion: 3, value: 'off', reason: '운영 중단 필요' });
  });

  it('확인 모달에는 타이핑 확인 입력란이 없다 (두 토글 모두 되돌릴 수 있는 조작)', async () => {
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '실시간 점수 공개 켜기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '실시간 점수 공개 켜기' });

    expect(within(dialog).queryByLabelText(/그대로 입력해 주세요/)).not.toBeInTheDocument();
  });

  it('사유를 입력하지 않으면 확인 버튼이 비활성 상태로 남는다', async () => {
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '실시간 점수 공개 켜기' }));
    const dialog = await screen.findByRole('alertdialog', { name: '실시간 점수 공개 켜기' });

    expect(within(dialog).getByRole('button', { name: '켜기' })).toBeDisabled();
    expect(mutateFor('PUBLIC_LIVE')).not.toHaveBeenCalled();
  });
});
