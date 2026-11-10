import { Check, CircleAlert } from 'lucide-react';
import {
  ACTIVITY_ITEM_LABELS,
  ACTIVITY_ITEM_ORDER,
  type ActivityMissingItem,
} from '@/lib/activity-profile-required';

/**
 * 활동 게이트 시트의 "무엇이 끝났고 무엇이 남았는지" 체크리스트.
 * 색만으로 구분하지 않는다 — 항목마다 아이콘과 "완료"/"필요" 글자를 함께 쓴다.
 */
export function ActivityGateChecklist({ missing }: { missing: readonly ActivityMissingItem[] }) {
  return (
    <ul
      aria-label="필요한 정보"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {ACTIVITY_ITEM_ORDER.map((item) => {
        const needed = missing.includes(item);
        return (
          <li
            key={item}
            className={needed ? 'tm-text-label tm-on-tint' : 'tm-text-label'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--radius-field)',
              background: needed ? 'var(--tint-orange)' : 'transparent',
              color: needed ? 'var(--text-strong)' : 'var(--text-muted)',
              fontWeight: needed ? 700 : 500,
            }}
          >
            {needed ? (
              <CircleAlert size={18} aria-hidden="true" style={{ color: 'var(--orange700)', flexShrink: 0 }} />
            ) : (
              <Check size={18} aria-hidden="true" style={{ color: 'var(--blue700)', flexShrink: 0 }} />
            )}
            <span style={{ flex: 1 }}>{ACTIVITY_ITEM_LABELS[item]}</span>
            <span className="tm-text-caption" style={{ fontWeight: 700 }}>
              {needed ? '필요' : '완료'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
