'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStagePlan } from '@/hooks/use-stage-plan';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { stagePlanCounts } from '@/lib/stage-plan';
import { extractErrorMessage } from '@/lib/error-message';
import type { StagePlanView, StagePoolView } from '@/types/stage-plan';
import { stageControl } from './stage-plan-editor';
import { StagePeriodSettings } from './stage-period-settings';
import { StageStructureEditor } from './stage-structure-editor';
import { StageFixtureRepair } from './stage-fixture-repair';
import { StageSixTeamControl } from './stage-six-team-control';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
type PoolLabels = { name: string; stageName: string; rankStart: string };
type PoolDraft = PoolLabels & { ids: string[]; reason: string; override: boolean; basis: string; labels: PoolLabels };
const assignmentBasis = (pool: StagePoolView) => JSON.stringify([pool.sourceVersion, pool.registrationIds, pool.assigned, pool.stale]);
export function StagePlanManager({ tournamentId, canWrite, canOverride = false, compactNavigation = false, tournamentStatus }: { tournamentId: string; canWrite: boolean; canOverride?: boolean; compactNavigation?: boolean; tournamentStatus?: string }) {
  const api = useStagePlan(tournamentId), bracket = useV1AdminBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [key, setKey] = useState(''), [error, setError] = useState('');
  const [panel, setPanel] = useState('teams');
  const drafts = useRef<Record<string, PoolDraft>>({});
  const [editorEpoch, setEditorEpoch] = useState(0);
  const editable = canWrite && tournamentStatus !== 'completed' && tournamentStatus !== 'cancelled';
  const view = api.view.data;
  if (!view) return api.view.isError ? <ErrorState message={extractErrorMessage(api.view.error, '단계 구성을 불러오지 못했어요.')} onRetry={() => void api.view.refetch()} /> : <p role="status">단계 구성을 불러오고 있어요.</p>;
  const pool = view.pools.find(p => p.key === key) ?? view.pools[0];
  const counts = stagePlanCounts(view.config);
  async function reload() {
    if (!await confirm({ title: '최신 구성으로 다시 불러올까요?', message: '저장하지 않은 입력은 최신 서버 내용으로 바뀌어요.', confirmLabel: '다시 불러오기' })) return;
    const result = await api.view.refetch();
    if (!result.isError) { drafts.current = {}; setEditorEpoch(epoch => epoch + 1); }
  }
  async function generate() {
    if (!view || !await confirm({ title: '단계별 대진을 생성할까요?', message: `${counts.fixtures}경기를 참가팀 미정 상태로 만들어요. 참가팀과 경기 일정은 별도로 설정하고, 시작 전 편성은 구성 수정에서 변경할 수 있어요.`, confirmLabel: '대진 생성' })) return;
    try { setError(''); await api.generate.mutateAsync({ expectedRevision: view.revision }); } catch (e) { setError(extractErrorMessage(e, '대진을 생성하지 못했어요.')); }
  }
  async function randomize() {
    if (!view || !await confirm({ title: '첫 단계 참가팀을 무작위로 배정할까요?', message: '확정된 전체 참가팀을 첫 단계의 각 편성에 나눠 넣어요. 시작한 경기가 있으면 변경할 수 없어요.', confirmLabel: '무작위 배정' })) return;
    try { setError(''); await api.randomize.mutateAsync({ expectedRevision: view.revision }); } catch (e) { setError(extractErrorMessage(e, '무작위 배정에 실패했어요.')); }
  }
  async function setAutomation(enabled: boolean) {
    if (!view || !await confirm({ title: enabled ? '공식 순위 자동 진출을 켤까요?' : '자동 진출을 끌까요?', message: '공식 순위가 한 팀으로 결정되고 미배정인 다음 편성만 자동 확정해요. 기존 배정과 초안·시작한 경기는 보존해요.', confirmLabel: enabled ? '자동 진출 켜기' : '자동 진출 끄기' })) return;
    try { setError(''); await api.automation.mutateAsync({ expectedRevision: view.revision, enabled }); } catch (e) { setError(extractErrorMessage(e, '자동 진출 설정에 실패했어요.')); }
  }
  return <div className="space-y-5">
    {!compactNavigation && <SectionTitle title="단계별 대진 관리" />}
    <p className="tm-text-label">{counts.teams}팀 · {view.config.stages.length}단계 · {counts.fixtures}경기. 풀리그 승점은 편성마다 새로 시작해요.</p>
    {compactNavigation && <SegmentedTabs ariaLabel="단계 관리 항목" role="tablist" items={[{ id: 'teams', label: '참가팀 배정' }, { id: 'settings', label: '경기 설정' }, ...(editable ? [{ id: 'structure', label: '구성 수정' }] : [])]} activeId={panel} onSelect={setPanel} />}
    <div hidden={compactNavigation && panel !== 'teams'} className="space-y-4">
    {editable && <Button variant="neutral" disabled={api.automation?.isPending || api.view.isError} onClick={() => void setAutomation(!view.config.autoAdvance)}>공식 순위 자동 진출: {view.config.autoAdvance ? '켜짐' : '꺼짐'}</Button>}
    {error && <AlertBanner tone="error" message={error} />}
    {api.view.isError && <AlertBanner tone="warning" message="최신 정보를 불러오지 못했어요. 새로 불러온 뒤 진행해 주세요." />}
    <div className="flex flex-wrap gap-2">
      {editable && !view.pools.some(p => p.generated) && <Button variant="primary" disabled={api.generate.isPending || api.view.isError} onClick={() => void generate()}>{api.generate.isPending ? '생성 중…' : '단계별 대진 생성'}</Button>}
      {editable && view.pools.some(p => p.generated) && <Button variant="neutral" disabled={api.randomize?.isPending || view.pools.some(p => p.stageIndex === 0 && p.started)} onClick={() => void randomize()}>첫 단계 무작위 배정</Button>}
      <Button variant="neutral" onClick={() => void reload()}>최신 구성 불러오기</Button>
      <Link className="tm-btn tm-btn-md tm-btn-neutral" href={`/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`}>경기 운영 보드</Link>
    </div>
    <label className="block tm-text-label">관리할 편성<select className={stageControl} value={pool?.key ?? ''} onChange={e => setKey(e.target.value)}>{view.config.stages.map(s => <optgroup key={s.key} label={s.name}>{s.pools.map(p => <option key={p.key} value={p.key}>{p.name} · {p.format === 'league' ? '풀리그' : '토너먼트'}</option>)}</optgroup>)}</select></label>
    {pool && <StagePoolAssignment key={`assignment:${tournamentId}:${pool.key}:${editorEpoch}`} pool={pool} view={view} initialDraft={drafts.current[`${tournamentId}:${pool.key}`]} onDraftChange={draft => { drafts.current[`${tournamentId}:${pool.key}`] = draft; }} canWrite={canWrite && !api.view.isError} canAssign={editable && !api.view.isError} canOverride={canOverride} onRename={names => api.rename.mutateAsync({ ...names, poolKey: pool.key, expectedRevision: view.revision })} onSave={registrationIds => api.assign.mutateAsync({ ...registrationIds, poolKey: pool.key, expectedRevision: view.revision, sourceVersion: pool.sourceVersion })} />}
    </div>
    {compactNavigation && panel === 'settings' && <label className="block tm-text-label">관리할 편성<select className={stageControl} value={pool?.key ?? ''} onChange={e => setKey(e.target.value)}>{view.config.stages.map(s => <optgroup key={s.key} label={s.name}>{s.pools.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</optgroup>)}</select></label>}
    <div hidden={compactNavigation && panel !== 'settings'} className="space-y-4">
    {editable && pool?.generated && bracket.data && <StageFixtureRepair key={`repair:${pool.key}:${view.revision}`} tournamentId={tournamentId} view={view} pool={pool} fixtures={bracket.data.fixtures} />}
    {pool?.sixTeamFinalBye && <StageSixTeamControl key={`six:${pool.key}:${view.revision}`} tournamentId={tournamentId} view={view} pool={pool} canWrite={editable} />}
    <StagePeriodSettings tournamentId={tournamentId} plan={view.config} canWrite={editable} />
    </div>
    {editable && <div hidden={compactNavigation && panel !== 'structure'}><StageStructureEditor key={`structure:${tournamentId}:${editorEpoch}`} tournamentId={tournamentId} view={view} /></div>}
    {ConfirmModal}
  </div>;
}
function StagePoolAssignment({ pool, view, initialDraft, onDraftChange, canWrite, canAssign, canOverride, onRename, onSave }: { pool: StagePoolView; view: StagePlanView; initialDraft?: PoolDraft; onDraftChange: (draft: PoolDraft) => void; canWrite: boolean; canAssign: boolean; canOverride: boolean; onRename: (names: { name: string; stageName: string; overallRankStart?: number | null }) => Promise<StagePlanView>; onSave: (input: { registrationIds: Array<string | null>; reason?: string; acknowledgeStartedCorrection?: boolean; draft?: boolean; overrideCandidates?: boolean }) => Promise<StagePlanView> }) {
  const poolLabels = { name: pool.name, stageName: pool.stageName, rankStart: pool.overallRankStart === undefined ? '' : String(pool.overallRankStart) };
  const initialLabel = (field: keyof PoolLabels) => initialDraft && initialDraft[field] !== initialDraft.labels[field] ? initialDraft[field] : poolLabels[field];
  const [ids, setIds] = useState(() => initialDraft?.ids ?? Array.from({ length: pool.capacity }, (_, i) => pool.registrationIds[i] ?? ''));
  const [reason, setReason] = useState(initialDraft?.reason ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [name, setName] = useState(() => initialLabel('name')), [stageName, setStageName] = useState(() => initialLabel('stageName')), [override, setOverride] = useState(initialDraft?.override ?? false);
  const [rankStart, setRankStart] = useState(() => initialLabel('rankStart'));
  const [basis, setBasis] = useState(initialDraft?.basis ?? assignmentBasis(pool));
  useEffect(() => { setSaved(false); }, [ids, reason, override]);
  const labels = useRef(poolLabels);
  useEffect(() => {
    const previous = labels.current, next = { name: pool.name, stageName: pool.stageName, rankStart: pool.overallRankStart === undefined ? '' : String(pool.overallRankStart) };
    setName(current => current === previous.name ? next.name : current);
    setStageName(current => current === previous.stageName ? next.stageName : current);
    setRankStart(current => current === previous.rankStart ? next.rankStart : current);
    labels.current = next;
  }, [pool.name, pool.stageName, pool.overallRankStart]);
  useEffect(() => { onDraftChange({ ids, reason, name, stageName, override, rankStart, basis, labels: labels.current }); }, [ids, reason, name, stageName, override, rankStart, basis, onDraftChange]);
  const assignmentChanged = basis !== assignmentBasis(pool);
  const finalStage = pool.stageIndex === view.config.stages.length - 1;
  const rankChanged = rankStart !== (pool.overallRankStart === undefined ? '' : String(pool.overallRankStart));
  const rankInvalid = rankStart !== '' && (!Number.isInteger(Number(rankStart)) || Number(rankStart) < 1 || Number(rankStart) > stagePlanCounts(view.config).teams);
  const { confirm, ConfirmModal } = useConfirm();
  const disabled = !canAssign || !pool.generated || pool.started || busy || assignmentChanged;
  const acceptSavedAssignment = (next: StagePlanView) => { const current = next.pools.find(item => item.key === pool.key); if (current) setBasis(assignmentBasis(current)); };
  const others = new Set(view.pools.filter(p => p.stageKey === pool.stageKey && p.key !== pool.key).flatMap(p => p.registrationIds));
  const teamName = (id: string) => view.registrations.find(r => r.id === id)?.team.name ?? '확정 명단에 없는 팀';
  const ready = ids.every(Boolean) && new Set(ids).size === pool.capacity;
  async function save() {
    if (!ready || !await confirm({ title: `${pool.name} 참가팀을 확정할까요?`, message: ids.map((id, i) => `${i + 1}번: ${teamName(id)}`).join('\n'), confirmLabel: '참가팀 확정' })) return;
    try { setBusy(true); setError(''); acceptSavedAssignment(await onSave({ registrationIds: ids, reason, ...(override ? { overrideCandidates: true } : {}) })); setSaved(true); } catch (e) { setError(extractErrorMessage(e, '참가팀을 확정하지 못했어요.')); } finally { setBusy(false); }
  }
  async function saveDraft() {
    try { setBusy(true); setError(''); acceptSavedAssignment(await onSave({ registrationIds: ids.map(id => id || null), reason, draft: true, ...(override ? { overrideCandidates: true } : {}) })); setSaved(false); } catch (e) { setError(extractErrorMessage(e, '배정 초안을 저장하지 못했어요.')); } finally { setBusy(false); }
  }
  async function saveNames() {
    try { setBusy(true); setError(''); await onRename({ name, stageName, ...(finalStage ? { overallRankStart: rankStart === '' ? null : Number(rankStart) } : {}) }); } catch (e) { setError(extractErrorMessage(e, '표시 설정을 저장하지 못했어요.')); } finally { setBusy(false); }
  }
  async function acknowledgeCorrection() {
    if (!reason.trim() || !await confirm({ title: '현재 참가팀을 유지하고 정정 영향을 확인할까요?', message: '이미 시작한 편성의 참가팀과 경기 기록을 유지해요. 이전 단계의 변경된 공식 결과를 확인한 사유를 감사 기록에 남겨요.', confirmLabel: '참가팀 유지 확인' })) return;
    try { setBusy(true); setError(''); acceptSavedAssignment(await onSave({ registrationIds: pool.registrationIds as string[], reason, acknowledgeStartedCorrection: true })); setSaved(true); } catch (e) { setError(extractErrorMessage(e, '정정 영향을 확인하지 못했어요.')); } finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <SectionTitle title={`${pool.stageName} · ${pool.name}`} />
    {canWrite && <div className="grid gap-3 sm:grid-cols-2"><label className="tm-text-label">단계 이름<input className={stageControl} value={stageName} maxLength={60} disabled={busy} onChange={e => setStageName(e.target.value)} /></label><label className="tm-text-label">편성 이름<input className={stageControl} value={name} maxLength={60} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      {finalStage && <label className="tm-text-label">전체 순위 시작 번호<input className={stageControl} type="number" min={1} max={stagePlanCounts(view.config).teams} value={rankStart} disabled={busy} onChange={event => setRankStart(event.target.value)} /><span className="tm-text-caption text-[var(--text-muted)]">비워 두면 이 편성의 순위만 표시해요.</span></label>}
      <Button variant="neutral" disabled={busy || !name.trim() || !stageName.trim() || rankInvalid || name === pool.name && stageName === pool.stageName && !rankChanged} onClick={() => void saveNames()}>표시 설정 저장</Button></div>}
    {pool.stale && <AlertBanner tone="warning" message="배정 이후 이전 단계 결과나 참가팀이 바뀌었어요. 시작 전이라면 공식 순위로 추천하고 다시 확정해 주세요. 이미 시작했다면 현재 참가팀을 유지하는 사유를 남겨 정정 영향을 확인해 주세요." />}
    {!pool.generated && <p className="tm-text-label">단계별 대진을 생성한 뒤 참가팀을 배정해요.</p>}
    {pool.started && <p className="tm-text-label">시작했거나 기록이 있는 편성이에요. 참가팀 배정은 고정돼요.</p>}
    {pool.stageIndex > 0 && <p className="tm-text-label">이전 단계의 공식 결과가 모두 반영돼야 추천할 수 있어요. 동률 자리는 후보 중에서 결정하고 사유를 남겨요.</p>}
    {error && <AlertBanner tone="error" message={error} />}{saved && <p role="status">참가팀을 확정했어요.</p>}
    {assignmentChanged && <AlertBanner tone="warning" message="서버의 참가팀 배정이나 진출 출처가 바뀌었어요. 입력은 보존했으며 최신 구성을 다시 불러온 뒤 배정해 주세요." />}
    {canAssign && pool.started && pool.stale && pool.assigned && pool.stageIndex > 0 && <div className="space-y-3"><label className="block tm-text-label">참가팀 유지 사유<textarea className={stageControl} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><Button variant="neutral" disabled={busy || !reason.trim() || pool.candidates.some(c => !c.length)} onClick={() => void acknowledgeCorrection()}>현재 참가팀 유지 · 정정 확인</Button></div>}
    <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2 [&>button]:sm:col-span-2 [&>div]:sm:col-span-2">
      {canOverride && pool.stageIndex > 0 && <label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />공식 후보 밖 예외 배정 · 사유 필수</label>}
      {pool.stageIndex > 0 && <Button variant="neutral" disabled={pool.candidates.some(c => !c.length)} onClick={() => setIds(pool.candidates.map(c => c.length === 1 ? c[0] : ''))}>공식 순위로 추천 배정</Button>}
      {ids.map((id, index) => {
        const allowed = pool.stageIndex === 0 || override ? view.registrations.map(r => r.id) : pool.candidates[index] ?? [];
        const origin = pool.sources[index], originPool = view.config.stages.flatMap(s => s.pools).find(p => p.key === origin?.poolKey);
        return <label key={index} className="block tm-text-label">{index + 1}번 자리{origin ? ` · ${originPool?.name ?? '이전 편성'} ${origin.rank}위` : ''}<select className={stageControl} value={id} onChange={e => setIds(ids.map((r, i) => i === index ? e.target.value : r))}>
          <option value="">{pool.stageIndex > 0 && !allowed.length ? '공식 결과 확정 대기' : '팀 선택'}</option>
          {[...new Set([...allowed, ...(id ? [id] : [])])].map(r => <option key={r} value={r} disabled={!allowed.includes(r) || others.has(r) || ids.some((picked, i) => i !== index && picked === r)}>{teamName(r)}{!allowed.includes(r) ? ' · 최신 출처 확인 필요' : ''}</option>)}
        </select></label>;
      })}
      {(override || pool.candidates.some(c => c.length > 1)) && <label className="block tm-text-label">{override ? '예외 배정 사유' : '동률 결정 사유'}<textarea className={stageControl} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {canAssign && <div className="flex flex-wrap gap-2"><Button variant="neutral" disabled={!pool.generated || pool.started || busy || override && !reason.trim()} onClick={() => void saveDraft()}>미정 자리 포함 초안 저장</Button><Button variant="primary" disabled={!ready || !pool.generated || pool.started || busy || (override || pool.candidates.some(c => c.length > 1)) && !reason.trim()} onClick={() => void save()}>{busy ? '확정 중…' : '이 편성 참가팀 확정'}</Button></div>}
    </fieldset>{ConfirmModal}
  </section>;
}
