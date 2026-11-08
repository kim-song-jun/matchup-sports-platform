import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import { FIELD_DEMO_PATH } from '@/lib/field-console-demo';
import styles from './demo.module.css';

export function TournamentOpsDemoEntry() {
  return (
    <section className={styles.entry} aria-labelledby="ops-demo-entry-title">
      <div>
        <p className={styles.eyebrow}>로그인 없이 · 약 5분 체험</p>
        <h2 id="ops-demo-entry-title">필드 담당자의 경기 운영을 체험해 보세요</h2>
        <p>실제 운영콘솔 화면에서 사용 안내를 보고 경기 시작, 득점·카드·교체 기록과 경기 종료를 체험해 보세요. 실제 대회에는 영향을 주지 않아요.</p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.primary} href={FIELD_DEMO_PATH} target="_blank" rel="noopener noreferrer"><Play size={16} aria-hidden="true" />운영 콘솔 체험하기<span className="sr-only"> (새 탭)</span></Link>
        <Link className={styles.secondary} href={FIELD_DEMO_PATH} target="_blank" rel="noopener noreferrer">주요 기능 보기<ArrowRight size={16} aria-hidden="true" /><span className="sr-only"> (새 탭)</span></Link>
      </div>
    </section>
  );
}
