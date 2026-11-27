'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { rememberDemoReturnPath } from './demo-return-link';
import { ArrowRight, Play } from 'lucide-react';
import { FIELD_DEMO_PATH } from '@/lib/field-console-demo';
import { DEMO_PATH } from '@/lib/tournament-ops-demo';
import styles from './demo.module.css';

/** 로그인 없이 경기 콘솔을 연습해 보는 한 줄 안내. 실제 대회에는 영향이 없다. */
export function TournamentOpsDemoEntry() {
  const pathname = usePathname();
  return (
    <section className={styles.entry} aria-label="경기 콘솔 체험">
      <p>경기 콘솔을 로그인 없이 5분 동안 연습해 볼 수 있어요. 실제 대회에는 영향이 없어요.</p>
      <div className={styles.actions}>
        <Link className={styles.secondary} href={FIELD_DEMO_PATH} onClick={() => rememberDemoReturnPath(pathname)}><Play size={16} aria-hidden="true" />경기 콘솔 연습하기</Link>
        <Link className={styles.quiet} href={`${DEMO_PATH}#demo-guide`} onClick={() => rememberDemoReturnPath(pathname)}>주요 기능 보기<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
