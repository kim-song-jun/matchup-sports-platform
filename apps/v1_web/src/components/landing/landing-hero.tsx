import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Zap } from 'lucide-react';
import {
  PUBLIC_NAV_CONTACT,
  PUBLIC_NAV_HELP,
  PublicSiteAudienceMenu,
  PublicSiteMobileMenu,
} from '@/components/public-site';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { LandingCtaLink } from './landing-cta-link';
import { LandingDevice, LandingScreen } from './landing-device';
import { HomeScreenBody } from './landing-app-screens';
import { LandingMotionToggle, LandingThemeToggle } from './landing-nav-controls';

const NAV_LINKS = [
  { href: '#why', label: '왜 팀밋' },
  { href: '#tour', label: '기능' },
  { href: '#sports', label: '종목' },
  { href: '#how', label: '이용 방법' },
] as const;

const LANDING_PATH = '/landing';

export function LandingNav() {
  return (
    <header className="tm-landing-nav">
      <div className="tm-landing-nav-inner">
        <Link className="tm-landing-brand" href="/landing" aria-label="teameet 홈">
          <BrandMark size={28} />
          teameet
        </Link>
        <nav className="tm-landing-nav-links" aria-label="페이지 내 이동">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="tm-landing-nav-link" href={link.href}>{link.label}</a>
          ))}
        </nav>
        <nav className="tm-landing-nav-site" aria-label="주요 메뉴">
          <PublicSiteAudienceMenu currentPath={LANDING_PATH} />
          {[PUBLIC_NAV_HELP, PUBLIC_NAV_CONTACT].map((link) => (
            <Link key={link.href} className="tm-landing-nav-link" href={link.href}>{link.label}</Link>
          ))}
        </nav>
        <div className="tm-landing-nav-ctas">
          <LandingMotionToggle />
          <LandingThemeToggle />
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-ghost tm-landing-nav-login" href="/login" cta="nav_login">
            로그인
          </LandingCtaLink>
          {/* 주요 CTA 는 화면당 하나(DESIGN.md 14절) — 내비는 보조로 두고, 모바일에선 하단 바가 대신한다 */}
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-nav-signup" href="/login" cta="nav_signup">
            시작하기
          </LandingCtaLink>
          <PublicSiteMobileMenu currentPath={LANDING_PATH} />
        </div>
      </div>
      <span className="tm-landing-progress" aria-hidden="true" />
    </header>
  );
}

export function LandingHero() {
  return (
    <section className="tm-landing-hero" aria-labelledby="hero-heading" data-loop="off">
      <div className="tm-landing-section-inner tm-landing-hero-grid">
        <div>
          <p className="tm-landing-hero-eyebrow">
            <span className="tm-landing-hero-eyebrow-dot" aria-hidden="true" />
            생활체육 동호인을 위한 경기 앱
          </p>
          <h1 id="hero-heading" className="tm-landing-hero-heading">
            <span className="tm-landing-hero-line">매치부터 대회까지,</span>
            <span className="tm-landing-hero-line"><em className="tm-landing-accent">한 앱</em>에서 끝까지</span>
          </h1>
          <p className="tm-landing-hero-sub">
            신청·명단·라이브 스코어·기록까지 팀밋이 한 흐름으로 이어 줘요.
          </p>
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

        {/* aside 의 첫 자식 = 그래픽, 둘째 = 사실 스트립(page.test.tsx 순서 계약) */}
        <div className="tm-landing-hero-aside">
          <div className="tm-landing-hero-graphic">
            <Image
              className="tm-landing-hero-illust"
              src="/illustrations/landing-hero-640.webp"
              alt=""
              aria-hidden="true"
              width={640}
              height={640}
              sizes="(min-width: 1024px) 200px, 150px"
              priority
            />
            <div className="tm-landing-float" data-pos="a" aria-hidden="true">
              <div className="tm-landing-float-card">
                <span className="tm-landing-float-ic" data-tone="green"><Check size={16} /></span>
                <span>대회 참가가 확정됐어요<small>가을 풋살 챔피언십 · 방금</small></span>
              </div>
            </div>
            <div className="tm-landing-float" data-pos="b" aria-hidden="true">
              <div className="tm-landing-float-card">
                <span className="tm-landing-float-ic" data-tone="red"><Zap size={16} /></span>
                <span>FC 한강 2 : 1 성수 러너스<small>결승 · 후반 진행 중</small></span>
              </div>
            </div>
            <LandingDevice
              size="hero"
              activeTab="home"
              label="팀밋 홈 화면 예시: 오늘의 추천 대회와 추천 매치. 팀 이름과 점수는 가상의 예시예요."
            >
              <LandingScreen kind="home" tabKey="home" on>
                <HomeScreenBody />
              </LandingScreen>
            </LandingDevice>
          </div>
          {/* 숫자를 싣지 않는다 — 이 페이지는 데이터를 조회하지 않아 숫자는 전부 확인해 줄 수 없는
              하드코딩이 된다(2026-09-04 사용자 확정). */}
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
