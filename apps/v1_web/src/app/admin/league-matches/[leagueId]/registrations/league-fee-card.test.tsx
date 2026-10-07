import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueFeeCard, type LeagueFeeSource } from './league-fee-card';

const { feeMutate, canWrite } = vi.hoisted(() => ({ feeMutate: vi.fn(), canWrite: { value: true } }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateLeagueEntryFee: () => ({ mutate: feeMutate, isPending: false }),
}));

const CONFIGURED_AT = '2026-10-01T00:00:00.000Z';
const paid: LeagueFeeSource = {
  entryFee: 70000,
  entryFeeConfiguredAt: CONFIGURED_AT,
  bankName: '국민은행',
  bankAccount: '123-456-789012',
  bankHolder: '팀밋',
  activeRegistrationCount: 0,
};
const unset: LeagueFeeSource = {
  entryFee: 0,
  entryFeeConfiguredAt: null,
  bankName: null,
  bankAccount: null,
  bankHolder: null,
  activeRegistrationCount: 0,
};

const renderCard = (league: LeagueFeeSource) =>
  render(<LeagueFeeCard league={league} leagueId="league-1" focusRequest={0} />);
const fee = () => screen.getByLabelText('팀당 참가비 (원)');
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: '저장' }));

describe('LeagueFeeCard', () => {
  beforeEach(() => {
    feeMutate.mockReset();
    canWrite.value = true;
    feeMutate.mockImplementation((_body, options) => options?.onSuccess?.({}));
  });

  describe('배지', () => {
    it('이어받음은 "미설정이고 금액이 있을 때"만 뜬다', () => {
      renderCard({ ...paid, entryFeeConfiguredAt: null });
      expect(screen.getByText('직전 시즌 설정을 이어받았어요')).toBeInTheDocument();
      expect(screen.queryByText('설정됨')).not.toBeInTheDocument();
    });

    it('설정된 리그는 "설정됨", 0원 미설정은 "미설정" — 이어받음이 아니다 (대조)', () => {
      const { unmount } = renderCard(paid);
      expect(screen.getByText('설정됨')).toBeInTheDocument();
      expect(screen.queryByText('직전 시즌 설정을 이어받았어요')).not.toBeInTheDocument();
      unmount();
      renderCard(unset);
      expect(screen.getByText('미설정')).toBeInTheDocument();
      expect(screen.queryByText('직전 시즌 설정을 이어받았어요')).not.toBeInTheDocument();
    });
  });

  describe('입력 검증', () => {
    it('유료인데 계좌가 비면 막고, 비어 있는 칸을 가리킨다', () => {
      renderCard(unset);
      type('팀당 참가비 (원)', '70000');
      type('은행', '국민은행');
      save();
      expect(screen.getByRole('alert')).toHaveTextContent('유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해 주세요.');
      expect(screen.getByLabelText('계좌번호')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('은행')).not.toHaveAttribute('aria-invalid');
      expect(feeMutate).not.toHaveBeenCalled();
    });

    it('무료(0원)는 계좌 없이 저장되고, 계좌는 payload 에서 빠진다', () => {
      renderCard(unset);
      save();
      expect(feeMutate).toHaveBeenCalledTimes(1);
      expect(feeMutate.mock.calls[0][0]).toEqual({ entryFee: 0 });
    });

    it('1억 원을 넘으면 막는다 / 비워도 막는다', () => {
      renderCard(unset);
      type('팀당 참가비 (원)', '100000001');
      save();
      expect(screen.getByRole('alert')).toHaveTextContent('참가비는 0원~1억 원 사이의 정수여야 해요.');
      type('팀당 참가비 (원)', '');
      save();
      expect(screen.getByRole('alert')).toHaveTextContent('참가비는 0원~1억 원 사이의 정수여야 해요.');
      expect(feeMutate).not.toHaveBeenCalled();
    });

    it('금액 입력은 천 단위 콤마로 보이고 숫자만 받는다', () => {
      renderCard(unset);
      type('팀당 참가비 (원)', '70,000원');
      expect(fee()).toHaveValue('70,000');
    });

    it('설정됨이고 바뀐 게 없으면 저장 버튼이 꺼져 있다 — 값을 고치면 켜진다', () => {
      renderCard(paid);
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
      type('예금주', '팀밋FC');
      expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
    });
  });

  describe('사유 모달 — 신청이 들어온 뒤의 변경', () => {
    it('신청이 없으면 금액을 바꿔도 모달 없이 바로 저장한다', () => {
      renderCard(paid);
      type('팀당 참가비 (원)', '80000');
      save();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(feeMutate.mock.calls[0][0]).toMatchObject({ entryFee: 80000 });
      expect(screen.getByRole('status')).toHaveTextContent('참가비를 저장했어요.');
    });

    it('신청이 있고 금액이 바뀌면 사유가 필수인 모달이 뜨고, 사유 없이는 보내지 못한다', () => {
      renderCard({ ...paid, activeRegistrationCount: 3 });
      type('팀당 참가비 (원)', '80000');
      save();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('참가비를 바꿀까요?');
      expect(dialog).toHaveTextContent('70,000원 → 80,000원');
      expect(dialog).toHaveTextContent('직접 신청한 3팀은 신청할 때의 금액이 그대로 유지돼요. 새로 신청하는 팀부터 80,000원이에요.');
      expect(feeMutate).not.toHaveBeenCalled();
      expect(within(dialog).getByRole('button', { name: '바꾸기' })).toBeDisabled();

      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  대관료 인상  ' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '바꾸기' }));
      expect(feeMutate.mock.calls[0][0]).toEqual({
        entryFee: 80000,
        bankName: '국민은행',
        bankAccount: '123-456-789012',
        bankHolder: '팀밋',
        reason: '대관료 인상',
      });
    });

    it('계좌만 바뀌면 제목과 안내가 계좌 이야기로 바뀐다', () => {
      renderCard({ ...paid, activeRegistrationCount: 3 });
      type('계좌번호', '999-000-111111');
      save();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('입금 계좌를 바꿀까요?');
      expect(dialog).toHaveTextContent('입금 대기 중인 팀에게도 새 계좌가 보여요.');
      expect(dialog).not.toHaveTextContent('→');
    });

    it('신청이 있어도 값이 그대로인 확인(이어받은 설정 확정)은 모달 없이 저장한다', () => {
      renderCard({ ...paid, entryFeeConfiguredAt: null, activeRegistrationCount: 3 });
      save();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(feeMutate.mock.calls[0][0]).toEqual({
        entryFee: 70000,
        bankName: '국민은행',
        bankAccount: '123-456-789012',
        bankHolder: '팀밋',
      });
    });

    it('화면의 신청 수가 낡아 서버가 사유를 요구하면(422) 같은 모달을 연다', () => {
      feeMutate.mockImplementationOnce((_body, options) =>
        options?.onError?.({ code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED', message: '이미 신청한 팀이 있어 사유가 필요해요.' }),
      );
      renderCard(paid);
      type('팀당 참가비 (원)', '80000');
      save();
      expect(screen.getByRole('dialog')).toHaveTextContent('참가비를 바꿀까요?');
    });

    it('다른 저장 실패는 모달 없이 알림으로 보인다', () => {
      feeMutate.mockImplementationOnce((_body, options) => options?.onError?.({ code: 'LEAGUE_STATE_CHANGED', message: '방금 바뀌었어요.' }));
      renderCard(paid);
      type('팀당 참가비 (원)', '80000');
      save();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('권한과 서버 거부', () => {
    it('읽기 전용 계정은 입력해도 저장하지 못하고 이유를 안내한다 (쓰기 권한 대조)', () => {
      canWrite.value = false;
      renderCard(unset);
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
      expect(screen.getByText('현재 계정은 참가비를 바꿀 권한이 없어요.')).toBeInTheDocument();
      expect(fee()).toBeDisabled();
    });

    it('쓰기 권한이 있으면 같은 화면에 안내가 없다', () => {
      renderCard(unset);
      expect(screen.queryByText('현재 계정은 참가비를 바꿀 권한이 없어요.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
    });

    it('계좌 필수 422 는 사유 모달이 아니라 알림으로 보인다', () => {
      feeMutate.mockImplementationOnce((_body, options) =>
        options?.onError?.({ code: 'LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED', message: '입금 계좌를 입력해 주세요.' }),
      );
      renderCard(unset);
      type('팀당 참가비 (원)', '70000');
      type('은행', '국민은행');
      type('계좌번호', '123-456');
      type('예금주', '팀밋');
      save();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
