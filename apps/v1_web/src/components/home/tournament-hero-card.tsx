'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { getSortedTournamentPromos } from '@/lib/tournament-promo';
import type { V1TournamentListItem } from '@/types/api';

/**
 * 홈 "오늘의 추천"의 대회 히어로.
 * 매치 히어로(FeaturedMatchCard)와 동일한 풀폭 미디어+오버레이 비중으로 모집중 대회를 노출한다.
 * 관리자가 홈 홍보를 켠 open 대회를 우선순위 순으로 모두 노출한다.
 */
export function TournamentHeroCard({ items, loading = false }: { items: V1TournamentListItem[]; loading?: boolean }) {
  if (loading) {
    return (
      <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }} aria-busy="true">
        <div
          className="tm-featured-media"
          style={{ background: 'linear-gradient(135deg, var(--blue500), var(--blue600))' }}
        >
          <div className="tm-featured-overlay" />
          <div className="tm-featured-text">
            <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>상금 대회 · 모집 중</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
              추천 대회를 가져오고 있어요
            </div>
          </div>
        </div>
        <div className="tm-featured-content">
          <div className="tm-review-skeleton" style={{ height: 20, borderRadius: 6, width: '72%' }} aria-hidden="true" />
          <div className="tm-review-skeleton" style={{ height: 14, borderRadius: 6, width: '54%', marginTop: 8 }} aria-hidden="true" />
        </div>
      </Card>
    );
  }

  const featuredItems = getSortedTournamentPromos(items, 'home');

  if (featuredItems.length === 0) return null;

  return (
    <>
      {featuredItems.map((featured) => {
        const cardTitle = featured.promoHomeTitle?.trim() || featured.title;
        const cardBody = featured.promoHomeSubtitle?.trim() || featured.venue || `${featured.sport.name} 대회`;
        const badgeText = featured.promoHomeBadgeText?.trim() || '추천 대회';
        const imageUrl = featured.promoHomeImageUrl?.trim();
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
              : `/tournaments/${featured.id}`}
            aria-label={`대회 상세 — ${cardTitle}`}
          >
            <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
              <div
                className="tm-featured-media"
                style={{ background: imageUrl ? `${cssUrl(imageUrl)} center/cover` : 'linear-gradient(135deg, var(--blue500), var(--blue600))' }}
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
                      style={{ marginTop: 6, display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 4, flexWrap: 'wrap' }}
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
                  className="tm-btn tm-btn-primary tm-btn-sm tm-featured-cta"
                  aria-hidden="true"
                >
                  참가 신청하기
                </span>
              </div>
            </Card>
          </Link>
        );
      })}
    </>
  );
}
