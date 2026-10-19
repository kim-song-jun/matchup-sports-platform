'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { AddPlayerForm, TournamentRosterDeadlineCard, formatRosterBirthDate } from '@/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client';
import { useV1AddPlayer, useV1Registration, useV1RemovePlayer, useV1TeamDetail, useV1Tournament,
  useV1TournamentPlayers, useV1UpdatePlayer, useV1UpdatePlayerRosterSettings } from '@/hooks/use-v1-api';
import type { V1PlayerEligibilityStatus } from '@/types/api';
import { getRosterDeadlineState, isTournamentRosterMutable, rosterEditBlockReason } from '@/lib/roster-editability';
import { compareRosterPlayers, rosterDisplayName, ROSTER_SAVE_LABEL } from '@/lib/roster-presentation';
import { parseJerseyInput } from '@/lib/jersey-number';
import { extractErrorMessage } from '@/lib/error-message';
import { rosterLimitText } from '@/lib/roster-limit';
import { PLAYER_ELIGIBILITY_LABEL } from '@/lib/v1-status-labels';
import { formatTournamentDateTimeLong } from '@/lib/date-utils';
import { closeOverlayThenNavigate } from '@/lib/overlay-history';
import { AlertBanner, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { Button } from '@/components/v1-ui/button';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useUnsavedChangesGuard } from '@/components/v1-ui/use-unsaved-changes-guard';
import { GameRosterPlayerRow, RosterPlayerColumns } from './game-roster-player-row';
import { useRosterEditorNavigation } from './roster-manager-navigation';
import styles from './participant-roster-editor.module.css';

type Settings = { jerseyNumber: number | null; goalkeeper: boolean };

