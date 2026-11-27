'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot } from '@/hooks/use-v1-bracket-canvas';
import { isFixtureLocked } from '@/lib/bracket-canvas-layout';
import { pickableCandidates, type MobilePickCandidate } from '@/lib/bracket-canvas-mobile-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { MultiFinalAssignmentDialog } from './multi-final-assignment-dialog';
import { ByeSideControl } from './bye-side-control';
import { fixtureTitle } from './bracket-canvas';

export function ByeSlotEditor({ tournamentId, slot, fixture, fixtures, groups, slots, candidates, canWrite, registrationsLoaded, onClose }: {
  tournamentId: string; slot: V1AdminBracketSlot; fixture: V1AdminBracketFixture; fixtures?: readonly V1AdminBracketFixture[]; groups: readonly V1AdminBracketGroup[];
  slots: V1AdminBracketSlot[]; candidates: MobilePickCandidate[]; canWrite: boolean; registrationsLoaded: boolean; onClose?: () => void;
}) {
  const id = useId();
  const [finalOpen, setFinalOpen] = useState(false);
  const track = groups.find(group => group.id === slot.groupId)?.bracketTrack;
  const namedFinal = track && !track.startsWith('stage:') && !['overall', 'upper', 'lower'].includes(track);
  const update = useV1UpdateFixture(tournamentId);
  const assign = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const [label, setLabel] = useState(slot.displayLabel ?? '');
  const [team, setTeam] = useState(slot.registrationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const labelDirty = useRef(false);
  const teamDirty = useRef(false);
  useEffect(() => { if (!labelDirty.current) setLabel(slot.displayLabel ?? ''); }, [slot.displayLabel]);
  useEffect(() => { if (!teamDirty.current) setTeam(slot.registrationId ?? ''); }, [slot.registrationId]);
  const home = fixture.homeSlotId === slot.id;
  const pending = update.isPending || assign.isPending;
  const locked = isFixtureLocked(fixture);
  const options = pickableCandidates(candidates, slots, slot, groups);
  const peers = slots.filter(row => row.id !== slot.id && row.groupId === slot.groupId && row.registrationId &&
    !options.some(candidate => candidate.registrationId === row.registrationId));
  const peer = peers.find(row => row.registrationId === team);
  return <section aria-label="부전승 자리 편집" className="flex flex-col gap-3 p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="tm-text-body-lg font-bold">부전승 자리</h2>{onClose ? <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost min-h-[44px]" onClick={onClose}>닫기</button> : null}</div>
    <p className="tm-text-caption text-[var(--text-muted)]">연결 위치: {fixtureTitle(fixture, groups)} · {home ? '홈' : '어웨이'}</p>
    <ByeSideControl selectedSlotId={slot.id} tournamentId={tournamentId} fixture={fixture} fixtures={fixtures} slots={slots} onSaved={onClose} canWrite={canWrite && !pending}
      showToast={(text, variant) => { setError(variant === 'error' ? text : null); setMessage(variant === 'error' ? null : text); }} />
    <form className="flex flex-col gap-2" onSubmit={async event => {
      event.preventDefault(); setError(null); setMessage(null);
      try { await update.mutateAsync({ fixtureId: fixture.id, [home ? 'homeDisplayLabel' : 'awayDisplayLabel']: label.trim() || null }); labelDirty.current = false; setMessage('표시 문구를 저장했어요.'); }
      catch (err) { setError(extractErrorMessage(err, '표시 문구를 저장하지 못했어요.')); }
    }}>
      <label htmlFor={`${id}-label`} className="tm-text-label">표시 문구</label>
      <p className="tm-text-caption text-[var(--text-muted)]">자동 문구: {slot.automaticLabel ?? slot.label}</p>
      <input id={`${id}-label`} className="tm-input" maxLength={120} value={label} placeholder={slot.automaticLabel ?? slot.label} disabled={!canWrite || pending} onChange={event => { labelDirty.current = true; setLabel(event.target.value); setMessage(null); }} />
      <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={!canWrite || pending || !label} onClick={() => { labelDirty.current = true; setLabel(''); }}>자동 문구 복원</button>
      {canWrite ? <button type="submit" className="tm-btn tm-btn-md tm-btn-outline" disabled={pending}>문구 저장</button> : null}
    </form>
    {namedFinal ? <>
      <button type="button" className="tm-btn tm-btn-outline" disabled={!canWrite} onClick={() => setFinalOpen(true)}>결선 배정팀 변경</button>
      {finalOpen && <MultiFinalAssignmentDialog tournamentId={tournamentId} initialFinal={track} open onClose={() => setFinalOpen(false)} onApplied={() => setFinalOpen(false)} />}
    </> : <>
    <label htmlFor={`${id}-team`} className="tm-text-label">배정팀</label>
    <select id={`${id}-team`} className="tm-input" value={team} disabled={!canWrite || pending || locked || !registrationsLoaded} onChange={event => { teamDirty.current = true; setTeam(event.target.value); setMessage(null); }}>
      <option value="">미정</option>{options.map(candidate => <option key={candidate.registrationId} value={candidate.registrationId}>{candidate.teamName}</option>)}
      {peers.map(row => <option key={row.id} value={row.registrationId!}>{row.teamName ?? candidates.find(team => team.registrationId === row.registrationId)?.teamName ?? row.label} · 자리 교환</option>)}
    </select>
    {locked ? <p className="tm-text-caption text-[var(--text-muted)]">연결된 경기가 시작되었거나 결과가 있어 팀을 바꿀 수 없어요.</p> : null}
    {canWrite ? <button type="button" className="tm-btn tm-btn-md tm-btn-outline" disabled={pending || locked || !registrationsLoaded || team === (slot.registrationId ?? '')} onClick={async () => {
      setError(null); setMessage(null);
      try { await assign.mutateAsync({ slotId: slot.id, registrationId: team || null, ...(peer && { swapSlotId: peer.id, expectedRegistrationId: slot.registrationId }) }); teamDirty.current = false; setMessage('배정팀을 저장했어요.'); }
      catch (err) { setError(extractErrorMessage(err, '배정팀을 저장하지 못했어요.')); }
    }}>팀 저장</button> : null}
    </>}
    {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    {message ? <p role="status" className="tm-text-caption text-[var(--text-muted)]">{message}</p> : null}
    <p className="tm-text-caption text-[var(--text-muted)]">경기 번호·시각·경기장은 연결된 경기에서 수정해요.</p>
  </section>;
}
