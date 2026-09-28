'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { stepState, viewTimelineProgress } from '@/lib/landing/landing-v4-motion';
import { LandingCtaLink, type LandingCtaId } from '../landing-cta-link';
import { useLandingV4MotionOn, useScrollFrame } from './landing-v4-motion-hooks';

const STEPS: ReadonlyArray<{ title: string; body: string; href: string; cta: LandingCtaId; link: string }> = [
  { title: '간편하게 가입하기', body: '소셜 계정이나 이메일로 가입하고, 휴대폰 인증까지 한 번에 마쳐요.', href: '/login', cta: 'step_signup', link: '무료로 가입하기' },
  { title: '근처 경기 찾아 신청', body: '모집 중인 팀 매치를 종목·지역으로 골라 신청해요.', href: '/team-matches', cta: 'step_browse_team_matches', link: '팀 매치 보기' },
  { title: '팀 꾸리고 대회까지', body: '팀을 만들거나, 모집 중인 대회에 참가해요.', href: '/tournaments', cta: 'step_browse_tournaments', link: '대회 둘러보기' },
];

/* 목록 윗변이 화면 80% 지점에 닿을 무렵부터 그리기 시작해 위쪽 20% 근처에서 다 그린다. */
const STEPS_RANGE = 'cover 20% cover 60%';

/** 3단계 — 스크롤한 만큼 연결선이 그려진다. 서버 HTML·모션 꺼짐은 선이 다 그려진 최종 상태다. */
export function LandingV4Steps() {
  const motionOn = useLandingV4MotionOn();
  const listRef = useRef<HTMLOListElement>(null);

  useScrollFrame(motionOn, () => {
    const list = listRef.current;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    const progress = viewTimelineProgress(rect.top, rect.height, window.innerHeight, STEPS_RANGE);
    list.querySelectorAll<HTMLElement>(':scope > li').forEach((item, k) => {
      const { line, reached } = stepState(progress, k);
      item.style.setProperty('--tm-landing-v4-line', line.toFixed(4));
      item.dataset.reached = String(reached);
    });
  });

  // 모션을 끄면 JS 가 넣은 진행값을 걷어 최종 상태(선 완성·단계 켜짐)로 돌린다.
  useEffect(() => {
    if (motionOn) return;
    listRef.current?.querySelectorAll<HTMLElement>(':scope > li').forEach((item) => {
      item.style.removeProperty('--tm-landing-v4-line');
      delete item.dataset.reached;
    });
  }, [motionOn]);

  return (
    <section id="how" className="tm-landing-section" aria-labelledby="how-heading">
      <div className="tm-landing-section-inner">
        <div className="tm-landing-section-header" data-reveal>
          <p className="tm-landing-section-kw">이용 방법</p>
          <h2 id="how-heading" className="tm-landing-section-title">세 단계면<br />바로 뛸 수 있어요</h2>
        </div>
        <ol ref={listRef} className="tm-landing-v4-steps" data-scroll={motionOn ? 'on' : undefined}>
          {STEPS.map((step, i) => (
            <li key={step.cta} className="tm-landing-v4-step" data-reveal style={{ '--i': i } as CSSProperties}>
              <span className="tm-landing-v4-step-no" aria-hidden="true">{i + 1}</span>
              {i < STEPS.length - 1 ? <span className="tm-landing-v4-step-line" aria-hidden="true"><i /></span> : null}
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <LandingCtaLink className="tm-landing-v4-step-link" href={step.href} cta={step.cta}>
                {step.link}
                <ArrowRight size={16} aria-hidden="true" />
              </LandingCtaLink>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
