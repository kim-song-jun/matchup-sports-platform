import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { LandingCtaLink } from './landing-cta-link';

/* 운영 종목은 v1_api seed 의 활성 4종뿐이다. 준비 중 종목·일정은 근거가 없어 싣지 않는다. */
const SPORTS = [
  { name: '축구', image: '/illustrations/sport-soccer-hero-640.webp', desc: '매치부터 팀 경기·대회까지' },
  { name: '풋살', image: '/illustrations/sport-futsal-hero-640.webp', desc: '퇴근 후 한 판부터 리그까지' },
  { name: '러닝', image: '/illustrations/sport-running-hero-640.webp', desc: '같이 달릴 사람 찾기' },
  { name: '수영', image: '/illustrations/sport-swimming-hero-640.webp', desc: '함께 레인을 쓸 동료 찾기' },
] as const;

const HOW_STEPS = [
  { title: '간편하게 가입하기', desc: '소셜 계정이나 이메일로 가입하고, 휴대폰 인증까지 한 번에 마쳐요.' },
  { title: '매치 찾거나 직접 열기', desc: '종목과 지역으로 매치를 찾아 신청하거나, 원하는 시간·장소로 매치를 직접 열어요.' },
  { title: '모여서 함께 뛰기', desc: '모집이 차면 약속한 시간과 장소에서 만나 경기만 즐기면 돼요.' },
] as const;

const FOOTER_LINKS = [
  { href: '/notices', label: '공지사항' },
  { href: '/terms?document=terms', label: '서비스 이용약관' },
  { href: '/terms?document=privacy', label: '개인정보처리방침' },
  { href: '/terms?document=location', label: '위치기반서비스 이용약관' },
  { href: '/terms?document=tournament-policy', label: '대회 운영정책' },
  { href: '/terms?document=support', label: '고객센터' },
] as const;

const stagger = (i: number) => ({ '--i': i }) as CSSProperties;

export function LandingSports() {
  return (
    <section id="sports" className="tm-landing-section" aria-labelledby="sports-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-align="center" data-reveal>
          <p className="tm-landing-section-kw">종목</p>
          <h2 id="sports-heading" className="tm-landing-section-title">지금 뛸 수 있는 종목</h2>
          <p className="tm-landing-section-sub">축구·풋살·러닝·수영, 네 종목으로 운영하고 있어요.</p>
        </div>
        <ul className="tm-landing-sports">
          {SPORTS.map((sport, i) => (
            <li key={sport.name} className="tm-landing-sport" data-reveal="scale" style={stagger(i)}>
              <div className="tm-landing-sport-img">
                <Image src={sport.image} alt="" width={640} height={640} sizes="(min-width: 768px) 240px, 45vw" />
              </div>
              <h3>{sport.name}</h3>
              <p>{sport.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LandingHow() {
  return (
    <section id="how" className="tm-landing-section" aria-labelledby="how-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">이용 방법</p>
          <h2 id="how-heading" className="tm-landing-section-title">세 단계면<br />바로 뛸 수 있어요</h2>
          <p className="tm-landing-section-sub">가입부터 첫 경기까지, 흐름은 늘 같아요.</p>
        </div>
        <div className="tm-landing-how">
          <ol className="tm-landing-steps" data-reveal>
            {HOW_STEPS.map((step, i) => (
              <li key={step.title} className="tm-landing-step" style={stagger(i)}>
                <span className="tm-landing-step-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="tm-landing-how-graphic" data-reveal="scale" data-loop="off">
            <Image src="/illustrations/journey-done-640.webp" alt="" width={640} height={640} sizes="260px" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingCtaBanner() {
  return (
    <section className="tm-landing-cta-banner" aria-labelledby="cta-heading" data-mobile-cta-hide>
      <div className="tm-landing-section-inner" data-reveal>
        <h2 id="cta-heading" className="tm-landing-cta-heading">같이 뛸 사람,<br />팀밋에서 만나요</h2>
        <p className="tm-landing-cta-sub">이번 주말 경기도, 다가오는 대회도 팀밋에 있어요.</p>
        <div className="tm-landing-hero-actions">
          <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="bottom_signup">
            무료로 시작하기
            <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
          </LandingCtaLink>
          <LandingCtaLink
            className="tm-btn tm-btn-lg tm-landing-btn-on-ink"
            href="/tournaments"
            cta="bottom_browse_tournaments"
          >
            대회 둘러보기
          </LandingCtaLink>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="tm-landing-footer" data-mobile-cta-hide>
      <div className="tm-landing-section-inner">
        <div className="tm-landing-footer-inner">
          <div className="tm-landing-footer-brand">
            <BrandMark size={24} />
            <span className="tm-landing-footer-name">teameet</span>
            <span>생활체육 매치·팀·대회 플랫폼</span>
          </div>
          <nav className="tm-landing-footer-links" aria-label="약관 및 고객 지원">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} className="tm-landing-footer-link" href={link.href}>{link.label}</Link>
            ))}
          </nav>
        </div>
        <p className="tm-landing-footer-copy">© 2026 teameet. All rights reserved.</p>
      </div>
    </footer>
  );
}
