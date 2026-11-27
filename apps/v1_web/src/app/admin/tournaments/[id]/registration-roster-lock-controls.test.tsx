import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1RosterDeadlineOverrideGrant,
  useV1RosterDeadlineOverrideRevoke,
  useV1RosterLock,
  useV1RosterUnlock,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { registrationFixture as reg } from '@/test/registration-fixtures';
import { RosterLockControls } from './registration-roster-lock-controls';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RosterLock: vi.fn(),
  useV1RosterUnlock: vi.fn(),
  useV1RosterDeadlineOverrideGrant: vi.fn(),
  useV1RosterDeadlineOverrideRevoke: vi.fn(),
}));

const lockMutate = vi.fn();
const unlockMutate = vi.fn();
const grantMutate = vi.fn();
const revokeMutate = vi.fn();
const showToast = vi.fn();
const DEADLINE = '2099-10-01T00:00:00.000Z';
const LOCKED_AT = '2026-08-01T00:00:00.000Z';

beforeEach(() => {
  vi.mocked(useV1RosterLock).mockReturnValue({ mutate: lockMutate, isPending: false } as never);
  vi.mocked(useV1RosterUnlock).mockReturnValue({ mutate: unlockMutate, isPending: false } as never);
  vi.mocked(useV1RosterDeadlineOverrideGrant).mockReturnValue({ mutate: grantMutate, isPending: false } as never);
  vi.mocked(useV1RosterDeadlineOverrideRevoke).mockReturnValue({ mutate: revokeMutate, isPending: false } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderControls(
  registration = reg(),
  props: { canWrite?: boolean; rosterDeadlineAt?: string | null } = {},
) {
  return render(
    <RosterLockControls
      registration={registration}
      canWrite={props.canWrite ?? true}
      rosterDeadlineAt={props.rosterDeadlineAt === undefined ? DEADLINE : props.rosterDeadlineAt}
      showToast={showToast}
    />,
  );
}

describe('RosterLockControls — 명단 잠금', () => {
  it('확정·미잠금이면 잠금 상태를 글자로 말하고, 누르면 그 신청을 잠근다', () => {
    renderControls();
    expect(screen.getByText('명단이 아직 잠기지 않았어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '명단 잠금' }));
    expect(lockMutate).toHaveBeenCalledWith(
      { registrationId: 'reg-1' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    lockMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith('명단을 잠갔어요.', 'success');
  });

  it('성별 쿼터가 안 맞아 잠금이 거절되면 부족한 인원을 알려 준다', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: '명단 잠금' }));
    const { onError } = lockMutate.mock.calls[0][1] as { onError: (err: unknown) => void };
    onError(
      new V1ApiError({
        status: 'error',
        timestamp: '2026-11-27T00:00:00.000Z',
        statusCode: 409,
        code: 'TOURNAMENT_GENDER_QUOTA_NOT_MET',
        message: 'quota',
        details: { male: { count: 3, min: 5, max: null, ok: false } },
      }),
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('남성 최소 5명 필요(현재 3명)'), 'error');
  });

  it('잠긴 확정 신청은 잠금 해제만 보인다', () => {
    renderControls(reg({ rosterLockedAt: LOCKED_AT }));
    expect(screen.getByText('명단이 잠겨 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명단 잠금' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
    expect(unlockMutate).toHaveBeenCalledWith('reg-1', expect.anything());
    unlockMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith('명단 잠금을 해제했어요.', 'success');
  });

  it('잠긴 취소 신청에는 아무것도 그리지 않고, 잠긴 취소 요청에는 잠금 해제 하나만 둔다', () => {
    const cancelled = renderControls(reg({ status: 'cancelled', rosterLockedAt: LOCKED_AT }));
    expect(cancelled.container).toBeEmptyDOMElement();
    cancelled.unmount();

    renderControls(reg({ status: 'cancel_requested', rosterLockedAt: LOCKED_AT }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '잠금 해제' })).toBeInTheDocument();
  });
});

describe('RosterLockControls — 명단 제출 마감 예외', () => {
  it('예외가 없으면 허용 버튼이 보이고, 누르면 그 신청에 예외를 준다', () => {
    renderControls(reg({ rosterDeadlineOverrideAt: null }));
    expect(screen.queryByRole('button', { name: '예외 해제' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '마감 예외 허용' }));
    expect(grantMutate).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    grantMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith('명단 제출 마감 예외를 허용했어요.', 'success');
  });

  it('잠긴 신청에 예외를 주면 잠금 해제도 해야 팀이 고칠 수 있다고 알린다', () => {
    renderControls(reg({ rosterLockedAt: LOCKED_AT }));
    fireEvent.click(screen.getByRole('button', { name: '마감 예외 허용' }));
    grantMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith(
      '명단 제출 마감 예외를 허용했어요. 다만 명단이 아직 잠겨 있어 팀이 수정하려면 잠금 해제도 함께 해야 해요.',
      'success',
    );
  });

  it('예외를 받은 신청은 해제 버튼만 보이고, 누르면 예외를 거둔다', () => {
    renderControls(reg({ rosterDeadlineOverrideAt: '2026-08-01T00:00:00.000Z' }));
    expect(screen.queryByRole('button', { name: '마감 예외 허용' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '예외 해제' }));
    expect(revokeMutate).toHaveBeenCalledWith('reg-1', expect.anything());
    revokeMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith('예외를 해제했어요.', 'success');
  });

  it('명단 마감이 없으면(리그) 허용을 숨기고, 이미 준 예외의 해제는 남긴다', () => {
    const plain = renderControls(reg({ rosterDeadlineOverrideAt: null, rosterLockedAt: LOCKED_AT }), { rosterDeadlineAt: null });
    expect(plain.container).not.toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: '마감 예외 허용' })).toBeNull();
    plain.unmount();

    renderControls(reg({ rosterDeadlineOverrideAt: '2026-10-01T00:00:00.000Z' }), { rosterDeadlineAt: null });
    expect(screen.getByRole('button', { name: '예외 해제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '마감 예외 허용' })).toBeNull();
  });
});

describe('RosterLockControls — 조회 전용', () => {
  it('canWrite=false 면 버튼도 안내도 없다', () => {
    const { container } = renderControls(reg({ rosterLockedAt: LOCKED_AT }), { canWrite: false });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
