'use client';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, SectionTitle } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { initialStagePlan, rankedLeagueStagePlan, stagePlanCounts, stagePlanError } from '@/lib/stage-plan';
import { randomUuid } from '@/lib/uuid';
import type { StagePlan, StagePool } from '@/types/stage-plan';
import { StageSourceEditor } from './stage-source-editor';
import { SixTeamOrderEditor } from '@/components/admin/tournaments/six-team-order-editor';
import { DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER } from '@/lib/tournament-tie-break';
import { ChevronDown } from 'lucide-react';
export const stageControl = 'tm-input min-h-11 min-w-0 w-full';
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
      <label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={value.autoAdvance === true} onChange={e => onChange({ ...value, autoAdvance: e.target.checked })} />공식 순위가 확정되면 다음 단계 참가팀 자동 확정 · 동률은 운영자가 결정</label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="neutral" onClick={() => void preset(false)}>단일 리그로 시작</Button><Button type="button" variant="neutral" onClick={() => void preset(true)}>20팀 순위별 리그 템플릿</Button></div>
      {value.stages.map((stage, si) => <section key={stage.key} className="min-w-0 space-y-4 border-t border-[var(--border)] pt-4">
        <label className="block tm-text-label">{si + 1}단계 이름<input className={stageControl} maxLength={60} value={stage.name} onChange={e => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, name: e.target.value } : s) })} /></label>
        {stage.pools.map((pool, pi) => <details key={pool.key} open={stage.pools.length === 1} className="group min-w-0 space-y-3 rounded-xl bg-[var(--surface-soft)] p-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 tm-text-label"><span>{pool.name} · {pool.capacity}팀 · {pool.format === 'league' ? '풀리그' : '토너먼트'}</span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="grid gap-3 sm:grid-cols-2"><label className="tm-text-label">편성 이름<input className={stageControl} maxLength={60} value={pool.name} onChange={e => edit(si, pi, { name: e.target.value })} /></label>
          <label className="tm-text-label">경기 방식<select className={stageControl} value={pool.format} onChange={e => edit(si, pi, { format: e.target.value as StagePool['format'], legs: 1, thirdPlace: false, sixTeamFinalBye: false, sixTeamDirectFinalOrder: undefined, seeding: 'fixed' })}><option value="league">풀리그</option><option value="knockout">토너먼트</option></select></label>
          <label className="tm-text-label">참가 자리 수<input className={stageControl} type="number" min={2} max={64} value={pool.capacity} onChange={e => { const capacity = Number(e.target.value); edit(si, pi, { capacity, ...(capacity !== 6 ? { sixTeamFinalBye: false, sixTeamDirectFinalOrder: undefined } : {}), ...(capacity !== 12 ? { seeding: 'fixed' } : {}), ...(capacity < 4 ? { thirdPlace: false } : {}), sources: si === 0 ? [] : Array.from({ length: Math.min(64, Math.max(0, capacity)) }, (_, i) => pool.sources[i] ?? { poolKey: '', rank: 1 }) }); }} /></label>
          {pool.format === 'league' && <label className="tm-text-label">회전 수<select className={stageControl} value={pool.legs} onChange={e => edit(si, pi, { legs: Number(e.target.value) as 1 | 2 })}><option value={1}>1회전 · 상대마다 한 경기</option><option value={2}>2회전 · 상대마다 두 경기</option></select></label>}</div>
          {pool.format === 'knockout' && <label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={pool.thirdPlace === true} disabled={pool.capacity < 4 || pool.sixTeamFinalBye} onChange={e => edit(si, pi, { thirdPlace: e.target.checked })} />3·4위전 진행</label>}
          {pool.format === 'knockout' && pool.capacity === 6 && <label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={pool.sixTeamFinalBye === true} onChange={e => edit(si, pi, { sixTeamFinalBye: e.target.checked, thirdPlace: false, sixTeamDirectFinalOrder: undefined })} />6강 결승 직행 · 첫 경기 승자 3팀 중 성적 비교 · 동률은 운영자 결정</label>}
          {pool.sixTeamFinalBye && <SixTeamOrderEditor order={pool.sixTeamDirectFinalOrder ?? [...DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER]} onChange={order => edit(si, pi, { sixTeamDirectFinalOrder: order })} />}
          {si === value.stages.length - 1 && <label className="block tm-text-label">전체 순위 시작 번호 · 비우면 편성 순위만 표시<input className={stageControl} type="number" min={1} max={counts.teams} value={pool.overallRankStart ?? ''} onChange={e => edit(si, pi, { overallRankStart: e.target.value === '' ? undefined : Number(e.target.value) })} /><span className="tm-text-caption">이 편성의 1위부터 {pool.format === 'league' ? pool.capacity : pool.thirdPlace ? 4 : 2}개 순위를 전체 순위 구간에 연결해요.</span></label>}
          {si > 0 && <fieldset className="space-y-3"><legend className="tm-text-label">진출 출처 · 시드 순서</legend>{pool.sources.map((source, index) => <StageSourceEditor key={index} source={source} index={index} origins={value.stages.slice(0, si).flatMap(stage => stage.pools.map(pool => ({ ...pool, name: `${stage.name} · ${pool.name}` })))} onChange={next => edit(si, pi, { sources: pool.sources.map((old, i) => i === index ? next : old) })} />)}</fieldset>}
          {si > 0 && pool.format === 'knockout' && pool.capacity === 12 && <label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={pool.seeding === 'cross_group_top_three'} onChange={event => edit(si, pi, { seeding: event.target.checked ? 'cross_group_top_three' : 'fixed' })} />4개 조 1~3위 교차 시드 · 조 1위 부전승 · 같은 조 재대결 회피</label>}
          <Button type="button" variant="neutral" disabled={stage.pools.length === 1} onClick={() => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, pools: s.pools.filter(p => p.key !== pool.key) } : s) })}>편성 삭제</Button>
        </details>)}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="neutral" disabled={stage.pools.length >= 16} onClick={() => onChange({ ...value, stages: value.stages.map((s, i) => i === si ? { ...s, pools: [...s.pools, makePool(`편성 ${s.pools.length + 1}`, si)] } : s) })}>편성 추가</Button>
        <Button type="button" variant="neutral" disabled={value.stages.length === 1} onClick={() => onChange({ ...value, stages: value.stages.filter(s => s.key !== stage.key) })}>단계 삭제</Button></div>
      </section>)}
      <Button type="button" variant="neutral" disabled={value.stages.length >= 8} onClick={() => onChange({ ...value, stages: [...value.stages, { key: randomUuid(), name: `${value.stages.length + 1}단계`, pools: [makePool('본선 편성', value.stages.length)] }] })}>다음 단계 추가</Button>
    </fieldset>
    <p className="tm-text-body font-semibold" role="status">모집 {counts.teams}팀 · {value.stages.length}단계 · 예상 {counts.fixtures}경기</p>
    {error && <AlertBanner tone="warning" message={error} />}{ConfirmModal}
  </section>;
}
