'use client';

import { FixtureTimePicker } from './fixture-time-picker';
import { WinnerTargetField } from './winner-target-field';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import type { PlaceValue } from '@/lib/place';
import { findAssignmentConflict } from '@/lib/fixture-assignment';
import { toVenuePayload, PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import { fixtureVenueValue, fixtureVenuePatch } from './fixture-venue-patch';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CompetitionFieldPicker } from '@/components/admin/competition-field-picker';
import { PeriodOverrideField, useMatchPeriodOverride } from '@/components/admin/period-override-field';
import { useV1UpdateFixture } from '@/hooks/use-v1-api';
import { automaticFixtureSideLabel, buildSideLabelContext } from '@/lib/bracket-canvas-layout';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot, V1UpdateFixturePayload } from '@/types/api';

export type LabelDraft = { displayTitle: string; homeDisplayLabel: string; awayDisplayLabel: string };
export function fixtureLabelDraft(fixture: V1AdminBracketFixture): LabelDraft {
  return { displayTitle: fixture.displayTitle ?? '', homeDisplayLabel: fixture.homeDisplayLabel ?? '', awayDisplayLabel: fixture.awayDisplayLabel ?? '' };
}
export function fixtureLabelPatch(draft: LabelDraft, fixture: V1AdminBracketFixture): Pick<V1UpdateFixturePayload, 'displayTitle' | 'homeDisplayLabel' | 'awayDisplayLabel'> {
  return Object.fromEntries((['displayTitle', 'homeDisplayLabel', 'awayDisplayLabel'] as const)
    .filter(key => (draft[key].trim() || null) !== (fixture[key] ?? null))
    .map(key => [key, draft[key].trim() || null]));
}

