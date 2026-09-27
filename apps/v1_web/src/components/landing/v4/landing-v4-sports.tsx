import type { CSSProperties } from 'react';
import Image from 'next/image';
import type { LandingBySport, LandingV4Data } from '@/lib/landing/landing-v4-data';

/* LandingSports(A안)와 같은 운영 4종목 — 이미지·마크업(.tm-landing-sports)도 그대로 재사용하고
 * 여기서는 종목별 실수치 한 줄만 더 붙인다. */
const SPORTS = [
  { name: '축구', image: '/illustrations/sport-soccer-hero-640.webp' },
  { name: '풋살', image: '/illustrations/sport-futsal-hero-640.webp' },
  { name: '러닝', image: '/illustrations/sport-running-hero-640.webp' },
  { name: '수영', image: '/illustrations/sport-swimming-hero-640.webp' },
] as const;

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

function sportLine(counts: LandingBySport[string] | undefined, hasAnyData: boolean): { text: string; ready: boolean } | null {
  if (!hasAnyData) return null;
  const c = counts ?? { teamMatches: 0, tournaments: 0, teams: 0 };
  const segments = [
    c.teamMatches ? `매치 ${c.teamMatches}` : null,
    c.tournaments ? `대회 ${c.tournaments}` : null,
    c.teams ? `팀 ${c.teams}` : null,
  ].filter((s): s is string => s !== null);
  return segments.length > 0 ? { text: segments.join(' · '), ready: true } : { text: '준비 중', ready: false };
}

export function LandingV4Sports({ data }: { data: LandingV4Data }) {
  return (
    <section id="sports" className="tm-landing-section" aria-labelledby="sports-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-align="center" data-reveal>
          <p className="tm-landing-section-kw">종목</p>
          <h2 id="sports-heading" className="tm-landing-section-title">지금 열려 있는 종목</h2>
          <p className="tm-landing-section-sub">종목마다 지금 열려 있는 매치·대회·팀 수예요.</p>
        </div>
        <ul className="tm-landing-sports">
          {SPORTS.map((sport, i) => {
            const line = sportLine(data.bySport[sport.name], data.hasAnyData);
            return (
              <li key={sport.name} className="tm-landing-sport" data-reveal="scale" style={stagger(i)}>
                <div className="tm-landing-sport-img">
                  <Image src={sport.image} alt="" width={640} height={640} sizes="(min-width: 768px) 240px, 45vw" />
                </div>
                <h3>{sport.name}</h3>
                {line ? (
                  <p className="tm-landing-v4-sport-stats" data-ready={line.ready}>{line.text}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
