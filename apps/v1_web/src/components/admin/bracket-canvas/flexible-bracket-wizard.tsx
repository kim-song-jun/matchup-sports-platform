'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { useV1ApplyBracketTemplate } from '@/hooks/use-v1-bracket-canvas';
import { V1ApiError, v1Get, v1Post, v1Put } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { randomIndex } from '@/lib/random-index';
import { distributeGroupSeeds } from '@/lib/seeded-group-assignment';
import type { FlexibleBracketInput, FlexibleBracketPreview } from '@/types/api';
import type { BracketTemplateDialogProps } from './bracket-template-dialog';

type Group = NonNullable<FlexibleBracketInput['groups']>[number] & { legs: 1 | 2 };
type Draft = { input: FlexibleBracketInput | null; revision: number };
const inputClass = 'tm-input min-h-[44px] w-full';
const draw = () => crypto.getRandomValues(new Uint32Array(1))[0];
function distribute(total: number, count: number): Group[] {
  return Array.from({ length: count }, (_, i) => {
    const capacity = Math.floor(total / count) + Number(i < total % count);
    return { name: `${String.fromCharCode(65 + i)}조`, capacity, advanceCount: Math.min(2, capacity - 1), legs: 1 };
  });
}

export function FlexibleBracketWizard(props: BracketTemplateDialogProps & { onLegacy: () => void }) {
  const { open, tournamentId, format, onClose, onApplied, showToast, onLegacy, hasExistingBracket } = props;
  const prefix = useId();
  const base = `/admin/tournaments/${encodeURIComponent(tournamentId)}/bracket/template`;
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(props.confirmedTeamCount || 8);
  const [groups, setGroups] = useState<Group[]>(() => distribute(props.confirmedTeamCount || 8, 2));
  const [thirdPlace, setThirdPlace] = useState(false);
  const [seed, setSeed] = useState(0);
  const [seedPolicy, setSeedPolicy] = useState<'random' | 'seeded'>('random');
  const [assignNow, setAssignNow] = useState(false);
  const [assignments, setAssignments] = useState<string[]>([]);
  const [groupSeeds, setGroupSeeds] = useState<string[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [acknowledgeRematches, setAcknowledgeRematches] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const touched = useRef(false);
  const request = useRef<{ input: string; id: string } | null>(null);
  const wasOpen = useRef(false);
  const apply = useV1ApplyBracketTemplate(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const registrations = useV1AdminTournamentRegistrations(open ? tournamentId : '');
  const teams = (registrations.data?.items ?? []).filter((team) => team.status === 'confirmed');
  const draft = useQuery({ queryKey: ['bracket-draft', tournamentId], queryFn: () => v1Get<Draft>(`${base}/draft`), enabled: open });
  const input: FlexibleBracketInput = { schemaVersion: 2, kind: format === 'group_knockout' ? 'group_knockout' : 'knockout',
    participantCount: count, ...(format === 'knockout' ? { size: count } : { groups }), thirdPlace,
    drawSeed: seed, seedPolicy, ...(assignNow ? { registrationIds: assignments } : {}) };
  const serialized = JSON.stringify(input);
  const preview = useMutation({ mutationFn: (payload: FlexibleBracketInput) => v1Post<FlexibleBracketPreview>(`${base}/preview`, payload) });
  const save = useMutation({ mutationFn: () => v1Put<Draft>(`${base}/draft`, { ...input, expectedRevision: revision }),
    onSuccess: (saved) => { setRevision(saved.revision); setDirty(false); void draft.refetch(); showToast('설정 초안을 저장했어요.', 'success'); },
    onError: (e) => setError(extractErrorMessage(e, '초안을 저장하지 못했어요.')) });
  const busy = apply.isPending || preview.isPending || save.isPending || recovering;
  async function close() {
    if (busy) return;
    if (dirty && !await confirm({ title: '설정 닫기', message: '저장하지 않은 설정이 있어요. 닫기 전에 초안 저장을 할 수 있어요. 지금 나갈까요?', confirmLabel: '나가기' })) return;
    onClose();
  }
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose: () => void close(), pending: busy });
  useEffect(() => {
    if (open && !wasOpen.current) { setStep(0); setSeed(draw()); setError(''); setDirty(false); touched.current = false; setRevision(null); preview.reset(); request.current = null; }
    wasOpen.current = open;
  }, [open]); // A new draw is explicit when starting a new wizard session.
  useEffect(() => {
    if (open && !touched.current && props.confirmedTeamCountStatus !== 'pending' && props.confirmedTeamCountStatus !== 'error') {
      const total = props.confirmedTeamCount || 8;
      setCount(total); setGroups(distribute(total, Math.max(2, Math.ceil(total / 4))));
      setAssignments([]); setGroupSeeds([]); setAssignNow(false); setThirdPlace(false);
    }
  }, [open, props.confirmedTeamCount, props.confirmedTeamCountStatus]);
  useEffect(() => { if (draft.data && revision === null) setRevision(draft.data.revision); }, [draft.data, revision]);
  const total = groups.reduce((sum, group) => sum + group.capacity, 0);
  const finalists = format === 'knockout' ? count : groups.reduce((sum, group) => sum + group.advanceCount, 0);
  useEffect(() => { if (finalists < 4) setThirdPlace(false); }, [finalists]);
  const validCount = Number.isInteger(count) && count >= 4 && count <= 64 && count % 2 === 0;
  const validGroups = format === 'knockout' || (total === count && groups.length >= 2 && groups.length <= 16
    && new Set(groups.map((group) => group.name.trim())).size === groups.length
    && groups.every((group) => group.name.trim() && Number.isInteger(group.capacity) && group.capacity >= 2 && group.capacity <= 8
      && Number.isInteger(group.advanceCount) && group.advanceCount >= 1 && group.advanceCount < group.capacity && [1, 2].includes(group.legs)));
  const validAssignment = !assignNow || (assignments.length === count && new Set(assignments).size === count
    && assignments.every((id) => teams.some((team) => team.id === id)));
  const valid = validCount && validGroups && validAssignment && (!thirdPlace || finalists >= 4);
  const currentPreview = preview.data && preview.variables && JSON.stringify(preview.variables) === serialized ? preview.data : null;
  const candidates = Array.from({ length: 15 }, (_, i) => i + 2).filter((n) => Math.floor(count / n) >= 2 && Math.ceil(count / n) <= 8);
  const mark = () => { touched.current = true; setDirty(true); setError(''); };
  const restore = async () => {
    const fresh = await draft.refetch();
    const saved = fresh.data?.input;
    if (!saved || saved.schemaVersion !== 2 || saved.kind !== input.kind) return;
    touched.current = true;
    setCount(saved.participantCount);
    setGroups(saved.groups?.map(group => ({ ...group, legs: group.legs ?? saved.legs ?? 1 })) ?? distribute(saved.participantCount, 2));
    setThirdPlace(saved.thirdPlace); setSeed(saved.drawSeed); setSeedPolicy(saved.seedPolicy);
    setAssignNow(Boolean(saved.registrationIds)); setAssignments(saved.registrationIds ?? []); setGroupSeeds([]); setRevision(fresh.data!.revision); setDirty(false);
  };
  async function changeGroupCount(groupCount: number) {
    if (assignments.some(Boolean) && !await confirm({ title: '조 편성 변경', message: '조 수를 바꾸면 현재 팀 배정이 초기화돼요. 다시 편성할까요?', confirmLabel: '다시 편성' })) return;
    setGroups(distribute(count, groupCount).map((group, i) => ({ ...group, legs: groups[i]?.legs ?? 1 })));
    setAssignments([]); setGroupSeeds([]); mark();
  }
  function fillTeams(seeded: boolean) {
    if (seeded && groupSeeds.slice(0, groupSeeds.findLastIndex(Boolean) + 1).some(id => !id)) {
      setError('시드는 1번부터 빈 순서 없이 선택해 주세요.'); return;
    }
    const ids = teams.map((team) => team.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    try { setAssignments(seeded ? distributeGroupSeeds(groups.map(group => group.capacity), groupSeeds.filter(Boolean), ids) : ids); mark(); }
    catch (e) { setError(extractErrorMessage(e, '시드 배정을 확인해 주세요.')); }
  }
  async function next() {
    if (step === 2) {
      if (!valid) return;
      try { await preview.mutateAsync(input); setAcknowledgeRematches(false); setStep(3); setError(''); } catch (e) { setError(extractErrorMessage(e, '미리보기를 불러오지 못했어요.')); }
    } else setStep(step + 1);
  }
  async function generate() {
    if (!currentPreview || !valid || (currentPreview.warnings?.length && !acknowledgeRematches)) return;
    if (hasExistingBracket && !await confirm({ title: '기존 대진 교체', message: '기존 경기와 자리·일정이 새 대진으로 교체돼요. 시작했거나 결과가 있는 경기는 교체할 수 없어요.', confirmLabel: '교체', tone: 'danger' })) return;
    if (!request.current || request.current.input !== serialized) request.current = { input: serialized, id: randomUuid() };
    const payload = { ...input, requestId: request.current.id, previewHash: currentPreview.previewHash, replaceExisting: hasExistingBracket, acknowledgeRematches };
    const finish = (result: { fixtures: number }) => { setDirty(false); showToast(`${result.fixtures}경기 대진을 만들었어요.`, 'success'); onApplied?.(); onClose(); };
    try {
      finish(await apply.mutateAsync(payload));
    } catch (e) {
      if (e instanceof V1ApiError && (e.statusCode === 0 || e.statusCode === 408 || e.statusCode >= 500)) {
        setRecovering(true);
        try {
          const status = await v1Get<{ completed: boolean }>(`${base}/requests/${encodeURIComponent(payload.requestId)}`);
          if (status.completed) { finish(await apply.mutateAsync(payload)); return; }
        } catch (recoveryError) {
          setError(extractErrorMessage(recoveryError, '생성 결과를 확인하지 못했어요. 같은 설정으로 다시 시도해 주세요.')); return;
        } finally { setRecovering(false); }
      }
      setError(extractErrorMessage(e, '생성 결과를 확인하지 못했어요. 같은 설정으로 다시 시도해 주세요.'));
    }
  }
  const assignmentSlots = format === 'knockout' ? Array.from({ length: validCount ? count : 0 }, (_, i) => `${i + 1}번 시드`)
    : groups.flatMap((group) => Array.from({ length: Number.isInteger(group.capacity) && group.capacity >= 2 && group.capacity <= 8 ? group.capacity : 0 }, (_, i) => `${group.name} ${i + 1}번`));
  if (!mounted || typeof document === 'undefined') return ConfirmModal;
  // 확인창 portal을 마지막에 두어 같은 modal 레이어에서 설정창 위로 올라오게 한다.
  return <>{createPortal(<div style={{ zIndex: 'var(--z-modal)' }} className={`fixed inset-0 flex items-center justify-center p-4 tm-modal-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${prefix}-title`} className="tm-modal-panel flex max-h-[calc(100dvh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[var(--card-surface)] text-[var(--text-strong)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] p-4">
        <h2 id={`${prefix}-title`} className="tm-text-body-lg font-bold">전체 대진 만들기</h2>
        <button aria-label="모달 닫기" className="flex size-11 items-center justify-center rounded-lg" disabled={busy} onClick={() => void close()}><X size={20} /></button>
      </div>
      <div key={step} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <fieldset disabled={busy} className="min-w-0 space-y-5 p-5">
        <p className="tm-text-label text-[var(--text-muted)]">{step + 1}/4 · {['참가 팀 수', '조 편성과 진출', '팀 배정', '전체 미리보기'][step]}</p>
        {error && <p role="alert" className="tm-text-caption text-[var(--red700)]">{error}</p>}
        {recovering && <p role="status" className="tm-text-caption">서버에 저장된 생성 결과를 확인하고 있어요.</p>}
        {draft.isError && <p role="alert">저장된 초안을 불러오지 못했어요. <button className="min-h-11 underline" onClick={() => void draft.refetch()}>다시 불러오기</button></p>}
        {step === 0 && <div className="space-y-4">
          <label className="block tm-text-label">참가 팀 수<input aria-label="참가 팀 수" className={inputClass} type="number" min={4} max={64} step={2} value={count || ''} onChange={(e) => { setCount(Number(e.target.value)); mark(); }} /></label>
          <p className="tm-text-caption">계획 {count || 0}팀 · 확정 참가 {props.confirmedTeamCount ?? 0}팀 · 4~64팀의 짝수로 만들 수 있어요.</p>
          {!validCount && <p role="alert" className="tm-text-caption text-[var(--red700)]">4~64 사이의 짝수를 입력해 주세요.</p>}
          {draft.data?.input?.schemaVersion === 2 && <Button variant="outline" disabled={draft.isFetching} onClick={() => void restore()}>저장한 설정 불러오기</Button>}
          {format === 'group_knockout' && <button className="min-h-11 text-[var(--blue700)] underline" onClick={onLegacy}>기존 20팀 조 간 비교 12강 설정</button>}
        </div>}
        {step === 1 && <div className="space-y-4">
          {format === 'group_knockout' && <>
            <label className="block tm-text-label">조 수<select aria-label="조 수" className={inputClass} value={groups.length} onChange={(e) => void changeGroupCount(Number(e.target.value))}>
              {candidates.map((n) => <option key={n} value={n}>{n}개 조</option>)}
            </select></label>
            <div className="flex flex-wrap gap-2" aria-label="조 편성 추천">{[...candidates].sort((a, b) => Math.abs(count / a - 4) - Math.abs(count / b - 4)).slice(0, 3).map((n) => <Button key={n} variant="outline" onClick={() => void changeGroupCount(n)}>{n}개 조 · {distribute(count, n).map((g) => g.capacity).join('·')}팀</Button>)}</div>
            <div className="space-y-3">{groups.map((group, index) => <fieldset key={index} className="grid min-w-0 grid-cols-3 gap-2 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-4">
              <legend className="tm-text-label px-1">{group.name || `${index + 1}번째 조`}</legend>
              {(['name', 'capacity', 'advanceCount'] as const).map((field, i) => <label key={field} className="tm-text-caption">{['조 이름', '팀 수', '진출 수'][i]}<input aria-label={`${index + 1}번째 조 ${['이름', '팀 수', '진출 수'][i]}`} className={inputClass} type={field === 'name' ? 'text' : 'number'} value={group[field]} min={field === 'capacity' ? 2 : 1} max={field === 'capacity' ? 8 : field === 'advanceCount' ? group.capacity - 1 : undefined} maxLength={80}
                onChange={(e) => { setGroups(groups.map((g, j) => j !== index ? g : { ...g, [field]: field === 'name' ? e.target.value : Number(e.target.value) })); mark(); }} /></label>)}
              <label className="col-span-3 tm-text-caption sm:col-span-1">회전<select aria-label={`${index + 1}번째 조 회전`} className={inputClass} value={group.legs}
                onChange={(e) => { setGroups(groups.map((g, j) => j !== index ? g : { ...g, legs: Number(e.target.value) as 1 | 2 })); mark(); }}><option value={1}>1회전</option><option value={2}>2회전</option></select></label>
              <p className="col-span-3 tm-text-caption text-[var(--text-muted)] sm:col-span-4">{group.capacity * (group.capacity - 1) / 2 * group.legs}경기 · 팀당 {(group.capacity - 1) * group.legs}경기 · {Math.round(group.advanceCount / group.capacity * 100)}% 진출</p>
            </fieldset>)}</div>
            <p className="tm-text-label">참가 {count}팀 중 {total}팀 편성 · 결선 {finalists}팀</p>
            {!validGroups && <p role="alert" className="tm-text-caption text-[var(--red700)]">조별 팀 수 합계를 맞추고, 각 조 진출 수는 1팀 이상·조 팀 수보다 적게 설정해 주세요.</p>}
          </>}
          <p className="tm-text-body">결선 {finalists}팀 · 부전승 {finalists >= 2 ? 2 ** Math.ceil(Math.log2(finalists)) - finalists : 0}팀</p>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={thirdPlace} disabled={finalists < 4} onChange={(e) => { setThirdPlace(e.target.checked); mark(); }} />3·4위전도 만들기</label>
          {finalists < 4 && <p className="tm-text-caption">결선 4팀 이상일 때 3·4위전을 만들 수 있어요.</p>}
        </div>}
        {step === 2 && <div className="space-y-4">
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={assignNow} onChange={(e) => { setAssignNow(e.target.checked); mark(); }} />확정 참가팀을 지금 배정하기</label>
          {!assignNow && <p className="tm-text-caption">빈 대진을 먼저 만들고 팀은 나중에 배정해요.</p>}
          {format === 'knockout' && <label className="block tm-text-label">결선 시드 방식<select className={inputClass} value={seedPolicy} onChange={(e) => { setSeedPolicy(e.target.value as 'random' | 'seeded'); mark(); }}><option value="random">무작위 추첨</option><option value="seeded">시드 우선</option></select></label>}
          {format === 'group_knockout' && <p className="tm-text-caption">조별 순위가 높은 팀부터 부전승을 배정하고, 같은 순위는 추첨해요. 같은 조 팀은 가능한 늦게 만나도록 편성해요.</p>}
          <Button variant="outline" onClick={() => { setSeed(draw()); mark(); }}>결선 추첨 다시 하기</Button>
          {assignNow && <>
            {registrations.isError && <p role="alert">참가팀을 불러오지 못했어요.</p>}
            {registrations.isPending && <p role="status">확정 참가팀을 불러오고 있어요.</p>}
            <Button variant="outline" disabled={teams.length !== count} onClick={() => fillTeams(false)}>참가팀 무작위 배정</Button>
            {format === 'group_knockout' && <details className="space-y-3"><summary className="min-h-11 cursor-pointer tm-text-label">시드팀을 조별로 분산하기</summary>
              <p className="tm-text-caption">시드 순서대로 서로 다른 조에 배정하고, 남은 팀은 추첨해요. 배정 후 아래에서 직접 수정할 수 있어요.</p>
              <div className="grid gap-2 sm:grid-cols-2">{groups.map((_, i) => <label key={i} className="tm-text-label">{i + 1}번 시드팀<select className={inputClass} value={groupSeeds[i] ?? ''} onChange={(e) => setGroupSeeds(Array.from({ length: groups.length }, (_, j) => j === i ? e.target.value : groupSeeds[j] ?? ''))}><option value="">시드 없음</option>{teams.map(team => <option key={team.id} value={team.id}>{team.teamName ?? '이름 없는 팀'}</option>)}</select></label>)}</div>
              <Button variant="outline" disabled={teams.length !== count || !groupSeeds.some(Boolean)} onClick={() => fillTeams(true)}>시드 분산 적용</Button>
            </details>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{assignmentSlots.map((label, i) => <label key={i} className="tm-text-label">{label}<select className={inputClass} value={assignments[i] ?? ''} onChange={(e) => { const ids = Array.from({ length: count }, (_, j) => assignments[j] ?? ''); ids[i] = e.target.value; setAssignments(ids); mark(); }}><option value="">팀 선택</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.teamName ?? '이름 없는 팀'}</option>)}</select></label>)}</div>
            {!validAssignment && <p role="alert" className="tm-text-caption">모든 자리에 서로 다른 확정 참가팀을 선택해 주세요.</p>}
          </>}
        </div>}
        {step === 3 && currentPreview && <><BracketPlanReview plan={currentPreview} input={input} teams={teams} />
          {Boolean(currentPreview.warnings?.length) && <div className="space-y-2"><ul className="tm-text-caption text-[var(--orange700)]">{currentPreview.warnings!.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={acknowledgeRematches} onChange={(e) => setAcknowledgeRematches(e.target.checked)} />같은 조 재대결 가능성을 확인했어요.</label>
          </div>}
        </>}
      </fieldset>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] p-4">
        <Button variant="neutral" disabled={busy || !valid || revision === null} onClick={() => save.mutate()}>초안 저장</Button>
        <div className="flex gap-2">{step > 0 && <Button variant="neutral" disabled={busy} onClick={() => setStep(step - 1)}>이전</Button>}
          {step < 3 ? <Button variant="primary" loading={preview.isPending} disabled={busy || !validCount || (step >= 1 && !validGroups) || (step === 2 && !valid)} onClick={() => void next()}>다음</Button>
            : <Button variant="primary" loading={apply.isPending} disabled={busy || !currentPreview || !valid || Boolean(currentPreview.warnings?.length && !acknowledgeRematches)} onClick={() => void generate()}>이 설정으로 대진 만들기</Button>}
        </div>
      </div>
    </div>
  </div>, document.body)}{ConfirmModal}</>;
}

