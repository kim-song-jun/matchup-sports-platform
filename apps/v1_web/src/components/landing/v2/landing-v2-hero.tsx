import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { LandingCtaLink } from '../landing-cta-link';
import { LandingDevice, LandingScreen } from '../landing-device';
import { HomeScreenBody } from '../landing-app-screens';
import { LandingMotionToggle, LandingThemeToggle } from '../landing-nav-controls';

const NAV_LINKS = [
  { href: '#pain', label: '공감' },
  { href: '#story', label: '해결' },
  { href: '#trust', label: '신뢰' },
  { href: '#sports', label: '종목' },
  { href: '#how', label: '이용 방법' },
] as const;

const OLD_WAY = ['참석 투표 올리기', '빠진 사람 다시 세기', '모자라면 용병 따로 구하기'] as const;

export function LandingV2Nav() {
  return (
    <header className="tm-landing-nav">
      <div className="tm-landing-nav-inner">
        <Link className="tm-landing-brand" href="/landing/v2" aria-label="teameet 홈">
          <BrandMark size={28} />
          teameet
        </Link>
        <nav className="tm-landing-nav-links" aria-label="페이지 내 이동">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="tm-landing-nav-link" href={link.href}>{link.label}</a>
          ))}
        </nav>
        <div className="tm-landing-nav-ctas">
          <LandingMotionToggle />
          <LandingThemeToggle />
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-ghost tm-landing-nav-login" href="/login" cta="nav_login" variant="v2">
            로그인
          </LandingCtaLink>
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-nav-signup" href="/login" cta="nav_signup" variant="v2">
            시작하기
          </LandingCtaLink>
        </div>
      </div>
      <span className="tm-landing-progress" aria-hidden="true" />
    </header>
  );
}

/** 기(공감) — "나 얘기네" 가 먼저, 기능은 그다음. 무대는 예전 방식 메모 위로 팀밋 화면이 올라오는 한 장면이다. */
export function LandingV2Hero() {
  return (
    <section id="top" className="tm-landing-v2-hero" aria-labelledby="v2-hero-heading" data-loop="off">
      <div className="tm-landing-section-inner tm-landing-v2-hero-grid">
        <div className="tm-landing-v2-hero-copy">
          <p className="tm-landing-v2-eyebrow">
            <span className="tm-landing-v2-eyebrow-dot" aria-hidden="true" />
            생활체육, 준비는 팀밋이 맡을게요
          </p>
          <h1 id="v2-hero-heading" className="tm-landing-v2-h1">
            <span className="tm-landing-v2-h1-line">운동보다 <mark className="tm-landing-v2-mark">준비가</mark></span>
            <span className="tm-landing-v2-h1-line">더 힘들었죠?</span>
          </h1>
          <p className="tm-landing-v2-hero-sub">
            인원 모으기, 대진표 짜기, 점수 적기, 기록 정리까지. 이제 팀밋에서 한 흐름으로 이어져요.
          </p>
          <div className="tm-landing-v2-hero-actions" data-mobile-cta-hide>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="hero_signup" variant="v2">
              무료로 시작하기
              <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
            </LandingCtaLink>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches" cta="hero_browse_matches" variant="v2">
              매치 둘러보기
            </LandingCtaLink>
          </div>
          <p className="tm-landing-v2-hero-note">회원가입 없이도 매치와 대회를 둘러볼 수 있어요</p>
        </div>

        <div className="tm-landing-v2-stage">
          <Image
            className="tm-landing-v2-stage-illust"
            src="/illustrations/landing-hero-640.webp"
            alt=""
            aria-hidden="true"
            width={640}
            height={640}
            sizes="(min-width: 1024px) 200px, 140px"
            priority
          />
          {/* 아래 섹션(공감)이 같은 내용을 글로 설명하므로 여기서는 읽히지 않게 둔다 */}
          <div className="tm-landing-v2-oldway" aria-hidden="true" data-nosnippet>
            <span className="tm-landing-v2-oldway-tag">예전엔</span>
            <ul>
              {OLD_WAY.map((item) => (
                <li key={item}><span className="tm-landing-v2-oldway-strike">{item}</span></li>
              ))}
            </ul>
          </div>
          <div className="tm-landing-v2-stage-device">
            <LandingDevice
              size="hero"
              activeTab="home"
              label="팀밋 홈 화면 예시: 진행 중인 대회와 추천 매치. 팀 이름과 점수는 가상의 예시예요."
            >
              <LandingScreen kind="home" tabKey="home" on>
                <HomeScreenBody />
              </LandingScreen>
            </LandingDevice>
          </div>
        </div>
      </div>
    </section>
  );
}
