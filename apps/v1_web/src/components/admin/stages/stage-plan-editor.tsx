'use client';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { initialStagePlan, rankedLeagueStagePlan, stagePlanCounts, stagePlanError } from '@/lib/stage-plan';
import { randomUuid } from '@/lib/uuid';
import type { StagePlan, StagePool } from '@/types/stage-plan';
export const stageControl = 'min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 tm-text-label text-[var(--text-strong)]';
export function StagePlanEditor({ value, onChange, disabled = false }: { value: StagePlan; onChange: (plan: StagePlan) => void; disabled?: boolean }) {
  const { confirm, ConfirmModal } = useConfirm();
  const counts = stagePlanCounts(value), error = stagePlanError(value);
  const edit = (si: number, pi: number, patch: Partial<StagePool>) => onChange({ ...value, stages: value.stages.map((s, i) => i !== si ? s : { ...s, pools: s.pools.map((p, j) => j !== pi ? p : { ...p, ...patch }) }) });
  const makePool = (name: string, index: number): StagePool => ({ key: randomUuid(), name, format: 'league', capacity: 2, legs: 1, sources: index === 0 ? [] : [{ poolKey: '', rank: 1 }, { poolKey: '', rank: 1 }] });
  async function preset(ranked: boolean) {
    if (await confirm({ title: '대회 구성을 바꿀까요?', message: '현재 단계와 편성을 선택한 템플릿으로 바꿔요.', confirmLabel: '구성 바꾸기' })) onChange(ranked ? rankedLeagueStagePlan() : initialStagePlan());
  }
  return <section className="space-y-5" aria-label="단계형 대회 구성">
    <SectionTitle title="단계와 편성" />
    <p className="tm-text-label text-[var(--text-muted)]">한 단계만 만들어도 돼요. 단계마다 여러 풀리그·토너먼트를 두고, 다음 단계의 진출 출처를 연결해요. 승점은 편성마다 새로 시작해요.</p>
    <fieldset disabled={disabled} className="space-y-5 min-w-0">
      <div className="flex flex-wrap gap-2"><Button variant="neutral" onClick={() => void preset(false)}>단일 리그로 시작</Button><Button variant="neutral" onClick={() => void preset(true)}>20팀 순위별 리그 템플릿</Button></div>
      {value.stages.map((stage, si) => <section key={stage.key} className="space-y-4 rounded-xl bg-[var(--surface-soft)] p-4">
        <label className="block tm-text-label">{si + 1}단계 이름<input className={stageControl} maxLength={60} value={stage.name} onChange={e => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, name: e.target.value } : s) })} /></label>
        {stage.pools.map((pool, pi) => <div key={pool.key} className="space-y-3 rounded-xl bg-[var(--card-surface)] p-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="tm-text-label">편성 이름<input className={stageControl} maxLength={60} value={pool.name} onChange={e => edit(si, pi, { name: e.target.value })} /></label>
          <label className="tm-text-label">경기 방식<select className={stageControl} value={pool.format} onChange={e => edit(si, pi, { format: e.target.value as StagePool['format'], legs: 1 })}><option value="league">풀리그</option><option value="knockout">토너먼트</option></select></label>
          <label className="tm-text-label">참가 자리 수<input className={stageControl} type="number" min={2} max={64} value={pool.capacity} onChange={e => { const capacity = Number(e.target.value); edit(si, pi, { capacity, sources: si === 0 ? [] : Array.from({ length: Math.min(64, Math.max(0, capacity)) }, (_, i) => pool.sources[i] ?? { poolKey: '', rank: 1 }) }); }} /></label>
          {pool.format === 'league' && <label className="tm-text-label">회전 수<select className={stageControl} value={pool.legs} onChange={e => edit(si, pi, { legs: Number(e.target.value) as 1 | 2 })}><option value={1}>1회전 · 상대마다 한 경기</option><option value={2}>2회전 · 상대마다 두 경기</option></select></label>}</div>
          {si > 0 && <fieldset className="space-y-2"><legend className="tm-text-label">진출 출처 · 시드 순서</legend>{pool.sources.map((source, index) => <label key={index} className="block tm-text-label">{index + 1}번 자리<select className={stageControl} value={source.poolKey ? `${source.poolKey}:${source.rank}` : ''} onChange={e => { const split = e.target.value.lastIndexOf(':'); const sources = [...pool.sources]; sources[index] = { poolKey: e.target.value.slice(0, split), rank: Number(e.target.value.slice(split + 1)) }; edit(si, pi, { sources }); }}><option value="">이전 편성과 순위 선택</option>{value.stages.slice(0, si).flatMap(s => s.pools.flatMap(p => Array.from({ length: p.format === 'knockout' ? 2 : Math.min(64, Math.max(0, p.capacity)) }, (_, i) => <option key={`${p.key}:${i + 1}`} value={`${p.key}:${i + 1}`}>{s.name} · {p.name} {i + 1}위</option>)))}</select></label>)}</fieldset>}
          <Button variant="neutral" disabled={stage.pools.length === 1} onClick={() => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, pools: s.pools.filter(p => p.key !== pool.key) } : s) })}>편성 삭제</Button>
        </div>)}
        <div className="flex flex-wrap gap-2"><Button variant="neutral" disabled={stage.pools.length >= 16} onClick={() => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, pools: [...s.pools, makePool(`편성 ${s.pools.length + 1}`, si)] } : s) })}>편성 추가</Button>
        <Button variant="neutral" disabled={value.stages.length === 1} onClick={() => onChange({ ...value, stages: value.stages.filter(s => s.key !== stage.key) })}>단계 삭제</Button></div>
      </section>)}
      <Button variant="neutral" disabled={value.stages.length >= 8} onClick={() => onChange({ ...value, stages: [...value.stages, { key: randomUuid(), name: `${value.stages.length + 1}단계`, pools: [makePool('본선 편성', value.stages.length)] }] })}>다음 단계 추가</Button>
    </fieldset>
    <p className="tm-text-body font-semibold" role="status">모집 {counts.teams}팀 · {value.stages.length}단계 · 예상 {counts.fixtures}경기</p>
    {error && <AlertBanner tone="warning" message={error} />}{ConfirmModal}
  </section>;
}
