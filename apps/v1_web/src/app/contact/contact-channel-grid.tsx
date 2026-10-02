'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { Check, Mail, MessageSquareText, type LucideIcon } from 'lucide-react';
import { hasStoredV1Session } from '@/lib/session-storage';
import styles from './contact.module.css';

export type ContactChannel = 'member' | 'guest';

const PICKS: readonly { id: ContactChannel; eyebrow: string; label: string; icon: LucideIcon }[] = [
  { id: 'member', eyebrow: '로그인했다면', label: '1:1 문의', icon: MessageSquareText },
  { id: 'guest', eyebrow: '로그인하지 않았다면', label: '이메일', icon: Mail },
];

/**
 * 두 창구 카드(children)는 서버에서 함께 렌더한다(세션에 따라 HTML 이 갈리면 정적 캐시·메타가 깨진다).
 * 1024 미만에서는 위의 창구 고르기로 한 장만 보이고(CSS :has — JS 없이도 라디오로 바뀐다), 1024+ 는 두 장을 나란히 둔다.
 * 로그인 흔적(localStorage)은 틀릴 수 있어 기본 선택·강조에만 쓰고 카드 내용은 바꾸지 않는다.
 */
export function ContactChannelGrid({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<ContactChannel | undefined>(undefined);
  const [picked, setPicked] = useState<ContactChannel | undefined>(undefined);
  const name = useId();

  useEffect(() => {
    const next = hasStoredV1Session() ? 'member' : 'guest';
    setViewer(next);
    setPicked(next);
  }, []);

  return (
    <div className={styles.channels} data-viewer={viewer}>
      <fieldset className={styles.picker}>
        <legend className={styles.pickerLabel}>문의 창구</legend>
        <div className={styles.pickerCards}>
          {PICKS.map((pick) => {
            const Icon = pick.icon;
            return (
              <label key={pick.id} className={styles.pick} data-card={pick.id}>
                <input
                  className={styles.pickInput}
                  type="radio"
                  name={name}
                  value={pick.id}
                  checked={picked === pick.id}
                  onChange={() => setPicked(pick.id)}
                />
                <span className={styles.pickIcon} aria-hidden="true"><Icon size={20} /></span>
                <span className={styles.pickText}>
                  <small>{pick.eyebrow}</small>
                  <b>{pick.label}</b>
                </span>
                <span className={styles.pickCheck} aria-hidden="true"><Check size={12} strokeWidth={3.4} /></span>
                <span className={styles.viewerBadge}>지금 쓰기 좋은 창구예요</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className={styles.panels}>{children}</div>
    </div>
  );
}
