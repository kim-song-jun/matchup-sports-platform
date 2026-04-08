'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface MediaLightboxImage {
  src: string;
  alt: string;
}

interface MediaLightboxProps {
  isOpen: boolean;
  images: MediaLightboxImage[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
}

const SWIPE_THRESHOLD = 48;

export function MediaLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
  title,
}: MediaLightboxProps) {
  const safeInitialIndex = useMemo(() => {
    if (images.length === 0) return 0;
    return Math.min(Math.max(initialIndex, 0), images.length - 1);
  }, [images.length, initialIndex]);
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(safeInitialIndex);
  }, [isOpen, safeInitialIndex]);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (images.length <= 1) return;
      if (event.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
      }
      if (event.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [images.length, isOpen, onClose]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const canNavigate = images.length > 1;

  function goPrev() {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }

  function goNext() {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }

  function handleTouchEnd(clientX: number) {
    if (touchStartX == null || !canNavigate) return;
    const deltaX = clientX - touchStartX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) {
      setTouchStartX(null);
      return;
    }

    if (deltaX > 0) {
      goPrev();
    } else {
      goNext();
    }

    setTouchStartX(null);
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title || '이미지 뷰어'}
      data-testid="media-lightbox"
      onClick={onClose}
    >
      <div className="flex h-full flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
          <div className="min-w-0">
            {title ? (
              <p className="truncate text-sm font-semibold text-white/90">{title}</p>
            ) : null}
            <p className="text-xs text-white/60">
              {currentIndex + 1} / {images.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="이미지 뷰어 닫기"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3 pt-1 sm:px-6">
          {canNavigate ? (
            <button
              type="button"
              onClick={goPrev}
              aria-label="이전 이미지"
              className="absolute left-3 top-1/2 z-10 hidden min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}

          <div
            className="flex h-full w-full items-center justify-center"
            onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
          >
            <img
              src={currentImage.src}
              alt={currentImage.alt}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            />
          </div>

          {canNavigate ? (
            <button
              type="button"
              onClick={goNext}
              aria-label="다음 이미지"
              className="absolute right-3 top-1/2 z-10 hidden min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>

        {canNavigate ? (
          <div className="overflow-x-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-2">
            <div className="mx-auto flex w-max gap-2">
              {images.map((image, index) => (
                <button
                  key={`${image.src}-${index}`}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`${index + 1}번째 이미지 보기`}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    index === currentIndex ? 'border-white' : 'border-white/20'
                  }`}
                >
                  <img src={image.src} alt="" className="h-14 w-14 object-cover sm:h-16 sm:w-16" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
