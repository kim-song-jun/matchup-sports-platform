'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Users } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';

/**
 * 팀장 혼자 남은 팀(Task 180 H3 A-1). 위임할 매니저가 없어 팀 나가기가 막힌 이유와,
 * 이어가기(멤버 초대)·그만두기(팀 해체) 두 갈래를 함께 보여 준다.
 */
export function SoloOwnerCard({ onInvite, dissolveHref }: { onInvite: () => void; dissolveHref: string }) {
  return (
    <Card pad={16} style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          className="tm-on-tint"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-circle)',
            background: 'var(--blue50)',
            color: 'var(--blue700)',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
          }}
        >
          <Users size={16} />
        </span>
        <h3 className="tm-text-label" style={{ margin: 0 }}>혼자 남은 팀이에요</h3>
      </div>
      <p className="tm-text-caption" style={{ margin: '8px 0 0', lineHeight: 1.55 }}>
        위임할 매니저가 없어서 팀 나가기는 쓸 수 없어요. 멤버를 초대해 팀을 이어가거나, 그만둘 거라면 팀을 해체할 수 있어요.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" onClick={onInvite}>
          멤버 초대
        </button>
        <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={dissolveHref} style={{ color: 'var(--red700)' }}>
          팀 해체
        </Link>
      </div>
    </Card>
  );
}

/** 팀 수정 맨 아래 "팀 관리"(팀장만) — 멤버가 있는 팀도 여기서 해체 화면으로 간다. */
export function TeamManageDissolveEntry({ dissolveHref }: { dissolveHref: string }) {
  const headingId = useId();
  return (
    <section className="tm-create-field" aria-labelledby={headingId}>
      <h2 id={headingId} className="tm-text-label" style={{ margin: 0 }}>팀 관리</h2>
      <Card pad={16} style={{ marginTop: 10 }}>
        <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>팀 해체</div>
        <p className="tm-text-caption" style={{ margin: '4px 0 0', lineHeight: 1.55 }}>
          팀을 목록에서 내리고 새 활동을 멈춰요. 지난 경기 기록은 남고, 30일 안에는 복구할 수 있어요.
        </p>
        <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={dissolveHref} style={{ marginTop: 12, color: 'var(--red700)' }}>
          팀 해체하기
        </Link>
      </Card>
    </section>
  );
}
