'use client';

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
}: {
  sponsors: V1TournamentSponsor[];
}) {
  if (sponsors.length === 0) {
    return null;
  }

  const cards = getTournamentSponsorCards(sponsors);

  return (
    <section id="tournament-sponsors" aria-labelledby="sponsor-heading" className={styles.section}>
      <div id="sponsor-heading" className={`tm-text-body-lg ${styles.heading}`}>
        협찬·이벤트
      </div>
      <div className={styles.cardList}>
        {cards.map((sponsor) => (
          <div key={sponsor.id} className={`tm-card ${styles.card}`}>
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
          </div>
        ))}
      </div>
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
