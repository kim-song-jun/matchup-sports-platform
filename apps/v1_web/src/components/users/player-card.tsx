'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarCheck, Clock, HeartHandshake, Lock, Sparkles, Target, Zap } from 'lucide-react';
import { cssUrl } from '@/lib/assets';
import type { V1PlayerCard, V1PlayerCardStat } from '@/types/api';

/**
 * 선수 카드 (Task 155 — 사용자 확정 목업 이식).
 *
 * 원래 문제는 "기록이 없다"가 아니라 **"공개할 이유가 없다"**였다 -- 프로덕션 실측으로
 * 신원 연결 1,384건에 공개 동의 0건이다. 이 카드는 그 이유를 만들려고 존재한다.
 *
 * ## 이 컴포넌트가 지켜야 하는 것
 * - **잠긴 능력치에 숫자를 그리지 않는다.** 서버가 `value: null` 을 주면 자물쇠를 그린다.
 * - **등급은 "잘하는 정도"가 아니라 "많이 뛴 정도"다.** 화면에도 그렇게 적는다.
 * - **총점이 null 이면 0 을 쓰지 않는다.** "NEW" 로 값이 없음을 말한다.
 *
 * ## 구조 (목업에서 확정된 것)
 * - **카드는 소장품이다.** 실루엣으로 잘린 면(앞/뒤) 안에는 총점·이름·능력치·발치만 두고,
 *   안내·진행도·CTA·공유는 전부 카드 **아래**에 둔다 -- 앞면에 산식을 적으면 영수증이 된다.
 * - **형태·재질·엠블럼은 전부 CSS 가 그린다.** 컴포넌트는 data-tier / data-shape /
 *   data-flipped 만 내보낸다. 티어 5단계 × 형태 2벌의 실루엣·토큰은 `globals.css` 에 있다.
 * - **카드 면의 글자는 영어로 통일한다**(gitfut/FUT 실물 문법 -- 값 + 3글자 코드).
 *   한글 뜻과 산식은 뒷면이 푼다.
 */

const TIER_LABEL: Record<V1PlayerCard['tier'], string> = {
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
  legend: '레전드',
  special: '스페셜',
};

const POSITION_LABEL: Record<string, string> = {
  FW: '공격수',
  MF: '미드필더',
  DF: '수비수',
  GK: '골키퍼',
};

/** 뒷면 산식 -- 서버 산식(`player-card.ts`)의 요약. 계수가 바뀌면 여기도 같이 바뀌어야 한다. */
const STAT_BACK: Record<
  V1PlayerCardStat['code'],
  { icon: typeof Target; formula: string; tag: string }
> = {
  SHO: { icon: Target, formula: '30 + 골÷경기 × 55', tag: '골 결정력' },
  PAS: { icon: Zap, formula: '30 + 도움÷경기 × 60', tag: '찬스 메이킹' },
  APP: { icon: CalendarCheck, formula: '35 + 경기 × 2.2 + 선발 × 15', tag: '성실 출석' },
  SKI: { icon: Sparkles, formula: '후기 평균 → 39~99', tag: '탄탄한 기본기' },
  MAN: { icon: HeartHandshake, formula: '후기 평균 → 39~99', tag: '매너 플레이' },
  PUN: { icon: Clock, formula: '후기 평균 → 39~99', tag: '시간 약속' },
};

function lockReasonText(reason: NonNullable<V1PlayerCardStat['lockedBy']>): string {
  if (reason.type === 'consent') return '기록 공개 필요';
  if (reason.type === 'appearances') return `${reason.remaining}경기 더`;
  return `후기 ${reason.remaining}개 더`;
}

