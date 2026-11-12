'use client';

import { useId, useState, type ReactNode, type FormEvent } from 'react';
import { Clock3 } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useCreateFixtureScheduleTime, useFixtureScheduleTimes } from '@/hooks/use-fixture-schedule-times';
import { useV1UpdateLeagueFixture } from '@/hooks/use-v1-api';
import { assignmentTimes, instant } from '@/lib/fixture-assignment';
import { kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1LeagueFixture } from '@/types/league-match';

export function LeagueTimeAssignment({ leagueId, fixtures, canWrite, fixtureName, refresh, showToast, children }: {
  children?: ReactNode; leagueId: string; fixtures: readonly V1LeagueFixture[]; canWrite: boolean;
  fixtureName: (fixture: V1LeagueFixture) => string;
  refresh: () => Promise<{ isError: boolean }>;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const id = useId();
  const wide = useMediaQuery('(min-width: 1440px)');
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const times = useFixtureScheduleTimes(leagueId, 'league-matches');
  const create = useCreateFixtureScheduleTime(leagueId, 'league-matches');
  const update = useV1UpdateLeagueFixture(leagueId);
  const busy = saving || create.isPending;
  const choices = assignmentTimes(fixtures.map(f => ({ scheduledAt: f.startAt })), times.data?.items ?? []);
  const unavailable = times.isPending || times.isError;
  const close = () => { if (!busy) setOpen(false); };
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || busy || unavailable) return;
    setError(null);
    const value = kstDatetimeLocalToIso(draft);
    if (!value) { setError('날짜와 시간을 확인해 주세요.'); return; }
    if (choices.includes(value)) { setError('이미 등록된 시간이에요.'); return; }
    try { await create.mutateAsync(value); setDraft(''); showToast('시간을 등록했어요.', 'success'); }
    catch (err) { setError(extractErrorMessage(err, '시간을 등록하지 못했어요.')); }
  }
  async function assign(teamMatchId: string, startsAt: string) {
    if (!canWrite || busy || unavailable) return;
    setError(null); setSaving(true);
    try {
      await update.mutateAsync({ teamMatchId, body: { startsAt } });
      const result = await refresh();
      if (result.isError) { setError('배정은 저장됐지만 최신 대진을 불러오지 못했어요. 다시 불러와 확인해 주세요.'); return; }
      showToast('시간 배정을 저장했어요.', 'success');
    } catch (err) { setError(extractErrorMessage(err, '시간 배정을 저장하지 못했어요.')); }
    finally { setSaving(false); }
  }
  const panel = <section className="flex flex-col gap-4 p-4" aria-label="시간 배정">
    <div className="flex items-center justify-between gap-3">
      <h2 className="tm-text-body-lg font-bold">시간 배정</h2>
      <Button variant="ghost" onClick={close} disabled={busy} aria-label="시간 배정 닫기">닫기</Button>
    </div>
    <p className="tm-text-caption text-[var(--text-muted)]">시간을 등록하고 경기를 골라 넣어요. 구장과 팀은 유지돼요. 제목을 누르면 경기 목록을 접거나 펼칠 수 있어요.</p>
    {canWrite ? <form onSubmit={event => void add(event)} className="flex flex-col gap-2">
      <label htmlFor={id + '-add'} className="tm-text-label">시간 추가 (한국 시간)</label>
      <div className="flex items-center gap-2"><input id={id + '-add'} type="datetime-local" className="tm-input min-w-0 flex-1" value={draft} onChange={event => setDraft(event.target.value)} required disabled={busy || unavailable} />
        <Button type="submit" variant="outline" loading={create.isPending} disabled={busy || unavailable}>추가</Button></div>
    </form> : null}
    {error ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p> : null}
    {times.isError ? <ErrorState compact message={extractErrorMessage(times.error, '시간 목록을 불러오지 못했어요.')} onRetry={() => void times.refetch()} /> : null}
    {times.isPending ? <p role="status" className="tm-text-caption">불러오는 중이에요.</p> : null}
    {!unavailable ? <div className="flex flex-col divide-y divide-[var(--border)]">
      {choices.length === 0 ? <p className="tm-text-caption py-4 text-[var(--text-muted)]">등록된 시간이 없어요.</p> : null}
      {choices.map((time, index) => {
        const assigned = fixtures.filter(f => instant(f.startAt) === time);
        const candidates = fixtures.filter(f => instant(f.startAt) !== time && f.status !== 'cancelled');
        const label = formatKstDateShort(time) + ' ' + formatKstTime(time);
        const courtKeys = assigned.filter(f => f.status !== 'cancelled').flatMap(f => f.fieldId ? ['field:' + f.fieldId] : f.placeName ? [JSON.stringify(f.place ?? { name: f.placeName, address: f.placeAddress ?? null })] : []);
        return <details key={time} className="py-3" open={!collapsed.has(time)}>
          <summary className="min-h-11 cursor-pointer tm-text-label" onClick={event => {
            event.preventDefault(); setCollapsed(previous => { const next = new Set(previous); if (next.has(time)) next.delete(time); else next.add(time); return next; });
          }}>{label} · {assigned.length}경기</summary>
          {!collapsed.has(time) ? <div className="flex flex-col gap-2 pt-2">
            {new Set(courtKeys).size < courtKeys.length ? <p className="tm-text-caption text-[var(--orange700)]">같은 시간·구장에 여러 경기가 있어요. 일정을 확인해 주세요.</p> : null}
            {assigned.map(f => <p key={f.teamMatchId} className="rounded-xl bg-[var(--surface-soft)] p-3 tm-text-label">{fixtureName(f)} · {f.placeName || '구장 미정'}</p>)}
            {canWrite ? <><label className="sr-only" htmlFor={id + '-assign-' + index}>{label}에 경기 배정</label>
              <select id={id + '-assign-' + index} className="tm-input" value="" disabled={busy} onChange={event => { if (event.target.value) void assign(event.target.value, time); }}>
                <option value="">＋ 경기 선택해서 배정</option>
                {candidates.map(f => <option key={f.teamMatchId} value={f.teamMatchId}>{fixtureName(f)}</option>)}
              </select></> : null}
          </div> : null}
        </details>;
      })}
    </div> : null}
  </section>;
  return <div className="flex min-w-0 flex-col gap-4">
    <Button className="self-start" variant={open ? 'primary' : 'outline'} onClick={() => setOpen(value => !value)} disabled={busy} aria-expanded={open} aria-controls={id + '-panel'}><Clock3 size={16} aria-hidden="true" />시간 배정</Button>
    <div className={open && wide ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_360px] items-start gap-4' : 'min-w-0'}>
      <div className="min-w-0">{children}</div>
      {wide && open ? <aside id={id + '-panel'} className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">{panel}</aside> : null}
    </div>
    {!wide && open ? <BottomSheet open={open} onClose={close} ariaLabel="시간 배정"><div className="tm-filter-sheet-handle" aria-hidden="true" /><div id={id + '-panel'}>{panel}</div></BottomSheet> : null}
  </div>;
}
