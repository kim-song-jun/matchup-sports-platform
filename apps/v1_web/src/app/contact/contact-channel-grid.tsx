'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { hasStoredV1Session } from '@/lib/session-storage';
import styles from './contact.module.css';

/**
 * 두 창구 카드는 서버에서 함께 렌더하고(세션에 따라 HTML 이 갈리면 정적 캐시·메타가 깨진다),
 * 여기서는 로그인 흔적(localStorage)에 맞는 카드만 강조한다. 흔적은 네트워크 확인이 아니라
 * 틀릴 수 있으므로 내용은 바꾸지 않고 강조만 한다.
 */
export function ContactChannelGrid({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<'member' | 'guest' | undefined>(undefined);
  useEffect(() => {
    setViewer(hasStoredV1Session() ? 'member' : 'guest');
  }, []);
  return (
    <div className={styles.channels} data-viewer={viewer}>
      {children}
    </div>
  );
}
