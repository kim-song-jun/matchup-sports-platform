'use client';
import { useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { BracketTemplateDialog } from './bracket-template-dialog';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketGroup, V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';

export function BracketListTemplateTools({ tournamentId, format, hasExistingBracket, groups, slots, registrations, showToast }: {
  tournamentId: string; format: 'knockout' | 'league' | 'group_knockout'; hasExistingBracket: boolean;
  groups: V1AdminBracketGroup[]; slots: V1AdminBracketSlot[]; registrations: V1AdminTournamentRegistration[];
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const [open, setOpen] = useState(false);
  const assign = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const randomFill = useV1RandomFillSlots(tournamentId, 'tournament');
  const { confirm, ConfirmModal } = useConfirm();
  const entryGroups = groups.filter((group) => group.phase === 'group' && slots.some((slot) => slot.groupId === group.id && slot.kind === 'ENTRY'));
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const pending = assign.isPending || randomFill.isPending;
  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="md" onClick={() => setOpen(true)} disabled={pending}>전체 대진 만들기</Button>
      {entryGroups.length > 0 ? <Button variant="neutral" size="md" disabled={pending} onClick={async () => {
        if (!await confirm({ title: '조별 빈 자리 무작위 배정', message: '이미 배정한 팀은 유지하고 조별리그의 빈 자리에 확정 참가팀을 무작위로 넣어요. 결선 팀은 넣지 않아요.', confirmLabel: '무작위 배정' })) return;
        randomFill.mutate(undefined, {
          onSuccess: (result) => showToast(`조별 ${result.assignments.length}자리에 팀을 배정했어요.`, 'success'),
          onError: (error) => showToast(extractErrorMessage(error, '무작위 배정에 실패했어요.'), 'error'),
        });
      }}>조별 빈 자리 무작위 배정</Button> : null}
    </div>
    {entryGroups.length > 0 ? <details>
      <summary className="tm-text-label min-h-[44px] cursor-pointer font-semibold">조별 팀 자리 편집 · 연결된 경기들에 함께 반영돼요</summary>
      <div className="grid gap-4 md:grid-cols-2">
        {entryGroups.map((group) => <fieldset key={group.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
          <legend className="tm-text-label font-semibold">{group.name}</legend>
          {slots.filter((slot) => slot.groupId === group.id && slot.kind === 'ENTRY').sort((a, b) => a.position - b.position).map((slot) =>
            <label key={slot.id} className="tm-text-label flex flex-col gap-1">{slot.label}
              <select className="tm-input min-h-[44px]" value={slot.registrationId ?? ''} disabled={pending}
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
    {open ? <BracketTemplateDialog open tournamentId={tournamentId} format={format} hasExistingBracket={hasExistingBracket} onClose={() => setOpen(false)} showToast={showToast} /> : null}
    {ConfirmModal}
  </section>;
}
