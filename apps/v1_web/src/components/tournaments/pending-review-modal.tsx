'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasStoredV1Session } from '@/lib/session-storage';
import { useV1PendingTournamentReviews } from '@/hooks/use-v1-api';

const DISMISS_KEY_PREFIX = 'teameet.v1.reviewNudgeSeen.';

function wasDismissedThisSession(tournamentId: string) {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(DISMISS_KEY_PREFIX + tournamentId) === '1';
}

/** 로그인 후 홈에서 1회 노출되는 "참가팀 후기 작성 독려" 모달 (세션당 대회별 1회) */
export function PendingTournamentReviewModal() {
  const hasSession = hasStoredV1Session();
  const { data } = useV1PendingTournamentReviews(hasSession);
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const target = data?.find(
    (item) => !dismissedIds.includes(item.tournamentId) && !wasDismissedThisSession(item.tournamentId),
  );
  if (!target) return null;

  const markSeen = () => {
    window.sessionStorage.setItem(DISMISS_KEY_PREFIX + target.tournamentId, '1');
    setDismissedIds((prev) => [...prev, target.tournamentId]);
  };

  const goWrite = () => {
    markSeen();
    router.push(`/tournaments/${target.tournamentId}/awards`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="후기 작성 안내"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) markSeen(); }}
    >
      <div style={{
        width: '100%', maxWidth: 480, background: 'var(--background)',
        borderRadius: '16px 16px 0 0', padding: '24px 20px',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 22 }} aria-hidden="true">🎉</p>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
              {target.tournamentTitle} 대회가 끝났어요
            </h3>
          </div>
          <button
            type="button"
            onClick={markSeen}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
          참가하신 팀의 후기를 남겨주시면 다른 참가자들에게 큰 도움이 돼요.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={markSeen} className="tm-btn tm-btn-md tm-btn-outline" style={{ flex: 1 }}>
            나중에
          </button>
          <button type="button" onClick={goWrite} className="tm-btn tm-btn-md tm-btn-primary" style={{ flex: 1.4 }}>
            후기 작성하기
          </button>
        </div>
      </div>
    </div>
  );
}
