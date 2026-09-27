import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { LandingCtaLink } from '../landing-cta-link';
import { LandingV4Demo } from './landing-v4-demo';

/* 헤드라인은 단어마다 span 으로 서버에서 나눠 둔다 — 등장 연출은 CSS 만 하고, JS·모션이 없으면 그대로 보인다. */
type Word = { key: string; content: ReactNode };

const HEADLINE: ReadonlyArray<ReadonlyArray<Word>> = [
  [
    { key: '매치부터', content: '매치부터' },
    { key: '대회까지', content: '대회까지,' },
  ],
  [
    { key: '한', content: <em className="tm-landing-accent">한</em> },
    { key: '앱에서', content: <><em className="tm-landing-accent">앱</em>에서</> },
    { key: '끝까지', content: '끝까지' },
  ],
];

function wordOrder(lineIndex: number, wordIndex: number): number {
  return HEADLINE.slice(0, lineIndex).reduce((sum, line) => sum + line.length, 0) + wordIndex;
}

function Headline() {
  return (
    <h1 id="hero-heading" className="tm-landing-hero-heading tm-landing-v4-heading">
      {HEADLINE.map((line, lineIndex) => (
        <span key={lineIndex} className="tm-landing-v4-line">
          {line.map((word, wordIndex) => (
            <span key={word.key}>
              {wordIndex > 0 ? ' ' : null}
              <span className="tm-landing-v4-word" style={{ '--tm-landing-v4-w': wordOrder(lineIndex, wordIndex) } as CSSProperties}>
                <span>{word.content}</span>
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

export function LandingV4Hero() {
  return (
    <section className="tm-landing-hero tm-landing-v4-hero" aria-labelledby="hero-heading" data-loop="off">
      <div className="tm-landing-section-inner tm-landing-v4-hero-grid">
        <div className="tm-landing-v4-hero-copy">
          <p className="tm-landing-hero-eyebrow">
            <span className="tm-landing-v4-eyebrow-dot" aria-hidden="true" />
            생활체육 동호인을 위한 매치 앱
          </p>
          <Headline />
          <p className="tm-landing-hero-sub">근처 경기에 신청하고, 팀을 꾸리고, 대회 결과까지 한곳에서 확인해요.</p>
          <div className="tm-landing-hero-actions" data-mobile-cta-hide>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="hero_signup">
              무료로 시작하기
              <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
            </LandingCtaLink>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/team-matches" cta="hero_browse_team_matches">
              경기 둘러보기
            </LandingCtaLink>
          </div>
          <p className="tm-landing-hero-disclaimer">회원가입 없이도 경기와 대회를 둘러볼 수 있어요</p>
        </div>
        <div className="tm-landing-v4-hero-aside">
          <LandingV4Demo />
        </div>
      </div>
    </section>
  );
}
