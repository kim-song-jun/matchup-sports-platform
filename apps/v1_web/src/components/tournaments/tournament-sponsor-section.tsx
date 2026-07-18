'use client';

import { Card } from '@/components/v1-ui/primitives';
import { Handshake } from 'lucide-react';
import type { V1TournamentSponsor } from '@/types/api';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import styles from './tournament-sponsor-section.module.css';

type SponsorFact = {
  label: string;
  value: string;
};

type SponsorLink = {
  label: string;
  href: string;
};

export type TournamentSponsorCard = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  facts: SponsorFact[];
  links: SponsorLink[];
};

export function getTournamentSponsorCards(
  sponsors: V1TournamentSponsor[],
): TournamentSponsorCard[] {
  return sponsors.map((sponsor) => ({
    id: sponsor.id,
    name: sponsor.name,
    description: sponsor.description,
    logoUrl: sponsor.logoUrl,
    facts: [
      makeFact('제공 혜택', sponsor.benefitText),
      makeFact('현장 부스', sponsor.boothText),
      makeFact('이벤트', sponsor.eventTitle),
      makeFact('참여 방법', sponsor.eventDescription),
      makeFact('이벤트 결과', sponsor.eventResultText),
    ].filter((fact): fact is SponsorFact => fact !== null),
    links: [
      makeLink('홈페이지', sponsor.websiteUrl),
      makeLink('인스타그램', sponsor.instagramUrl),
    ].filter((link): link is SponsorLink => link !== null),
  }));
}

export function TournamentSponsorSection({
  sponsors,
  showEmptyState = false,
}: {
  sponsors: V1TournamentSponsor[];
  showEmptyState?: boolean;
}) {
  const cards = getTournamentSponsorCards(sponsors);

  if (cards.length === 0 && !showEmptyState) return null;

  return (
    <section id="tournament-sponsors" aria-labelledby="sponsor-heading" className={styles.section}>
      <div className={styles.sectionHeading}>
        <span className={styles.kicker}>Sponsors</span>
        <h2 id="sponsor-heading" className={styles.heading}>함께 만드는 파트너</h2>
        <p>대회를 더 풍성하게 만드는 공식 후원 혜택과 현장 이벤트를 확인하세요.</p>
      </div>
      {cards.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}><Handshake aria-hidden="true" /></span>
          <div>
            <strong>공식 후원사를 준비하고 있어요</strong>
            <p>파트너 정보와 참가팀 혜택은 확정되는 대로 이곳에 공개합니다.</p>
          </div>
        </div>
      ) : (
        <div className={styles.cardList}>
        {cards.map((sponsor) => (
          <Card key={sponsor.id} pad={16}>
            <div className={styles.summary}>
              <SponsorLogo name={sponsor.name} logoUrl={sponsor.logoUrl} />
              <div className={styles.details}>
                <div className={`tm-text-label ${styles.name}`}>
                  {sponsor.name}
                </div>
                {sponsor.description ? (
                  <p className={`tm-text-caption ${styles.description}`}>
                    {sponsor.description}
                  </p>
                ) : null}
              </div>
            </div>

            {sponsor.facts.length > 0 ? (
              <dl className={styles.factList}>
                {sponsor.facts.map((fact) => (
                  <div key={fact.label} className={styles.fact}>
                    <dt className={`tm-text-caption ${styles.factLabel}`}>
                      {fact.label}
                    </dt>
                    <dd className={`tm-text-caption ${styles.factValue}`}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {sponsor.links.length > 0 ? (
              <div className={styles.links}>
                {sponsor.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tm-btn tm-btn-sm tm-btn-neutral"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
        </div>
      )}
    </section>
  );
}

function makeFact(label: string, value: string | null): SponsorFact | null {
  return value ? { label, value } : null;
}

function makeLink(label: string, href: string | null): SponsorLink | null {
  return href ? { label, href } : null;
}

function SponsorLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <div aria-hidden="true" className={styles.logo}>
      <span className="tm-text-label">{name.slice(0, 2)}</span>
      {logoUrl ? (
        <TournamentCampaignMedia
          src={logoUrl}
          alt=""
          sportCode="sponsor"
          className={styles.logoImage}
        />
      ) : null}
    </div>
  );
}
