import type { CSSProperties } from 'react';
import { ArrowRight, Eye, Handshake, UserRound } from 'lucide-react';
import { LandingCtaLink } from '../landing-cta-link';

/* 평가 항목은 v1_api submit-review.dto 의 네 가지 그대로다. 막대 길이는 예시라 숫자를 싣지 않는다. */
const RATE_ROWS = [
  { label: '실력', fill: 0.78 },
  { label: '매너', fill: 0.94 },
  { label: '시간약속', fill: 1 },
  { label: '안전', fill: 0.9 },
] as const;

/* 공개 정책(reviews.service · review-visibility): 작성자 닉네임 공개, 서로 남기면 함께 공개, 아니면 일정 시간 뒤 공개 */
const POLICY = [
  { Icon: UserRound, text: '평가를 남긴 사람의 닉네임이 함께 보여요' },
  { Icon: Handshake, text: '서로 평가를 남기면 그때 함께 공개돼요' },
  { Icon: Eye, text: '한쪽만 남겼다면 일정 시간이 지난 뒤 공개돼요' },
] as const;

/** 전→결 다리(신뢰) — 노쇼·비매너 걱정을 평가 제도로 푼다. "익명" 이라는 말은 정책과 반대라 쓰지 않는다. */
export function LandingV2Trust() {
  return (
    <section id="trust" className="tm-landing-section" aria-labelledby="v2-trust-heading">
      <div className="tm-landing-section-inner tm-landing-v2-trust">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">신뢰</p>
          <h2 id="v2-trust-heading" className="tm-landing-section-title">다시 같이 뛰고 싶은 사람,<br />미리 알 수 있어요</h2>
          <p className="tm-landing-section-sub">
            경기가 끝나면 같이 뛴 사람끼리 실력·매너·시간약속·안전을 평가해요. 쌓인 평가는 매너 점수가 되고, 팀도 같은 방식으로 신뢰가 쌓여요.
          </p>
        </div>
        <div className="tm-landing-v2-trust-card" data-reveal style={{ '--i': 1 } as CSSProperties}>
          <div className="tm-landing-v2-trust-head">
            <h3>경기 후 상호평가</h3>
            <span className="tm-landing-v2-example">예시 화면</span>
          </div>
          <ul className="tm-landing-v2-rate">
            {RATE_ROWS.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <span className="tm-landing-v2-rate-track" aria-hidden="true">
                  <i style={{ '--fill': row.fill } as CSSProperties} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="tm-landing-v2-trust-card" data-reveal style={{ '--i': 2 } as CSSProperties}>
          <div className="tm-landing-v2-trust-head">
            <h3>평가는 이렇게 공개돼요</h3>
          </div>
          <ul className="tm-landing-v2-policy">
            {POLICY.map(({ Icon, text }) => (
              <li key={text}>
                <span className="tm-landing-v2-policy-icon" aria-hidden="true"><Icon size={18} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** 결 — 이야기의 첫 문장("준비가 더 힘들었죠?")으로 되돌아와 닫는다. 늘 어두운 지면은 A안 배너 스타일을 그대로 쓴다. */
export function LandingV2CtaBanner() {
  return (
    <section className="tm-landing-cta-banner" aria-labelledby="v2-cta-heading" data-mobile-cta-hide>
      <div className="tm-landing-section-inner" data-reveal>
        <h2 id="v2-cta-heading" className="tm-landing-cta-heading">이번 주말 경기,<br />준비는 팀밋에 맡기세요</h2>
        <p className="tm-landing-cta-sub">매치와 대회는 가입하지 않아도 먼저 둘러볼 수 있어요.</p>
        <div className="tm-landing-v2-hero-actions">
          <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="bottom_signup" variant="v2">
            무료로 시작하기
            <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
          </LandingCtaLink>
          <LandingCtaLink className="tm-btn tm-btn-lg tm-landing-btn-on-ink" href="/tournaments" cta="bottom_browse_tournaments" variant="v2">
            대회 둘러보기
          </LandingCtaLink>
        </div>
      </div>
    </section>
  );
}
