import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaLightbox } from '../media-lightbox';

const images = [
  { src: '/one.jpg', alt: '첫 번째 이미지' },
  { src: '/two.jpg', alt: '두 번째 이미지' },
  { src: '/three.jpg', alt: '세 번째 이미지' },
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

  it('navigates images with arrow buttons and keyboard', async () => {
    renderLightbox();

    await userEvent.click(screen.getByRole('button', { name: '다음 이미지' }));
    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByAltText('세 번째 이미지')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();
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

    const dialog = screen.getByTestId('media-lightbox');
    const swipeSurface = dialog.querySelector('.flex.h-full.w-full.items-center.justify-center');
    expect(swipeSurface).not.toBeNull();

    fireEvent.touchStart(swipeSurface!, {
      changedTouches: [{ clientX: 200 }],
    });
    fireEvent.touchEnd(swipeSurface!, {
      changedTouches: [{ clientX: 100 }],
    });

    expect(screen.getByAltText('두 번째 이미지')).toBeInTheDocument();
  });
});
