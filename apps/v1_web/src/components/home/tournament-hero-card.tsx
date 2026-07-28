'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import type { V1TournamentListItem } from '@/types/api';

/**
 * 홈 "오늘의 추천"의 대회 히어로.
 * 매치 히어로(FeaturedMatchCard)와 동일한 풀폭 미디어+오버레이 비중으로 모집중 대회를 노출한다.
 * 일정이 가장 가까운 open 대회 1개를 고르고, open 대회가 없으면 렌더하지 않는다(빈 히어로 방지).
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

  const featured = items
    .filter((item) => item.status === 'open' && item.promoHomeEnabled)
    .slice()
    .sort((a, b) => {
      if (b.promoHomePriority !== a.promoHomePriority) return b.promoHomePriority - a.promoHomePriority;
      return (a.scheduledAt ?? '~').localeCompare(b.scheduledAt ?? '~');
    })[0];

  if (!featured) return null;

  const cardTitle = featured.promoHomeTitle?.trim() || featured.title;
  const cardBody = featured.promoHomeSubtitle?.trim() || featured.venue || `${featured.sport.name} 대회`;
  const badgeText = featured.promoHomeBadgeText?.trim() || '추천 대회';
  const imageUrl = featured.promoHomeImageUrl?.trim();
  const facts = [
    featured.promoHomeDateText?.trim(),
    featured.promoHomeTeamsText?.trim(),
    featured.promoHomeLocationText?.trim(),
    featured.promoHomePrizeText?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      className="tm-featured-link tm-pressable"
      href={`/tournaments/${featured.id}`}
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
        <div className="tm-featured-content">
          <div className="tm-text-body-lg">{cardBody}</div>
          {facts ? (
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              {facts}
            </div>
          ) : null}
          {/*
           * FeaturedMatchCard와 짝을 이루는 시각적 CTA — 카드 전체가 이미 <Link>이므로
           * 순수 시각 신호만 제공하는 비-interactive 요소(span)로 렌더링한다.
           * <a> 안에 <button>(interactive-in-interactive) 중첩은 HTML5 스펙 위반이라
           * span으로 대체했다(Copilot 리뷰 지적, PR #51).
           * (매치 히어로 카드의 tm-btn tm-btn-primary tm-btn-sm 패턴과 동일)
           * .tm-featured-cta는 고정 marginTop:12px — 카드 하단 경계 정합은
           * .tm-featured-card{height:100%}가 담당하므로 버튼은 텍스트 바로 아래
           * 일정한 간격으로 붙인다(marginTop:auto였을 때 짧은 텍스트 카드에서
           * 버튼이 과하게 아래로 밀리던 문제 해결).
           */}
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
}
