'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminEmpty, AdminPageHeader, AdminPageSkeleton } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useLeagueSettings, useUpdateLeagueSettings } from '@/hooks/use-league-settings';
import { useV1MasterRegions } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { DATE_INPUT_MAX, isoToKstDatetimeLocal, kstDatetimeLocalToIso, toKstDateString } from '@/lib/kst-calendar';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { LeagueSettings } from '@/types/league-settings';

function draftOf(data: LeagueSettings) {
  return { title: data.title, rulesText: data.rulesText, regionId: data.regionId ?? '',
    startsOn: data.startsOn ? toKstDateString(new Date(data.startsOn)) : '',
    endsOn: data.endsOn ? toKstDateString(new Date(data.endsOn)) : '',
    deadline: isoToKstDatetimeLocal(data.registrationDeadlineAt) };
}
const labelClass = 'grid gap-2 tm-text-label font-semibold text-[var(--text-strong)]';
const buttonClass = 'tm-btn tm-btn-md tm-btn-neutral min-h-[44px]';

export default function LeagueSettingsClient({ leagueId }: { leagueId: string }) {
  const query = useLeagueSettings(leagueId);
  const [revision, setRevision] = useState(0);
  if (query.isPending) return <AdminPageSkeleton />;
  if (!query.data) return <AdminEmpty title="리그 정보를 불러오지 못했어요"
    description={extractErrorMessage(query.error, '잠시 후 다시 시도해 주세요.')}
    action={<button type="button" className={buttonClass} onClick={() => query.refetch()}>다시 시도</button>} />;
  return <SettingsForm key={`${leagueId}:${revision}`} leagueId={leagueId} initial={query.data}
    reload={async () => { const result = await query.refetch(); if (result.error) throw result.error; setRevision(value => value + 1); }} />;
}

