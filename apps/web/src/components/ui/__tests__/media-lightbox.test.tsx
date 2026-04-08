import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaLightbox } from '../media-lightbox';

const images = [
  { src: '/one.jpg', alt: '첫 번째 이미지' },
  { src: '/two.jpg', alt: '두 번째 이미지' },
  { src: '/three.jpg', alt: '세 번째 이미지' },
  { src: '/two.jpg', alt: '중복 이미지' },
];

function renderLightbox(props: Partial<Parameters<typeof MediaLightbox>[0]> = {}) {
  return render(
    <MediaLightbox
      isOpen
      images={images}
      initialIndex={0}
      onClose={vi.fn()}
      title="매치 사진"
      {...props}
    />,
  );
}

describe('MediaLightbox', () => {
  it('renders current image and counter', () => {
    renderLightbox({ initialIndex: 1 });

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '매치 사진');
    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('moves focus into the lightbox and restores previous overflow on close', async () => {
    document.body.style.overflow = 'scroll';
    const trigger = document.createElement('button');
    trigger.textContent = 'open';
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <MediaLightbox
        isOpen
        images={images}
        initialIndex={0}
        onClose={vi.fn()}
        title="매치 사진"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '이미지 뷰어 닫기' })).toHaveFocus();
    });
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <MediaLightbox
        isOpen={false}
        images={images}
        initialIndex={0}
        onClose={vi.fn()}
        title="매치 사진"
      />,
    );

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(document.body.style.overflow).toBe('scroll');
    trigger.remove();
  });

  it('navigates images with arrow buttons and keyboard', async () => {
    renderLightbox();

    await userEvent.click(screen.getByRole('button', { name: '다음 이미지' }));
    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByAltText('세 번째 이미지')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();
  });

  it('deduplicates duplicate image sources and keeps a valid counter', () => {
    renderLightbox({ initialIndex: 2 });

    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.queryByText('3 / 4')).toBeNull();
  });

  it('navigates to selected image via thumbnail', async () => {
    const user = userEvent.setup();
    renderLightbox();

    await user.click(screen.getByRole('button', { name: '3번째 이미지 보기' }));
    expect(screen.getByAltText('세 번째 이미지')).toBeInTheDocument();
  });

  it('calls onClose when backdrop or escape is used', async () => {
    const onClose = vi.fn();
    renderLightbox({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('media-lightbox'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('supports swipe navigation on touch devices', () => {
    renderLightbox();

    const swipeSurface = screen.getByTestId('media-lightbox-surface');

    fireEvent.touchStart(swipeSurface!, {
      changedTouches: [{ clientX: 200 }],
    });
    fireEvent.touchEnd(swipeSurface!, {
      changedTouches: [{ clientX: 100 }],
    });

    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();
  });
});
