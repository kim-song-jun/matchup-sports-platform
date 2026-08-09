import type { Metadata } from 'next';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { buildNoIndexMetadata } from '@/lib/seo';

// 세그먼트 전용 not-found — 자세한 배경은 tournaments/[id]/not-found.tsx 주석 참조.
export const metadata: Metadata = buildNoIndexMetadata('대회 후기를 찾을 수 없어요');

export default function TournamentReviewsNotFound() {
  return (
    <AppChrome title="대회 후기" activeTab="tournaments" backHref="/tournaments" showNotifications={false} desktopHead>
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
    </AppChrome>
  );
}