function BracketPlanReview({ plan, input, teams }: { plan: FlexibleBracketPreview; input: FlexibleBracketInput; teams: { id: string; teamName?: string | null }[] }) {
  const entrySlots = input.kind === 'knockout' ? [...plan.slots].sort((a, b) => a.position - b.position) : plan.slots.filter((slot) => slot.kind === 'ENTRY');
  const slotLabel = (key: string) => {
    const slot = plan.slots.find((row) => row.key === key)!;
    const registration = input.registrationIds?.[entrySlots.indexOf(slot)];
    const team = teams.find((row) => row.id === registration)?.teamName;
    const group = plan.groups.find((row) => row.key === (slot.sourceGroupKey ?? slot.groupKey));
    return `${team ?? (slot.sourceGroupKey ? `${group?.name} ${slot.position}위` : `${group?.phase === 'group' ? group.name + ' ' : ''}${slot.position}번 자리`)}${slot.byeSortOrder != null ? ' · 부전승' : ''}`;
  };
  return <div className="space-y-4">
    <p className="tm-text-body font-bold">총 {plan.counts.fixtures}경기 · 참가 {input.participantCount}팀 · 부전승 {plan.byeSlots.length}팀</p>
    <p className="tm-text-caption text-[var(--text-muted)]">일정과 장소는 생성 후 경기별로 설정해요. 조별 순위 출처는 결과가 확정된 뒤 실제 팀으로 배정해요.</p>
    {plan.groups.map((group) => <details key={group.key} open className="rounded-xl border border-[var(--border)] p-3">
      <summary className="min-h-11 cursor-pointer tm-text-label font-semibold">{group.name}{group.advanceCount ? ` · 상위 ${group.advanceCount}팀 진출` : ''}</summary>
      <ul className="space-y-2">{plan.fixtures.filter((fixture) => fixture.groupKey === group.key).map((fixture) => <li key={fixture.key} className="tm-text-caption">
        #{fixture.fixtureNumber} · {(['HOME', 'AWAY'] as const).map((side) => {
          const slot = side === 'HOME' ? fixture.homeSlotKey : fixture.awaySlotKey;
          if (slot) return slotLabel(slot);
          const edge = plan.edges.find((row) => row.targetFixtureKey === fixture.key && row.targetSide === side);
          return `#${plan.fixtures.find((row) => row.key === edge?.sourceFixtureKey)?.fixtureNumber} ${edge?.outcome === 'LOSER' ? '패자' : '승자'}`;
        }).join(' vs ')}
      </li>)}</ul>
    </details>)}
  </div>;
}