function unlockHint(card: V1PlayerCard): string | null {
  if (card.nextUnlock === null) return null;
  const { reason } = card.nextUnlock;
  if (reason.type === 'consent') return '기록 공개를 켜면 골·도움·출전이 한 번에 열려요';
  if (reason.type === 'appearances') {
    // 아직 한 경기도 안 뛴 사람에게 "1경기 더" 는 틀린 말이다 -- 더 뛸 앞선 경기가 없다.
    if (card.appearances === 0) return '첫 경기를 뛰면 기록이 쌓이기 시작해요';
    return `${reason.remaining}경기 더 뛰면 열려요`;
  }
  return `후기 ${reason.remaining}개를 더 받으면 열려요`;
}

/**
 * 티어 엠블럼 -- 롤 랭크 배지처럼 **모양 자체가** 등급을 말한다.
 * 방패(브론즈) → 날개(실버) → 왕관 밴드(골드) → 광휘 든 육각(레전드·스페셜).
 * 그라디언트 id 는 useId 로 인스턴스마다 갈라 한 페이지에 카드가 둘 떠도 안 섞인다.
 */
function TierCrest({ tier }: { readonly tier: V1PlayerCard['tier'] }) {
  const gid = `tm-crest-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const stops: Record<V1PlayerCard['tier'], [string, string]> = {
    bronze: ['#e6b98a', '#8a5528'],
    silver: ['#f4f7fb', '#7e8b9d'],
    gold: ['#ffe9a8', '#c08f1c'],
    legend: ['#f8ecc0', '#a8801a'],
    special: ['#dcf2ff', '#2f7fe0'],
  };
  const [from, to] = stops[tier];
  const shield = 'M12 3.4 L20 6.6 V13.2 C20 17.6 12 21.4 12 21.4 C12 21.4 4 17.6 4 13.2 V6.6 Z';
  const hex = 'M12 1.6 L20.5 6.4 V15.6 L12 22.4 L3.5 15.6 V6.4 Z';
  return (
    <span className="tm-pcard-crest" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        {tier === 'legend' || tier === 'special' ? (
          <>
            <path d={hex} fill={`url(#${gid})`} stroke="rgba(255,255,255,.35)" strokeWidth=".7" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <rect
                key={deg}
                x="11.4"
                y="-1.6"
                width="1.2"
                height="3.4"
                rx=".6"
                fill={`url(#${gid})`}
                opacity=".55"
                transform={`rotate(${deg} 12 12)`}
              />
            ))}
            <path
              d="M12 7.4 L13.5 11 L17.2 11 L14.2 13.3 L15.4 16.9 L12 14.7 L8.6 16.9 L9.8 13.3 L6.8 11 L10.5 11 Z"
              fill="#fff"
              opacity=".9"
            />
          </>
        ) : (
          <>
            <path d={shield} fill={`url(#${gid})`} stroke="rgba(255,255,255,.35)" strokeWidth=".7" />
            {tier === 'bronze' ? <circle cx="12" cy="11.4" r="2.4" fill="#fff" opacity=".55" /> : null}
            {tier === 'silver' || tier === 'gold' ? (
              <>
                <path d="M4 9.2 L0.6 11 L4 12.8 Z" fill={`url(#${gid})`} opacity=".85" />
                <path d="M20 9.2 L23.4 11 L20 12.8 Z" fill={`url(#${gid})`} opacity=".85" />
              </>
            ) : null}
            {tier === 'gold' ? (
              <path d="M7.4 4.2 L9.6 1.4 L12 3.2 L14.4 1.4 L16.6 4.2 Z" fill={`url(#${gid})`} />
            ) : null}
          </>
        )}
      </svg>
    </span>
  );
}

function StatCell({ stat }: { readonly stat: V1PlayerCardStat }) {
  const locked = !stat.unlocked || stat.value === null;
  return (
    <div
      className="tm-player-card-stat"
      data-locked={locked ? 'true' : undefined}
      // 스크린리더에는 한글 뜻과 "잠김"을 말로 전달한다 -- 카드 면의 영어 코드만으로는 안 읽힌다.
      aria-label={locked ? `${stat.label} 잠김` : `${stat.label} ${stat.value}점`}
    >
      <span className="tm-player-card-stat-value" aria-hidden="true">
        {locked ? <Lock size={13} strokeWidth={2.4} /> : stat.value}
      </span>
      <span className="tm-player-card-stat-code" aria-hidden="true">
        {stat.code}
      </span>
    </div>
  );
}

