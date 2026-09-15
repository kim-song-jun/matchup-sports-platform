import type { Metadata } from 'next';
import Link from 'next/link';
import { buildNoIndexMetadata } from '@/lib/seo';

// 세그먼트 전용 not-found — 자세한 배경은 tournaments/[id]/not-found.tsx 주석 참조.
export const metadata: Metadata = buildNoIndexMetadata('대회 후기를 찾을 수 없어요');

// pathname '/tournaments/:id/reviews'는 U33(tournaments-extra)이 route-chrome 테이블에
// 이미 등록했다(fragments/tournaments-extra.ts) — 셀프 AppChrome은 걷어낸다(배치 3 통합
// 검증에서 실측: reviews-page-client.tsx는 이미 걷어냈는데 이 짝 not-found만 빠져 있었다).
export default function TournamentReviewsNotFound() {
  return (
    <section
      aria-labelledby="tournament-subroute-not-found-title"
      style={{ display: 'grid', gap: 8, padding: '48px 20px', justifyItems: 'start' }}
    >
      <h1 id="tournament-subroute-not-found-title" className="tm-text-heading" style={{ margin: 0 }}>
        대회 후기를 찾을 수 없어요
      </h1>
      <p className="tm-text-body" style={{ margin: '0 0 12px', color: 'var(--text-muted)' }}>
        주소가 바뀌었거나 아직 공개 전인 대회예요.
      </p>
      <Link className="tm-btn tm-btn-primary" href="/tournaments">
        대회 목록으로
      </Link>
    </section>
  );
}
