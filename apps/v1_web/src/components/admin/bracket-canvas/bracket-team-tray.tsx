'use client';

import { useMemo, type DragEvent } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import type { V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

export type BracketTeamTrayProps = {
  registrations: V1AdminTournamentRegistration[];
  slots: V1AdminBracketSlot[];
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onPick: (registrationId: string | null) => void;
};

export function BracketTeamTray({ registrations, slots, pendingRegistrationId, canWrite, onPick }: BracketTeamTrayProps) {
  const teams = useMemo(
    () =>
      registrations
        .filter((registration) => registration.status === 'confirmed')
        .map((registration) => ({ id: registration.id, name: registration.teamName ?? registration.teamId }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [registrations],
  );
  // 서버의 SLOT_TEAM_ALREADY_PLACED 는 ENTRY·BYE 사이에서 판정한다. 순위 자리는 결과로 채워지는 칸이라 세지 않는다.
  const placedIds = useMemo(
    () => new Set(slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId)),
    [slots],
  );
  const unplacedCount = teams.filter((team) => !placedIds.has(team.id)).length;

  return (
    <section aria-label="참가팀" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
          참가팀
        </h3>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {`미배정 ${unplacedCount} / 전체 ${teams.length}`}
        </span>
      </div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
        {canWrite ? '팀을 고른 뒤 비어 있는 자리를 누르거나, 팀을 끌어서 자리에 놓으세요.' : '읽기 전용이라 팀을 넣을 수 없어요.'}
      </p>
      {teams.length === 0 ? (
        <p className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
          확정된 참가팀이 아직 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {teams.map((team) => {
            const placed = placedIds.has(team.id);
            const selected = pendingRegistrationId === team.id;
            return (
              <li key={team.id}>
                <button
                  type="button"
                  draggable={canWrite && !placed}
                  disabled={!canWrite || placed}
                  aria-pressed={selected}
                  onClick={() => onPick(selected ? null : team.id)}
                  onDragStart={(event: DragEvent) => {
                    event.dataTransfer.setData(REGISTRATION_DRAG_MIME, team.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  className={`tm-on-tint flex min-h-[44px] w-full items-center gap-2 border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 ${
                    selected ? 'bg-[var(--blue50)] border-[var(--blue500)]' : 'bg-[var(--card-surface)] border-[var(--border)] hover:bg-[var(--surface-soft)]'
                  }`}
                  style={{ borderRadius: 'var(--radius-control)' }}
                >
                  <GripVertical size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                  <span className="tm-text-label min-w-0 flex-1 truncate" style={{ color: 'var(--text-strong)' }}>
                    {team.name}
                  </span>
                  {placed ? (
                    <span className="tm-text-caption-strong inline-flex items-center gap-1">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      배정됨
                    </span>
                  ) : selected ? (
                    <span className="tm-text-caption-strong" style={{ color: 'var(--blue700)' }}>
                      선택됨
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
