/**
 * 모달 a11y 공용 훅 계약 — 4개 모달(admin-reason, league 3종)이 각자 들고 있던
 * 스캐폴딩을 이 훅으로 모으면서, 각 파일에 흩어져 있던(그리고 어디서도 테스트로
 * 고정돼 있지 않던) 동작을 여기서 고정한다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** 훅이 의도한 사용법 — `mounted` 로 렌더를 붙잡아 퇴장 애니메이션을 재생한다.
 *  위 TestModal(조건부 언마운트)과는 계약이 다르므로 따로 둔다. */
function MountedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<
    HTMLInputElement,
    HTMLDivElement
  >({ open, onClose });
  if (!mounted) return null;
  return (
    <div data-testid="backdrop" className={closing ? 'is-closing' : ''} onClick={onBackdropClick}>
      <div ref={dialogRef} role="dialog" aria-modal="true">
        <input ref={initialFocusRef} aria-label="첫 입력" />
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

  it('조건부 언마운트형은 닫는 즉시 스크롤 잠금을 푼다', () => {
    // 이 호출자는 open=false 면 DOM 을 바로 걷어낸다 — 재생할 퇴장 UI 가 없다.
    // 여기서 잠금을 지연시키면 화면에 아무것도 없는데 뒤 화면만 안 움직인다.
    const { rerender } = render(<TestModal open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<TestModal open={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('mounted 기반 렌더는 퇴장 애니메이션 동안 잠금을 유지한다', async () => {
    const { rerender } = render(<MountedModal open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<MountedModal open={false} onClose={() => {}} />);
    // 패널이 아직 화면에 있다. 여기서 풀면 시트가 떠 있는데 뒤 화면이 스크롤된다.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    // 사라진 뒤에 풀린다
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('열린 채 언마운트돼도 이전 포커스를 복원한다 — 조건부 마운트형(LogDetailModal 류) 경로', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(<TestModal open onClose={() => {}} />);
    unmount();
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
