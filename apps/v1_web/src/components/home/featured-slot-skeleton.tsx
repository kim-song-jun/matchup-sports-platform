'use client';

import { Card } from '@/components/v1-ui/primitives';

/**
 * "오늘의 추천" 캐러셀 한 칸의 자리표시.
 *
 * 두 슬롯(추천 매치 · 추천 대회)이 **같은 뼈대**를 써야 한다. 각자 만들면 한쪽만 실제 카드와
 * 어긋나고, 그 차이가 그대로 레이아웃 이동이 된다 — 실제로 대회 슬롯이 실제보다 188px 커서
 * 데이터가 도착할 때마다 화면을 당겼다(alpha 실측: 483px vs 295px).
 *
 * 지켜야 하는 것 세 가지:
 *  1. **캐러셀 자식은 `.tm-featured-link`** — 실제 카드도 이 클래스의 `<Link>` 다. 다른 요소가
 *     자식이 되면 flex 규칙이 달리 걸려 폭이, 따라서(미디어가 `aspect-ratio` 라) 높이가 어긋난다.
 *  2. **`.tm-featured-skeleton`** — `.tm-home-featured-carousel > *:only-child` 가 폭을 100% 로
 *     늘리는데 자리표시는 늘 한 장이라 항상 걸린다. 이 클래스로 그 규칙에서 빠져 실제(88%)와
 *     같은 폭을 잡는다.
 *  3. **막대는 `.tm-skeleton`** — `.tm-review-skeleton` 은 리뷰 카드용이라 `min-height: 92px` 가
 *     있어 인라인 height 를 조용히 덮어쓴다. 20px 막대가 92px 이 되는 식이다.
 *
 * `aria-hidden` 서브트리다 — "불러오는 중"은 바깥 블록(`.tm-home-featured-block`)의 `aria-busy`
 * 가 알린다. 여기 안쪽에 무엇을 달아도 보조기기에 닿지 않는다.
 */
export function FeaturedSlotSkeleton({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="tm-featured-link tm-featured-skeleton" aria-hidden="true">
      <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
        <div
          className="tm-featured-media"
          style={{ background: 'linear-gradient(135deg, var(--blue500), var(--blue600))' }}
        >
          <div className="tm-featured-overlay" />
          <div className="tm-featured-text">
            <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>{eyebrow}</div>
            <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
              {title}
            </div>
          </div>
        </div>
        <div className="tm-featured-content tm-featured-content-with-cta">
          <div className="tm-featured-copy">
            {/* 두 막대의 합(20 + 8 + 24 = 52px)은 실제 카드 copy 의 실측 높이에 맞춘 값이다. */}
            <div className="tm-skeleton" style={{ height: 20, borderRadius: 'var(--radius-tight)', width: '72%' }} />
            <div className="tm-skeleton" style={{ height: 24, borderRadius: 'var(--radius-tight)', width: '54%', marginTop: 8 }} />
          </div>
          {/* CTA 는 실제와 같은 박스 모델(tm-btn + tm-btn-sm + tm-featured-cta)을 그대로 써서
              높이(44px)가 버튼 토큰을 따라가게 하고, 색만 자리표시로 바꾼다. */}
          <span className="tm-btn tm-btn-sm tm-featured-cta tm-skeleton">&nbsp;</span>
        </div>
      </Card>
    </div>
  );
}
