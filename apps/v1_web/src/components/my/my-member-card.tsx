'use client';

import { useState } from 'react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import type { MyMember } from './my.types';

export function MyMemberCard({ member }: { member: MyMember }) {
  const [open, setOpen] = useState(false);
  const actions = member.actions ?? [];
  /* #17: 액션이 없으면 관리 버튼 자체를 렌더하지 않음
   * (항상 disabled인 버튼은 affordance를 흐림)
   * Copilot: actionPending(팀 멤버 전체 공유 플래그)을 hasActions 에 섞으면 다른 멤버
   * mutation 중에도 액션이 통째로 사라져 깜빡임 → 유무(hasActions)와 진행(pending) 분리,
   * pending 동안은 숨기지 않고 disabled 처리한다. */
  const hasActions = actions.length > 0;
  const pending = member.actionPending;

  return (
    <Card pad={14}>
      <ListItem title={member.name} sub={member.meta} trailing={member.role || member.status} />
      {hasActions ? (
        <button className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block" style={{ marginTop: 10 }} type="button" disabled={pending} onClick={() => setOpen((current) => !current)}>
          관리
        </button>
      ) : null}
      {open && hasActions ? (
        <div className="tm-member-actions" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              className={`tm-btn tm-btn-sm ${action.tone === 'danger' ? 'tm-btn-danger' : 'tm-btn-neutral'} tm-btn-block`}
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
