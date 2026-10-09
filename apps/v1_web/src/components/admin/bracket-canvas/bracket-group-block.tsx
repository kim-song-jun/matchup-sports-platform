// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.tsx
'use client';

import type { DragEvent } from 'react';
import type { GroupBlockLayout } from '@/lib/bracket-canvas-group-layout';
import { CANVAS_HEADER_HEIGHT, CANVAS_ROW_HEIGHT } from '@/lib/bracket-canvas-layout';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

export type BracketGroupBlockProps = {
  block: GroupBlockLayout;
  canWrite: boolean;
  /** 이 자리를 쓰는 경기 중 시작했거나 결과가 있는 경기가 있는 자리 — 서버 SLOT_LOCKED 와 같은 기준 */
  lockedSlotIds: ReadonlySet<string>;
  pendingRegistrationId: string | null;
  onPlace: (slotId: string, registrationId: string) => void;
  /** 팀을 고르지 않고 자리를 눌렀을 때 — 그 자리를 쓰는 경기의 패널을 연다 */
  onOpenSlot: (slotId: string) => void;
};

export function BracketGroupBlock({ block, canWrite, lockedSlotIds, pendingRegistrationId, onPlace, onOpenSlot }: BracketGroupBlockProps) {
  return (
    <section
      role="group"
      aria-label={`${block.name} 조 편성`}
      data-group-id={block.groupId}
      className="absolute overflow-hidden bg-[var(--card-surface)]"
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3" style={{ height: CANVAS_HEADER_HEIGHT }}>
        <span className="tm-text-label min-w-0 truncate font-semibold" style={{ color: 'var(--text-strong)' }}>
          {block.name}
        </span>
        {block.advanceCount ? (
          <span className="tm-badge tm-badge-sm tm-badge-blue shrink-0">상위 {block.advanceCount}팀 진출</span>
        ) : null}
      </div>
      <ul>
        {block.slots.map((slot) => {
          const filled = slot.registrationId !== null;
          const teamText = filled ? (slot.teamName ?? '') : '빈 자리';
          const assignable = canWrite && !lockedSlotIds.has(slot.id);
          const placing = assignable && pendingRegistrationId !== null;
          return (
            <li
              key={slot.id}
              className="border-t border-[var(--border)]"
              style={{ height: CANVAS_ROW_HEIGHT }}
              onDragOver={assignable ? (event: DragEvent) => event.preventDefault() : undefined}
              onDrop={
                assignable
                  ? (event: DragEvent) => {
                      event.preventDefault();
                      const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
                      if (registrationId !== '') onPlace(slot.id, registrationId);
                    }
                  : undefined
              }
            >
              <button
                type="button"
                aria-label={`${slot.label}, ${teamText}${placing ? ', 선택한 팀을 여기에 넣어요' : ''}`}
                onClick={() => (placing ? onPlace(slot.id, pendingRegistrationId) : onOpenSlot(slot.id))}
                className={`flex h-full w-full items-center gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500${placing ? ' tm-on-tint bg-[var(--blue50)]' : ''}`}
              >
                <span aria-hidden="true" className="tab-num tm-text-caption w-5 shrink-0 text-center" style={{ color: 'var(--text-muted)' }}>
                  {slot.position}
                </span>
                <span
                  className={`tm-text-label min-w-0 flex-1 truncate${filled ? ' font-semibold' : ''}`}
                  style={{ color: filled || placing ? 'var(--text-strong)' : 'var(--text-muted)' }}
                >
                  {teamText}
                </span>
                {placing ? (
                  <span className="tm-text-caption-strong shrink-0" style={{ color: 'var(--blue700)' }}>
                    여기에 넣기
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
