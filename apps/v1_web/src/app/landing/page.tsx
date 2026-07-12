import Link from 'next/link';
import { BellIcon, HomeIcon, MatchIcon, TeamsIcon, TeamMatchIcon, SearchIcon } from '@/components/v1-ui/icons';
import { BrandMark } from '@/components/v1-ui/brand-logo';

export default function LandingPage() {
  return (
    <div className="tm-landing">
      {/* ── Top navigation ── */}
      <header className="tm-landing-nav" role="banner">
        <div className="tm-landing-nav-inner">
          <Link
            className="tm-landing-brand"
            href="/landing"
            aria-label="teameet 홈"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <BrandMark size={26} />
            teameet
          </Link>
          <nav className="tm-landing-nav-links" aria-label="메뉴">
            <Link className="tm-landing-nav-link" href="#features">기능</Link>
            <Link className="tm-landing-nav-link" href="#sports">종목</Link>
            <Link className="tm-landing-nav-link" href="#how">이용 방법</Link>
          </nav>
          <div className="tm-landing-nav-ctas">
            <Link className="tm-btn tm-btn-sm tm-btn-ghost" href="/login">로그인</Link>
            <Link className="tm-btn tm-btn-sm tm-btn-primary" href="/login">시작하기</Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="tm-landing-hero" aria-labelledby="hero-heading">
          <div className="tm-landing-section-inner">
            <div className="tm-landing-hero-content">
              <p className="tm-landing-hero-eyebrow">AI 기반 스포츠 매칭</p>
              <h1 id="hero-heading" className="tm-landing-hero-heading">
                오늘 같이 뛸 사람을<br />
                가장 빠르게 찾는 방법
              </h1>
              <p className="tm-landing-hero-sub">
                축구·풋살·러닝·수영 4개 종목으로 운영 중이고, 더 많은 종목을 준비하고 있어요.
                지금 내 주변 매치를 찾아보세요.
              </p>
              <div className="tm-landing-hero-actions">
                <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/login">
                  무료로 시작하기
                </Link>
                <Link className="tm-btn tm-btn-lg tm-btn-ghost" href="/matches">
                  매치 둘러보기
                </Link>
              </div>
              <p className="tm-landing-hero-disclaimer">
                회원가입 없이도 매치를 둘러볼 수 있어요
              </p>
            </div>
            {/* Hero stat strip */}
            {/* P1 숫자:단위 2:1 + tabular-nums — stat-num(24px mobile/28px desktop) : label(11px/13px) ≈ 2.2:1. tabular-nums는 .tm-landing-stat-num CSS에 적용됨 */}
            <div className="tm-landing-hero-stats" role="list">
              <div className="tm-landing-stat" role="listitem">
                <span className="tm-landing-stat-num">124</span>
                <span className="tm-landing-stat-label">오늘 열린 매치</span>
              </div>
              <div className="tm-landing-stat-divider" aria-hidden="true" />
              <div className="tm-landing-stat" role="listitem">
                <span className="tm-landing-stat-num">4+</span>
                <span className="tm-landing-stat-label">운영 종목</span>
              </div>
              <div className="tm-landing-stat-divider" aria-hidden="true" />
              <div className="tm-landing-stat" role="listitem">
                <span className="tm-landing-stat-num">4.8</span>
                <span className="tm-landing-stat-label">평균 매너 점수</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="tm-landing-section tm-landing-section-alt" aria-labelledby="features-heading">
          <div className="tm-landing-section-inner">
            <div className="tm-landing-section-header">
              <h2 id="features-heading" className="tm-text-heading">Teameet에서 할 수 있는 것</h2>
              <p className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
                개인 매치부터 팀 경기, 용병 모집까지 생활체육의 모든 것을 한곳에서 해결해요
              </p>
            </div>
            <ul className="tm-landing-features" aria-label="주요 기능 목록">
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <MatchIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">개인 매치</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    오늘 당장 뛸 수 있는 매치를 찾거나 직접 만들어 참가자를 모집하세요.
                    AI가 실력·지역·시간에 맞는 매치를 추천해 줘요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <TeamMatchIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">팀 매치</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    우리 팀과 비슷한 실력의 상대 팀을 찾아 경기를 신청하세요.
                    2단계 상호 확인으로 안전하게 경기를 잡아요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <TeamsIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">팀·클럽 찾기</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    종목·지역·수준별 팀을 검색하고 가입 신청을 보내세요.
                    팀 신뢰 점수로 믿을 수 있는 팀인지 미리 확인할 수 있어요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <SearchIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">용병 모집</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    팀 인원이 부족할 때 용병을 모집하거나, 빈자리가 있는 팀에 용병으로 뛰어보세요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <BellIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">알림·채팅</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    매치 확정·체크인·결과 알림을 실시간으로 받고, 팀원·상대팀과 채팅으로 소통하세요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-feature-card">
                <span className="tm-landing-feature-icon" aria-hidden="true">
                  <HomeIcon size={24} />
                </span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-feature-title">장터·강좌</h3>
                  <p className="tm-text-caption tm-landing-feature-desc">
                    중고 장비 거래부터 구장 대여, 코치 강좌까지 생활체육의 모든 것을 한곳에서 해결해요.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* ── Sports ── */}
        <section id="sports" className="tm-landing-section" aria-labelledby="sports-heading">
          <div className="tm-landing-section-inner">
            <div className="tm-landing-section-header">
              <h2 id="sports-heading" className="tm-text-heading">지원 종목</h2>
              <p className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
                지금 4개 종목으로 운영 중이에요. 더 많은 종목을 순차적으로 열고 있어요.
              </p>
            </div>
            <ul className="tm-landing-sports" aria-label="지원 종목 목록">
              {/* 활성 종목 (실제 seed) — 배지 없음 */}
              {[
                { name: '축구', emoji: '⚽' },
                { name: '풋살', emoji: '🥅' },
                { name: '러닝', emoji: '🏃' },
                { name: '수영', emoji: '🏊' },
              ].map(({ name, emoji }) => (
                <li key={name} className="tm-landing-sport-chip" aria-label={name}>
                  <span aria-hidden="true">{emoji}</span>
                  <span>{name}</span>
                </li>
              ))}
              {/* 준비중 종목 — 비색상 지표('준비중' 텍스트)로 상태 전달(a11y) */}
              {[
                { name: '농구', emoji: '🏀' },
                { name: '아이스하키', emoji: '🏒' },
                { name: '배드민턴', emoji: '🏸' },
                { name: '테니스', emoji: '🎾' },
                { name: '볼링', emoji: '🎳' },
                { name: '탁구', emoji: '🏓' },
                { name: '야구', emoji: '⚾' },
                { name: '배구', emoji: '🏐' },
                { name: '클라이밍', emoji: '🧗' },
              ].map(({ name, emoji }) => (
                <li
                  key={name}
                  className="tm-landing-sport-chip tm-landing-sport-chip-soon"
                  aria-label={`${name} (준비 중)`}
                >
                  <span aria-hidden="true">{emoji}</span>
                  <span>{name}</span>
                  <span className="tm-landing-sport-soon" aria-hidden="true">준비 중</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="tm-landing-section tm-landing-section-alt" aria-labelledby="how-heading">
          <div className="tm-landing-section-inner">
            <div className="tm-landing-section-header">
              <h2 id="how-heading" className="tm-text-heading">이용 방법</h2>
              <p className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
                세 단계면 바로 뛸 수 있어요
              </p>
            </div>
            <ol className="tm-landing-steps" aria-label="이용 단계">
              <li className="tm-landing-step">
                <span className="tm-landing-step-num" aria-label="1단계">1</span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-step-title">가입하고 프로필 설정</h3>
                  <p className="tm-text-caption tm-landing-step-desc">
                    카카오·네이버로 간편하게 가입하고 종목·수준·활동 지역을 입력하면 AI가 맞춤 매치를 추천해 줘요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-step">
                <span className="tm-landing-step-num" aria-label="2단계">2</span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-step-title">매치 찾고 신청하기</h3>
                  <p className="tm-text-caption tm-landing-step-desc">
                    오늘 열린 매치를 지도·목록으로 찾아보고 참가 신청을 보내세요.
                    호스트가 수락하면 토스로 간편하게 참가비를 내면 돼요.
                  </p>
                </div>
              </li>
              <li className="tm-landing-step">
                <span className="tm-landing-step-num" aria-label="3단계">3</span>
                <div>
                  <h3 className="tm-text-body-lg tm-landing-step-title">경기 후 서로 리뷰하기</h3>
                  <p className="tm-text-caption tm-landing-step-desc">
                    서로 매너·실력을 평가하면 실력 레이팅이 업데이트돼요.
                    쌓인 매너 점수로 신뢰할 수 있는 플레이어로 성장하세요.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="tm-landing-cta-banner" aria-labelledby="cta-heading">
          <div className="tm-landing-section-inner">
            <h2 id="cta-heading" className="tm-landing-cta-heading">지금 바로 시작하세요</h2>
            <p className="tm-landing-cta-sub">
              오늘도 전국 곳곳에서 새로운 매치가 열리고 있어요
            </p>
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/login">
              무료로 시작하기
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="tm-landing-footer" role="contentinfo">
        <div className="tm-landing-section-inner">
          <div className="tm-landing-footer-inner">
            <div className="tm-landing-footer-brand">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <BrandMark size={24} />
                <span className="tm-landing-brand">teameet</span>
              </span>
              <p className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-caption)' }}>
                AI 스포츠 매칭 플랫폼
              </p>
            </div>
            <nav className="tm-landing-footer-links" aria-label="하단 링크">
              <Link className="tm-landing-footer-link" href="/notices">공지사항</Link>
              <Link className="tm-landing-footer-link" href="/terms?document=terms">서비스 이용약관</Link>
              <Link className="tm-landing-footer-link" href="/terms?document=privacy">개인정보처리방침</Link>
              <Link className="tm-landing-footer-link" href="/terms?document=location">위치기반서비스 이용약관</Link>
              <Link className="tm-landing-footer-link" href="/terms?document=tournament-policy">대회 운영정책</Link>
              <Link className="tm-landing-footer-link" href="/terms?document=support">고객센터</Link>
            </nav>
          </div>
          <p className="tm-text-caption tm-landing-footer-copy">
            © 2026 teameet. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
