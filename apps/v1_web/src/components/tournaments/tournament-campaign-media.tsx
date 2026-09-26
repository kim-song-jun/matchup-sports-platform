'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { sportIllustration } from '@/components/v1-ui/sport-illustration';

type TournamentCampaignMediaProps = {
  readonly src?: string | null;
  readonly sportCode: string;
  readonly alt: string;
  readonly className?: string;
  readonly eager?: boolean;
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
      className={className}
      priority={eager}
      onError={() => setErrored(true)}
    />
  );
}
