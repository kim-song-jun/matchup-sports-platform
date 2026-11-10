'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  return <Link className={styles.quiet} href={href} data-demo-return>대회 운영으로 돌아가기</Link>;
}
