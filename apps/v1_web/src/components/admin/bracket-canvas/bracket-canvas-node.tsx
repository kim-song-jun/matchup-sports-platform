'use client';

import { Zap } from 'lucide-react';
import type { DragEvent } from 'react';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { bracketNodeStateChip } from '@/lib/competition-status';
import {
  CANVAS_FOOTER_HEIGHT,
  CANVAS_HEADER_HEIGHT,
  CANVAS_ROW_HEIGHT,
  classifyFixtureSide,
  fixtureNodeState,
  isFixtureLocked,
  isSlotAssignable,
  type CanvasNodeLayout,
  type SideKey,
} from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '어웨이' };

export type BracketCanvasNodeProps = {
  fixture: V1AdminBracketFixture;
  position: CanvasNodeLayout;
  title: string;
  sideLabels: Record<SideKey, string>;
  slots: { HOME: V1AdminBracketSlot | null; AWAY: V1AdminBracketSlot | null };
  selected: boolean;
  canWrite: boolean;
  pendingRegistrationId: string | null;
  onSelect: (fixtureId: string) => void;
  onAssign: (slotId: string, registrationId: string) => void;
  onAssignDirect: (fixtureId: string, side: SideKey, registrationId: string) => void;
};

export function BracketCanvasNode({
  fixture,
  position,
  title,
  sideLabels,
  slots,
  selected,
  canWrite,
  pendingRegistrationId,
  onSelect,
  onAssign,
  onAssignDirect,
}: BracketCanvasNodeProps) {
  const state = fixtureNodeState(fixture.game);
  const chip = bracketNodeStateChip(state);
  const locked = isFixtureLocked(fixture);
  const revision = fixture.game?.latestRevision ?? null;
  const voided = revision?.state === 'VOID';
  const score = voided ? null : (revision?.score ?? null);
  const quick = !voided && revision?.entryMethod === 'quick';
  const penalty = score?.penalties ? `승부차기 ${score.penalties.home}:${score.penalties.away}` : null;
  const footer = [voided ? '무효 처리됨' : quick ? '어드민 빠른 입력' : null, penalty].filter((part): part is string => part !== null);

  const resolvedSlots = new Map([slots.HOME, slots.AWAY].filter((slot): slot is V1AdminBracketSlot => slot !== null).map((slot) => [slot.id, slot]));

  const renderSide = (side: SideKey) => {
    const slot = slots[side];
    const direct = classifyFixtureSide(fixture, side, resolvedSlots) === 'direct';
    const assignable = canWrite && !locked && (direct || (slot !== null && isSlotAssignable(slot)));
    const placing = assignable && pendingRegistrationId !== null;
    const filled = (side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId) !== null;
    const place = (registrationId: string) => (direct ? onAssignDirect(fixture.id, side, registrationId) : slot !== null && onAssign(slot.id, registrationId));
    const sideScore = score === null ? null : side === 'HOME' ? score.home : score.away;
    return (
      <div
        key={side}
        data-side={side}
        className="border-t border-[var(--border)]"
        style={{ height: CANVAS_ROW_HEIGHT }}
        onDragOver={assignable ? (event: DragEvent) => event.preventDefault() : undefined}
        onDrop={
          assignable
            ? (event: DragEvent) => {
                event.preventDefault();
                const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
                if (registrationId !== '') place(registrationId);
              }
            : undefined
        }
      >
        <button
          type="button"
          aria-label={`${SIDE_NAME[side]} ${sideLabels[side]}${placing ? ', 선택한 팀을 여기에 넣어요' : ''}`}
          onClick={() => (placing ? place(pendingRegistrationId) : onSelect(fixture.id))}
          className={`flex h-full w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500${placing ? ' tm-on-tint bg-[var(--blue50)]' : ''}`}
        >
          <span
            className={`tm-text-label min-w-0 flex-1 truncate${filled ? ' font-semibold' : ''}`}
            style={{ color: filled || placing ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {sideLabels[side]}
          </span>
          {placing ? (
            <span className="tm-text-caption-strong shrink-0" style={{ color: 'var(--blue700)' }}>
              여기에 넣기
            </span>
          ) : sideScore !== null ? (
            <span className="tab-num tm-text-body-lg shrink-0 font-bold" style={{ color: 'var(--text-strong)' }}>
              {sideScore}
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={`${title}, ${chip.label}`}
      data-fixture-id={fixture.id}
      data-state={state}
      className="absolute overflow-hidden bg-[var(--card-surface)]"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        borderRadius: 'var(--radius-container)',
        // 선택은 색만이 아니라 두께로도 구분한다(색만으로 정보 전달 금지).
        border: selected ? '2px solid var(--blue500)' : '1px solid var(--border-strong)',
      }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${title} 열기`}
        onClick={() => onSelect(fixture.id)}
        className="flex w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
        style={{ height: CANVAS_HEADER_HEIGHT }}
      >
        <span className="tm-text-label min-w-0 truncate font-semibold" style={{ color: 'var(--text-strong)' }}>
          {title}
        </span>
        <StatusChip chip={chip} />
      </button>
      {renderSide('HOME')}
      {renderSide('AWAY')}
      <div
        className="tm-text-caption flex items-center gap-1 border-t border-[var(--border)] px-3"
        style={{ height: CANVAS_FOOTER_HEIGHT, color: 'var(--text-muted)' }}
      >
        {quick ? <Zap size={12} aria-hidden="true" /> : null}
        <span className="truncate">{footer.join(' · ')}</span>
      </div>
    </div>
  );
}
