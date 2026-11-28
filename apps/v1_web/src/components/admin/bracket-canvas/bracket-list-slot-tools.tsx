'use client';
import { SixTeamDecisionPanel } from './six-team-template-dialog';
import { useV1AssignTournamentSlot } from '@/hooks/use-v1-bracket-canvas';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketGroup, V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';

/** 목록 보기에만 남는 도구 — 6강 진출 관리와 조별 팀 자리 편집. 만들기·무작위 배정·결선 진출팀은 위의 도구 줄 메뉴에 있다. */
export function BracketListSlotTools({ tournamentId, groups, slots, registrations, canWrite, showToast }: {
  tournamentId: string; groups: V1AdminBracketGroup[]; slots: V1AdminBracketSlot[]; registrations: V1AdminTournamentRegistration[];
  canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const assign = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const entryGroups = groups.filter((group) => group.phase === 'group' && slots.some((slot) => slot.groupId === group.id && slot.kind === 'ENTRY'));
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  return <section className="flex flex-col gap-4">
    <SixTeamDecisionPanel tournamentId={tournamentId} />
    {entryGroups.length > 0 ? <details>
      <summary className="tm-text-label min-h-[44px] cursor-pointer font-semibold">조별 팀 자리 편집 · 연결된 경기들에 함께 반영돼요</summary>
      <div className="grid gap-4 md:grid-cols-2">
        {entryGroups.map((group) => <fieldset key={group.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
          <legend className="tm-text-label font-semibold">{group.name}</legend>
          {slots.filter((slot) => slot.groupId === group.id && slot.kind === 'ENTRY').sort((a, b) => a.position - b.position).map((slot) =>
            <label key={slot.id} className="tm-text-label flex flex-col gap-1">{slot.label}
              <select className="tm-input min-h-[44px]" value={slot.registrationId ?? ''} disabled={!canWrite || assign.isPending}
                onChange={(event) => assign.mutate({ slotId: slot.id, registrationId: event.target.value || null }, {
                  onSuccess: () => showToast('조별 자리와 연결된 경기들의 팀을 바꿨어요.', 'success'),
                  onError: (error) => showToast(extractErrorMessage(error, '팀 배정에 실패했어요.'), 'error'),
                })}>
                <option value="">팀 미정</option>
                {confirmed.map((registration) => <option key={registration.id} value={registration.id}
                  disabled={slots.some((other) => other.kind === 'ENTRY' && other.id !== slot.id && other.registrationId === registration.id)}>
                  {registration.teamName}
                </option>)}
              </select>
            </label>)}
        </fieldset>)}
      </div>
    </details> : null}
  </section>;
}
