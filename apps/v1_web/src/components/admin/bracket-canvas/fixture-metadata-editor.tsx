'use client';

import { PlacePicker } from '@/components/v1-ui/place-picker';
import type { PlaceValue } from '@/lib/place';
import { PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import { fixtureVenueValue, fixtureVenuePatch } from './fixture-venue-patch';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CompetitionFieldPicker } from '@/components/admin/competition-field-picker';
import { useV1UpdateFixture } from '@/hooks/use-v1-api';
import { automaticFixtureSideLabel, buildSideLabelContext } from '@/lib/bracket-canvas-layout';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot, V1UpdateFixturePayload } from '@/types/api';

export type LabelDraft = { homeDisplayLabel: string; awayDisplayLabel: string };
export function fixtureLabelDraft(fixture: V1AdminBracketFixture): LabelDraft {
  return { homeDisplayLabel: fixture.homeDisplayLabel ?? '', awayDisplayLabel: fixture.awayDisplayLabel ?? '' };
}
export function fixtureLabelPatch(draft: LabelDraft, fixture: V1AdminBracketFixture): Pick<V1UpdateFixturePayload, 'homeDisplayLabel' | 'awayDisplayLabel'> {
  return Object.fromEntries((['homeDisplayLabel', 'awayDisplayLabel'] as const)
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
    {(['HOME', 'AWAY'] as const).map(side => {
      const key = side === 'HOME' ? 'homeDisplayLabel' : 'awayDisplayLabel';
      const label = side === 'HOME' ? '홈 표시 문구' : '어웨이 표시 문구';
      const automatic = automaticFixtureSideLabel(fixture, side, context);
      return <div key={side} className="flex flex-col gap-1">
        <label htmlFor={`${id}-${side}`} className="tm-text-label">{label}</label>
        <p id={`${id}-${side}-hint`} className="tm-text-caption text-[var(--text-muted)]">자동 문구: {automatic}</p>
        <input id={`${id}-${side}`} className="tm-input" maxLength={120} value={value[key]} placeholder={automatic}
          aria-describedby={`${id}-${side}-hint`} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })} />
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={disabled || value[key] === ''}
          onClick={() => onChange({ ...value, [key]: '' })}>{side === 'HOME' ? '홈' : '어웨이'} 자동 문구 복원</button>
      </div>;
    })}
    <p className="tm-text-caption text-[var(--text-muted)]">표시 문구만 바뀌어요. 실제 팀과 승자·패자 진출 연결은 유지돼요.</p>
  </div>;
}

export function FixtureMetadataEditor({ tournamentId, fixture, groups, fixtures, slots, canWrite }: {
  tournamentId: string; fixture: V1AdminBracketFixture; groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[]; slots: readonly V1AdminBracketSlot[]; canWrite: boolean;
}) {
  const id = useId();
  const mutation = useV1UpdateFixture(tournamentId);
  const [number, setNumber] = useState(String(fixture.fixtureNumber));
  const [labels, setLabels] = useState(() => fixtureLabelDraft(fixture));
  const [time, setTime] = useState(() => isoToKstDatetimeLocal(fixture.scheduledAt));
  const [venue, setVenue] = useState<PlaceValue | null>(() => fixtureVenueValue(fixture));
  const [fieldId, setFieldId] = useState(fixture.fieldId ?? '');
  const [clearPlace, setClearPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setNumber(String(fixture.fixtureNumber)); setLabels(fixtureLabelDraft(fixture));
    setTime(isoToKstDatetimeLocal(fixture.scheduledAt)); setFieldId(fixture.fieldId ?? ''); setClearPlace(false); setVenue(fixtureVenueValue(fixture));
  }, [fixture.id, fixture.fixtureNumber, fixture.homeDisplayLabel, fixture.awayDisplayLabel, fixture.scheduledAt, fixture.fieldId]);
  const disabled = !canWrite || mutation.isPending;
  const edit = (action: () => void) => { dirty.current = true; setMessage(null); action(); };
  async function save(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    const fixtureNumber = Number(number);
    if (!Number.isInteger(fixtureNumber) || fixtureNumber < 1 || fixtureNumber > 2147483647) { setError('경기 번호는 1 이상의 정수로 입력해 주세요.'); return; }
    const scheduledAt = time === '' ? null : kstDatetimeLocalToIso(time);
    if (time !== '' && scheduledAt === null) { setError('경기 시각을 다시 확인해 주세요.'); return; }
    const body: V1UpdateFixturePayload = {
      ...fixtureLabelPatch(labels, fixture),
      ...(fixtureNumber === fixture.fixtureNumber ? {} : { fixtureNumber }),
      ...(time === isoToKstDatetimeLocal(fixture.scheduledAt) ? {} : { scheduledAt }),
      ...(fieldId ? (fieldId === fixture.fieldId ? {} : { fieldId }) : { ...(fixture.fieldId ? { fieldId: null } : {}), ...fixtureVenuePatch(clearPlace ? null : venue, fixture) }),
    };
    if (Object.keys(body).length === 0) { setMessage('변경한 항목이 없어요.'); return; }
    try {
      await mutation.mutateAsync({ fixtureId: fixture.id, ...body });
      dirty.current = false; setMessage('경기 정보를 저장했어요.');
    } catch (err) { setError(extractErrorMessage(err, '경기 정보를 저장하지 못했어요. 다시 시도해 주세요.')); }
  }
  return <form onSubmit={save} className="flex flex-col gap-3" aria-label="경기 정보 편집">
    <label className="flex flex-col gap-1 tm-text-label" htmlFor={`${id}-number`}>경기 번호
      <input id={`${id}-number`} className="tm-input" type="number" min={1} max={2147483647} step={1} value={number} disabled={disabled} onChange={event => edit(() => setNumber(event.target.value))} />
    </label>
    <FixtureLabelFields fixture={fixture} groups={groups} fixtures={fixtures} slots={slots} value={labels} onChange={value => edit(() => setLabels(value))} disabled={disabled} />
    <label className="flex flex-col gap-1 tm-text-label" htmlFor={`${id}-time`}>경기 시각
      <input id={`${id}-time`} className="tm-input" type="datetime-local" value={time} disabled={disabled} onChange={event => edit(() => setTime(event.target.value))} />
    </label>
    <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={disabled || !time} onClick={() => edit(() => setTime(''))}>시각 비우기</button>
    <CompetitionFieldPicker tournamentId={tournamentId} value={fieldId} onChange={value => edit(() => { setFieldId(value); setClearPlace(!value); if (!value) setVenue(null); })}
      disabled={disabled} allowNew={false} allowEmpty emptyLabel="경기장 미정" />
    {!fieldId ? <PlacePicker id={`${id}-venue`} label="장소" maxLength={PLACE_NAME_MAX_LENGTH.tournament} value={clearPlace ? null : venue} onChange={value => edit(() => { setClearPlace(false); setVenue(value); })} disabled={disabled} /> : null}
    <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={disabled || (!fieldId && !fixture.venue)}
      onClick={() => edit(() => { setFieldId(''); setClearPlace(true); setVenue(null); })}>경기장 비우기</button>
    {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    {message ? <p role="status" className="tm-text-caption text-[var(--text-muted)]">{message}</p> : null}
    {canWrite ? <button type="submit" className="tm-btn tm-btn-md tm-btn-outline" disabled={mutation.isPending}>{mutation.isPending ? '저장 중…' : '경기 정보 저장'}</button> : null}
  </form>;
}
