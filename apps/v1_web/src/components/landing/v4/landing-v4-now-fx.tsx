'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import { publicAssetPath } from '@/lib/assets';
import { countAt, viewTimelineProgress } from '@/lib/landing/landing-v4-motion';
import type { LandingLiveTeamMatch } from '@/lib/landing/landing-v4-data';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { supportsViewTimeline, useLandingV4MotionOn, useScrollFrame } from './landing-v4-motion-hooks';

const COUNT_MS = 1500;

/**
 * 숫자 카운트업. 서버 HTML·모션 꺼짐은 최종값이고, 화면 아래에 있다가 들어올 때만 0 부터 센다.
 * 화면 낭독기는 옆의 sr-only 최종값만 읽는다.
 */
export function LandingV4Count({ value, order }: { value: number; order: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionOn = useLandingV4MotionOn();

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionOn || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.textContent = '0';
    let frame = 0;
    const duration = COUNT_MS + order * 150;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          el.textContent = String(countAt(value, now - start, duration));
          frame = now - start < duration ? window.requestAnimationFrame(step) : 0;
        };
        frame = window.requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [motionOn, value, order]);

  return (
    <>
      <span ref={ref} aria-hidden="true">{value}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}

/** CSS 의 `animation-range` 와 같은 값이어야 한다(landing-v4.css .tm-landing-v4-tcard-media). */
const PARALLAX_RANGE = 'cover 0% cover 100%';

/** 대회 카드 이미지 패럴랙스 — view() 를 지원하면 CSS 가, 아니면 여기서 같은 진행값을 넣는다. */
export function LandingV4Parallax({ src, illustration }: { src: string; illustration: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionOn = useLandingV4MotionOn();
  const byScript = motionOn && supportsViewTimeline() === false;

  useScrollFrame(byScript, () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    el.style.setProperty('--tm-landing-v4-k', viewTimelineProgress(rect.top, rect.height, window.innerHeight, PARALLAX_RANGE).toFixed(4));
  });
  useEffect(() => {
    if (!byScript) ref.current?.style.removeProperty('--tm-landing-v4-k');
  }, [byScript]);

  return (
    <span ref={ref} className="tm-landing-v4-tcard-media" data-kind={illustration ? 'illustration' : 'photo'}>
      <Image src={publicAssetPath(src)} alt="" fill sizes="(min-width: 1024px) 720px, 100vw" unoptimized={!illustration} />
    </span>
  );
}

/** 흐르는 팀 매치 카드. 끊김 없이 돌리려고 복제한 카드는 탭 순서·보조기술에서 뺀다.
 * 칩 줄은 카드 맨 아래에 늘 있다 — 한 줄에 선 카드 높이가 같아서, 칩이 없는 카드만 아래가 비어 보이지 않게. */
export function LandingV4MatchCard({ match, clone }: { match: LandingLiveTeamMatch; clone?: boolean }) {
  const where = match.place ?? match.region;
  const tags = [match.formatText, match.levelLabel].filter(Boolean).join(' ');
  return (
    <li aria-hidden={clone ? 'true' : undefined}>
      <Link
        className="tm-landing-v4-mcard"
        href={match.href}
        tabIndex={clone ? -1 : undefined}
        onClick={() => trackEvent('landing_cta_click', { cta: 'live_open_team_match' })}
      >
        <span className="tm-landing-v4-mcard-logos">
          <TeamAvatar seed={match.hostName} name={match.hostName} logoUrl={match.hostLogoUrl} size="sm" />
          <TeamAvatar seed={match.opponentName} name={match.opponentName} logoUrl={match.opponentLogoUrl} size="sm" />
        </span>
        <b>{match.hostName} <span className="tm-landing-v4-mcard-vs">vs</span> {match.opponentName}</b>
        <small>{[where, match.dateTimeText].filter(Boolean).join(' · ')}</small>
        <span className="tm-landing-v4-mcard-tags">
          {match.isLeague ? <span className="tm-landing-v4-mtag" data-tone="blue">리그</span> : null}
          {tags || !match.isLeague ? <span className="tm-landing-v4-mtag" data-tone="grey">{tags || '팀 매치'}</span> : null}
        </span>
      </Link>
    </li>
  );
}
