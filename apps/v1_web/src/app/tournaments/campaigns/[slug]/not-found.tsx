import Link from 'next/link';
import styles from '@/components/tournaments/tournament-campaign-template.module.css';

// campaigns/page.tsx와 짝을 이루는 not-found. notFound()가 던져진 그 URL 그대로
// 렌더되므로 pathname은 페이지와 동일하게 '/tournaments/campaigns/:slug' 패턴을
// 공유한다(tournaments/[id]/not-found.tsx와 동일 근거) — route-chrome 테이블
// (fragments/tournaments-core.ts)의 정적값(title '대회 캠페인' / backHref '/tournaments' /
// showNotifications false / desktopHead true)이 마이그레이션 전 이 화면이 쓰던 값과
// 완전히 같다. 이 화면엔 검색 파라미터 의존 backHref가 없으므로(notFound()는 페이지
// 렌더가 실패한 시점에 던져지고, 그 시점의 backHref 계산은 이미 버려진다) page.tsx와
// 달리 CampaignChromeBridge/override 없이도 회귀가 없다 — 셀프 AppChrome은 걷어낸다.
export default function TournamentCampaignNotFound() {
  return (
    <section className={styles.notFound} aria-labelledby="campaign-not-found-title">
      <h1 id="campaign-not-found-title" className="tm-text-heading">공개된 대회 캠페인을 찾을 수 없어요</h1>
      <p className="tm-text-body" style={{ margin: '8px 0 20px', color: 'var(--text-muted)' }}>
        주소가 바뀌었거나 아직 공개 전인 캠페인이에요.
      </p>
      <Link className={`tm-btn tm-btn-primary ${styles.notFoundAction}`} href="/tournaments">
        대회 목록으로
      </Link>
    </section>
  );
}
