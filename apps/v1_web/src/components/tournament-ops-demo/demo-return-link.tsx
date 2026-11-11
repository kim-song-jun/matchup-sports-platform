'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAppBackClick } from '@/components/v1-ui/app-back-link';
import styles from './demo.module.css';

const STORAGE_KEY = 'teameet.demo.return-path';
const DEFAULT_PATH = '/tournament-management';
const RETURN_PATHS = new Set([DEFAULT_PATH, '/my/tournament-staff', '/admin/ops/tournaments']);

export function rememberDemoReturnPath(pathname: string | null) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, pathname && RETURN_PATHS.has(pathname) ? pathname : DEFAULT_PATH);
  } catch {
    // Storage-disabled browsers can still leave the demo through the default entry.
  }
}

export function DemoReturnLink() {
  const [href, setHref] = useState(DEFAULT_PATH);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved && RETURN_PATHS.has(saved)) setHref(saved);
    } catch {
      // The default destination remains available without browser storage.
    }
  }, []);
  const onClick = useAppBackClick(href);
  // push 하면 복귀 뒤 스와이프·하드웨어 뒤로가 방금 떠난 체험 화면으로 튄다 — 뒤로가기 규칙으로 이동한다.
  return <Link className={styles.quiet} href={href} data-demo-return data-nav-back="true" onClick={onClick}>대회 운영으로 돌아가기</Link>;
}
