'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Clock3, MapPin, X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useV1AdminBracket, useV1CreateTournamentField, useV1RenameTournamentField, useV1TournamentFields, useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useCreateFixtureScheduleTime, useFixtureScheduleTimes, useUpdateFixtureScheduleTime } from '@/hooks/use-fixture-schedule-times';
import { extractErrorMessage } from '@/lib/error-message';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { randomUuid } from '@/lib/uuid';
import { assignmentCourts, assignmentPatch, assignmentTimes, fixtureCourtKey, hasAssignmentCollision, instant, isAssigned,
  type AssignmentMode, type CourtChoice } from '@/lib/fixture-assignment';
import type { V1AdminBracketFixture } from '@/types/api';
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { fixtureTitle } from './bracket-canvas';
import { FixtureAssignmentContext } from './fixture-assignment-context';

export function FixtureAssignmentWorkspace({ tournamentId, canWrite, canManageFields, showToast, children, toolbar }: {
  tournamentId: string; canWrite: boolean; canManageFields: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void; children: ReactNode; toolbar?: ReactNode;
}) {
  const id = useId();
  const [mode, setMode] = useState<AssignmentMode | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [timeDraft, setTimeDraft] = useState('');
  const [courtDraft, setCourtDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ key: string; value: string; initialValue: string; fixtureIds: string[]; scheduleTimeId?: string | null; fieldId?: string; expectedVersion?: number } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const editInput = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const fieldRequest = useRef<{ name: string; scopeKey: string } | null>(null);
  const wide = useMediaQuery('(min-width: 1440px)');
  const bracket = useV1AdminBracket(tournamentId);
  const times = useFixtureScheduleTimes(tournamentId);
  const fields = useV1TournamentFields(tournamentId);
  const addTime = useCreateFixtureScheduleTime(tournamentId);
  const addField = useV1CreateTournamentField(tournamentId);
  const editTime = useUpdateFixtureScheduleTime(tournamentId);
  const editField = useV1RenameTournamentField(tournamentId);
  const update = useV1UpdateFixture(tournamentId);
  const fixtures = bracket.data?.fixtures ?? [];
  const groups = bracket.data?.groups ?? [];
  const context = useMemo(() => buildSideLabelContext(groups, fixtures, bracket.data?.slots ?? []), [bracket.data]);
  const courts = assignmentCourts(fixtures, fields.data?.items ?? []);
  const timeChoices = assignmentTimes(fixtures, times.data?.items ?? []);
  const busy = saving || addTime.isPending || addField.isPending || editTime.isPending || editField.isPending;
  const label = mode === 'court' ? '구장' : '시간';
  const assignedCount = fixtures.filter(f => mode === 'court' ? fixtureCourtKey(f) : f.scheduledAt).length;
  const fixtureName = (f: V1AdminBracketFixture) => `${fixtureSideLabel(f, 'HOME', context)} vs ${fixtureSideLabel(f, 'AWAY', context)}`;
  const cancelEdit = () => { if (!busy) {
    setEditing(null); setEditError(null);
    if (editTrigger.current?.isConnected) editTrigger.current.focus(); else panelRef.current?.focus();
  } };
  const close = () => { if (!busy) { setMode(null); setError(null); setEditing(null); setEditError(null); } };
  const open = (next: AssignmentMode) => { if (!busy) { setMode(mode === next ? null : next); setError(null); setEditing(null); setEditError(null); } };

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy || !mode || !canWrite || mode === 'court' && !canManageFields) return;
    if (editing.value === editing.initialValue) { cancelEdit(); return; }
    const value = mode === 'time' ? kstDatetimeLocalToIso(editing.value) : editing.value.trim();
    if (!value) { setEditError(mode === 'time' ? '날짜와 시간을 확인해 주세요.' : '구장 이름을 입력해 주세요.'); return; }
    if (mode === 'time' ? value === editing.key : courts.find(court => court.key === editing.key)?.name === value) {
      cancelEdit(); return;
    }
    setSaving(true); setEditError(null);
    try {
      if (mode === 'time') {
        const expectedScheduleTimeId = editing.scheduleTimeId ?? null;
        await editTime.mutateAsync({ expectedScheduleTimeId, expectedScheduledAt: editing.key, scheduledAt: value,
          ...(expectedScheduleTimeId === null ? { expectedFixtureIds: editing.fixtureIds } : {}) });
      } else {
        if (editing.fieldId === undefined || editing.expectedVersion === undefined) throw new Error('등록된 구장을 다시 불러온 뒤 수정해 주세요.');
        await editField.mutateAsync({ fieldId: editing.fieldId, expectedVersion: editing.expectedVersion, name: value });
      }
      const [freshBracket, freshSource] = await Promise.all([bracket.refetch(), mode === 'time' ? times.refetch() : fields.refetch()]);
      if (freshBracket.isError || freshSource.isError) {
        setEditing(null); setError('수정은 저장됐지만 최신 목록을 불러오지 못했어요. 다시 불러와 확인해 주세요.'); return;
      }
      setEditing(null); panelRef.current?.focus();
      showToast(mode === 'time' ? '시간과 배정된 경기 일정을 수정했어요.' : '구장 이름과 배정된 경기 표시를 수정했어요.', 'success');
    } catch (err) { setEditError(extractErrorMessage(err, `${label}을 수정하지 못했어요.`)); }
    finally { setSaving(false); }
  }

  async function assign(fixtureId: string, value: string | CourtChoice | null) {
    if (!mode || !canWrite || busy) return;
    setError(null); setSaving(true);
    try {
      await update.mutateAsync({ fixtureId, ...assignmentPatch(mode, value) });
      const refreshed = await bracket.refetch();
      if (refreshed.isError) {
        setError('배정은 저장됐지만 최신 대진을 불러오지 못했어요. 다시 불러와 확인해 주세요.');
        return;
      }
      showToast(`${label} 배정을 ${value ? '저장' : '해제'}했어요.`, 'success');
    } catch (err) { setError(extractErrorMessage(err, `${label} 배정을 저장하지 못했어요.`)); }
    finally { setSaving(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault(); setError(null);
    try {
      if (mode === 'time') {
        const value = kstDatetimeLocalToIso(timeDraft);
        if (!value) { setError('날짜와 시간을 확인해 주세요.'); return; }
        if (timeChoices.includes(value)) { setError('이미 등록된 시간이에요.'); return; }
        await addTime.mutateAsync(value); setTimeDraft('');
      } else {
        const name = courtDraft.trim();
        if (!canManageFields || !name) return;
        if (courts.some(court => court.name === name)) { setError('같은 이름의 구장이 있어요. 기존 구장을 확인해 주세요.'); return; }
        if (fieldRequest.current?.name !== name) fieldRequest.current = { name, scopeKey: randomUuid() };
        await addField.mutateAsync(fieldRequest.current);
        const refreshed = await fields.refetch();
        if (refreshed.isError) { setError('구장은 등록됐지만 목록을 불러오지 못했어요. 다시 불러와 주세요.'); return; }
        setCourtDraft(''); fieldRequest.current = null;
      }
      showToast(`${label}을 등록했어요.`, 'success');
    } catch (err) { setError(extractErrorMessage(err, `${label}을 등록하지 못했어요.`)); }
  }
  const source = mode === 'court' ? fields : times;
  const unavailable = bracket.isPending || bracket.isError || source.isPending || source.isError;
  const entries = mode === 'court' ? courts.map(court => ({ key: court.key, title: court.name, value: court, active: court.active }))
    : timeChoices.map(value => ({ key: value, title: `${formatKstDateShort(value)} ${formatKstTime(value)}`, value, active: true }));
  const editSourceMissing = Boolean(editing && !busy && (unavailable || !entries.some(entry => entry.key === editing.key)));
  const editExpanded = editing ? !collapsed.has(`${mode}:${editing.key}`) : false;
  useEffect(() => { if (editExpanded) editInput.current?.focus(); }, [editing?.key, editSourceMissing, editExpanded]);
  const panel = <section ref={panelRef} tabIndex={-1} className="flex min-h-0 flex-col" aria-label={`${label} 배정`}>
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
      <div><h2 className="tm-text-body-lg font-bold">{label} 배정</h2><p className="tm-text-caption text-[var(--text-muted)]">{label}을 등록하고 경기를 골라 넣어요.</p></div>
      <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost min-h-11" aria-label={`${label} 배정 닫기`} onClick={close} disabled={busy}><X size={18} aria-hidden="true" /></button>
    </div>
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <p className="tm-text-caption text-[var(--text-muted)]" role="status">{label} 배정 {assignedCount}/{fixtures.length}경기 · 미배정 {fixtures.length - assignedCount}경기</p>
      {canWrite && (mode === 'time' || canManageFields) ? <form onSubmit={event => void add(event)} className="flex flex-col gap-2">
        <label htmlFor={`${id}-add-${mode}`} className="tm-text-label">{label} 추가{mode === 'time' ? ' (한국 시간)' : ''}</label>
        <div className="flex items-center gap-2">
          <input id={`${id}-add-${mode}`} className="tm-input min-w-0 flex-1" type={mode === 'time' ? 'datetime-local' : 'text'}
            value={mode === 'time' ? timeDraft : courtDraft} maxLength={mode === 'court' ? 120 : undefined} required disabled={busy || unavailable}
            placeholder={mode === 'court' ? '예: A구장' : undefined} onChange={event => mode === 'time' ? setTimeDraft(event.target.value) : setCourtDraft(event.target.value)} />
          <Button type="submit" variant="outline" disabled={busy || unavailable} loading={addTime.isPending || addField.isPending}>추가</Button>
        </div>
      </form> : mode === 'court' && canWrite ? <p className="tm-text-caption text-[var(--text-muted)]">구장 등록은 플랫폼 운영자가 할 수 있어요. 등록된 구장은 배정할 수 있어요.</p> : null}
      <p className="tm-text-caption text-[var(--text-muted)]">{mode === 'court' ? '구장을 바꿔도 경기 시간은 유지돼요.' : '시간을 바꿔도 경기 구장은 유지돼요.'} 제목을 누르면 경기 목록을 접거나 펼칠 수 있어요.</p>
      {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
      {bracket.isError ? <ErrorState compact message={extractErrorMessage(bracket.error, '대진을 불러오지 못했어요.')} onRetry={() => void bracket.refetch()} /> : null}
      {source.isError ? <ErrorState compact message={extractErrorMessage(source.error, `${label} 목록을 불러오지 못했어요.`)} onRetry={() => void source.refetch()} /> : null}
      {bracket.isPending || source.isPending ? <p role="status" className="tm-text-caption">불러오는 중이에요.</p> : null}
      {editing && editSourceMissing ? <div className="flex flex-col gap-2 py-3">
        <p role="alert" className="tm-text-caption text-[var(--red700)]">수정 중이던 항목을 최신 목록에서 확인할 수 없어요. 입력값을 남겨 두었으니 확인 후 취소하고 항목을 다시 선택해 주세요.</p>
        <label htmlFor={`${id}-unavailable-edit`} className="tm-text-label">{mode === 'time' ? '시간 수정 (한국 시간)' : '구장 이름 수정'}</label>
        <input ref={editInput} id={`${id}-unavailable-edit`} className="tm-input w-full" type={mode === 'time' ? 'datetime-local' : 'text'} value={editing.value} readOnly />
        <Button type="button" variant="outline" onClick={cancelEdit}>취소</Button>
      </div> : null}
      {!unavailable ? <div className="flex flex-col divide-y divide-[var(--border)]">
        {entries.length === 0 ? <p className="py-4 tm-text-caption text-[var(--text-muted)]">등록된 {label}이 없어요.</p> : null}
        {entries.map((entry, index) => {
          const assigned = fixtures.filter(f => isAssigned(f, mode!, entry.key));
          const candidates = fixtures.filter(f => !isAssigned(f, mode!, entry.key));
          const stateKey = `${mode}:${entry.key}`;
          const expanded = !collapsed.has(stateKey);
          const field = mode === 'court' ? fields.data?.items.find(item => `field:${item.id}` === entry.key) : undefined;
          const editable = canWrite && (mode === 'time' || canManageFields && field !== undefined);
          const editingEntry = editing?.key === entry.key;
          return <div key={stateKey} className="relative py-3"><details open={expanded}>
            <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-500 ${editable ? 'pr-16' : ''}`}
              onClick={event => { event.preventDefault(); if (busy) return; setCollapsed(previous => { const next = new Set(previous); if (expanded) next.add(stateKey); else next.delete(stateKey); return next; }); }}>
              <span className="min-w-0 break-words tm-text-body font-bold">{entry.title}{!entry.active ? ' (사용 안 함)' : ''}</span>
              <span className="flex shrink-0 items-center gap-2"><span className="tm-text-caption text-[var(--text-muted)]">{assigned.length}경기</span><ChevronDown size={16} aria-hidden="true" className={expanded ? '' : '-rotate-90'} /></span>
            </summary>
            {editingEntry && editing && !editSourceMissing ? <form id={`${id}-edit-form-${index}`} onSubmit={event => void saveEntry(event)} className="flex flex-col gap-2 py-3">
              <label htmlFor={`${id}-edit-${index}`} className="tm-text-label">{mode === 'time' ? '시간 수정 (한국 시간)' : '구장 이름 수정'}</label>
              <input ref={editInput} id={`${id}-edit-${index}`} className="tm-input w-full" type={mode === 'time' ? 'datetime-local' : 'text'}
                value={editing.value} maxLength={mode === 'court' ? 120 : undefined} required disabled={busy}
                onChange={event => setEditing(previous => previous ? { ...previous, value: event.target.value } : null)}
                onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit(); } }} />
              <p className="tm-text-caption text-[var(--text-muted)]">이 항목에 배정된 {assigned.length}경기의 {mode === 'time' ? '시간' : '구장 이름'}도 함께 바뀌어요.</p>
              {editError ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{editError}</p> : null}
              <div className="flex gap-2"><Button type="submit" loading={saving} disabled={busy}>저장</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={cancelEdit}>취소</Button></div>
            </form> : null}
            {expanded ? <div className="flex flex-col gap-2 pt-2">
              {hasAssignmentCollision(assigned) ? <p className="tm-text-caption text-[var(--orange700)]">같은 시간·구장에 여러 경기가 있어요. 일정을 확인해 주세요.</p> : null}
              {assigned.map(fixture => <div key={fixture.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-soft)] p-3">
                <div className="min-w-0"><p className="tm-text-caption text-[var(--text-muted)]">{fixtureTitle(fixture, groups)}</p><p className="break-words tm-text-label font-semibold">{fixtureName(fixture)}</p>
                  <p className="tm-text-caption text-[var(--text-muted)]">{mode === 'time' ? courts.find(court => court.key === fixtureCourtKey(fixture))?.name ?? '구장 미정' : fixture.scheduledAt ? `${formatKstDateShort(fixture.scheduledAt)} ${formatKstTime(fixture.scheduledAt)}` : '시간 미정'}</p></div>
                {canWrite ? <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost min-h-11 shrink-0" aria-label={`${fixtureName(fixture)} ${label} 해제`} disabled={busy} onClick={() => void assign(fixture.id, null)}>해제</button> : null}
              </div>)}
              {canWrite ? <><label className="sr-only" htmlFor={`${id}-assign-${index}`}>{entry.title}에 경기 배정</label>
                <select id={`${id}-assign-${index}`} className="tm-input w-full" value="" disabled={busy || !entry.active} onChange={event => { if (event.target.value) void assign(event.target.value, entry.value); }}>
                  <option value="">＋ 경기 선택해서 배정</option>
                  {candidates.map(fixture => <option key={fixture.id} value={fixture.id}>{fixtureTitle(fixture, groups)} · {fixtureName(fixture)}</option>)}
                </select></> : null}
            </div> : null}
          </details>{editable ? <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost absolute right-0 top-3 min-h-11"
            aria-label={`${entry.title} ${mode === 'court' ? '이름' : '시간'} 수정`} aria-expanded={editingEntry} aria-controls={`${id}-edit-form-${index}`} disabled={busy}
            onClick={event => {
              setCollapsed(previous => { const next = new Set(previous); next.delete(stateKey); return next; });
              if (editingEntry) { editInput.current?.focus(); return; }
              editTrigger.current = event.currentTarget; setEditError(null);
              const initialValue = mode === 'time' ? isoToKstDatetimeLocal(String(entry.value)) : entry.title;
              setEditing({ key: entry.key, value: initialValue, initialValue, fixtureIds: assigned.map(fixture => fixture.id),
                ...(mode === 'time' ? { scheduleTimeId: times.data?.items.find(item => instant(item.scheduledAt) === entry.key)?.id ?? null } : {}),
                ...(field ? { fieldId: field.id, expectedVersion: field.version } : {}) });
            }}>수정</button> : null}</div>;
        })}
      </div> : null}
    </div>
  </section>;
  return <FixtureAssignmentContext.Provider value><div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap gap-2">{toolbar}<Button variant={mode === 'time' ? 'primary' : 'outline'} onClick={() => open('time')} disabled={busy} aria-expanded={mode === 'time'} aria-controls={`${id}-panel`}><Clock3 size={16} aria-hidden="true" />시간 배정</Button>
      <Button variant={mode === 'court' ? 'primary' : 'outline'} onClick={() => open('court')} disabled={busy} aria-expanded={mode === 'court'} aria-controls={`${id}-panel`}><MapPin size={16} aria-hidden="true" />구장 배정</Button></div>
    <div className={mode && wide ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_360px] items-start gap-4' : 'min-w-0'}>
      <div className="min-w-0">{children}</div>
      {mode && wide ? <aside id={`${id}-panel`} className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">{panel}</aside> : null}
    </div>
    {!wide ? <BottomSheet open={mode !== null} onClose={close} ariaLabel={`${label} 배정`}><div className="tm-filter-sheet-handle" aria-hidden="true" /><div id={`${id}-panel`}>{panel}</div></BottomSheet> : null}
  </div></FixtureAssignmentContext.Provider>;
}
