import { Card } from '@/components/v1-ui/primitives';
import type { V1TournamentSponsor } from '@/types/api';

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
    <section id="tournament-sponsors" aria-labelledby="sponsor-heading" style={{ marginTop: 24 }}>
      <div id="sponsor-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        협찬·이벤트
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {cards.map((sponsor) => (
          <Card key={sponsor.id} pad={16}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <SponsorLogo name={sponsor.name} logoUrl={sponsor.logoUrl} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                  {sponsor.name}
                </div>
                {sponsor.description ? (
                  <p className="tm-text-caption" style={{ margin: '3px 0 0', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {sponsor.description}
                  </p>
                ) : null}
              </div>
            </div>

            {sponsor.facts.length > 0 ? (
              <dl style={{ display: 'grid', gap: 8, margin: '14px 0 0' }}>
                {sponsor.facts.map((fact) => (
                  <div key={fact.label} style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 10 }}>
                    <dt className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
                      {fact.label}
                    </dt>
                    <dd className="tm-text-caption" style={{ color: 'var(--text-body)', lineHeight: 1.55, margin: 0 }}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {sponsor.links.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
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
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'var(--blue50)',
        color: 'var(--blue600)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span className="tm-text-label">{name.slice(0, 2)}</span>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
    </div>
  );
}
