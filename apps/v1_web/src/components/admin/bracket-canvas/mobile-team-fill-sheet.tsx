'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AdminToastVariant } from '@/components/admin';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { directPlacedRegistrationIds } from '@/lib/bracket-canvas-layout';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentBracket, V1AdminTournamentRegistration } from '@/types/api';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { teamFillTargets } from './team-fill-targets';
import { useTeamPlacement } from './use-team-placement';

const ROW = 'flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--grey50)] disabled:opacity-50';

/** 폰에는 끌어 놓기가 없다 — 자리 없는 팀을 고르고 넣을 자리를 고르는 두 단계 시트. */
export function MobileTeamFillSheet({ open, onClose, tournamentId, bracket, registrations, registrationsState, showToast }: {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  bracket: V1AdminTournamentBracket;
  registrations: readonly V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const placement = useTeamPlacement(tournamentId, bracket, showToast, () => setPickedId(null));
  const unplaced = useMemo(() => {
    const placedIds = new Set(bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
    const directIds = directPlacedRegistrationIds(bracket.fixtures, bracket.slots);
    return registrations
      .filter((registration) => registration.status === 'confirmed' && !placedIds.has(registration.id) && !directIds.has(registration.id))
      .map((registration) => ({ id: registration.id, name: registration.teamName ?? registration.teamId }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [bracket, registrations]);
  const picked = unplaced.find((team) => team.id === pickedId) ?? null;
  const targets = useMemo(
    () => (picked === null ? [] : teamFillTargets({ fixtures: bracket.fixtures, slots: bracket.slots, groups: bracket.groups, registrationId: picked.id })),
    [bracket, picked],
  );

  let body;
  if (registrationsState.status === 'pending') {
    body = <p role="status" className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">참가팀을 불러오는 중이에요.</p>;
  } else if (registrationsState.status === 'error') {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">{extractErrorMessage(registrationsState.error, '참가팀을 불러오지 못했어요.')}</p>
        <button type="button" onClick={registrationsState.onRetry} className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px]">다시 시도</button>
      </div>
    );
  } else if (picked === null) {
    body = unplaced.length === 0 ? (
      <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">자리 없는 팀이 없어요</p>
    ) : (
      <ul role="list" aria-label="자리 없는 팀" className="flex flex-col gap-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y', maxHeight: '50dvh' }}>
        {unplaced.map((team) => (
          <li key={team.id}><button type="button" className={ROW} onClick={() => setPickedId(team.id)}>{team.name}</button></li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setPickedId(null)} className="tm-btn tm-btn-sm tm-btn-ghost min-h-[44px] self-start">
          <ChevronLeft size={16} aria-hidden="true" />팀 다시 고르기
        </button>
        <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{picked.name} · 넣을 자리</p>
        {targets.length === 0 ? (
          <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">넣을 수 있는 자리가 없어요.</p>
        ) : (
          <ul role="list" aria-label="넣을 자리" className="flex flex-col gap-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y', maxHeight: '50dvh' }}>
            {targets.map((target) => (
              <li key={target.key}>
                <button
                  type="button"
                  disabled={placement.pending}
                  className={ROW}
                  onClick={() => (target.slotId === null ? placement.placeDirect(target.fixtureId, target.side, picked.id) : placement.placeIntoSlot(target.slotId, picked.id))}
                >
                  {target.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="참가팀 목록">
      <div className="flex flex-col gap-3 pb-1">{body}</div>
    </BottomSheet>
  );
}
