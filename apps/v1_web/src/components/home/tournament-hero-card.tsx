'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { getSortedTournamentPromos, resolveTournamentImage } from '@/lib/tournament-promo';
import type { V1TournamentListItem } from '@/types/api';

/**
 * 홈 "오늘의 추천"의 대회 히어로.
 * 매치 히어로(FeaturedMatchCard)와 동일한 풀폭 미디어+오버레이 비중으로 모집중 대회를 노출한다.
 * 관리자가 홈 홍보를 켠 open 대회를 우선순위 순으로 모두 노출한다.
 */
export function TournamentHeroCard({ items, loading = false }: { items: V1TournamentListItem[]; loading?: boolean }) {
  if (loading) {
    // 스켈레톤은 **실제 카드와 같은 DOM** 이어야 한다. 지금까지는 링크 래퍼도 CTA 도 없고
    // `tm-featured-content-with-cta` 도 빠져 있어서, 자리를 잡아 주기는커녕 실제 카드보다
    // 105px 크게 잡았다가 데이터가 오면 그만큼 줄며 화면을 당겼다(alpha 실측: 450px → 345px).
    //
    // 폭도 맞춘다. `.tm-home-featured-carousel > *:only-child` 는 카드가 하나뿐일 때 폭을
    // 100% 로 늘리는데, 스켈레톤은 늘 하나라 항상 그 규칙에 걸렸다. 미디어가
    // `aspect-ratio` 라 **폭이 곧 높이**여서, 이것만으로도 실제(88%)와 어긋난다.
    // `tm-featured-skeleton` 을 달아 그 규칙에서 빼, 여러 장 캐러셀과 같은 폭으로 잡는다.
    return (
      <div className="tm-featured-link tm-featured-skeleton" aria-hidden="true">
        {/* aria-busy 는 여기가 아니라 바깥 블록(.tm-home-featured-block)이 단다 —
            이 안은 aria-hidden 서브트리라 무엇을 달아도 보조기기에 닿지 않는다. */}
        <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
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
          <div className="tm-featured-content tm-featured-content-with-cta">
            <div className="tm-featured-copy">
              {/* `.tm-review-skeleton` 이 아니라 `.tm-skeleton` 이다. 전자는 리뷰 카드용 블록이라
                  `min-height: 92px` 를 갖고 있어 **인라인 height 를 조용히 덮어쓴다** — 20px·14px
                  막대가 둘 다 92px 이 되어 copy 가 52px 대신 192px 이 됐다(alpha 실측).
                  두 막대의 합(20 + 8 + 24 = 52px)은 실제 카드 copy 의 실측 높이에 맞춘 값이다. */}
              <div className="tm-skeleton" style={{ height: 20, borderRadius: 6, width: '72%' }} />
              <div className="tm-skeleton" style={{ height: 24, borderRadius: 6, width: '54%', marginTop: 8 }} />
            </div>
            {/* 실제 카드의 CTA 와 같은 박스 모델(tm-btn + tm-btn-sm + tm-featured-cta)을 그대로 쓰고
                색만 스켈레톤으로 바꾼다 — 높이를 숫자로 베끼면 버튼 높이가 바뀔 때 조용히 어긋난다. */}
            {/* CTA 도 같은 이유로 tm-skeleton 이다 — tm-review-skeleton 이면 min-height 92px 에
                눌려 실제 버튼(44px)의 두 배가 된다. */}
            <span className="tm-btn tm-btn-sm tm-featured-cta tm-skeleton">&nbsp;</span>
          </div>
        </Card>
      </div>
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
