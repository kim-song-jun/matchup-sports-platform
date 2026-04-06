import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../modal';

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <p>모달 내용입니다</p>,
  };
  return render(<Modal {...defaultProps} {...props} />);
}

describe('Modal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children when isOpen is true', () => {
    renderModal({ isOpen: true });
    expect(screen.getByText('모달 내용입니다')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('모달 내용입니다')).not.toBeInTheDocument();
  });

  it('renders title when title prop is provided', () => {
    renderModal({ title: '설정' });
    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  it('renders close button with aria-label', () => {
    renderModal({ title: '팀 수정' });
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ title: '알림', onClose });
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ title: '알림', onClose });
    // The backdrop is the first child div inside the dialog (bg-black/40 overlay)
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.firstElementChild as HTMLElement;
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderModal({ title: '알림', onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has role="dialog" and aria-modal="true"', () => {
    renderModal({ title: '접근성 모달' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses aria-label from title prop', () => {
    renderModal({ title: '프로필 수정' });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '프로필 수정');
  });

  it('uses default aria-label when no title', () => {
    renderModal({ title: undefined });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '대화상자');
  });
});
