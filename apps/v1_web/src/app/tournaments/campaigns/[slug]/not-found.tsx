import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import styles from '@/components/tournaments/tournament-campaign-template.module.css';

export default function TournamentCampaignNotFound() {
  return (
    <AppChrome title="대회 캠페인" activeTab="tournaments" backHref="/tournaments" showNotifications={false}>
      <section className={styles.notFound} aria-labelledby="campaign-not-found-title">
        <h1 id="campaign-not-found-title" className="tm-text-heading">공개된 대회 캠페인을 찾을 수 없어요</h1>
        <p className="tm-text-body" style={{ margin: '8px 0 20px', color: 'var(--text-muted)' }}>
          주소가 바뀌었거나 아직 공개 전인 캠페인이에요.
        </p>
        <Link className={`tm-btn tm-btn-primary ${styles.notFoundAction}`} href="/tournaments">
          대회 목록으로
        </Link>
      </section>
    </AppChrome>
  );
}
