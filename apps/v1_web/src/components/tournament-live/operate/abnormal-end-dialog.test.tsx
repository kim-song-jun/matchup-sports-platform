import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AbnormalEndDialog } from './abnormal-end-dialog';

// ─────────────────────────────────────────────────────────────────────────────
// 1차 대회(2026-08-15~16) 회고 "몰수·중단 등 특수 상황 처리". 지금까지 운영자는
// 몰수를 임의 점수(3-0 등)로 수기 입력하는 수밖에 없었고, 정상 종료와 구분되지 않아
// **왜 그 점수인지 근거가 남지 않았다**.
//
// 2026-08-23 사용자 결정(Q3)은 "표준 스코어 자동 부여"가 아니라 "운영자 입력 +
// 사유 필수"였다. 그래서 이 다이얼로그가 지켜야 하는 계약은 사실상 하나다 —
// **사유 없이는 종료가 확정되지 않는다.** 그게 무너지면 이 기능은 회고가 지적한
// 문제를 하나도 해결하지 못한다(점수의 임의성은 그대로인데 근거만 없는 상태).
// ─────────────────────────────────────────────────────────────────────────────

describe('AbnormalEndDialog — 몰수·중단 종료', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<AbnormalEndDialog open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // 이 스위트에서 가장 중요한 계약.
  it('사유가 비어 있으면 확정 버튼을 잠그고 이유를 알려준다', () => {
    const onConfirm = vi.fn();
    render(<AbnormalEndDialog open onCancel={vi.fn()} onConfirm={onConfirm} />);

    const submit = screen.getByRole('button', { name: '이대로 종료' });
    expect(submit).toBeDisabled();
    // 비활성 버튼만 두면 현장에서 왜 못 누르는지 못 찾는다 — 이유를 말로 준다.
    expect(screen.getByText('사유를 적어야 종료할 수 있어요.')).toBeInTheDocument();

    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('공백만 적은 것은 사유로 인정하지 않는다', () => {
    const onConfirm = vi.fn();
    render(<AbnormalEndDialog open onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: '이대로 종료' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('사유를 적으면 선택한 종류와 함께 확정한다', () => {
    const onConfirm = vi.fn();
    render(<AbnormalEndDialog open onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: '  원정팀 미출석  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '이대로 종료' }));

    // 앞뒤 공백은 다듬어 보낸다 — 서버도 trim 하지만 화면이 보낸 값과 저장되는 값이
    // 다르면 나중에 "내가 적은 그대로인가"를 확인할 수 없다.
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'FORFEIT', note: '원정팀 미출석' });
  });

  it('중단을 고르면 그 종류로 확정한다', () => {
    const onConfirm = vi.fn();
    render(<AbnormalEndDialog open onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('radio', { name: /경기 중단/ }));
    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '낙뢰로 중단' } });
    fireEvent.click(screen.getByRole('button', { name: '이대로 종료' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: 'ABANDONED', note: '낙뢰로 중단' });
  });

  it('기본 선택은 몰수이며 두 종류 모두 뜻을 함께 설명한다', () => {
    render(<AbnormalEndDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /몰수·기권/ })).toBeChecked();
    // 컬러/라벨만으로 구분하지 않고 각 선택지가 무엇을 뜻하는지 문장으로 준다.
    expect(screen.getByText('한 팀이 경기를 수행하지 않아 종결해요.')).toBeInTheDocument();
    expect(screen.getByText('날씨·사고 등으로 끝까지 진행하지 못했어요.')).toBeInTheDocument();
  });

  it('ESC로 닫을 수 있다', () => {
    const onCancel = vi.fn();
    render(<AbnormalEndDialog open onCancel={onCancel} onConfirm={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  // Copilot 리뷰 지적 — 버튼만 잠그면 키보드/백드롭 경로가 열려 있어 반쪽이다.
  it('전송 중에는 ESC 로도 닫히지 않는다', () => {
    const onCancel = vi.fn();
    render(<AbnormalEndDialog open submitting onCancel={onCancel} onConfirm={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('전송 중에는 취소와 확정을 모두 잠근다 (중복 종료 방지)', () => {
    render(<AbnormalEndDialog open submitting onCancel={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '원정팀 미출석' } });
    expect(screen.getByRole('button', { name: '이대로 종료' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });
});
