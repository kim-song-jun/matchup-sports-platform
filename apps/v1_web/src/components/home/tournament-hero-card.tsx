'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { FeaturedSlotSkeleton } from './featured-slot-skeleton';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { getSortedTournamentPromos, resolveTournamentImage } from '@/lib/tournament-promo';
import { withFromPath } from '@/lib/session-storage';
import { resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import type { V1TournamentListItem } from '@/types/api';

/**
 * 홈 "오늘의 추천"의 대회 히어로.
 * 매치 히어로(FeaturedMatchCard)와 동일한 풀폭 미디어+오버레이 비중으로 모집중 대회를 노출한다.
 * 관리자가 홈 홍보를 켠 open 대회를 우선순위 순으로 모두 노출한다.
 */
export function TournamentHeroCard({ items, loading = false }: { items: V1TournamentListItem[]; loading?: boolean }) {
  const [, refreshClock] = useState(0);
  // 목록이 늦게 도착하거나 바뀌어도 mount 시각이 아닌 현재 시각으로 판정한다.
  const now = Date.now();
  const featuredCards = getSortedTournamentPromos(items, 'home').map((featured) => {
    const deadline = featured.registrationDeadlineAt ? new Date(featured.registrationDeadlineAt).getTime() : null;
    const scheduledAt = featured.scheduledAt ? new Date(featured.scheduledAt).getTime() : null;
    const registrationBlocked = featured.teamCount === undefined
      // open 홍보 목록의 정규 리그는 정원이 없다. 숫자를 채우지 않고 리그의 마감 게이트만 적용한다.
      ? featured.kind !== 'regular_league' || deadline === null || !Number.isFinite(deadline) || deadline < now
      : resolveTournamentRegistrationBlock({ ...featured, teamCount: featured.teamCount }, new Date(now)) !== null;
    // 캠페인 링크는 일반 신청 게이트보다 엄격하다: 시작·마감 순간부터 접수를 닫는다.
    const campaignBlocked = Boolean(featured.campaignSlug) && (
      (scheduledAt !== null && scheduledAt <= now)
      || (deadline !== null && (!Number.isFinite(deadline) || deadline <= now))
    );
    return { featured, deadline, scheduledAt, registrationBlocked: registrationBlocked || campaignBlocked };
  });
  const hasUpcomingGate = featuredCards.some(({ featured, deadline, scheduledAt, registrationBlocked }) =>
    !registrationBlocked && (
      (deadline !== null && Number.isFinite(deadline) && deadline >= now)
      || (Boolean(featured.campaignSlug) && scheduledAt !== null && Number.isFinite(scheduledAt) && scheduledAt > now)
    ));

  useEffect(() => {
    if (loading || !hasUpcomingGate) return;
    // 캠페인 페이지와 같은 1분 갱신 주기다. 닫힌 카드와 loading에는 타이머를 남기지 않는다.
    const timer = window.setInterval(() => refreshClock((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [hasUpcomingGate, loading]);

  if (loading) {
    // 자리표시 뼈대는 추천 매치 슬롯과 공유한다 — 각자 만들면 한쪽만 실제 카드와 어긋나고
    // 그 차이가 그대로 레이아웃 이동이 된다(그 사고를 두 번 냈다).
    return <FeaturedSlotSkeleton eyebrow="상금 대회 · 모집 중" title="추천 대회를 가져오고 있어요" />;
  }

  if (featuredCards.length === 0) return null;

  return (
    <>
      {featuredCards.map(({ featured, registrationBlocked }) => {
        const cardTitle = featured.promoHomeTitle?.trim() || featured.title;
        const ctaLabel = registrationBlocked ? getTournamentStatusConfig(featured.status, true).label : '참가 신청하기';
        const cardBody = featured.promoHomeSubtitle?.trim() || featured.venue || `${featured.sport.name} 대회`;
        const badgeText = featured.promoHomeBadgeText?.trim() || '추천 대회';
        // 홈 홍보 이미지를 따로 지정하지 않았으면 대회 커버(기본 이미지)를 그대로 쓴다.
        const imageUrl = resolveTournamentImage(featured, 'home');
        const facts = [
          { kind: 'date', value: featured.promoHomeDateText?.trim() },
          { kind: 'teams', value: featured.promoHomeTeamsText?.trim() },
          { kind: 'location', value: featured.promoHomeLocationText?.trim() },
          { kind: 'prize', value: featured.promoHomePrizeText?.trim() },
        ].filter((fact): fact is { kind: string; value: string } => Boolean(fact.value));

        return (
          <Link
            key={featured.id}
            className="tm-featured-link tm-pressable"
            href={featured.campaignSlug
              ? `/tournaments/campaigns/${featured.campaignSlug}`
              : withFromPath(`/tournaments/${featured.id}`, '/home')}
            aria-label={`대회 상세 — ${cardTitle} — ${ctaLabel}`}
          >
            <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
              <div
                className="tm-featured-media"
                style={{ background: imageUrl ? `${cssUrl(imageUrl)} center/cover` : 'var(--brand-hero-gradient)' }}
              >
                {/* 은은한 트로피 워터마크 (장식) — 세로 중앙·우측 살짝 블리드(상단 잘림 방지) */}
                {!imageUrl ? (
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)', opacity: 0.18, color: 'var(--static-white)' }}
                  >
                    <TrophyIcon size={120} strokeWidth={1.4} />
                  </div>
                ) : null}
                <div className="tm-featured-overlay" />
                <div className="tm-featured-text">
                  <div
                    className="tm-text-micro"
                    style={{ color: 'var(--static-white)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <TrophyIcon size={13} strokeWidth={2} aria-hidden="true" /> {badgeText}
                  </div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
                    {cardTitle}
                  </div>
                </div>
              </div>
              <div className="tm-featured-content tm-featured-content-with-cta">
                <div className="tm-featured-copy">
                  <div className="tm-text-body-lg">{cardBody}</div>
                  {facts.length > 0 ? (
                    <div
                      className="tm-text-caption tm-featured-meta"
                      style={{ marginTop: 8, display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 4, flexWrap: 'wrap' }}
                    >
                      {facts.map((fact) => (
                        <span
                          key={`${featured.id}-${fact.kind}`}
                          style={fact.kind === 'date'
                            ? { color: 'var(--text-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
                            : undefined}
                        >
                          {fact.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span
                  // 카드 CTA 는 secondary(outline) — 추천 대회가 여러 장이라 solid 면
                  // 한 화면에 primary 가 겹겹이 쌓인다(home-page.tsx 의 같은 자리 참고).
                  className="tm-btn tm-btn-outline tm-btn-sm tm-featured-cta"
                  aria-hidden="true"
                >
                  {ctaLabel}
                </span>
              </div>
            </Card>
          </Link>
        );
      })}
    </>
  );
}
