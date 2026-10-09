'use client';

import { useMemo, type DragEvent } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import type { V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

/** 신청 목록 조회 상태 — 불러오는 중·실패를 "참가팀 0팀"으로 보여 주지 않으려고 트레이·패널까지 내린다. */
export type RegistrationsLoadState = {
  status: 'pending' | 'error' | 'success';
  /** 안전 상한에 걸려 일부만 불러왔을 때 true */
  truncated: boolean;
  error: unknown;
  onRetry: () => void;
};

const NO_IDS: ReadonlySet<string> = new Set();

export type BracketTeamTrayProps = {
  registrations: V1AdminTournamentRegistration[];
  slots: V1AdminBracketSlot[];
  /** 자리 없이 경기에 직접 들어간 팀 — "경기에 있음"으로 보이고 미배정 수에서 빠지지만 계속 고를 수 있다. */
  directPlacedIds?: ReadonlySet<string>;
  registrationsState: RegistrationsLoadState;
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onPick: (registrationId: string | null) => void;
};

export function BracketTeamTray({
  registrations,
  slots,
  directPlacedIds = NO_IDS,
  registrationsState,
  pendingRegistrationId,
  canWrite,
  onPick,
}: BracketTeamTrayProps) {
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
  const unplacedCount = teams.filter((team) => !placedIds.has(team.id) && !directPlacedIds.has(team.id)).length;

  return (
    <section aria-label="참가팀" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
          참가팀
        </h3>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {registrationsState.status === 'success' ? `미배정 ${unplacedCount} / 전체 ${teams.length}` : null}
        </span>
      </div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
        {canWrite ? '팀을 고른 뒤 비어 있는 자리를 누르거나, 팀을 끌어서 자리에 놓으세요.' : '읽기 전용이라 팀을 넣을 수 없어요.'}
      </p>
      {registrationsState.status === 'pending' ? (
        <p role="status" className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
          참가팀을 불러오는 중이에요.
        </p>
      ) : registrationsState.status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
            {extractErrorMessage(registrationsState.error, '참가팀을 불러오지 못했어요.')}
          </p>
          <button type="button" onClick={registrationsState.onRetry} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
            다시 시도
          </button>
        </div>
      ) : teams.length === 0 ? (
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
                  ) : directPlacedIds.has(team.id) && !selected ? (
                    <span className="tm-text-caption-strong" style={{ color: 'var(--text-muted)' }}>
                      경기에 있음
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
      {registrationsState.status === 'success' && registrationsState.truncated ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          참가팀이 많아 일부만 불러왔어요.
        </p>
      ) : null}
    </section>
  );
}
