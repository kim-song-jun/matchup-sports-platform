'use client';

import { useState } from 'react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import type { MyMember } from './my.types';

export function MyMemberCard({ member }: { member: MyMember }) {
  const [open, setOpen] = useState(false);
  const disabled = member.actionPending || member.actions.length === 0;

  return (
    <Card pad={14}>
      <ListItem title={member.name} sub={member.meta} trailing={member.role || member.status} />
      <button className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block" style={{ marginTop: 10 }} type="button" disabled={disabled} onClick={() => setOpen((current) => !current)}>
        관리
      </button>
      {open && !disabled ? (
        <div className="tm-member-actions" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
          {member.actions.map((action) => (
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
