'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isOptimizableImagePath } from '@/lib/assets';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { sportIllustration } from '@/components/v1-ui/sport-illustration';

// sizes 가 없으면 next/image 가 width(1600)의 1x/2x 인 1920·3840 을 받는다 — 기본값은 콘텐츠 열 전체 폭
// (프레임 480·600, 데스크톱 스크롤 영역 1072). 열보다 좁게 그리는 호출처는 sizes 를 넘긴다.
const FULL_COLUMN_SIZES = '(min-width: 1024px) 1072px, (min-width: 768px) 600px, (min-width: 480px) 480px, 100vw';

type TournamentCampaignMediaProps = {
  readonly src?: string | null;
  readonly sportCode: string;
  readonly alt: string;
  readonly className?: string;
  readonly eager?: boolean;
  /** 이미지가 실제로 그려지는 폭(`<img sizes>`). 기본값은 콘텐츠 열 전체 폭이다. */
  readonly sizes?: string;
};

/**
 * 대회 캠페인 미디어 — 실제 사진이 없거나(신청 전) 로드 실패(깨진 URL)면 목업 사진
 * (`/mock/generated/*.webp`) 대신 종목 액센트로 틴트한 패널 + 종목 그래픽을 보여준다.
 * alpha 실측(2026-09-04)에서 실제 대회에 목업 사진(배드민턴 클럽·풋살 루프탑 등)이
 * 그 대회의 사진처럼 붙어 있었다 — 없으면 없다고 보여준다(matches-page.tsx
 * SportIllustration 패턴을 그대로 따른다).
 */
export function TournamentCampaignMedia({
  src,
  sportCode,
  alt,
  className,
  eager = false,
  sizes = FULL_COLUMN_SIZES,
}: TournamentCampaignMediaProps) {
  const requestedSrc = src?.trim() || null;
  const [currentSrc, setCurrentSrc] = useState(requestedSrc);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setCurrentSrc(requestedSrc);
    setErrored(false);
  }, [requestedSrc]);

  if (!currentSrc || errored) {
    const accent = getSportAccent(sportCode);
    return (
      <div
        className={`tm-campaign-media-fallback${className ? ` ${className}` : ''}`}
        style={{ background: `linear-gradient(135deg, ${accent.dot}, ${accent.gradientTo})` }}
        aria-hidden="true"
      >
        <Image
          className="tm-campaign-media-illustration"
          src={`/illustrations/${sportIllustration(accent.label)}-640.webp`}
          alt=""
          width={640}
          height={640}
          sizes="160px"
        />
      </div>
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      width={1600}
      height={900}
      sizes={sizes}
      unoptimized={!isOptimizableImagePath(currentSrc)}
      className={className}
      priority={eager}
      onError={() => setErrored(true)}
    />
  );
}