export function ParticipantRosterEditor({ tournamentId, registrationId }: { tournamentId: string; registrationId: string }) {
  const tournament = useV1Tournament(tournamentId);
  const registration = useV1Registration(tournamentId, registrationId);
  const roster = useV1TournamentPlayers(tournamentId, registrationId);
  const team = useV1TeamDetail(registration.data?.teamId ?? '');
  const update = useV1UpdatePlayerRosterSettings(tournamentId, registrationId);
  const updateEligibility = useV1UpdatePlayer(tournamentId, registrationId);
  const remove = useV1RemovePlayer(tournamentId, registrationId);
  const add = useV1AddPlayer(tournamentId, registrationId);
  const { confirm, ConfirmModal } = useConfirm();
  const [draft, setDraft] = useState<Record<string, Settings>>({});
  const [number, setNumber] = useState<{ id: string; value: string } | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<V1PlayerEligibilityStatus>('needs_review');
  const [adding, setAdding] = useState(false);
  const [addFooter, setAddFooter] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const id = useId();
  const players = (roster.data?.players ?? []).map(player => ({ ...player, displayName: rosterDisplayName(player) })).sort(compareRosterPlayers);
  const registered = useMemo(() => new Set((roster.data?.players ?? []).map(p => p.userId)), [roster.data]);
  const permissionResolved = Boolean(team.data && registration.data) && !team.isPending && !team.isPlaceholderData && !team.isError;
  const manager = permissionResolved && (team.data?.viewer.role === 'owner' || team.data?.viewer.role === 'manager');
  const deadline = getRosterDeadlineState(tournament.data?.rosterDeadlineAt, registration.data?.rosterDeadlineOverrideAt);
  const closed = !isTournamentRosterMutable(tournament.data);
  const locked = Boolean(registration.data?.rosterLockedAt);
  const cancelled = registration.data?.status === 'cancel_requested' || registration.data?.status === 'cancelled';
  const editable = manager && Boolean(tournament.data) && rosterEditBlockReason({
    isTournamentRosterClosed: closed, isRosterLocked: locked,
    isRosterEditBlockedByStatus: cancelled, isRosterDeadlineBlocked: deadline.blocked,
  }) === null;
  const changes = players.filter(p => draft[p.id] && (draft[p.id].jerseyNumber !== p.jerseyNumber || draft[p.id].goalkeeper !== (p.goalkeeper ?? false)));
  const dirty = changes.length > 0 || adding || number !== null;
  const busy = saving || add.isPending || remove.isPending || updateEligibility.isPending;
  const { UnsavedChangesModal } = useUnsavedChangesGuard(dirty);
  const current = (id: string): Settings => draft[id] ?? {
    jerseyNumber: players.find(p => p.id === id)?.jerseyNumber ?? null,
    goalkeeper: players.find(p => p.id === id)?.goalkeeper ?? false,
  };
  function patch(id: string, value: Partial<Settings>) {
    setNotice(null);
    setDraft(prev => ({ ...prev, [id]: { ...current(id), ...value } }));
  }
  async function save() {
    if (savingRef.current || !editable) return false;
    if (adding || number) { setError('열린 입력을 먼저 적용하거나 닫아 주세요.'); return false; }
    savingRef.current = true; setSaving(true); setError(null); setNotice(null);
    let completed = 0;
    try {
      // 서버는 행마다 지금 DB 기준으로 번호 중복을 검사한다. 번호를 맞바꾸면(A 7→10, B 10→7) 첫 저장이 409 가 나므로
      // 다른 선수가 가져갈 번호를 쥔 행은 먼저 번호를 비운다.
      const targets = new Set(changes.map(p => draft[p.id].jerseyNumber).filter((n): n is number => n !== null));
      for (const player of changes) {
        if (player.jerseyNumber !== null && draft[player.id].jerseyNumber !== player.jerseyNumber && targets.has(player.jerseyNumber)) {
          await update.mutateAsync({ playerId: player.id, jerseyNumber: null });
        }
      }
      // 행마다 서버 트랜잭션으로 저장한다. 일부 성공 뒤 실패하면 남은 초안을 유지하고 실제 결과를 안내한다.
      for (const player of changes) {
        const value = draft[player.id];
        await update.mutateAsync({ playerId: player.id,
          ...(value.jerseyNumber !== player.jerseyNumber ? { jerseyNumber: value.jerseyNumber } : {}),
          ...(value.goalkeeper !== (player.goalkeeper ?? false) ? { goalkeeper: value.goalkeeper } : {}),
        });
        completed++;
        setDraft(prev => { const next = { ...prev }; delete next[player.id]; return next; });
      }
      setNotice('참가 선수의 공통 설정을 저장했어요.');
      return true;
    } catch (caught) {
      setError(`${completed ? `${completed}명은 저장됐어요. 나머지 변경을 다시 저장해 주세요. ` : ''}${extractErrorMessage(caught, '참가 선수 설정을 저장하지 못했어요.')}`);
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }
  useRosterEditorNavigation({ dirty, busy, save, discard: () => { setDraft({}); setAdding(false); setNumber(null); } });
  const info = players.find(p => p.id === infoId);
  const numberPlayer = players.find(p => p.id === number?.id);
  const noun = tournament.data?.kind === 'regular_league' ? '리그' : '대회';

  if (roster.isError || registration.isError || tournament.isError) {
    const failed = roster.isError ? roster : registration.isError ? registration : tournament;
    return <ErrorState title="참가 명단을 불러오지 못했어요" message={extractErrorMessage(failed.error, '참가 명단 조회에 실패했어요.')} onRetry={() => void failed.refetch()} />;
  }
  if (!roster.data || !registration.data || !tournament.data) return <PageSkeleton variant="list" />;
  return <div className={styles.editor}>
    <TournamentRosterDeadlineCard deadlineAt={tournament.data.registrationDeadlineAt}
      tournamentStatus={tournament.data.status} isTournamentRosterClosed={closed}
      isRosterLocked={locked} isRosterEditBlockedByStatus={cancelled} isRosterDeadlineBlocked={deadline.blocked}
      canManageRoster={manager} permissionResolved={permissionResolved}
      season={noun === '리그' ? { startAt: tournament.data.scheduledAt, endAt: tournament.data.scheduledEndAt, status: tournament.data.status } : null} />
    {team.isError ? <ErrorState title="수정 권한을 확인하지 못했어요" message={extractErrorMessage(team.error, '팀 조회에 실패했어요.')} onRetry={() => void team.refetch()} /> : null}
    <p className="tm-text-caption">{noun} 공통 설정이에요. 선수·번호·GK 변경은 시작 전 경기에 반영돼요.</p>
    {roster.data.belowMinimum ? <AlertBanner tone="warning" message={`최소 ${tournament.data.minPlayers}명 이상 등록해야 해요. 현재 ${Math.max(0, tournament.data.minPlayers - players.length)}명이 부족해요.`} /> : null}
    {tournament.data.rosterDeadlineAt ? <p className="tm-text-caption">명단 제출 마감 · {formatTournamentDateTimeLong(tournament.data.rosterDeadlineAt)}{deadline.overridden ? ' · 운영진이 수정 예외를 허용했어요.' : ''}</p> : null}
    <div className={styles.heading}>
      <div><SectionTitle compact title={`참가 선수 ${players.length}명`} /><p className="tm-text-caption">{rosterLimitText(tournament.data.minPlayers, tournament.data.maxPlayers, (min, max) => `최소 ${min}명 · 최대 ${max}명`)}</p></div>
      {editable && players.length < (tournament.data.maxPlayers ?? Infinity) ? <Button variant="outline" size="sm" disabled={busy || adding} onClick={() => { setAdding(true); setAddError(null); }}>선수 추가</Button> : null}
    </div>
    {error ? <AlertBanner tone="error" message={error} /> : null}
    {notice ? <AlertBanner tone="info" message={notice} /> : null}
    {adding && editable ? <>
      <AddPlayerForm formId={`${id}-add`} teamId={registration.data.teamId} genderCategory={tournament.data.genderCategory}
        registeredUserIds={registered} pendingUserIds={new Set()} isSubmitting={add.isPending} error={addError}
        isActive multipleDrafts={false} onActivate={() => {}} onFooterNeededChange={() => {}}
        footerSlot={addFooter} onUserChange={() => {}} onRemove={() => setAdding(false)}
        onSubmit={async (_id, form) => {
          const jersey = parseJerseyInput(form.jerseyNumber);
          if (!jersey.ok) { setAddError('등번호는 0에서 99 사이 숫자로 입력해 주세요.'); return; }
          if (add.isPending) return;
          try { await add.mutateAsync({ userId: form.userId, realName: form.realName, birthDate: form.birthDate,
            eligibilityStatus: form.eligibilityStatus, ...(jersey.value === undefined ? {} : { jerseyNumber: jersey.value }) });
            setAdding(false); setNotice('선수를 추가했어요. 시작 전 경기에도 반영돼요.');
          } catch (caught) { setAddError(extractErrorMessage(caught, '선수를 추가하지 못했어요.')); }
        }} />
      <div ref={setAddFooter} />
    </> : null}
    <RosterPlayerColumns action="관리" />
    {players.length ? <ul className={styles.list}>
      {players.map(player => <li key={player.id}>
        <GameRosterPlayerRow displayName={player.displayName} jerseyNumber={current(player.id).jerseyNumber} accountLinked
          onJerseyPress={editable && !busy ? () => { setNumber({ id: player.id, value: current(player.id).jerseyNumber?.toString() ?? '' }); setSheetError(null); } : undefined}
          trailing={<div className={styles.actions}>
            {editable ? <Button size="sm" variant="outline"
              aria-pressed={current(player.id).goalkeeper} aria-label={`${player.displayName} GK 지정`} disabled={busy}
              onClick={() => patch(player.id, { goalkeeper: !current(player.id).goalkeeper })}>GK</Button> : <span className={styles.gk}>{player.goalkeeper ? 'GK' : ''}</span>}
            <Button variant="ghost" size="sm" aria-label={`${player.displayName} 선수 정보`} onClick={() => { setInfoId(player.id); setEligibility(player.eligibilityStatus); setSheetError(null); }}>⋯</Button>
          </div>} />
      </li>)}
    </ul> : <EmptyState title="등록된 선수가 없어요" sub={editable ? '팀원을 참가 선수로 추가해 주세요.' : '팀장에게 참가 명단 등록을 요청해 주세요.'} />}
    <footer className={styles.footer}>
      <p className="tm-text-caption">{noun} 공통 설정 · {changes.length ? `${changes.length}명 변경` : '변경사항 없음'}</p>
      {editable ? <Button block size="lg" loading={saving} disabled={!changes.length || busy || adding} onClick={() => void save()}>{ROSTER_SAVE_LABEL}</Button> : null}
    </footer>
    <BottomSheet open={Boolean(numberPlayer)} title={`${numberPlayer?.displayName ?? '선수'} 등번호`} onClose={() => setNumber(null)}>
      <div className={styles.sheet}>
        <label className="tm-text-label" htmlFor={`${id}-jersey`}>등번호</label>
        <input className="tm-input" id={`${id}-jersey`} inputMode="numeric" maxLength={2} value={number?.value ?? ''}
          onChange={event => setNumber(prev => prev ? { ...prev, value: event.target.value } : prev)} />
        <p className="tm-text-caption">0~99를 입력해 주세요. 비우면 번호 없는 선수로 표시돼요.</p>
        {sheetError ? <AlertBanner tone="error" message={sheetError} /> : null}
        <Button block disabled={!editable} onClick={() => {
          if (!number) return;
          const parsed = parseJerseyInput(number.value);
          if (!parsed.ok) { setSheetError('등번호는 0에서 99 사이 숫자로 입력해 주세요.'); return; }
          const jerseyNumber = parsed.value ?? null;
          if (jerseyNumber !== null && players.some(p => p.id !== number.id && current(p.id).jerseyNumber === jerseyNumber)) {
            setSheetError('같은 팀에서 이미 사용 중인 등번호예요.'); return;
          }
          patch(number.id, { jerseyNumber }); setNumber(null);
        }}>적용</Button>
      </div>
    </BottomSheet>
    <BottomSheet open={Boolean(info)} title={info?.displayName ?? '선수 정보'} onClose={() => { if (!busy) setInfoId(null); }}>
      {info ? <div className={styles.sheet}>
        {info.personalInfoVisible ? <p className="tm-text-caption">등록 이름 {info.realName} · {formatRosterBirthDate(info.birthDateSnapshot)}</p> : null}
        <label className="tm-text-label" htmlFor={`${id}-eligibility`}>선출 여부</label>
        <select id={`${id}-eligibility`} className="tm-input" value={eligibility} disabled={!editable || busy}
          onChange={event => setEligibility(event.target.value as V1PlayerEligibilityStatus)}>
          {(['needs_review','non_pro','pro'] as const).map(value => <option key={value} value={value}>{PLAYER_ELIGIBILITY_LABEL[value]}</option>)}
        </select>
        {sheetError ? <AlertBanner tone="error" message={sheetError} /> : null}
        {editable ? <>
          <Button block loading={updateEligibility.isPending} disabled={eligibility === info.eligibilityStatus || busy}
            onClick={async () => { try { await updateEligibility.mutateAsync({ playerId: info.id, body: { eligibilityStatus: eligibility } }); setInfoId(null); }
              catch (caught) { setSheetError(extractErrorMessage(caught, '선수 정보를 저장하지 못했어요.')); } }}>선수 정보 저장</Button>
          <Button block variant="ghost" disabled={busy} onClick={async () => {
            const player = info;
            await closeOverlayThenNavigate(() => setInfoId(null), () => {});
            const ok = await confirm({ title: '참가 명단에서 제외할까요?', message: `${player.displayName} 선수가 ${noun} 참가 명단과 시작 전 경기에서 빠져요. 이번 경기만 빠지면 경기 출전 탭에서 체크를 풀어 주세요.`, confirmLabel: '참가 명단에서 제외', tone: 'danger' });
            if (!ok) return;
            try { await remove.mutateAsync(player.id); setDraft(prev => { const next = { ...prev }; delete next[player.id]; return next; }); setNotice('참가 명단에서 제외했어요.'); }
            catch (caught) { setError(extractErrorMessage(caught, '선수를 제외하지 못했어요.')); }
          }}>참가 명단에서 제외</Button>
        </> : null}
      </div> : null}
    </BottomSheet>
    {ConfirmModal}{UnsavedChangesModal}
  </div>;
}
