'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { useV1MyStaffAssignments } from '@/hooks/use-v1-my-staff-assignments';

/**
 * 마이페이지 진입점 — 대회 스태프로 배정된 사용자에게만 보이는 카드.
 *
 * 배정이 없으면(또는 조회에 실패하면) 아무것도 그리지 않는다: 운영과 무관한 사용자에게
 * 운영 콘솔 링크를 노출하지 않는다는 뜻이다. `PendingTournamentReviewCard`와 같은 패턴.
 */
export function MyOpsEntryCard() {
  const { data } = useV1MyStaffAssignments();
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const fixtureCount = items.reduce((total, item) => total + item.fixtures.length, 0);
  const summary =
    fixtureCount > 0
      ? `대회 ${items.length}건 · 담당 경기 ${fixtureCount}건`
      : `대회 ${items.length}건`;

  return (
    <Card
      pad={16}
      style={{
        background: 'var(--tint-blue)',
        border: '1px solid var(--tint-blue-border)',
        marginBottom: 16,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <ClipboardList size={18} stroke="var(--blue700)" strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue700)' }}>
            대회 운영을 맡고 있어요
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-caption)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary}
          </div>
        </div>
        <Link
          href="/tournament-ops"
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          바로가기
        </Link>
      </div>
    </Card>
  );
}
