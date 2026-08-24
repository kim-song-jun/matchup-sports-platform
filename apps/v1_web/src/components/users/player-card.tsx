'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { cssUrl } from '@/lib/assets';
import type { V1PlayerCard, V1PlayerCardStat } from '@/types/api';

/**
 * 선수 카드 (Task 155, 사용자 선택 A안).
 *
 * 원래 문제는 "기록이 없다"가 아니라 **"공개할 이유가 없다"**였다 -- 프로덕션 실측으로
 * 신원 연결 1,384건에 공개 동의 0건이다. 이 카드는 그 이유를 만들려고 존재한다.
 *
 * ## 이 컴포넌트가 지켜야 하는 것
 * - **잠긴 능력치에 숫자를 그리지 않는다.** 서버가 `value: null` 을 주면 자물쇠를 그린다.
 *   1경기 1골이 "슛 99"로 보이는 순간 카드 전체가 거짓말이 된다.
 * - **등급은 "잘하는 정도"가 아니라 "많이 뛴 정도"다.** 화면에도 그렇게 적는다 --
 *   실력 서열로 읽히면 하위 등급 사용자가 카드를 아예 안 쓰게 되고 설계가 실패한다.
 * - **총점이 null 이면 자리를 비우지 않고 "-" 를 그린다.** 0 을 쓰면 측정된 최저점처럼 보인다.
 */

const TIER_STYLE: Record<V1PlayerCard['tier'], { label: string; ring: string; glow: string }> = {
  // 등급별 색은 카드 테두리와 상단 글로우로만 쓴다. 배경 전체를 등급색으로 칠하면
  // 브론즈 카드가 눈에 띄게 초라해져 "안 쓰고 싶은 카드"가 된다.
  bronze: { label: '브론즈', ring: 'rgba(197, 132, 74, 0.55)', glow: 'rgba(197, 132, 74, 0.34)' },
  silver: { label: '실버', ring: 'rgba(176, 184, 193, 0.6)', glow: 'rgba(176, 184, 193, 0.34)' },
  gold: { label: '골드', ring: 'rgba(255, 195, 66, 0.62)', glow: 'rgba(255, 195, 66, 0.36)' },
  // 레전드는 금빛 계열이되 더 밝고 차분하게, 스페셜은 그 위에서 푸른빛으로 갈라진다 --
  // 둘 다 금색이면 30경기와 100경기가 화면에서 구분되지 않는다.
  legend: { label: '레전드', ring: 'rgba(246, 231, 174, 0.72)', glow: 'rgba(201, 162, 39, 0.4)' },
  special: { label: '스페셜', ring: 'rgba(49, 130, 246, 0.7)', glow: 'rgba(49, 130, 246, 0.42)' },
};

const POSITION_LABEL: Record<string, string> = {
  FW: '공격수',
  MF: '미드필더',
  DF: '수비수',
  GK: '골키퍼',
};

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

function StatCell({ stat }: { readonly stat: V1PlayerCardStat }) {
  const locked = !stat.unlocked || stat.value === null;
  return (
    <div
      className="tm-player-card-stat"
      data-locked={locked ? 'true' : undefined}
      // 스크린리더에는 "잠김"을 말로 전달한다 -- 자물쇠 아이콘만으로는 안 읽힌다.
      aria-label={locked ? `${stat.label} 잠김` : `${stat.label} ${stat.value}점`}
    >
      <span className="tm-player-card-stat-value" aria-hidden="true">
        {locked ? <Lock size={15} strokeWidth={2.4} /> : stat.value}
      </span>
      <span className="tm-player-card-stat-meta" aria-hidden="true">
        <span className="tm-player-card-stat-code">{stat.code}</span>
        <span className="tm-player-card-stat-label">{stat.label}</span>
      </span>
    </div>
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
  const tier = TIER_STYLE[card.tier];
  const hint = unlockHint(card);
  const initial = displayName.trim().charAt(0) || '?';
  const needsConsent = card.nextUnlock?.reason.type === 'consent';

  return (
    <section
      className="tm-player-card"
      style={{ '--tm-card-ring': tier.ring, '--tm-card-glow': tier.glow } as React.CSSProperties}
      aria-label={`${displayName} 선수 카드`}
    >
      <div className="tm-player-card-top">
        <div className="tm-player-card-ovr">
          <div className="tm-player-card-ovr-value">{card.overall ?? '–'}</div>
          <div className="tm-player-card-ovr-rule" aria-hidden="true" />
          <div className="tm-player-card-ovr-pos">{card.position ?? '–'}</div>
        </div>

        {/* 사진이 카드의 주인공이다. 없으면 이니셜로 대체하되, 본인에게는 올리라고 권한다 --
            사진이 있는 카드와 없는 카드는 공유하고 싶은 정도가 크게 다르다. */}
        <div className="tm-player-card-photo" aria-hidden="true">
          {profileImageUrl ? (
            <div className="tm-player-card-photo-img" style={{ backgroundImage: cssUrl(profileImageUrl) }} />
          ) : (
            <div className="tm-player-card-photo-fallback">{initial}</div>
          )}
        </div>
      </div>

      <div className="tm-player-card-id">
        {/* 등번호를 이름 앞에 둔다. 왼쪽 큰 숫자는 총점이라, 그것만 있으면 등번호로
            오해된다 -- 실제 유니폼 번호는 따로 보여야 "내 카드"로 읽힌다. */}
        <div className="tm-player-card-name">
          {card.jerseyNumber !== null ? (
            <span className="tm-player-card-jersey" aria-label={`등번호 ${card.jerseyNumber}번`}>
              {card.jerseyNumber}
            </span>
          ) : null}
          {displayName}
        </div>
        <div className="tm-player-card-sub">
          {card.position ? POSITION_LABEL[card.position] : '포지션 미정'}
          {' · '}
          <span title="많이 뛸수록 올라가요">{tier.label}</span>
          {' · '}
          {card.appearances}경기
        </div>
        {teamName ? <div className="tm-player-card-club">{teamName}</div> : null}
      </div>

      <div className="tm-player-card-stats">
        {card.stats.map((stat) => (
          <StatCell key={stat.code} stat={stat} />
        ))}
      </div>

      {/* 등급의 의미를 카드 안에서 못 박는다. 이 문장이 없으면 브론즈가 "실력 하위"로 읽힌다. */}
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
    </section>
  );
}
