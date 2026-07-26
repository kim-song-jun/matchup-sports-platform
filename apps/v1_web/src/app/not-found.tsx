import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';

// 전역 404. 이 파일이 없으면 Next.js 기본 화면(영문 "This page could not be found",
// 링크 0개)이 떠서 만료·삭제된 링크로 들어온 사용자가 완전히 갇힌다.
// activeTab 은 지정하지 않는다 — 404 는 5개 탭 어디에도 속하지 않으므로 활성 탭이 없어야 한다.
export default function NotFound() {
  return (
    <AppChrome title="" showNotifications={false}>
      <section
        aria-labelledby="not-found-title"
        style={{ padding: '48px 20px', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 8 }}
      >
        <h1 id="not-found-title" className="tm-text-heading" style={{ margin: 0 }}>
          페이지를 찾을 수 없어요
        </h1>
        <p className="tm-text-body" style={{ margin: 0, color: 'var(--text-muted)' }}>
          주소가 바뀌었거나 삭제된 페이지예요. 아래에서 다시 시작해 주세요.
        </p>
        <div style={{ display: 'grid', gap: 8, width: 'min(100%, 280px)', marginTop: 16 }}>
          <Link className="tm-btn tm-btn-md tm-btn-primary tm-btn-block" href="/home">
            홈으로 가기
          </Link>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/search">
            검색으로 찾아보기
          </Link>
        </div>
      </section>
    </AppChrome>
  );
}
