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
            생활체육 동호인을 위한 경기 앱
          </p>
          <Headline />
          <p className="tm-landing-hero-sub">신청·명단·라이브 스코어·기록까지 팀밋이 한 흐름으로 이어 줘요.</p>
          <div className="tm-landing-hero-actions" data-mobile-cta-hide>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="hero_signup">
              무료로 시작하기
              <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
            </LandingCtaLink>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches" cta="hero_browse_matches">
              매치 둘러보기
            </LandingCtaLink>
          </div>
          <p className="tm-landing-hero-disclaimer">회원가입 없이도 매치와 대회를 둘러볼 수 있어요</p>
        </div>
        <div className="tm-landing-v4-hero-aside">
          <LandingV4Demo />
          {/* 숫자를 싣지 않는다 — 이 페이지는 데이터를 조회하지 않는다(2026-09-04 사용자 확정). */}
          <dl className="tm-landing-hero-facts">
            <div className="tm-landing-fact"><dt>운영 중인 종목</dt><dd>축구·풋살·러닝·수영</dd></div>
            <div className="tm-landing-fact"><dt>참여 방식</dt><dd>매치·팀·대회·리그</dd></div>
            <div className="tm-landing-fact"><dt>회원 가입</dt><dd>무료</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
