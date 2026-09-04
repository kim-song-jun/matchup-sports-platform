'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { ErrorState } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { getSortedTournamentPromos, resolveTournamentImage } from '@/lib/tournament-promo';
import type { V1TournamentListItem } from '@/types/api';

type TournamentPromoCarouselProps = {
  items: V1TournamentListItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

export function TournamentPromoCarousel({
  items,
  loading = false,
  error = false,
  onRetry,
}: TournamentPromoCarouselProps) {
  const promos = getSortedTournamentPromos(items, 'list');
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // hover/포커스는 "지금 보는 중"의 임시 정지, manuallyPaused는 WCAG 2.2.2가
  // 요구하는 명시적 정지 수단(토글 버튼) — 마우스가 벗어나도 유지돼야 한다.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const isInteracting = hovered || focused;
  const autoPlayPaused = isInteracting || manuallyPaused;
  const promoIds = promos.map((promo) => promo.id).join(':');

  useEffect(() => {
    setActiveIndex(0);
    const rail = railRef.current;
    if (!rail) return;
    if (typeof rail.scrollTo === 'function') rail.scrollTo({ left: 0 });
    else rail.scrollLeft = 0;
  }, [promoIds]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener?.('change', syncPreference);
    return () => mediaQuery.removeEventListener?.('change', syncPreference);
  }, []);

  const moveTo = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(index, promos.length - 1));
    const rail = railRef.current;
    const target = rail?.children.item(nextIndex) as HTMLElement | null;
    if (!rail || !target) return;

    const left = target.offsetLeft - rail.offsetLeft;
    if (typeof rail.scrollTo === 'function') rail.scrollTo({ left, behavior: 'smooth' });
    else rail.scrollLeft = left;
    setActiveIndex(nextIndex);
  }, [promos.length]);

  useEffect(() => {
    if (promos.length <= 1 || autoPlayPaused || prefersReducedMotion) return;

    const timer = window.setTimeout(() => {
      moveTo((activeIndex + 1) % promos.length);
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [activeIndex, autoPlayPaused, moveTo, prefersReducedMotion, promos.length]);

  const handleScroll = () => {
    const rail = railRef.current;
    if (!rail) return;

    const slides = Array.from(rail.children) as HTMLElement[];
    const closest = slides.reduce(
      (best, slide, index) => {
        const distance = Math.abs(slide.offsetLeft - rail.offsetLeft - rail.scrollLeft);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    setActiveIndex(closest.index);
  };

  if (!loading && !error && promos.length === 0) return null;

  return (
    <section
      className="tm-tournament-promo-carousel"
      aria-label="추천 대회"
      aria-roledescription="carousel"
    >
      {loading ? (
        <div className="tm-tournament-promo-carousel-skeleton" aria-busy="true" aria-label="추천 대회 불러오는 중" />
      ) : error ? (
        <div className="tm-tournament-promo-carousel-error">
          <ErrorState message="추천 대회를 불러오지 못했어요." onRetry={onRetry} retryLabel="다시 불러오기" />
        </div>
      ) : (
        <div
          className="tm-tournament-promo-carousel-body"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
        >
          <div
            ref={railRef}
            className="tm-tournament-promo-carousel-rail"
            onScroll={handleScroll}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveTo(activeIndex - 1);
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveTo(activeIndex + 1);
              }
            }}
            tabIndex={0}
            aria-label="추천 대회 카드뉴스"
          >
            {promos.map((promo, index) => {
            const title = promo.promoListTitle?.trim() || promo.title;
            const subtitle = promo.promoListSubtitle?.trim();
            const badge = promo.promoListBadgeText?.trim() || '추천 대회';
            // 목록 홍보 이미지를 따로 지정하지 않았으면 대회 커버(기본 이미지)를 그대로 쓴다.
            const imageUrl = resolveTournamentImage(promo, 'list');
            const facts = [
              promo.promoListDateText?.trim(),
              promo.promoListTeamsText?.trim(),
              promo.promoListLocationText?.trim(),
            ].filter(Boolean).join(' · ');
            const prizeText = promo.promoListPrizeText?.trim();

            return (
              <article
                key={promo.id}
                className="tm-tournament-promo-slide"
                aria-roledescription="slide"
                aria-label={`${index + 1} / ${promos.length}: ${title}`}
              >
                <Link
                  href={promo.campaignSlug
                    ? `/tournaments/campaigns/${promo.campaignSlug}`
                    : `/tournaments/${promo.id}`}
                  className="tm-tournament-promo-card tm-pressable"
                  aria-label={`${title} 자세히 보기`}
                  style={{
                    background: imageUrl
                      ? `${cssUrl(imageUrl)} center/cover`
                      : 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
                  }}
                >
                  {imageUrl ? <span className="tm-tournament-promo-card-scrim" aria-hidden="true" /> : null}
                  {!imageUrl ? (
                    <TrophyIcon className="tm-tournament-promo-card-watermark" size={144} strokeWidth={1.2} aria-hidden="true" />
                  ) : null}
                  <div className="tm-tournament-promo-card-content">
                    <span className="tm-tournament-promo-card-badge">
                      <TrophyIcon size={12} strokeWidth={2} aria-hidden="true" />
                      {badge}
                    </span>
                    <div className="tm-text-body-lg tm-tournament-promo-card-title">{title}</div>
                    {subtitle ? <div className="tm-text-caption tm-tournament-promo-card-meta">{subtitle}</div> : null}
                    {facts ? <div className="tm-text-caption tm-tournament-promo-card-meta">{facts}</div> : null}
                    <div className="tm-tournament-promo-card-footer">
                      <span className="tm-text-caption">{prizeText}</span>
                      <span className="tm-tournament-promo-card-cta">자세히 보기</span>
                    </div>
                  </div>
                </Link>
              </article>
            );
            })}
          </div>

          {/* 캐러셀 밖(예: 아래 대회 목록)에 포커스/마우스가 있을 때는 자동 전환마다
              읽는 걸 끈다 — 캐러셀을 보고 있을 때만 "n / N" 이 스크린리더에 끼어든다. */}
          <span className="sr-only" aria-live={isInteracting ? 'polite' : 'off'}>
            {activeIndex + 1} / {promos.length}
          </span>

          {promos.length > 1 ? (
            <div className="tm-tournament-promo-dots" aria-label={`추천 대회 ${activeIndex + 1} / ${promos.length}`}>
              <button
                type="button"
                className="tm-tournament-promo-dot-button"
                aria-label={manuallyPaused ? '자동 전환 다시 시작' : '자동 전환 멈추기'}
                aria-pressed={manuallyPaused}
                onClick={() => setManuallyPaused((paused) => !paused)}
              >
                {manuallyPaused
                  ? <Play size={14} strokeWidth={2} aria-hidden="true" />
                  : <Pause size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
              {promos.map((promo, index) => (
                <button
                  key={promo.id}
                  type="button"
                  className="tm-tournament-promo-dot-button"
                  aria-label={`${index + 1}번째 추천 대회 보기`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  onClick={() => moveTo(index)}
                >
                  <span className="tm-tournament-promo-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
