import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OperationFlagTogglePanel } from './operation-flag-toggle-panel';
import type { V1GameOperationFlag, V1GameOperationFlagKey, V1GameOperationFlagValue } from '@/types/api';

// ── Fixtures ─────────────────────────────────────────────────────────────
type FlagState = Record<V1GameOperationFlagKey, V1GameOperationFlagValue>;

const LEGACY_STATE: FlagState = {
  GAME_READ: 'legacy',
  GAME_WRITE: 'legacy',
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

let flagState: FlagState = LEGACY_STATE;
let gateEnabled = true;

// mutate 는 키별로 분리해 어느 단계가 실제로 호출됐는지 검증할 수 있게 한다.
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
    flagState = { ...LEGACY_STATE };
    gateEnabled = true;
    mutateByKey.clear();
  });

  it('선행 조건이 안 맞는 단계의 실행 버튼은 비활성이라 눌러도 아무 일도 일어나지 않는다', async () => {
    // GAME_READ가 legacy라 2단계(GAME_WRITE)는 아직 잠겨 있어야 한다.
    flagState = { ...LEGACY_STATE, GAME_READ: 'legacy' };
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    const step2Button = screen.getByRole('button', { name: '새 시스템으로 기록 전환 실행' });
    expect(step2Button).toBeDisabled();

    await user.click(step2Button);
    expect(mutateFor('GAME_WRITE')).not.toHaveBeenCalled();
    // 모달도 열리면 안 된다.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('선행 조건이 갖춰지면(READ=compare) 2단계 버튼이 활성화된다', () => {
    flagState = { ...LEGACY_STATE, GAME_READ: 'compare' };
    render(<OperationFlagTogglePanel />);

    const step2Button = screen.getByRole('button', { name: '새 시스템으로 기록 전환 실행' });
    expect(step2Button).not.toBeDisabled();
  });

  it('간소 전환 모드가 꺼져 있으면 실행 가능했을 단계의 버튼도 비활성이 된다', () => {
    gateEnabled = false;
    flagState = { ...LEGACY_STATE }; // 1단계는 선행조건이 없어 원래라면 바로 실행 가능
    render(<OperationFlagTogglePanel />);

    const step1Button = screen.getByRole('button', { name: '새 시스템 기록 대조 시작 실행' });
    expect(step1Button).toBeDisabled();
  });

  it('2단계 확인 모달은 "전환"을 정확히 입력해야만 확인 버튼이 활성화된다', async () => {
    flagState = { ...LEGACY_STATE, GAME_READ: 'compare' };
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '새 시스템으로 기록 전환 실행' }));
    const dialog = await screen.findByRole('alertdialog', { name: '새 시스템으로 기록 전환 실행' });

    const confirmButton = within(dialog).getByRole('button', { name: '실행' });
    const typedInput = within(dialog).getByLabelText(/전환.*입력해 주세요/);
    const reasonInput = within(dialog).getByLabelText(/사유/);

    // 사유만 채우고 오타를 입력하면 여전히 비활성.
    await user.type(reasonInput, '알파 검증 완료');
    await user.type(typedInput, '전환됨');
    expect(confirmButton).toBeDisabled();

    // 정확히 "전환"을 입력하면 활성화되고 제출된다.
    await user.clear(typedInput);
    await user.type(typedInput, '전환');
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);
    expect(mutateFor('GAME_WRITE')).toHaveBeenCalledTimes(1);
    const [payload] = mutateFor('GAME_WRITE').mock.calls[0];
    expect(payload).toEqual({ expectedVersion: 3, value: 'new', reason: '알파 검증 완료' });
  });

  it('다른 단계(1단계)의 확인 모달에는 타이핑 확인 입력란이 없다', async () => {
    flagState = { ...LEGACY_STATE };
    const user = userEvent.setup();
    render(<OperationFlagTogglePanel />);

    await user.click(screen.getByRole('button', { name: '새 시스템 기록 대조 시작 실행' }));
    const dialog = await screen.findByRole('alertdialog', { name: '새 시스템 기록 대조 시작 실행' });

    expect(within(dialog).queryByLabelText(/그대로 입력해 주세요/)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/사유/), '대조 시작합니다');
    await user.click(within(dialog).getByRole('button', { name: '실행' }));
    expect(mutateFor('GAME_READ')).toHaveBeenCalledTimes(1);
    const [payload] = mutateFor('GAME_READ').mock.calls[0];
    expect(payload).toEqual({ expectedVersion: 3, value: 'compare', reason: '대조 시작합니다' });
  });
});
