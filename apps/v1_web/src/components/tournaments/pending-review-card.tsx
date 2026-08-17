'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { hasStoredV1Session } from '@/lib/session-storage';
import { useV1PendingTournamentReviews } from '@/hooks/use-v1-api';

/** 마이페이지 상단 — 참가 확정 대회 중 아직 리뷰를 남기지 않은 건 안내 카드 */
export function PendingTournamentReviewCard() {
  // enabled 를 안 넘기면 기본값 true 라 비로그인 방문자도 인증 필요한 엔드포인트를 때린다
  // (모달 쪽 PendingTournamentReviewModal 은 이미 세션을 넘기고 있었다).
  const { data } = useV1PendingTournamentReviews(hasStoredV1Session());
  const target = data?.[0];
  if (!target) return null;

  return (
    <Card pad={16} style={{ background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-border)', marginBottom: 16, minWidth: 0 }}>
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
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue700)' }}>참가팀 후기를 기다리고 있어요</div>
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