export function FixtureLabelFields({ fixture, groups, fixtures, slots, value, onChange, disabled = false }: {
  fixture: V1AdminBracketFixture; groups: readonly V1AdminBracketGroup[]; fixtures: readonly V1AdminBracketFixture[];
  slots: readonly V1AdminBracketSlot[]; value: LabelDraft; onChange: (next: LabelDraft) => void; disabled?: boolean;
}) {
  const id = useId();
  const context = buildSideLabelContext(groups, fixtures, slots);
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-title`} className="tm-text-label">경기 제목</label>
      <input id={`${id}-title`} className="tm-input" maxLength={120} value={value.displayTitle}
        placeholder="예: 개막전, A조 2차전" aria-describedby={`${id}-title-hint`} disabled={disabled}
        onChange={event => onChange({ ...value, displayTitle: event.target.value })} />
      <p id={`${id}-title-hint`} className="tm-text-caption text-[var(--text-muted)]">비워 두면 조·라운드·경기 번호로 자동 표시해요.</p>
    </div>
    {(['HOME', 'AWAY'] as const).map(side => {
      const key = side === 'HOME' ? 'homeDisplayLabel' : 'awayDisplayLabel';
      const label = side === 'HOME' ? '홈 표시 문구' : '원정 표시 문구';
      return <div key={side} className="flex flex-col gap-1">
        <label htmlFor={`${id}-${side}`} className="tm-text-label">{label}</label>
        <input id={`${id}-${side}`} className="tm-input" maxLength={120} value={value[key]} placeholder={automaticFixtureSideLabel(fixture, side, context)}
          disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })} />
      </div>;
    })}
    <p className="tm-text-caption text-[var(--text-muted)]">표시 문구만 바뀌어요. 실제 팀과 승자·패자 진출 연결은 유지돼요.</p>
  </div>;
}

/** 'YYYY-MM-DD' 와 'HH:mm' 둘 다 있을 때만 하나의 KST 벽시계 문자열이 된다. */
function joinLocal(date: string, clock: string): string {
  return date !== '' && clock !== '' ? `${date}T${clock}` : '';
}
function splitLocal(iso: string | null): { date: string; clock: string } {
  const local = isoToKstDatetimeLocal(iso);
  return { date: local.slice(0, 10), clock: local.slice(11, 16) };
}

export function FixtureMetadataEditor({ tournamentId, fixture, groups, fixtures, slots, canWrite, showToast }: {
  tournamentId: string; fixture: V1AdminBracketFixture; groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[]; slots: readonly V1AdminBracketSlot[]; canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const id = useId();
  const mutation = useV1UpdateFixture(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [number, setNumber] = useState(String(fixture.fixtureNumber));
  const [labels, setLabels] = useState(() => fixtureLabelDraft(fixture));
  const [date, setDate] = useState(() => splitLocal(fixture.scheduledAt).date);
  const [clock, setClock] = useState(() => splitLocal(fixture.scheduledAt).clock);
  const [venue, setVenue] = useState<PlaceValue | null>(() => fixtureVenueValue(fixture));
  const [fieldId, setFieldId] = useState(fixture.fieldId ?? '');
  const [clearPlace, setClearPlace] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useRef(false);
  const timeDirty = useRef(false);
  const placeDirty = useRef(false);
  // 경기 방식은 이 경기에만 저장한다 — 조·단계·대회 기본 설정은 바뀌지 않는다.
  const periods = useMatchPeriodOverride(tournamentId, fixture.id, '대회 기본값');
  useEffect(() => {
    if (dirty.current) return;
    setNumber(String(fixture.fixtureNumber)); setLabels(fixtureLabelDraft(fixture));
  }, [fixture.id, fixture.fixtureNumber, fixture.displayTitle, fixture.homeDisplayLabel, fixture.awayDisplayLabel]);
  // A label draft must not freeze pristine time/place fields while the assignment panel changes them.
  useEffect(() => {
    if (timeDirty.current) return;
    const next = splitLocal(fixture.scheduledAt);
    setDate(next.date); setClock(next.clock);
  }, [fixture.id, fixture.scheduledAt]);
  useEffect(() => {
    if (placeDirty.current) return;
    setFieldId(fixture.fieldId ?? ''); setClearPlace(false); setVenue(fixtureVenueValue(fixture));
  }, [fixture.id, fixture.fieldId, fixture.venue, fixture.place]);
  const pending = mutation.isPending || periods.pending;
  const disabled = !canWrite || pending;
  const edit = (action: () => void) => { dirty.current = true; setMessage(null); setError(null); action(); };
  const editTime = (nextDate: string, nextClock: string) => edit(() => { timeDirty.current = true; setDate(nextDate); setClock(nextClock); });
  const editPlace = (action: () => void) => edit(() => { placeDirty.current = true; action(); });
  async function save(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    if (periods.payload && periods.error) { setError(periods.error); return; }
    const fixtureNumber = Number(number);
    if (!Number.isInteger(fixtureNumber) || fixtureNumber < 1 || fixtureNumber > 2147483647) { setError('경기 번호는 1 이상의 정수로 입력해 주세요.'); return; }
    if ((date === '') !== (clock === '')) { setError('날짜와 시각을 함께 정해 주세요.'); return; }
    const time = joinLocal(date, clock);
    const scheduledAt = time === '' ? null : kstDatetimeLocalToIso(time);
    if (time !== '' && scheduledAt === null) { setError('경기 시각을 다시 확인해 주세요.'); return; }
    const body: V1UpdateFixturePayload = {
      ...fixtureLabelPatch(labels, fixture),
      ...(fixtureNumber === fixture.fixtureNumber ? {} : { fixtureNumber }),
      ...(time === isoToKstDatetimeLocal(fixture.scheduledAt) ? {} : { scheduledAt }),
      ...(fieldId ? (fieldId === fixture.fieldId ? {} : { fieldId }) : { ...(fixture.fieldId ? { fieldId: null } : {}), ...fixtureVenuePatch(clearPlace ? null : venue, fixture) }),
    };
    if (timeDirty.current || placeDirty.current) {
      const court = fieldId ? `field:${fieldId}` : !clearPlace && venue ? `venue:${JSON.stringify(toVenuePayload(venue))}` : null;
      const conflict = findAssignmentConflict(fixtures, fixture.id, scheduledAt, court);
      if (conflict) {
        const accepted = await confirm({ title: '시간·구장이 겹쳐요', confirmLabel: '그대로 저장',
          message: `${conflict.displayTitle || conflict.fixtureNumber + '번 경기'}와 시간·구장이 겹쳐요. 그대로 저장할까요?` });
        if (!accepted) return;
      }
    }
    const fixtureChanged = Object.keys(body).length > 0;
    if (!fixtureChanged && !periods.payload) { setMessage('변경한 항목이 없어요.'); return; }
    try {
      if (fixtureChanged) await mutation.mutateAsync({ fixtureId: fixture.id, ...body });
    } catch (err) { setError(extractErrorMessage(err, '경기 정보를 저장하지 못했어요. 다시 시도해 주세요.')); return; }
    try {
      await periods.save();
      dirty.current = false; timeDirty.current = false; placeDirty.current = false; setMessage('경기 정보를 저장했어요.');
    } catch (err) {
      const reason = extractErrorMessage(err, '경기 방식을 저장하지 못했어요. 다시 시도해 주세요.');
      setError(fixtureChanged ? `경기 정보는 저장됐어요. 경기 방식은 저장하지 못했어요: ${reason}` : reason);
    }
  }
  const moreId = `${id}-more`;
  return <><form onSubmit={save} className="flex flex-col gap-3" aria-label="경기 정보 편집">
    <h3 className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>시간·구장</h3>
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 tm-text-label" htmlFor={`${id}-date`}>날짜
        <input id={`${id}-date`} className="tm-input" type="date" value={date} disabled={disabled} onChange={event => editTime(event.target.value, clock)} />
      </label>
      <label className="flex flex-col gap-1 tm-text-label" htmlFor={`${id}-clock`}>시각
        <input id={`${id}-clock`} className="tm-input" type="time" value={clock} disabled={disabled} onChange={event => editTime(date, event.target.value)} />
      </label>
    </div>
    <FixtureTimePicker tournamentId={tournamentId} fixtures={fixtures} value={joinLocal(date, clock)} disabled={disabled}
      onChange={value => editTime(value.slice(0, 10), value.slice(11, 16))} />
    <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={disabled || (!date && !clock)} onClick={() => editTime('', '')}>날짜·시각 비우기</button>
    <CompetitionFieldPicker tournamentId={tournamentId} value={fieldId} onChange={value => editPlace(() => { setFieldId(value); setClearPlace(!value); if (!value) setVenue(null); })}
      disabled={disabled} allowNew={false} allowEmpty emptyLabel="구장 미정" />
    <div className="flex flex-col gap-1">
      <button type="button" className="tm-btn tm-btn-sm tm-btn-outline self-start min-h-[44px]" aria-expanded={moreOpen} aria-controls={moreOpen ? moreId : undefined}
        onClick={() => setMoreOpen(open => !open)}>{moreOpen ? '접기' : '더 보기'}</button>
      <p className="tm-text-caption text-[var(--text-muted)]">표시 문구 · 경기 방식 · 번호 · 이긴 팀이 갈 경기</p>
    </div>
    {moreOpen ? <div id={moreId} className="flex flex-col gap-3">
      <FixtureLabelFields fixture={fixture} groups={groups} fixtures={fixtures} slots={slots} value={labels} onChange={value => edit(() => setLabels(value))} disabled={disabled} />
      <PeriodOverrideField
        inheritedSummary={periods.inheritedSummary}
        customLabel="이 경기만 따로"
        customHint="이 경기만 바뀌어요. 조·단계 설정과 대회 기본값은 그대로예요."
        status={periods.status}
        choice={periods.choice}
        onChange={choice => edit(() => periods.setChoice(choice))}
        disabled={disabled}
        lockedReason={periods.lockedReason}
      />
      <label className="flex flex-col gap-1 tm-text-label" htmlFor={`${id}-number`}>경기 번호
        <input id={`${id}-number`} className="tm-input" type="number" min={1} max={2147483647} step={1} value={number} disabled={disabled} onChange={event => edit(() => setNumber(event.target.value))} />
      </label>
      {!fieldId ? <PlacePicker id={`${id}-venue`} label="구장 직접 입력" maxLength={PLACE_NAME_MAX_LENGTH.tournament} value={clearPlace ? null : venue} onChange={value => editPlace(() => { setClearPlace(false); setVenue(value); })} disabled={disabled} /> : null}
      <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={disabled || (!fieldId && !fixture.venue)}
        onClick={() => editPlace(() => { setFieldId(''); setClearPlace(true); setVenue(null); })}>구장 비우기</button>
      <WinnerTargetField tournamentId={tournamentId} fixture={fixture} groups={groups} fixtures={fixtures} canWrite={canWrite} showToast={showToast} />
    </div> : null}
    {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    {message ? <p role="status" className="tm-text-caption text-[var(--text-muted)]">{message}</p> : null}
    {canWrite ? <button type="submit" className="tm-btn tm-btn-md tm-btn-outline" disabled={pending}>{pending ? '저장 중…' : '저장'}</button> : null}
  </form>{ConfirmModal}</>;
}
