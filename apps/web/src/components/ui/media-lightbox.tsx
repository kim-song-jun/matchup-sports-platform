'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SafeImage } from './safe-image';

export interface MediaLightboxImage {
  src: string;
  alt: string;
  fallbackSrc?: string;
}

interface MediaLightboxProps {
  isOpen: boolean;
  images: MediaLightboxImage[];
  initialIndex?: number;
  onClose: () => void;
  title?: string;
}

const SWIPE_THRESHOLD = 48;

function dedupeImages(images: MediaLightboxImage[]) {
  const uniqueImages: MediaLightboxImage[] = [];
  const seen = new Set<string>();

  for (const image of images) {
    if (!image?.src || seen.has(image.src)) continue;
    seen.add(image.src);
    uniqueImages.push(image);
  }

  return uniqueImages;
}

export function MediaLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
  title,
}: MediaLightboxProps) {
  const normalizedImages = useMemo(() => dedupeImages(images), [images]);
  const safeInitialIndex = useMemo(() => {
    if (normalizedImages.length === 0) return 0;
    return Math.min(Math.max(initialIndex, 0), normalizedImages.length - 1);
  }, [normalizedImages.length, initialIndex]);
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedRef = useRef<HTMLElement | null>(null);
  const previousOverflowRef = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(safeInitialIndex);
  }, [isOpen, safeInitialIndex]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
          return;
        }
      }

      if (normalizedImages.length <= 1) return;
      if (event.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev === 0 ? normalizedImages.length - 1 : prev - 1));
      }
      if (event.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev === normalizedImages.length - 1 ? 0 : prev + 1));
      }
    };

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflowRef.current;
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusedRef.current && document.contains(previousFocusedRef.current)) {
        previousFocusedRef.current.focus();
      }
    };
  }, [normalizedImages.length, isOpen, onClose]);

  if (!isOpen || normalizedImages.length === 0) return null;

  const currentImage = normalizedImages[currentIndex];
  const canNavigate = normalizedImages.length > 1;

  function goPrev() {
    setCurrentIndex((prev) => (prev === 0 ? normalizedImages.length - 1 : prev - 1));
  }

  function goNext() {
    setCurrentIndex((prev) => (prev === normalizedImages.length - 1 ? 0 : prev + 1));
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
      <div
        ref={panelRef}
        className="flex h-full flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
          <div className="min-w-0">
            {title ? (
              <p className="truncate text-sm font-semibold text-white/90">{title}</p>
            ) : null}
            <p className="text-xs text-white/60">
              {currentIndex + 1} / {normalizedImages.length}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="이미지 뷰어 닫기"
            className="flex min-h-[44px] min-w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
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
              className="absolute left-3 top-1/2 z-10 flex min-h-[44px] min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:min-h-12 sm:min-w-[48px]"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}

          <div
            className="flex h-full w-full items-center justify-center"
            onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
            data-testid="media-lightbox-surface"
          >
            <SafeImage
              src={currentImage.src}
              fallbackSrc={currentImage.fallbackSrc}
              alt={currentImage.alt}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            />
          </div>

          {canNavigate ? (
            <button
              type="button"
              onClick={goNext}
              aria-label="다음 이미지"
              className="absolute right-3 top-1/2 z-10 flex min-h-[44px] min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:min-h-12 sm:min-w-[48px]"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>

        {canNavigate ? (
          <div className="overflow-x-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-2">
            <div className="mx-auto flex w-max gap-2">
              {normalizedImages.map((image, index) => (
                <button
                  key={`${image.src}-${index}`}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`${index + 1}번째 이미지 보기`}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    index === currentIndex ? 'border-white' : 'border-white/20'
                  }`}
                >
                  <SafeImage
                    src={image.src}
                    fallbackSrc={image.fallbackSrc}
                    alt=""
                    className="h-14 w-14 object-cover sm:h-16 sm:w-16"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
