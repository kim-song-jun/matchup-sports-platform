/**
 * 모달 a11y 공용 훅 계약 — 4개 모달(admin-reason, league 3종)이 각자 들고 있던
 * 스캐폴딩을 이 훅으로 모으면서, 각 파일에 흩어져 있던(그리고 어디서도 테스트로
 * 고정돼 있지 않던) 동작을 여기서 고정한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useModalA11y } from './use-modal-a11y';

function TestModal({
  open,
  onClose,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  pending?: boolean;
}) {
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLInputElement>({
    open,
    onClose,
    pending,
  });
  if (!open) return null;
  return (
    <div data-testid="backdrop" onClick={onBackdropClick}>
      <div ref={dialogRef} role="dialog" aria-modal="true">
        <input ref={initialFocusRef} aria-label="첫 입력" />
        <button type="button">확인</button>
      </div>
    </div>
  );
}

describe('useModalA11y', () => {
  it('ESC로 닫힌다 — 단 pending 중엔 잠긴다', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TestModal open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<TestModal open onClose={onClose} pending />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 클릭은 닫지만 패널 클릭은 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<TestModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('열리면 body 스크롤을 잠그고 닫히면 되돌린다', () => {
    const { rerender } = render(<TestModal open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<TestModal open={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('닫힐 때 이전 포커스를 복원한다 (WCAG 2.4.3)', () => {
    const outside = document.createElement('button');
    outside.textContent = '열기';
    document.body.appendChild(outside);
    outside.focus();

    const { rerender } = render(<TestModal open onClose={() => {}} />);
    // 첫 컨트롤 포커스는 60ms 지연 — 여기선 복원 경로만 본다
    rerender(<TestModal open={false} onClose={() => {}} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('열리면 지정한 첫 컨트롤로 포커스가 이동한다', async () => {
    vi.useFakeTimers();
    try {
      render(<TestModal open onClose={() => {}} />);
      vi.advanceTimersByTime(80);
      expect(document.activeElement).toBe(screen.getByLabelText('첫 입력'));
    } finally {
      vi.useRealTimers();
    }
  });
});
