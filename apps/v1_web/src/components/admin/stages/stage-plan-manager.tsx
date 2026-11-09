'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStagePlan } from '@/hooks/use-stage-plan';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { stagePlanCounts } from '@/lib/stage-plan';
import { extractErrorMessage } from '@/lib/error-message';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type { StagePlanView, StagePoolView } from '@/types/stage-plan';
import type { V1AdminBracketFixture } from '@/types/api';
import { stageControl } from './stage-plan-editor';
export function StagePlanManager({ tournamentId, canWrite }: { tournamentId: string; canWrite: boolean }) {
  const api = useStagePlan(tournamentId), bracket = useV1AdminBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [key, setKey] = useState(''), [error, setError] = useState('');
  const view = api.view.data;
  if (!view) return api.view.isError ? <ErrorState message={extractErrorMessage(api.view.error, '단계 구성을 불러오지 못했어요.')} onRetry={() => void api.view.refetch()} /> : <p role="status">단계 구성을 불러오고 있어요.</p>;
  const pool = view.pools.find(p => p.key === key) ?? view.pools[0];
  const counts = stagePlanCounts(view.config);
  async function generate() {
    if (!view || !await confirm({ title: '단계별 대진을 생성할까요?', message: `${counts.fixtures}경기를 참가팀 미정 상태로 만들어요. 생성 후 단계 구조는 고정되고 참가팀과 경기 일정은 별도로 설정해요.`, confirmLabel: '대진 생성' })) return;
    try { setError(''); await api.generate.mutateAsync({ expectedRevision: view.revision }); } catch (e) { setError(extractErrorMessage(e, '대진을 생성하지 못했어요.')); }
  }
  return <div className="space-y-5">
    <SectionTitle title="단계별 대진 관리" />
    <p className="tm-text-label">{counts.teams}팀 · {view.config.stages.length}단계 · {counts.fixtures}경기. 풀리그 승점은 편성마다 새로 시작해요.</p>
    {error && <AlertBanner tone="error" message={error} />}
    {api.view.isError && <AlertBanner tone="warning" message="최신 정보를 불러오지 못했어요. 새로 불러온 뒤 진행해 주세요." />}
    <div className="flex flex-wrap gap-2">
      {canWrite && !view.pools.some(p => p.generated) && <Button variant="primary" disabled={api.generate.isPending || api.view.isError} onClick={() => void generate()}>{api.generate.isPending ? '생성 중…' : '단계별 대진 생성'}</Button>}
      <Button variant="neutral" onClick={() => void api.view.refetch()}>최신 구성 불러오기</Button>
      <Link className="tm-btn tm-btn-md tm-btn-neutral" href={`/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`}>경기 운영 보드</Link>
    </div>
    <label className="block tm-text-label">관리할 편성<select className={stageControl} value={pool?.key ?? ''} onChange={e => setKey(e.target.value)}>{view.config.stages.map(s => <optgroup key={s.key} label={s.name}>{s.pools.map(p => <option key={p.key} value={p.key}>{p.name} · {p.format === 'league' ? '풀리그' : '토너먼트'}</option>)}</optgroup>)}</select></label>
    {pool && <StagePoolAssignment key={`${pool.key}:${view.revision}`} pool={pool} view={view} canWrite={canWrite && !api.view.isError} onSave={registrationIds => api.assign.mutateAsync({ ...registrationIds, poolKey: pool.key, expectedRevision: view.revision, sourceVersion: pool.sourceVersion })} />}
    {pool?.generated && <section className="space-y-3"><SectionTitle title="경기 일정" />{bracket.isError ? <ErrorState message="경기 일정을 불러오지 못했어요." onRetry={() => void bracket.refetch()} /> : bracket.isPending ? <p role="status">경기 일정을 불러오고 있어요.</p> : bracket.data?.fixtures.filter(f => pool.fixtureIds.includes(f.id)).map(f => <StageFixtureSchedule key={`${f.id}:${f.scheduledAt}`} fixture={f} tournamentId={tournamentId} canWrite={canWrite} />)}</section>}
    {ConfirmModal}
  </div>;
}
function StagePoolAssignment({ pool, view, canWrite, onSave }: { pool: StagePoolView; view: StagePlanView; canWrite: boolean; onSave: (input: { registrationIds: string[]; reason?: string; acknowledgeStartedCorrection?: boolean }) => Promise<unknown> }) {
  const [ids, setIds] = useState(() => Array.from({ length: pool.capacity }, (_, i) => pool.registrationIds[i] ?? ''));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const { confirm, ConfirmModal } = useConfirm();
  const disabled = !canWrite || !pool.generated || pool.started || busy;
  const others = new Set(view.pools.filter(p => p.stageKey === pool.stageKey && p.key !== pool.key).flatMap(p => p.registrationIds));
  const name = (id: string) => view.registrations.find(r => r.id === id)?.team.name ?? '확정 명단에 없는 팀';
  const ready = ids.every(Boolean) && new Set(ids).size === pool.capacity;
  async function save() {
    if (!ready || !await confirm({ title: `${pool.name} 참가팀을 확정할까요?`, message: ids.map((id, i) => `${i + 1}번: ${name(id)}`).join('\n'), confirmLabel: '참가팀 확정' })) return;
    try { setBusy(true); setError(''); await onSave({ registrationIds: ids, reason }); setSaved(true); } catch (e) { setError(extractErrorMessage(e, '참가팀을 확정하지 못했어요.')); } finally { setBusy(false); }
  }
  async function acknowledgeCorrection() {
    if (!reason.trim() || !await confirm({ title: '현재 참가팀을 유지하고 정정 영향을 확인할까요?', message: '이미 시작한 편성의 참가팀과 경기 기록을 유지해요. 이전 단계의 변경된 공식 결과를 확인한 사유를 감사 기록에 남겨요.', confirmLabel: '참가팀 유지 확인' })) return;
    try { setBusy(true); setError(''); await onSave({ registrationIds: pool.registrationIds as string[], reason, acknowledgeStartedCorrection: true }); setSaved(true); } catch (e) { setError(extractErrorMessage(e, '정정 영향을 확인하지 못했어요.')); } finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <SectionTitle title={`${pool.stageName} · ${pool.name}`} />
    {pool.stale && <AlertBanner tone="warning" message="배정 이후 이전 단계 결과나 참가팀이 바뀌었어요. 시작 전이라면 공식 순위로 추천하고 다시 확정해 주세요. 이미 시작했다면 현재 참가팀을 유지하는 사유를 남겨 정정 영향을 확인해 주세요." />}
    {!pool.generated && <p className="tm-text-label">단계별 대진을 생성한 뒤 참가팀을 배정해요.</p>}
    {pool.started && <p className="tm-text-label">시작했거나 기록이 있는 편성이에요. 참가팀 배정은 고정돼요.</p>}
    {pool.stageIndex > 0 && <p className="tm-text-label">이전 단계의 공식 결과가 모두 반영돼야 추천할 수 있어요. 동률 자리는 후보 중에서 결정하고 사유를 남겨요.</p>}
    {error && <AlertBanner tone="error" message={error} />}{saved && <p role="status">참가팀을 확정했어요.</p>}
    {canWrite && pool.started && pool.stale && pool.assigned && pool.stageIndex > 0 && <div className="space-y-3"><label className="block tm-text-label">참가팀 유지 사유<textarea className={stageControl} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><Button variant="neutral" disabled={busy || !reason.trim() || pool.candidates.some(c => !c.length)} onClick={() => void acknowledgeCorrection()}>현재 참가팀 유지 · 정정 확인</Button></div>}
    <fieldset disabled={disabled} className="space-y-3 min-w-0">
      {pool.stageIndex > 0 && <Button variant="neutral" disabled={pool.candidates.some(c => !c.length)} onClick={() => setIds(pool.candidates.map(c => c.length === 1 ? c[0] : ''))}>공식 순위로 추천 배정</Button>}
      {ids.map((id, index) => {
        const allowed = pool.stageIndex === 0 ? view.registrations.map(r => r.id) : pool.candidates[index] ?? [];
        const origin = pool.sources[index], originPool = view.config.stages.flatMap(s => s.pools).find(p => p.key === origin?.poolKey);
        return <label key={index} className="block tm-text-label">{index + 1}번 자리{origin ? ` · ${originPool?.name ?? '이전 편성'} ${origin.rank}위` : ''}<select className={stageControl} value={id} onChange={e => setIds(ids.map((r, i) => i === index ? e.target.value : r))}>
          <option value="">{pool.stageIndex > 0 && !allowed.length ? '공식 결과 확정 대기' : '팀 선택'}</option>
          {[...new Set([...allowed, ...(id ? [id] : [])])].map(r => <option key={r} value={r} disabled={!allowed.includes(r) || others.has(r) || ids.some((picked, i) => i !== index && picked === r)}>{name(r)}{!allowed.includes(r) ? ' · 최신 출처 확인 필요' : ''}</option>)}
        </select></label>;
      })}
      {pool.candidates.some(c => c.length > 1) && <label className="block tm-text-label">동률 결정 사유<textarea className={stageControl} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {canWrite && <Button variant="primary" disabled={!ready || !pool.generated || pool.started || busy || pool.candidates.some(c => c.length > 1) && !reason.trim()} onClick={() => void save()}>{busy ? '확정 중…' : '이 편성 참가팀 확정'}</Button>}
    </fieldset>{ConfirmModal}
  </section>;
}
function StageFixtureSchedule({ fixture, tournamentId, canWrite }: { fixture: V1AdminBracketFixture; tournamentId: string; canWrite: boolean }) {
  const { v1Patch } = useV1DataSource(), client = useQueryClient();
  const [date, setDate] = useState(isoToKstDatetimeLocal(fixture.scheduledAt)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    try { setBusy(true); setError(''); await v1Patch(`/admin/fixtures/${encodeURIComponent(fixture.id)}`, { scheduledAt: date ? kstDatetimeLocalToIso(date) : null }); await client.invalidateQueries({ predicate: q => q.queryKey.some(k => k === tournamentId) }); } catch (e) { setError(extractErrorMessage(e, '일정을 저장하지 못했어요.')); } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-xl bg-[var(--surface-soft)] p-4">
    <p className="tm-text-label">{fixture.fixtureNumber}경기 · {fixture.homeTeamName ?? '진출팀 미정'} vs {fixture.awayTeamName ?? '진출팀 미정'}</p>
    <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 tm-text-label">경기 시작 · 한국 시간<input type="datetime-local" className={stageControl} value={date} disabled={!canWrite || busy} onChange={e => setDate(e.target.value)} /></label>{canWrite && <Button variant="neutral" disabled={busy} onClick={() => void save()}>일정 저장</Button>}</div>
    {error && <AlertBanner tone="error" message={error} />}
  </div>;
}