function SettingsForm({ leagueId, initial, reload }: { leagueId: string; initial: LeagueSettings; reload: () => Promise<void> }) {
  const id = useId();
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const regions = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);
  // Keep the exact snapshot/version until an explicit reload; cache updates must not overwrite a draft.
  const [snapshot] = useState(initial);
  const [original] = useState(() => draftOf(initial));
  const [draft, setDraft] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const save = useUpdateLeagueSettings(leagueId);
  const lock = useRef(false);
  const { confirm, ConfirmModal } = useConfirm();
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const ended = snapshot.status === 'completed' || snapshot.status === 'cancelled';
  const busy = save.isPending || reloading;
  const disabled = !canWrite || ended || busy;
  const detailHref = `/admin/league-matches/${encodeURIComponent(leagueId)}`;
  const change = (key: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const hint = !draft.title.trim() ? '리그 이름을 입력해 주세요.'
    : !draft.regionId ? '지역을 선택해 주세요.'
    : !draft.startsOn || !draft.endsOn ? '시작일과 종료일을 입력해 주세요.'
    : draft.endsOn < draft.startsOn ? '종료일은 시작일보다 빠를 수 없어요.'
    : null;
  const discard = async () => !dirty || await confirm({ title: '수정 내용을 버릴까요?', message: '저장하지 않은 입력이 사라져요.', confirmLabel: '수정 내용 버리기' });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || !dirty || hint || lock.current) return;
    lock.current = true;
    setError(null);
    try {
      await save.mutateAsync({ expectedUpdatedAt: snapshot.updatedAt, title: draft.title.trim(), rulesText: draft.rulesText,
        regionId: draft.regionId,
        startsOn: draft.startsOn === original.startsOn && snapshot.startsOn ? snapshot.startsOn : new Date(`${draft.startsOn}T00:00:00.000+09:00`).toISOString(),
        endsOn: draft.endsOn === original.endsOn && snapshot.endsOn ? snapshot.endsOn : new Date(`${draft.endsOn}T23:59:59.999+09:00`).toISOString(),
        registrationDeadlineAt: draft.deadline === original.deadline ? snapshot.registrationDeadlineAt : kstDatetimeLocalToIso(draft.deadline),
      });
      router.push(detailHref);
    } catch (cause) { setError(extractErrorMessage(cause, '리그 정보를 저장하지 못했어요.')); }
    finally { lock.current = false; }
  };
  return <div className="max-w-3xl space-y-6">
    <AdminPageHeader eyebrow="플랫폼 · 리그" title="리그 수정" description={`${snapshot.title} · ${snapshot.sportName}`} />
    {!canWrite && <p role="status">조회 권한으로 접속했어요. 기본 정보를 수정하려면 쓰기 권한이 필요해요.</p>}
    {ended && <p role="status">끝났거나 취소된 리그는 기본 정보를 수정할 수 없어요.</p>}
    <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-4 tm-text-body font-bold">기본 정보</legend>
        <label className={`${labelClass} sm:col-span-2`} htmlFor={`${id}-title`}>리그명
          <input id={`${id}-title`} className="tm-input min-h-[44px]" required maxLength={100} value={draft.title} onChange={e => change('title', e.target.value)} />
        </label>
        <label className={`${labelClass} sm:col-span-2`} htmlFor={`${id}-rules`}>설명·운영 안내
          <textarea id={`${id}-rules`} className="tm-input tm-create-input-multiline" rows={5} maxLength={10000} value={draft.rulesText} onChange={e => change('rulesText', e.target.value)} />
        </label>
        <label className={labelClass} htmlFor={`${id}-region`}>지역
          <select id={`${id}-region`} className="tm-input min-h-[44px]" required value={draft.regionId} onChange={e => change('regionId', e.target.value)}>
            <option value="">지역 선택</option>
            {draft.regionId && !regionOptions.some(region => region.id === draft.regionId) && <option value={draft.regionId}>현재 저장된 지역</option>}
            {regionOptions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>종목<input className="tm-input min-h-[44px]" value={snapshot.sportName} readOnly disabled /></label>
        <label className={labelClass} htmlFor={`${id}-start`}>시작일 (한국 시간)
          <input id={`${id}-start`} className="tm-input min-h-[44px]" type="date" max={DATE_INPUT_MAX} required value={draft.startsOn} onChange={e => change('startsOn', e.target.value)} />
        </label>
        <label className={labelClass} htmlFor={`${id}-end`}>종료일 (한국 시간)
          <input id={`${id}-end`} className="tm-input min-h-[44px]" type="date" min={draft.startsOn || undefined} max={DATE_INPUT_MAX} required value={draft.endsOn} onChange={e => change('endsOn', e.target.value)} />
        </label>
      </fieldset>
      {regions.isError && <p role="alert">지역 목록을 불러오지 못했어요. <button className={buttonClass} type="button" disabled={busy} onClick={() => regions.refetch()}>지역 다시 불러오기</button></p>}
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-4 tm-text-body font-bold">모집 조건</legend>
        <label className={labelClass} htmlFor={`${id}-deadline`}>신청 마감 (한국 시간)
          <input id={`${id}-deadline`} className="tm-input min-h-[44px]" type="datetime-local" max="9999-12-31T23:59" value={draft.deadline} onChange={e => change('deadline', e.target.value)} />
        </label>
        <p className="tm-text-label text-[var(--text-muted)] sm:col-span-2">리그는 신청 정원 제한이 없어요. 신청 마감을 비우면 신규 신청이 닫혀요. 기간을 바꿔도 기존 경기 일정은 자동으로 이동하지 않아요.</p>
      </fieldset>
      {hint && <p role="status" className="tm-text-label text-[var(--text-muted)]">{hint}</p>}
      {error && <p role="alert" className="tm-text-label text-[var(--red700)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="tm-btn tm-btn-md tm-btn-primary min-h-[44px]" type="submit" disabled={disabled || !dirty || !!hint}>{save.isPending ? '저장 중…' : '변경사항 저장'}</button>
        <button className={buttonClass} type="button" disabled={busy} onClick={async () => { if (await discard()) router.push(detailHref); }}>상세로 돌아가기</button>
        <button className={buttonClass} type="button" disabled={busy} onClick={async () => {
          if (!(await discard())) return;
          setReloading(true); setError(null);
          try { await reload(); } catch (cause) { setError(extractErrorMessage(cause, '최신 정보를 불러오지 못했어요.')); }
          finally { setReloading(false); }
        }}>최신 정보 다시 불러오기</button>
      </div>
    </form>
    {ConfirmModal}
  </div>;
}
