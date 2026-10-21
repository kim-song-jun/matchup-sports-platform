'use client';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useFinalistPreview, useApplyFinalists } from '@/hooks/use-finalist-assignment';
import { extractErrorMessage } from '@/lib/error-message';
import { finalistTargetKey, initialFinalistOrder, recommendFinalists } from '@/lib/finalist-assignment';
import type { FinalistPreview } from '@/types/finalist-assignment';
import { CrossGroupRound12Dialog } from './cross-group-round12-dialog';

type Props = { tournamentId: string; onClose: () => void; showToast: (message: string, variant?: 'success' | 'error') => void };
export function FinalistAssignmentDialog(props: Props & { supportsRound12: boolean }) {
  const [mode, setMode] = useState<'general' | 'round12' | null>(props.supportsRound12 ? null : 'general');
  if (mode === 'round12') return <CrossGroupRound12Dialog {...props} />;
  if (mode === 'general') return <GeneralFinalistDialog {...props} />;
  return <FinalistFrame onClose={props.onClose} pending={false}>
    <p className="tm-text-body">결선 배정 방식을 선택해 주세요.</p>
    <Button variant="primary" size="md" onClick={() => setMode('round12')}>12강 진출팀 자동 배정</Button>
    <p className="tm-text-caption text-[var(--text-muted)]">기존 규칙 그대로 조 1·2위와 3위 상위 2팀을 뽑고, 상위 조 1위 4팀을 8강에 직행시켜요.</p>
    <Button variant="outline" size="md" onClick={() => setMode('general')}>일반 결선 · 자동·수동 배정</Button>
  </FinalistFrame>;
}
function FinalistFrame({ onClose, pending, children, footer }: { onClose: () => void; pending: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  const titleId = useId();
  const { dialogRef, mounted, closing, onBackdropClick } = useModalA11y({ open: true, onClose, pending });
  if (!mounted) return null;
  return createPortal(<div style={{ zIndex: 'var(--z-modal)' }} onClick={onBackdropClick}
    className={`fixed inset-0 flex items-center justify-center bg-[var(--scrim-dark-32)] p-0 md:p-4 tm-modal-scrim${closing ? ' is-closing' : ''}`}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--card-surface)] text-[var(--text-strong)] md:h-auto md:max-h-[90dvh] md:max-w-4xl md:rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="tm-text-body-lg font-bold">결선 진출팀 배정</h2>
        <Button variant="neutral" size="md" aria-label="닫기" disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
      {footer ? <div className="shrink-0 border-t border-[var(--border)] p-5">{footer}</div> : null}
    </div>
  </div>, document.body);
}
function GeneralFinalistDialog(props: Props) {
  const preview = useFinalistPreview(props.tournamentId);
  const [refreshKey, setRefreshKey] = useState(0);
  return preview.isPending ? <FinalistFrame onClose={props.onClose} pending={false}><p role="status">조별 순위와 결선 자리를 불러오고 있어요…</p></FinalistFrame>
    : preview.isError ? <FinalistFrame onClose={props.onClose} pending={false}><ErrorState message={extractErrorMessage(preview.error, '결선 배정 정보를 불러오지 못했어요.')} onRetry={() => void preview.refetch()} /></FinalistFrame>
    : <FinalistEditor key={`${preview.data.version}:${refreshKey}`} {...props} preview={preview.data} onRefresh={() => { void preview.refetch().then((result) => { if (result.isSuccess) setRefreshKey((value) => value + 1); }); }} />;
}
function FinalistEditor({ tournamentId, preview, onClose, showToast, onRefresh }: Props & { preview: FinalistPreview; onRefresh: () => void }) {
  const [orders, setOrders] = useState(() => Object.fromEntries(preview.groups.map((group) => [group.id, initialFinalistOrder(group)])));
  const [counts, setCounts] = useState(() => Object.fromEntries(preview.groups.map((group) => [group.id, Math.min(group.advanceCount, group.teams.length)])));
  const [assignments, setAssignments] = useState(() => Object.fromEntries(preview.targets.map((target) => [finalistTargetKey(target), target.currentRegistrationId ?? ''])));
  const [reason, setReason] = useState('조별 공식 성적 확인 후 결선 진출팀 배정');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [dirty, setDirty] = useState(false);
  const apply = useApplyFinalists(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const teams = preview.groups.flatMap((group) => group.teams.map((team) => ({ ...team, groupId: group.id, groupName: group.name })));
  const byId = new Map(teams.map((team) => [team.registrationId, team]));
  const name = (id: string | null) => id ? byId.get(id)?.teamName ?? '기존 배정팀' : '팀 미정';
  const values = preview.targets.map((target) => assignments[finalistTargetKey(target)]);
  const duplicate = new Set(values.filter(Boolean)).size !== values.filter(Boolean).length;
  const changedCount = preview.targets.filter((target) => (assignments[finalistTargetKey(target)] || null) !== target.currentRegistrationId).length;
  const hasTies = preview.groups.some((group) => group.ranks.some((rank) => rank.state === 'tied'));
  const allAssigned = values.every((id) => byId.has(id));
  const blocked = preview.blockedReason ?? (duplicate ? '같은 팀을 두 자리에 배정할 수 없어요.' : !allAssigned ? '모든 결선 자리에 팀을 선택해 주세요.'
    : (hasTies || edited) && !confirmed ? '동률 또는 운영자가 조정한 배정안을 확인해 주세요.' : changedCount === 0 ? '변경된 배정이 없어요.' : !reason.trim() ? '배정 사유를 입력해 주세요.' : null);
  const sameGroupFixtures = [...new Set(preview.targets.map((target) => target.fixtureId))].flatMap((fixtureId) => {
    const home = preview.targets.find((target) => target.fixtureId === fixtureId && target.side === 'HOME');
    const away = preview.targets.find((target) => target.fixtureId === fixtureId && target.side === 'AWAY');
    const h = home ? byId.get(assignments[finalistTargetKey(home)]) : undefined;
    const a = away ? byId.get(assignments[finalistTargetKey(away)]) : undefined;
    return h && a && h.groupId === a.groupId ? [`${h.teamName} vs ${a.teamName}`] : [];
  });
  function recommend(mode: 'cross' | 'seed') {
    try {
      const result = recommendFinalists(preview, orders, counts, mode);
      setAssignments(Object.fromEntries(preview.targets.map((target, i) => [finalistTargetKey(target), result[i]])));
      setError(null); setConfirmed(false); setDirty(true);
    } catch (err) { setError((err as Error).message); }
  }
  async function refresh() {
    if (dirty && !await confirm({ title: '순위 다시 불러오기', message: '저장하지 않은 배정 초안을 지우고 최신 순위와 대진을 불러올까요?', confirmLabel: '다시 불러오기' })) return;
    onRefresh();
  }
  async function submit() {
    if (blocked !== null || apply.isPending) return;
    if (!await confirm({ title: '결선 배정 저장', message: `${changedCount}자리의 팀을 바꿔요. 기존 경기 시간·장소·승자 연결과 공식 조별 순위는 유지돼요.`, confirmLabel: '배정 저장' })) return;
    try {
      await apply.mutateAsync({ version: preview.version, reason: reason.trim(), assignments: preview.targets.map((target) => ({ fixtureId: target.fixtureId, side: target.side, registrationId: assignments[finalistTargetKey(target)] })) });
      showToast(`결선 ${changedCount}자리의 팀을 배정했어요.`, 'success'); onClose();
    } catch (err) { setError(extractErrorMessage(err, '결선 배정을 저장하지 못했어요.')); }
  }
  return <FinalistFrame onClose={onClose} pending={apply.isPending} footer={<div className="flex flex-col gap-2">
    {blocked ? <p role="status" className="tm-text-caption text-[var(--text-muted)]">{blocked}</p> : null}
    {error ? <p role="alert" className="tm-text-label text-[var(--red700)]">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button variant="neutral" size="md" disabled={apply.isPending} onClick={onClose}>취소</Button>
      <Button variant="outline" size="md" disabled={apply.isPending} onClick={() => void refresh()}>순위 다시 불러오기</Button>
      <Button variant="primary" size="md" className="flex-1" disabled={blocked !== null} loading={apply.isPending} onClick={() => void submit()}>배정 저장 · {changedCount}자리</Button></div>
  </div>}>
    <p className="tm-text-caption text-[var(--text-muted)]">공식 조별 순위를 확인하고 결선 배정안을 조정해요. 순서를 바꾸거나 다른 팀을 선택해도 공식 성적표는 바뀌지 않아요. 저장 뒤 결과가 정정되어도 결선 배정을 자동으로 덮어쓰지 않아요.</p>
    {preview.standingsChanged ? <p role="status" className="tm-text-label text-[var(--orange700)]">마지막 배정 이후 조별 순위나 결과가 바뀌었어요. 현재 결선 배정과 최신 순위를 비교해 다시 확인해 주세요.</p> : null}
    <section className="flex flex-col gap-3"><SectionTitle title="조별 순위 · 진출팀 선정" />
      <div className="grid gap-4 md:grid-cols-2">{preview.groups.map((group) => <div key={group.id} className="flex flex-col gap-3 rounded-xl bg-[var(--surface-soft)] p-4">
        <p className="tm-text-label font-semibold">{group.name} · {group.complete ? '공식 결과 반영 완료' : '경기 진행 중 · 순위 확인 필요'}</p>
        <label className="tm-text-label flex items-center gap-2">진출 팀 수
          <select aria-label={`${group.name} 진출 팀 수`} className="tm-input min-h-[44px]" value={counts[group.id]} disabled={!group.complete || apply.isPending}
            onChange={(event) => { setCounts({ ...counts, [group.id]: Number(event.target.value) }); setEdited(true); setConfirmed(false); setDirty(true); }}>
            {Array.from({ length: group.teams.length + 1 }, (_, i) => <option key={i} value={i}>{i}팀</option>)}
          </select></label>
        <ol className="flex flex-col gap-2">{orders[group.id].map((id, index) => {
          const team = byId.get(id)!;
          return <li key={id} className="tm-text-label flex flex-wrap items-center justify-between gap-2">
            <span>{index + 1}. {team.teamName}{index < counts[group.id] ? ' · 진출 후보' : ''}<br /><span className="tm-text-caption text-[var(--text-muted)]">공식 {team.position ?? '미정'}위 · 승점 {team.points} · 골득실 {team.goalsFor - team.goalsAgainst} · 득점 {team.goalsFor}{group.ranks.some((rank) => rank.state === 'tied' && rank.tiedRegistrationIds.includes(id)) ? ' · 동률 확인' : ''}</span></span>
            <span className="flex gap-1">{[-1, 1].map((offset) => <Button key={offset} variant="neutral" size="md" aria-label={`${group.name} ${team.teamName} ${offset < 0 ? '올리기' : '내리기'}`}
              disabled={!group.complete || apply.isPending || index + offset < 0 || index + offset >= orders[group.id].length}
              onClick={() => { const next = [...orders[group.id]]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; setOrders({ ...orders, [group.id]: next }); setEdited(true); setConfirmed(false); setDirty(true); }}>{offset < 0 ? '위로' : '아래로'}</Button>)}</span>
          </li>;
        })}</ol>
      </div>)}</div>
    </section>
    <section className="flex flex-col gap-3"><SectionTitle title="기존 결선에 배정" />
      <p className="tm-text-caption text-[var(--text-muted)]">자동 배정 후보 {Object.values(counts).reduce((sum, count) => sum + count, 0)}팀 · 배정할 자리 {preview.targets.length}개. 자동 배정 뒤에도 각 자리를 직접 바꿀 수 있어요. 수동 배정에서는 후보 외 조별 참가팀도 선택할 수 있어요. 시드는 조별 배정 순위 → 조 표시 순서이며, 조 간 성적 비교는 하지 않아요. 직행 자리는 배정 미리보기에서 직접 확인해 주세요.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="md" disabled={preview.blockedReason !== null || apply.isPending} onClick={() => recommend('cross')}>조별 교차 자동 배정</Button>
        <Button variant="outline" size="md" disabled={preview.blockedReason !== null || apply.isPending} onClick={() => recommend('seed')}>시드순 자동 배정</Button></div>
      <div className="grid gap-3 md:grid-cols-2">{preview.targets.map((target) => <label key={finalistTargetKey(target)} className="tm-text-label flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4">
        {target.label}<select aria-label={target.label} className="tm-input min-h-[44px]" value={assignments[finalistTargetKey(target)]} disabled={preview.blockedReason !== null || apply.isPending}
          onChange={(event) => { const key = finalistTargetKey(target); const value = event.target.value; const other = Object.keys(assignments).find((otherKey) => otherKey !== key && assignments[otherKey] === value && value !== '');
            setAssignments({ ...assignments, ...(other ? { [other]: assignments[key] } : {}), [key]: value }); setEdited(true); setConfirmed(false); setDirty(true); }}>
          <option value="">팀 선택</option>{teams.map((team) => <option key={team.registrationId} value={team.registrationId}>{team.groupName} · {team.teamName} · 공식 {team.position ?? '미정'}위</option>)}
        </select><span className="tm-text-caption text-[var(--text-muted)]">현재 {name(target.currentRegistrationId)} → {name(assignments[finalistTargetKey(target)] || null)}</span>
      </label>)}</div>
      {sameGroupFixtures.map((text) => <p key={text} className="tm-text-caption text-[var(--orange700)]">같은 조 재대결: {text}</p>)}
      {(hasTies || edited) ? <label className="tm-text-label flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={confirmed} disabled={apply.isPending} onChange={(event) => setConfirmed(event.target.checked)} />동률·운영자 조정 및 최종 진출팀 배치를 확인했어요.</label> : null}
      <label className="tm-text-label flex flex-col gap-2">배정 사유<input className="tm-input min-h-[44px]" maxLength={500} value={reason} disabled={apply.isPending} onChange={(event) => { setReason(event.target.value); setDirty(true); }} /></label>
    </section>
    {ConfirmModal}
  </FinalistFrame>;
}
