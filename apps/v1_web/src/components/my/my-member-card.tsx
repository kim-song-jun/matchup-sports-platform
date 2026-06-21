'use client';

import { useState } from 'react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import type { MyMember } from './my.types';

export function MyMemberCard({ member }: { member: MyMember }) {
  const [open, setOpen] = useState(false);
  const actions = member.actions ?? [];
  /* #17: 액션이 없으면 관리 버튼 자체를 렌더하지 않음
   * (항상 disabled인 버튼은 affordance를 흐림) */
  const hasActions = actions.length > 0 && !member.actionPending;

  return (
    <Card pad={14}>
      <ListItem title={member.name} sub={member.meta} trailing={member.role || member.status} />
      {hasActions ? (
        <button className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block" style={{ marginTop: 10 }} type="button" onClick={() => setOpen((current) => !current)}>
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
