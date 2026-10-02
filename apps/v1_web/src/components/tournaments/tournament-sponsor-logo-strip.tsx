'use client';

import Image from 'next/image';
import { useState } from 'react';
import { displayInitials } from '@/lib/display-initials';
import type { V1TournamentSponsor } from '@/types/api';
import styles from './tournament-sponsor-logo-strip.module.css';

/**
 * 참가 신청 페이지 최하단용 후원사 로고 축약 노출.
 * TournamentSponsorSection(대회 상세용, 설명·혜택·부스·외부링크 포함)과 달리
 * 순수 로고 이미지만 나열한다 — 클릭 핸들러/<a> 태그를 두지 않는다(외부 이동 없음).
 */
export function SponsorLogoStrip({
  sponsors,
}: {
  sponsors: V1TournamentSponsor[];
}) {
  const logoSponsors = sponsors
    .filter(
      (sponsor): sponsor is V1TournamentSponsor & { logoUrl: string } =>
        Boolean(sponsor.logoUrl?.trim()),
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (logoSponsors.length === 0) {
    return null;
  }

  return (
    <section aria-label="후원사" className={styles.section}>
      <div className={`tm-text-caption ${styles.caption}`}>
        함께하는 후원사
      </div>
      <div className={styles.logoList}>
        {logoSponsors.map((sponsor) => (
          <SponsorLogo
            key={`${sponsor.id}:${sponsor.logoUrl}`}
            logoUrl={sponsor.logoUrl.trim()}
            name={sponsor.name}
          />
        ))}
      </div>
    </section>
  );
}

function SponsorLogo({ logoUrl, name }: { logoUrl: string; name: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={`${name} 로고`}
        className={`${styles.logoFrame} ${styles.logoFallback}`}
      >
        <span aria-hidden="true" className="tm-text-label">
          {getSponsorInitials(name)}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.logoFrame}>
      <Image
        src={logoUrl}
        alt={`${name} 로고`}
        width={112}
        height={40}
        unoptimized
        loading="lazy"
        className={styles.logoImage}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

/** 두 단어 이상이면 단어마다 첫 글자("Alpha Partner" → "AP"), 아니면 앞 두 글자. */
function getSponsorInitials(name: string): string {
  const wordInitials = name.split(/\s+/).map((word) => displayInitials(word, { fallback: '' })).filter(Boolean);
  const initials = wordInitials.length > 1 ? wordInitials.slice(0, 2).join('') : displayInitials(name, { fallback: '후원', count: 2 });
  return initials.toUpperCase();
}
