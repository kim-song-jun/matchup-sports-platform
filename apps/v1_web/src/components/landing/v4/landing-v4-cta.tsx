'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { viewTimelineProgress } from '@/lib/landing/landing-v4-motion';
import { LandingCtaLink } from '../landing-cta-link';
import { supportsViewTimeline, useLandingV4MotionOn, useScrollFrame } from './landing-v4-motion-hooks';

/** CSS 의 `animation-range` 와 같은 값이어야 한다(landing-v4.css .tm-landing-v4-cta). */
const CTA_RANGE = 'entry 0% entry 100%';
const MAGNET_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
const MAGNET_RADIUS = 140;

const HEADLINE = [['같이', '뛸', '사람,'], ['팀밋에서', '만나요']] as const;

const clampPx = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v)).toFixed(1);

/**
 * 마지막 CTA — 둥근 카드로 들어와 스크롤할수록 화면 가득 펼쳐진다(--tm-landing-v4-k 0→1).
 * 진행값의 초깃값이 1 이라 서버 HTML·모션 꺼짐은 펼쳐진 최종 상태다.
 */
export function LandingV4Cta() {
  const motionOn = useLandingV4MotionOn();
  const sectionRef = useRef<HTMLElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const byScript = motionOn && supportsViewTimeline() === false;

  useScrollFrame(byScript, () => {
    const section = sectionRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    section.style.setProperty('--tm-landing-v4-k', viewTimelineProgress(rect.top, rect.height, window.innerHeight, CTA_RANGE).toFixed(4));
  });
  useEffect(() => {
    if (!byScript) sectionRef.current?.style.removeProperty('--tm-landing-v4-k');
  }, [byScript]);

  // 주 버튼 자석 — 데스크톱 정밀 포인터에서만 커서 쪽으로 몇 px 끌려온다.
  useEffect(() => {
    const zone = zoneRef.current;
    const button = zone?.querySelector<HTMLElement>('.tm-landing-v4-magnet');
    if (!motionOn || !zone || !button || typeof window.matchMedia !== 'function') return;
    const fine = window.matchMedia(MAGNET_QUERY);
    const reset = () => {
      button.style.removeProperty('translate');
      delete button.dataset.pulling;
    };
    const onMove = (event: PointerEvent) => {
      if (!fine.matches) return reset();
      const r = button.getBoundingClientRect();
      const dx = event.clientX - (r.left + r.width / 2);
      const dy = event.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) > MAGNET_RADIUS) return reset();
      button.dataset.pulling = 'true';
      button.style.translate = `${clampPx(dx * 0.28, 14)}px ${clampPx(dy * 0.35, 10)}px`;
    };
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerleave', reset);
    return () => {
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerleave', reset);
      reset();
    };
  }, [motionOn]);

  let order = 0;
  return (
    <section ref={sectionRef} id="start" className="tm-landing-v4-cta" aria-labelledby="cta-heading">
      <div className="tm-landing-v4-cta-box">
        <span className="tm-landing-v4-cta-glow" aria-hidden="true" />
        <Image className="tm-landing-v4-cta-illu" data-pos="l" src="/illustrations/journey-done-640.webp" alt="" width={640} height={640} sizes="180px" />
        <Image className="tm-landing-v4-cta-illu" data-pos="r" src="/illustrations/sport-soccer-hero-640.webp" alt="" width={640} height={640} sizes="150px" />
        <div className="tm-landing-v4-cta-inner" data-reveal="words">
          <h2 id="cta-heading" className="tm-landing-v4-cta-title">
            {HEADLINE.map((line) => (
              <span key={line.join(' ')} className="tm-landing-v4-line">
                {line.map((word, i) => (
                  <span key={word}>
                    {i > 0 ? ' ' : null}
                    <span className="tm-landing-v4-cta-word" style={{ '--tm-landing-v4-w': order++ } as CSSProperties}>
                      <span>{word}</span>
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </h2>
          <p className="tm-landing-v4-cta-sub">이번 주 경기도, 다가오는 대회도 팀밋에 있어요.</p>
          <div ref={zoneRef} className="tm-landing-v4-cta-actions" data-mobile-cta-hide>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary tm-landing-v4-magnet" href="/login" cta="bottom_signup">
              무료로 시작하기
              <ArrowRight className="tm-landing-btn-arrow" size={18} aria-hidden="true" />
            </LandingCtaLink>
            <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/team-matches" cta="bottom_browse_team_matches">
              경기 둘러보기
            </LandingCtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}
