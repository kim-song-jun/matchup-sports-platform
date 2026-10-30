import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import { DEMO_PATH } from '@/lib/tournament-ops-demo';
import styles from './demo.module.css';

export function TournamentOpsDemoEntry() {
  return (
    <section className={styles.entry} aria-labelledby="ops-demo-entry-title">
      <div>
        <p className={styles.eyebrow}>로그인 없이 · 약 5분 체험</p>
        <h2 id="ops-demo-entry-title">대회 운영을 직접 체험해 보세요</h2>
        <p>샘플 대회에서 참가팀 확인부터 경기 기록·결과 검토까지 따라가 보세요. 실제 대회에는 영향을 주지 않아요.</p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.primary} href={DEMO_PATH} target="_blank" rel="noopener noreferrer"><Play size={16} aria-hidden="true" />운영 콘솔 체험하기<span className="sr-only"> (새 탭)</span></Link>
        <Link className={styles.secondary} href={`${DEMO_PATH}#demo-guide`} target="_blank" rel="noopener noreferrer">주요 기능 보기<ArrowRight size={16} aria-hidden="true" /><span className="sr-only"> (새 탭)</span></Link>
      </div>
    </section>
  );
}
