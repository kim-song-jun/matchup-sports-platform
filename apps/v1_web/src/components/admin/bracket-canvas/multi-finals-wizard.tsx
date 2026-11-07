'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner, SectionTitle } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useMultiFinals, type MultiFinalDefinition, type MultiFinalGroup, type MultiFinalView } from '@/hooks/use-multi-finals';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { randomIndex } from '@/lib/random-index';
import { byeSeedCount, orderRulesByRank } from '@/lib/multi-final-seed-order';
import { MultiFinalAssignmentDialog } from './multi-final-assignment-dialog';

type DraftGroup = MultiFinalGroup & { registrationIds?: string[] };
const control = 'h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 tm-text-label';

type WizardProps = { tournamentId: string; open: boolean; onClose: () => void; onApplied: () => void; mode?: 'create' | 'rules' | 'assign' };
export function MultiFinalsWizard(props: WizardProps) {
  return props.mode === 'assign' ? <MultiFinalAssignmentDialog {...props} /> : <MultiFinalsSetupWizard {...props} />;
}
function MultiFinalsSetupWizard({ tournamentId, open, onClose, onApplied, mode = 'create' }: WizardProps) {
  const rulesOnly = mode === 'rules';
  const steps = rulesOnly ? [{ value: 1, label: '토너먼트 배정 규칙' }]
    : [{ value: 0, label: '예선 편성' }, { value: 1, label: '토너먼트 자리 수' }, { value: 3, label: '미리보기' }];
  const api = useMultiFinals(tournamentId, open); const titleId = useId();
  const [step, setStep] = useState(0); const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [finals, setFinals] = useState<MultiFinalDefinition[]>([]); const [server, setServer] = useState<MultiFinalView | null>(null);
  const [error, setError] = useState(''); const [dirty, setDirty] = useState(false); const initialized = useRef(false); const requestId = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Steps share a scroll container. Keeping the previous offset hides the next heading or validation error.
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step, error]);
  const busy = api.setup.isPending || api.select.isPending || api.updatePreliminary.isPending || api.reset.isPending || api.preview.isPending || api.generate.isPending;
  const { confirm, ConfirmModal } = useConfirm();
  async function close() { if (busy) return; if (dirty && !await confirm({ title: '설정 닫기', message: '저장하지 않은 변경을 닫을까요?', confirmLabel: '닫기' })) return; onClose(); }
  const { dialogRef, mounted, onBackdropClick } = useModalA11y({ open, onClose: () => void close(), pending: busy });
  function hydrate(view: MultiFinalView) {
    setServer(view); setGroups(view.groups); setFinals(view.finals.map(f => ({ id: f.id, name: f.name, capacity: f.capacity ?? f.registrationIds?.length ?? f.rules.length, thirdPlace: f.thirdPlace, rules: f.rules, registrationIds: f.registrationIds, assignmentPolicy: f.assignmentPolicy })));
  }
  useEffect(() => {
    if (!open) { initialized.current = false; setServer(null); return; }
    if (!api.view.data || api.view.isFetching || api.view.isError || initialized.current) return;
    initialized.current = true; const view = api.view.data; hydrate(view); setDirty(false); setError(''); setNotice(''); api.preview.reset(); requestId.current = null;
    if (!view.groups.length && !rulesOnly) {
      setGroups([{ id: '0', name: 'A조', capacity: 4, legs: 1 }, { id: '1', name: 'B조', capacity: 4, legs: 1 }]);
      setFinals([{ name: '상위 토너먼트', capacity: 2, rules: [], thirdPlace: false, registrationIds: null }]); setStep(0);
    } else setStep(rulesOnly ? 1 : 0);
  }, [open, rulesOnly, api.view.data, api.view.isFetching, api.view.isError]);
  if (!mounted || typeof document === 'undefined') return null;
  const configured = Boolean(server?.groups.length);
  const remainingFixtures = server?.fixtureCount ?? server?.preliminaryFixtureCount;
  const editable = !configured || remainingFixtures === 0 && !server?.generated;
  const registrations = server?.registrations ?? [];
  const capacityOf = (f: MultiFinalDefinition) => f.capacity ?? f.registrationIds?.length ?? f.rules.length;
  const groupOrder = groups.map(g => g.id);
  const seedOrders = finals.map(f => orderRulesByRank(f.rules, groupOrder));
  // Rules stored before rank-first ordering keep their old seed order until they are saved again.
  const needsReorder = finals.some((f, i) => f.rules.some((rule, j) => rule.groupId !== seedOrders[i][j].groupId || rule.rank !== seedOrders[i][j].rank));
  async function resetBracket() {
    if (!server || busy || !await confirm({ title: '대진 초기화', message: '예선과 결선의 모든 대진·일정·대진 자리와 진출팀 선택을 삭제해요. 참가 신청, 예선 조 설정과 팀 선택, 토너먼트 규칙은 유지해요. 시작했거나 기록·결과가 있는 경기가 있으면 초기화할 수 없어요. 초기화할까요?', confirmLabel: '대진 초기화', tone: 'danger' })) return;
    try {
      const result = await api.reset.mutateAsync({ expectedRevision: server.revision });
      hydrate(result); setDirty(false); setError(''); setNotice('대진을 초기화했어요. 예선 편성과 팀 선택을 수정한 뒤 별도로 저장해 주세요.'); api.preview.reset(); requestId.current = null; setStep(0);
    } catch (e) { setError(extractErrorMessage(e, '대진을 초기화하지 못했어요.')); }
  }
  function autoAssign() {
    const ids = registrations.map(reg => reg.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    let offset = 0;
    setGroups(rows => rows.map(group => { const registrationIds = ids.slice(offset, offset + group.capacity); offset += group.capacity; return { ...group, registrationIds }; }));
    setDirty(true); setError(''); setNotice('확정 참가팀을 무작위로 배정했어요. 정원을 넘는 팀은 미배정으로 남고, 팀이 부족한 자리는 미정으로 남아요. 저장 전에 확인해 주세요.'); api.preview.reset();
  }
  function changeFinal(index: number, patch: Partial<MultiFinalDefinition>) { setFinals(rows => rows.map((f, i) => i === index ? { ...f, ...patch } : f)); setDirty(true); api.preview.reset(); }
  async function preview() { await api.preview.mutateAsync(); requestId.current = randomUuid(); setStep(3); }
  async function next() {
    setError('');
    try {
      if (step === 0) {
        if (!groups.length || groups.some(g => !g.name.trim() || !Number.isSafeInteger(g.capacity) || g.capacity < 2)) throw new Error('예선 조 이름과 2팀 이상의 팀 수를 입력해 주세요.');
        if (new Set(groups.map(g => g.name.trim())).size !== groups.length) throw new Error('예선 조 이름은 중복 없이 입력해 주세요.');
        const selected = groups.flatMap(g => g.registrationIds?.filter(Boolean) ?? []);
        if (editable && (new Set(selected).size !== selected.length || selected.some(id => !registrations.some(reg => reg.id === id)))) throw new Error('확정 참가팀을 중복 없이 선택해 주세요.');
        setStep(1); return;
      }
      if (step === 1) {
        if (!rulesOnly && configured && !dirty && !editable) { await preview(); return; }
        if (finals.some(f => !Number.isSafeInteger(f.capacity ?? f.registrationIds?.length ?? f.rules.length) || (f.capacity ?? f.registrationIds?.length ?? f.rules.length) < 2)) throw new Error('토너먼트 자리 수를 2 이상으로 입력해 주세요.');
        if (rulesOnly && finals.some(f => f.rules.length !== (f.capacity ?? f.registrationIds?.length ?? f.rules.length))) throw new Error('각 토너먼트 자리 수에 맞게 순위별 목적지를 설정해 주세요.');
        if (!finals.length || finals.some(f => !f.name.trim()) || new Set(finals.map(f => f.name.trim())).size !== finals.length) throw new Error('토너먼트 이름을 중복 없이 입력해 주세요.');
        if (server?.generated && !await confirm({ title: rulesOnly ? '진출 규칙 변경' : '결선 설정 변경', message: rulesOnly ? '순위별 목적지만 저장해요. 이미 확정한 팀과 대진·일정은 유지해요. 새 추천은 진출팀 배정에서 다시 확정해 주세요.' : '저장하면 아직 시작하지 않은 기존 결선 대진을 비우고 새 명단으로 다시 만들어요. 예선 경기와 결과는 유지돼요.', confirmLabel: rulesOnly ? '규칙 저장' : '설정 저장' })) return;
        const setupInput = { expectedRevision: server!.revision, groups: groups.map(({ id: _id, ...g }) => ({ ...g, registrationIds: g.registrationIds?.filter(Boolean) })), finals: finals.map(f => ({ ...f, registrationIds: null, rules: f.rules.map(rule => ({ ...rule, groupId: String(groups.findIndex(g => g.id === rule.groupId)) })) })) };
        const result = configured && !editable
          ? await api.select.mutateAsync({ expectedRevision: server!.revision, finals })
          : configured ? await api.updatePreliminary.mutateAsync(setupInput) : await api.setup.mutateAsync(setupInput);
        hydrate(result); setDirty(false);
        if (rulesOnly) { onApplied(); onClose(); return; }
        await preview(); return;
      }
      if (!api.preview.data) throw new Error('미리보기를 다시 확인해 주세요.');
      await api.generate.mutateAsync({ expectedRevision: api.preview.data.revision, previewHash: api.preview.data.previewHash, requestId: requestId.current ?? (requestId.current = randomUuid()) });
      setDirty(false); onApplied(); onClose();
    } catch (e) { setError(extractErrorMessage(e, '설정을 저장하지 못했어요.')); }
  }
  return createPortal(<div className="fixed inset-0 flex items-center justify-center p-4 tm-modal-scrim" style={{ zIndex: 'var(--z-modal)' }} onClick={onBackdropClick}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="tm-modal-panel flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-2xl bg-[var(--card-surface)]">
      <div className="shrink-0 border-b border-[var(--border)] p-4">
        <h2 id={titleId} className="tm-text-heading font-bold">{rulesOnly ? '토너먼트 배정 규칙' : '예선·토너먼트 대진 생성'}</h2>
        <ol aria-label="설정 단계" className="mt-3 flex flex-wrap gap-3 tm-text-caption">{steps.map(({ value, label }, i) => <li key={label} aria-current={step === value ? 'step' : undefined} className={step === value ? 'font-bold text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}>{i + 1}. {label}</li>)}</ol>
      </div>
      <div ref={contentRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!server ? api.view.isError ? <div role="alert"><p>설정을 불러오지 못했어요.</p><Button variant="neutral" onClick={() => void api.view.refetch()}>다시 시도</Button></div> : <p role="status">설정을 불러오고 있어요.</p> : <fieldset disabled={busy} className="min-w-0 space-y-4">
          {rulesOnly && !configured && <AlertBanner tone="warning" message="예선·토너먼트 대진 생성에서 예선을 먼저 편성해 주세요." />}
          {error ? <AlertBanner tone="error" message={error} /> : null}
          {notice && <p role="status" className="tm-text-label">{notice}</p>}
          {finals.some(final => final.registrationIds?.some(id => !registrations.some(reg => reg.id === id))) ? <div className="space-y-2">
            <AlertBanner tone="warning" message="선택한 팀 중 확정 참가 명단에서 빠진 팀이 있어요. 해당 팀을 제외한 뒤 새 진출팀을 선택해 주세요." />
            <Button variant="neutral" onClick={() => { setFinals(rows => rows.map(final => ({ ...final, registrationIds: final.registrationIds == null ? final.registrationIds : final.registrationIds.filter(id => registrations.some(reg => reg.id === id)) }))); setDirty(true); }}>확정 명단에 없는 팀 제외</Button>
          </div> : null}
          {step === 0 ? <>
            <SectionTitle title="예선 조 편성" /><p className="tm-text-label text-[var(--text-muted)]">예선은 조별리그로 진행해요. 확정 참가팀을 직접 선택하거나 자동 배정할 수 있고, 빈 자리는 생성 후에도 채울 수 있어요.</p>
            {configured && <Button variant="outline" disabled={busy || remainingFixtures === 0 && !server.generated} onClick={() => void resetBracket()}>대진 초기화</Button>}
            {!editable ? <><p className="tm-text-label">기존 대진이 있어 예선 편성을 수정할 수 없어요. 수정하려면 별도의 대진 초기화를 먼저 실행해 주세요.</p>{groups.map(g => <p key={g.id} className="tm-text-label">{g.name} · {g.capacity}팀 · {g.legs}회전</p>)}</> : <>
            {configured && <p role="status" className="tm-text-label">대진이 없어 저장된 예선 편성을 수정할 수 있어요. 저장하면 예선 대진을 다시 만들어요.</p>}
            <p className="tm-text-caption">확정 참가 {registrations.length}팀 · 예선 정원 {groups.reduce((sum, g) => sum + (Number.isSafeInteger(g.capacity) ? g.capacity : 0), 0)}팀 · 선택 {groups.reduce((sum, g) => sum + (g.registrationIds?.filter(Boolean).length ?? 0), 0)}팀 · 미배정 {registrations.filter(reg => !groups.some(g => g.registrationIds?.includes(reg.id))).length}팀</p>
            <Button variant="neutral" disabled={busy || !registrations.length || groups.some(g => !Number.isSafeInteger(g.capacity) || g.capacity < 2)} onClick={() => {
              if (groups.some(g => g.registrationIds?.some(Boolean))) { void confirm({ title: '예선 팀 자동 배정', message: '현재 팀 선택을 지우고 확정 참가팀을 무작위로 다시 배정할까요?', confirmLabel: '자동 배정' }).then(ok => { if (ok) autoAssign(); }); }
              else autoAssign();
            }}>참가팀 자동 배정</Button>
            {!registrations.length && <p className="tm-text-caption">확정된 참가팀이 없어요. 참가 신청을 확정하거나 빈 대진을 먼저 만들어 주세요.</p>}
            {groups.map((g, index) => <fieldset key={g.id} className="space-y-3 border-b border-[var(--border)] pb-4"><legend className="tm-text-body font-semibold">{g.name || `${index + 1}번째 조`}</legend>
              <div className="grid gap-3 sm:grid-cols-3"><label className="tm-text-label">조 이름<input aria-label={`${index + 1}번째 조 이름`} className={control} maxLength={80} value={g.name} onChange={e => { setGroups(rows => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row)); setDirty(true); }} /></label>
              <label className="tm-text-label">팀 수<input aria-label={`${index + 1}번째 조 팀 수`} className={control} type="number" min={2} value={g.capacity} onChange={e => { setGroups(rows => rows.map((row, i) => i === index ? { ...row, capacity: Number(e.target.value), registrationIds: undefined } : row)); setFinals(rows => rows.map(f => ({ ...f, rules: f.rules.filter(rule => rule.groupId !== g.id || rule.rank <= Number(e.target.value)) }))); setDirty(true); }} /></label>
              <label className="tm-text-label">회전 수<select className={control} value={g.legs} onChange={e => { setGroups(rows => rows.map((row, i) => i === index ? { ...row, legs: Number(e.target.value) as 1 | 2 } : row)); setDirty(true); }}><option value={1}>1회전</option><option value={2}>2회전</option></select></label></div>
              <p className="tm-text-caption">예상 {Number.isSafeInteger(g.capacity) && g.capacity >= 2 ? g.capacity * (g.capacity - 1) / 2 * g.legs : 0}경기</p>
              <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: Number.isSafeInteger(g.capacity) && g.capacity >= 2 ? g.capacity : 0 }, (_, position) => <label key={position} className="tm-text-label">{g.name} {position + 1}번 팀
                <select aria-label={`${g.name} ${position + 1}번 팀`} className={control} value={g.registrationIds?.[position] ?? ''} onChange={e => {
                  const value = e.target.value;
                  setGroups(rows => rows.map((row, i) => i !== index ? row : { ...row, registrationIds: Array.from({ length: row.capacity }, (_, j) => j === position ? value : row.registrationIds?.[j] ?? '') })); setDirty(true);
                }}><option value="">팀 미정</option>{g.registrationIds?.[position] && !registrations.some(reg => reg.id === g.registrationIds![position]) && <option value={g.registrationIds[position]}>확정 명단에서 제외된 팀 · 다시 선택해 주세요</option>}
                  {registrations.map(reg => <option key={reg.id} value={reg.id} disabled={groups.some((row, i) => row.registrationIds?.some((id, j) => id === reg.id && (i !== index || j !== position)))}>{reg.team.name}</option>)}
                </select></label>)}</div>
              <Button variant="neutral" onClick={() => { setGroups(rows => rows.filter((_, i) => i !== index)); setFinals(rows => rows.map(f => ({ ...f, rules: f.rules.filter(rule => rule.groupId !== g.id) }))); setDirty(true); }}>조 삭제</Button>
            </fieldset>)}
            <Button variant="neutral" onClick={() => { setGroups(rows => [...rows, { id: randomUuid(), name: `${rows.length + 1}조`, capacity: 4, legs: 1 }]); setDirty(true); }}>예선 조 추가</Button>
            </>}
          </> : null}
          {step === 1 ? <>
            <SectionTitle title={rulesOnly ? "토너먼트별 진출 규칙" : "토너먼트 이름과 자리 수"} /><p className="tm-text-label text-[var(--text-muted)]">{rulesOnly ? "각 조의 몇 위를 어느 토너먼트로 보낼지 선택해요. 이미 확정한 팀은 유지하며, 새 추천을 적용하려면 토너먼트별 진출팀 배정에서 다시 확정해 주세요." : "이름과 자리 수로 빈 대진을 먼저 만들어요. 순위별 목적지는 별도의 토너먼트 배정 규칙에서 설정해요."}</p>
            {!rulesOnly ? <>
            {finals.map((f, index) => <div key={index} className="grid items-end gap-3 border-b border-[var(--border)] pb-3 sm:grid-cols-[1fr_auto_auto_auto]"><label className="tm-text-label">토너먼트 {index + 1} 이름<input aria-label={`토너먼트 ${index + 1} 이름`} className={control} value={f.name} maxLength={80} onChange={e => changeFinal(index, { name: e.target.value })} /></label><label className="tm-text-label">자리 수<input aria-label={`토너먼트 ${index + 1} 자리 수`} className={control} type="number" min={2} value={f.capacity ?? f.registrationIds?.length ?? f.rules.length} disabled={rulesOnly} onChange={e => changeFinal(index, { capacity: Number(e.target.value), registrationIds: null })} /></label><label className="flex min-h-11 items-center gap-2 tm-text-label"><input type="checkbox" checked={f.thirdPlace} onChange={e => changeFinal(index, { thirdPlace: e.target.checked })} />3·4위전</label><Button variant="neutral" onClick={() => { setFinals(rows => rows.filter((_, i) => i !== index)); setDirty(true); }}>토너먼트 삭제</Button></div>)}
            <Button variant="neutral" onClick={() => { setFinals(rows => [...rows, { name: `토너먼트 ${rows.length + 1}`, capacity: 2, rules: [], thirdPlace: false, registrationIds: null }]); setDirty(true); }}>토너먼트 추가</Button>
            </> : <div className="space-y-2">
              {finals.map(f => <p key={f.name} className="tm-text-label">{f.name} · {f.capacity ?? f.rules.length}자리 · {f.rules.length}개 순위 연결</p>)}
              {finals.length > 0 ? <p className="tm-text-caption text-[var(--text-caption)]">저장하면 순위가 높은 팀부터 시드를 받아요. 같은 순위끼리는 조 순서대로예요(임시 기본값). 진출팀 배정 화면에서 바꿀 수 있어요.</p> : null}
            </div>}
            {rulesOnly && groups.map(g => <fieldset key={g.id} className="space-y-2"><legend className="tm-text-body font-semibold">{g.name} · {finals.reduce((sum, f) => sum + f.rules.filter(rule => rule.groupId === g.id).length, 0)}팀 기본 진출</legend>
              {Array.from({ length: Number.isSafeInteger(g.capacity) && g.capacity > 0 ? g.capacity : 0 }, (_, rankIndex) => {
                const rank = rankIndex + 1; const target = finals.findIndex(f => f.rules.some(rule => rule.groupId === g.id && rule.rank === rank));
                const seed = target < 0 ? 0 : seedOrders[target].findIndex(rule => rule.groupId === g.id && rule.rank === rank) + 1;
                return <label key={rank} className="grid grid-cols-[auto_1fr_96px] items-center gap-3 tm-text-label"><span>{rank}위</span><select aria-label={`${g.name} ${rank}위 진출 토너먼트`} className={control} value={target} onChange={e => { const destination = Number(e.target.value); setFinals(rows => rows.map((f, i) => ({ ...f, rules: [...f.rules.filter(rule => !(rule.groupId === g.id && rule.rank === rank)), ...(i === destination ? [{ groupId: g.id, rank }] : [])] }))); setDirty(true); }}><option value={-1}>기본 진출 없음</option>{finals.map((f, i) => <option key={i} value={i}>{f.name || `토너먼트 ${i + 1}`}</option>)}</select>
                  <span className="flex min-h-11 items-center gap-1 whitespace-nowrap">{seed > 0 ? <><b className="inline-flex h-6 items-center rounded-full bg-[var(--blue50)] px-2 tm-text-caption font-bold text-[var(--blue700)]">시드 {seed}</b>{seed <= byeSeedCount(capacityOf(finals[target])) ? <span className="tm-text-caption font-semibold text-[var(--text-muted)]">부전승</span> : null}</> : null}</span></label>;
              })}
            </fieldset>)}
            {!configured ? <p className="tm-text-caption">다음 단계로 이동하면 예선 대진과 기본 규칙을 저장해요. 대진 생성 후 토너먼트 배정 규칙에서 순위별 목적지를 설정해 주세요.</p> : null}
          </> : null}
          {step === 3 && api.preview.data ? <>
            <SectionTitle title="결선 대진 미리보기" />
            <p className="tm-text-body">토너먼트 {api.preview.data.counts.tournaments}개 · 총 {api.preview.data.counts.fixtures}경기 · 부전승 {api.preview.data.counts.byes}자리</p>
            {api.preview.data.finals.map(f => <section key={f.name} className="space-y-2 border-b border-[var(--border)] pb-3">
              <h3 className="tm-text-body font-semibold">{f.name} · {f.capacity ?? f.registrationIds?.length ?? f.rules.length}자리{f.registrationIds == null ? ' · 진출팀 미정' : ''}</h3>
              <ol className="space-y-1 tm-text-label">{f.registrationIds != null ? f.registrationIds.map((id, i) => <li key={id}>{i + 1}번 시드 · {registrations.find(reg => reg.id === id)?.team.name ?? '확인할 수 없는 참가팀'}</li>)
                : Array.from({ length: f.capacity ?? f.rules.length }, (_, i) => { const rule = f.rules[i]; return <li key={i}>{i + 1}번 시드 · {rule ? `${groups.find(g => g.id === rule.groupId)?.name ?? '예선 조'} ${rule.rank}위` : '진출 규칙 미설정'} · 미정</li>; })}</ol>
              <p className="tm-text-caption">{f.thirdPlace ? '3·4위전 포함' : '3·4위전 없음'}</p>
            </section>)}
            {api.preview.data.plan?.groups.map(group => <section key={group.key} className="space-y-2"><h3 className="tm-text-body font-semibold">{group.name}</h3>
              {api.preview.data!.plan!.fixtures.filter(fixture => fixture.groupKey === group.key).map(fixture => {
                const sideLabel = (side: 'HOME' | 'AWAY') => {
                  const plan = api.preview.data!.plan!; const slotKey = side === 'HOME' ? fixture.homeSlotKey : fixture.awaySlotKey;
                  const slot = plan.slots.find(row => row.key === slotKey);
                  if (slot) { const final = api.preview.data!.finals.find(row => row.name === group.bracketTrack); const id = final?.registrationIds?.[slot.position - 1]; return registrations.find(row => row.id === id)?.team.name ?? `${slot.position}번 시드`; }
                  const edge = plan.edges.find(row => row.targetFixtureKey === fixture.key && row.targetSide === side); const source = plan.fixtures.find(row => row.key === edge?.sourceFixtureKey);
                  return source ? `${source.fixtureNumber}경기 ${edge?.outcome === 'LOSER' ? '패자' : '승자'}` : '미정';
                };
                return <p key={fixture.key} className="tm-text-label">{fixture.fixtureNumber}경기 · {sideLabel('HOME')} vs {sideLabel('AWAY')}</p>;
              })}
            </section>)}
            <p className="tm-text-label">대진 생성은 진출팀을 확정하지 않아요. 예선 종료 후 토너먼트별 진출팀 배정에서 팀을 채워 주세요.</p>
          </> : null}
        </fieldset>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] p-4">
        <Button variant="neutral" disabled={busy} onClick={() => void close()}>닫기</Button>
        {step > (rulesOnly ? 1 : 0) ? <Button variant="neutral" disabled={busy} onClick={() => setStep(step === 3 ? 1 : 0)}>이전</Button> : null}
        <Button variant="primary" disabled={!server || busy || rulesOnly && (!configured || !dirty && !needsReorder)} onClick={() => void next()}>{busy ? '처리 중…' : rulesOnly ? '배정 규칙 저장' : step === 3 ? '확인하고 결선 생성' : step === 1 ? '대진 미리보기' : '다음'}</Button>
      </div>
    </div>{ConfirmModal}
  </div>, document.body);
}
