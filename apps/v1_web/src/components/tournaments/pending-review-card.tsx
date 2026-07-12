'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { useV1PendingTournamentReviews } from '@/hooks/use-v1-api';

/** 마이페이지 상단 — 참가 확정 대회 중 아직 리뷰를 남기지 않은 건 안내 카드 */
export function PendingTournamentReviewCard() {
  const { data } = useV1PendingTournamentReviews();
  const target = data?.[0];
  if (!target) return null;

  return (
    <Card pad={16} style={{ background: 'var(--blue50)', border: '1px solid var(--blue100)', marginBottom: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <Star size={18} fill="var(--orange500)" stroke="var(--orange500)" strokeWidth={1.6} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>참가팀 후기를 기다리고 있어요</div>
          <div
            style={{
              fontSize: 12, color: 'var(--text-caption)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {target.tournamentTitle}
          </div>
        </div>
        <Link
          href={`/tournaments/${target.tournamentId}/awards`}
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ flexShrink: 0 }}
        >
          작성하기
        </Link>
      </div>
    </Card>
  );
}