/** 앞면 능력치를 기록(왼쪽)·후기(오른쪽) 두 열로 나누고 가운데 헤어라인을 세운다. */
function splitStats(stats: readonly V1PlayerCardStat[]) {
  const left = stats.filter((s) => s.code === 'SHO' || s.code === 'PAS' || s.code === 'APP');
  const right = stats.filter((s) => s.code === 'SKI' || s.code === 'MAN' || s.code === 'PUN');
  return { left, right };
}

/** 뒷면 성향 태그 -- 열린 능력치 중 값이 큰 순서로 최대 2개 + 티어·경기수. */
function personaTags(card: V1PlayerCard): { text: string; accent: boolean }[] {
  const top = card.stats
    .filter((s) => s.unlocked && s.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 2)
    .map((s) => ({ text: STAT_BACK[s.code].tag, accent: false }));
  const base = [
    { text: `${TIER_LABEL[card.tier]} 카드`, accent: true },
    { text: `${card.appearances}경기`, accent: false },
  ];
  if (top.length === 0) return [...base, { text: '기록 모으는 중', accent: false }];
  return [...base, ...top];
}

function backSummary(card: V1PlayerCard): ReactNode {
  const pos = card.position ? POSITION_LABEL[card.position] : '선수';
  if (card.appearances === 0) return <>아직 첫 경기를 기다리는 선수예요.</>;
  const best = card.stats
    .filter((s) => s.unlocked && s.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return (
    <>
      <b>{card.appearances}경기</b>를 뛴 <b>{pos}</b>
      {best ? (
        <>
          . 지금 가장 높은 항목은 <b>{best.label}</b>이에요.
        </>
      ) : (
        <>예요.</>
      )}
    </>
  );
}

export function PlayerCard({
  card,
  displayName,
  profileImageUrl,
  teamName,
  isOwner,
  shareHref,
}: {
  readonly card: V1PlayerCard;
  readonly displayName: string;
  readonly profileImageUrl: string | null;
  readonly teamName: string | null;
  /** 본인이 보는 경우에만 "공개하기" 같은 행동을 권한다 -- 남의 카드에서 권하면 이상하다. */
  readonly isOwner: boolean;
  /**
   * 공유 화면 경로. 주면 카드 아래에 공유 입구가 붙는다.
   * 공유 화면 자신은 이 값을 주지 않는다 -- 자기 자신으로 가는 버튼은 의미가 없다.
   */
  readonly shareHref?: string;
}) {
  const hint = unlockHint(card);
  const initial = displayName.trim().charAt(0) || '?';
  const needsConsent = card.nextUnlock?.reason.type === 'consent';
  const { left, right } = splitStats(card.stats);
  const [flipped, setFlipped] = useState(false);

  /**
   * 포인터 추종 기울기 + 글레어 (목업 확정 인터랙션).
   * - 마우스: 커서 위치를 각도로 바꿔 카드가 손을 따라 돈다(±5/±6도 -- 더 크면 안 읽힌다).
   * - 터치: 기울기는 CSS 가 끈다(손가락에 가려 안 보인다). 누름 반응만 남는다.
   * - prefers-reduced-motion: 아예 걸지 않는다.
   * 상태를 리액트 state 로 두면 pointermove 마다 리렌더가 나므로 CSS 변수를 직접 만진다.
   */
  const sceneRef = useRef<HTMLDivElement>(null);
  const tiltEnabled = useRef(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    tiltEnabled.current =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  function resetTilt() {
    const el = sceneRef.current;
    if (!el) return;
    el.dataset.active = 'false';
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--lift', '0px');
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = sceneRef.current;
    if (!el || !tiltEnabled.current) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.dataset.active = 'true';
    el.style.setProperty('--ry', `${((px - 0.5) * 12).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${((0.5 - py) * 10).toFixed(2)}deg`);
    el.style.setProperty('--lift', '-10px');
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  }

  const face = (
    <div className="tm-pcard-face">
      <div className="tm-pcard-fx" aria-hidden="true" />
      <div className="tm-pcard-crest-bg" aria-hidden="true" />

      {/* 선수 렌더 -- 원형 아바타가 아니라 아래로 잘려 사라지는 큰 컷아웃. */}
      <div className="tm-pcard-render" aria-hidden="true">
        {profileImageUrl ? (
          <div className="tm-pcard-render-photo" style={{ backgroundImage: cssUrl(profileImageUrl) }} />
        ) : (
          <div className="tm-pcard-render-img">{initial}</div>
        )}
      </div>

      <div className="tm-player-card-top">
        {/* 왼쪽 세로 열: 총점 → 구분선 → 포지션 → 등급 → 배지 스택.
            이 열이 실제 FUT 카드의 서명이다 -- 없으면 색을 맞춰도 피파로 안 읽힌다. */}
        <div className="tm-player-card-ovr">
          <div
            className="tm-player-card-ovr-value"
            data-empty={card.overall === null ? 'true' : undefined}
          >
            {card.overall ?? 'NEW'}
          </div>
          <div className="tm-player-card-ovr-rule" aria-hidden="true" />
          {card.position ? <div className="tm-player-card-ovr-pos">{card.position}</div> : null}
          <div className="tm-pcard-tier-tag" aria-hidden="true">
            {card.tier.toUpperCase()}
          </div>
          <div className="tm-pcard-badges">
            <TierCrest tier={card.tier} />
            <span className="tm-pcard-badge" aria-hidden="true">
              <span className="tm-pcard-badge-mark" />
            </span>
          </div>
        </div>
      </div>

      <div className="tm-player-card-name">
        {card.jerseyNumber !== null ? (
          <span className="tm-player-card-jersey" aria-label={`등번호 ${card.jerseyNumber}번`}>
            <span className="tm-pcard-no-lbl" aria-hidden="true">
              no.
            </span>
            <span className="tm-pcard-no-num" aria-hidden="true">
              {card.jerseyNumber}
            </span>
          </span>
        ) : null}
        {displayName}
      </div>

      <div className="tm-player-card-stats">
        <StatCell stat={left[0]} />
        <div className="tm-pcard-stats-div" aria-hidden="true" />
        <StatCell stat={right[0]} />
        <StatCell stat={left[1]} />
        <StatCell stat={right[1]} />
        <StatCell stat={left[2]} />
        <StatCell stat={right[2]} />
      </div>

      <div className="tm-pcard-meta">
        <span className="tm-pcard-meta-line">
          {teamName ? (
            <>
              <b>{teamName}</b>
              <i aria-hidden="true" />
            </>
          ) : null}
          <span>{card.appearances}경기</span>
        </span>
        <span className="tm-pcard-brand" aria-hidden="true">
          <em />
          TEAMEET
        </span>
      </div>
    </div>
  );

  const back = (
    <div className="tm-pcard-backface">
      <div className="tm-pcard-back-h">
        <em aria-hidden="true" />
        {displayName} · 어떤 선수인가
      </div>

      <div className="tm-pcard-back-sum">{backSummary(card)}</div>

      <div className="tm-pcard-back-sec">성향</div>
      <div className="tm-pcard-back-tags">
        {personaTags(card).map((tag) => (
          <span key={tag.text} className="tm-pcard-tag" data-tone={tag.accent ? 'accent' : undefined}>
            {tag.text}
          </span>
        ))}
      </div>

      <div className="tm-pcard-back-sec">이 숫자가 나온 곳</div>
      <div className="tm-pcard-back-rows">
        {card.stats.map((stat) => {
          const meta = STAT_BACK[stat.code];
          const Icon = meta.icon;
          const locked = !stat.unlocked || stat.value === null;
          return (
            <div key={stat.code} className="tm-pcard-brow">
              <Icon aria-hidden="true" />
              <b data-locked={locked ? 'true' : undefined}>{locked ? '—' : stat.value}</b>
              <span>
                {stat.label} ·{' '}
                {locked && stat.lockedBy ? `잠김 (${lockReasonText(stat.lockedBy)})` : meta.formula}
              </span>
            </div>
          );
        })}
      </div>

      <div className="tm-pcard-back-eq">
        총점은 <b>포지션 가중 평균</b>이에요. 잠긴 능력치는 0 이 아니라 <b>평균에서 빠져요</b>.
      </div>
    </div>
  );

  return (
    <section
      className="tm-player-card"
      // 형태·재질·엠블럼은 전부 CSS 가 그린다 -- 컴포넌트 로직에 티어/모양 분기를 넣으면
      // 새 티어·모양을 더할 때마다 이 파일을 고쳐야 한다.
      data-tier={card.tier}
      data-shape={card.shape ?? 'rect'}
      data-flipped={flipped ? 'true' : undefined}
      aria-label={`${displayName} 선수 카드`}
    >
      <div
        ref={sceneRef}
        className="tm-pcard-scene"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          resetTilt();
          const el = sceneRef.current;
          if (el) el.dataset.press = 'false';
        }}
        onPointerDown={() => {
          const el = sceneRef.current;
          if (el) el.dataset.press = 'true';
        }}
        onPointerUp={() => {
          const el = sceneRef.current;
          if (el) el.dataset.press = 'false';
        }}
      >
        <div className="tm-pcard-flip">
          <div className="tm-pcard-side" data-side="front" aria-hidden={flipped}>
            <div className="tm-pcard-frame">
              {face}
              <div className="tm-pcard-glare" aria-hidden="true" />
            </div>
          </div>
          <div className="tm-pcard-side" data-side="back" aria-hidden={!flipped}>
            <div className="tm-pcard-frame">{back}</div>
          </div>
        </div>
      </div>

      <div className="tm-pcard-below">
        {/* 뒤집기는 버튼으로만 -- 카드 자체를 누르게 하면 기울기·공유 링크와 충돌한다. */}
        <button
          type="button"
          className="tm-pcard-flipbtn"
          onClick={() => setFlipped((v) => !v)}
        >
          {flipped ? '앞면 보기 ↺' : '카드 뒤집기 — 숫자의 근거 보기 ↻'}
        </button>

        <div className="tm-player-card-sub">
          {card.position ? POSITION_LABEL[card.position] : '포지션 미정'}
          {' · '}
          <span title="많이 뛸수록 올라가요">{TIER_LABEL[card.tier]}</span>
          {' · '}
          {card.appearances}경기
        </div>

        {/* 등급의 의미를 못 박는다. 이 문장이 없으면 브론즈가 "실력 하위"로 읽힌다. */}
        <div className="tm-player-card-tier-note">등급은 실력이 아니라 뛴 경기 수로 올라가요</div>

        {hint ? (
          <div className="tm-player-card-progress">
            <div className="tm-player-card-progress-text">{hint}</div>
            <div className="tm-player-card-progress-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((card.unlockedCount / card.stats.length) * 100)}%` }} />
            </div>
            <div className="tm-player-card-progress-count">
              {card.unlockedCount} / {card.stats.length} 열림
            </div>
          </div>
        ) : null}

        {isOwner && needsConsent ? (
          <Link href="/my/settings/record-consent" className="tm-player-card-cta">
            기록 공개하고 3개 열기
          </Link>
        ) : null}

        {/* 공유 입구. 잠긴 게 많아도 막지 않는다 -- 자랑할지 말지는 본인이 정한다. */}
        {shareHref ? (
          <Link href={shareHref} className="tm-player-card-share-link">
            카드 공유하기
          </Link>
        ) : null}
      </div>
    </section>
  );
}
