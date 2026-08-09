import type { Metadata } from 'next';
import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { buildNoIndexMetadata } from '@/lib/seo';

// 세그먼트 전용 not-found. 없으면 notFound() 가 루트 not-found 로 떨어지고, 루트에는
// metadata export 가 없어 tournaments/layout.tsx 의 '스포츠 대회' 로 title 이 폴백된다
// (탭 제목·공유 미리보기가 실제 상태와 어긋난다). generateMetadata 와 같은 문구를 여기서도
// 명시해 404 렌더에서도 title 이 유지되게 한다.
export const metadata: Metadata = buildNoIndexMetadata('대회를 찾을 수 없어요');

export default function TournamentDetailNotFound() {
  return (
    <AppChrome title="대회" activeTab="tournaments" backHref="/tournaments" showNotifications={false} desktopHead>
      <section
        aria-labelledby="tournament-subroute-not-found-title"
        style={{ display: 'grid', gap: 8, padding: '48px 20px', justifyItems: 'start' }}
      >
        <h1 id="tournament-subroute-not-found-title" className="tm-text-heading" style={{ margin: 0 }}>
          대회를 찾을 수 없어요
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
