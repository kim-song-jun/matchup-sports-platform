import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { registrationFixture as reg } from '@/test/registration-fixtures';
import { CancelRequestChoice, CancelRequestSheet } from './registrations-cancel-request';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  __resetOverlayHistoryForTests();
});

describe('CancelRequestChoice — 데스크톱 인라인 선택', () => {
  it('질문 아래 두 선택지가 있고, 각 선택은 자기 핸들러를 한 번만 부른다', () => {
    const onApprove = vi.fn();
    const onKeep = vi.fn();
    render(<CancelRequestChoice id="choice-1" busy={false} onApprove={onApprove} onKeep={onKeep} />);
    expect(screen.getByText('취소 요청을 어떻게 처리할까요?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소 승인' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '참가 유지' }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('접근 이름은 선택지 이름만이고 결과 설명은 부가 설명으로 읽힌다', () => {
    render(<CancelRequestChoice id="choice-1" busy={false} onApprove={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByRole('button', { name: '취소 승인' })).toHaveAccessibleDescription(
      '신청이 취소되고 되돌릴 수 없어요. 사유를 남길 수 있어요.',
    );
    expect(screen.getByRole('button', { name: '참가 유지' })).toHaveAccessibleDescription(
      '취소 요청을 거절하고 이전 상태로 돌려요. 팀이 남긴 사유는 기록에 남아요.',
    );
  });

  it('처리 중에는 두 선택지 모두 잠긴다', () => {
    render(<CancelRequestChoice id="choice-1" busy onApprove={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByRole('button', { name: '취소 승인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '참가 유지' })).toBeDisabled();
  });
});

describe('CancelRequestSheet — 폰 아래 시트', () => {
  const registration = reg({
    status: 'cancel_requested',
    teamName: '분당 스트라이커',
    cancelRequestedAt: '2026-11-27T05:00:00.000Z',
    cancelReason: '선수 부족으로 불참',
  });

  function renderSheet(overrides: Partial<Parameters<typeof CancelRequestSheet>[0]> = {}) {
    const props = {
      open: true,
      registration,
      reason: '',
      error: null,
      busy: false,
      onReasonChange: vi.fn(),
      onApprove: vi.fn(),
      onKeep: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
    render(<CancelRequestSheet {...props} />);
    return props;
  }

  it('처음에는 아무것도 고르지 않아 확정 버튼이 잠겨 있고 사유 칸도 없다', () => {
    renderSheet();
    const sheet = screen.getByRole('dialog', { name: '분당 스트라이커 취소 요청' });
    expect(within(sheet).getByText(/팀이 남긴 취소 사유: “선수 부족으로 불참”/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '처리하기' })).toBeDisabled();
    expect(within(sheet).queryByRole('textbox')).toBeNull();
  });

  it('취소 승인을 고르면 사유 칸과 「취소 승인하기」가 나오고, 사유는 부모로 올라가며 확정은 onApprove 를 부른다', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByRole('radio', { name: '취소 승인' }));

    fireEvent.change(screen.getByLabelText('운영진 사유 (선택)'), { target: { value: '환불 안내함' } });
    expect(props.onReasonChange).toHaveBeenCalledWith('환불 안내함');

    fireEvent.click(screen.getByRole('button', { name: '취소 승인하기' }));
    expect(props.onApprove).toHaveBeenCalledTimes(1);
    expect(props.onKeep).not.toHaveBeenCalled();
  });

  it('참가 유지를 고르면 사유 칸이 사라지고 「참가 유지하기」가 onKeep 을 부른다', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByRole('radio', { name: '취소 승인' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '참가 유지' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '취소 승인하기' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '참가 유지하기' }));
    expect(props.onKeep).toHaveBeenCalledTimes(1);
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it('선택은 라디오 그룹의 aria-checked 로 말한다', () => {
    renderSheet();
    const approve = screen.getByRole('radio', { name: '취소 승인' });
    const keep = screen.getByRole('radio', { name: '참가 유지' });
    expect(screen.getByRole('radiogroup')).toContainElement(approve);
    expect([approve, keep].map((el) => el.getAttribute('aria-checked'))).toEqual(['false', 'false']);
    fireEvent.click(keep);
    expect([approve, keep].map((el) => el.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('서버 오류는 알림으로 보이고, 처리 중에는 확정과 닫기가 잠긴다', () => {
    renderSheet({ error: '취소를 승인하지 못했어요.', busy: true });
    expect(screen.getByRole('alert')).toHaveTextContent('취소를 승인하지 못했어요.');
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
  });

  it('닫기는 onClose 를 부르고, 열려 있지 않으면 아무것도 그리지 않는다', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const { container } = render(
      <CancelRequestSheet
        open={false}
        registration={registration}
        reason=""
        error={null}
        busy={false}
        onReasonChange={vi.fn()}
        onApprove={vi.fn()}
        onKeep={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
