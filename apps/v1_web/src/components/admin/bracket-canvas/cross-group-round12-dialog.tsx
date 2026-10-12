'use client';
import { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useApplyCrossGroupRound12, useCrossGroupRound12Preview } from '@/hooks/use-cross-group-round12';
import { extractErrorMessage } from '@/lib/error-message';
import { compareCrossGroupTeams, crossGroupRecommendation, swapRound12Assignment } from '@/lib/cross-group-round12';
import type { CrossGroupPreview } from '@/types/cross-group-round12';

export function CrossGroupRound12Dialog({ tournamentId, onClose, showToast }: {
  tournamentId: string; onClose: () => void; showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const preview = useCrossGroupRound12Preview(tournamentId, true);
  return preview.isPending ? (
    <Round12Frame onClose={onClose} pending={false}><p role="status">공식 순위와 대진을 확인하고 있어요…</p></Round12Frame>
  ) : preview.isError ? (
    <Round12Frame onClose={onClose} pending={false}>
      <ErrorState message={extractErrorMessage(preview.error, '순위를 불러오지 못했어요.')} onRetry={() => void preview.refetch()} />
    </Round12Frame>
  ) : <Round12Editor key={preview.data.version} preview={preview.data} tournamentId={tournamentId}
    onClose={onClose} showToast={showToast} onRefresh={() => void preview.refetch()} />;
}

function Round12Frame({ onClose, pending, children, footer }: { onClose: () => void; pending: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  const titleId = useId();
  const { dialogRef, mounted, closing, onBackdropClick } = useModalA11y({ open: true, onClose, pending });
  if (!mounted) return null;
  return createPortal(<div style={{ zIndex: 'var(--z-modal)' }} className={`fixed inset-0 flex items-center justify-center bg-[var(--scrim-dark-32)] p-0 md:p-4 tm-modal-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--card-surface)] text-[var(--text-strong)] md:h-auto md:max-h-[90dvh] md:max-w-4xl md:rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="tm-text-body-lg font-bold">12강 진출팀 자동 배정</h2>
        <Button variant="neutral" size="md" aria-label="닫기" disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
      {footer ? <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card-surface)] px-5 py-4">{footer}</div> : null}
    </div>
  </div>, document.body);
}

function Round12Editor({ preview, tournamentId, onClose, showToast, onRefresh }: {
  preview: CrossGroupPreview; tournamentId: string; onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void; onRefresh: () => void;
}) {
  const [picks, setPicks] = useState(() => preview.ranks.map((rank) => rank.candidates.length === 1 ? rank.candidates[0] : ''));
  const [order, setOrder] = useState<string[] | null>(null);
  const [edited, setEdited] = useState<string[] | null>(null);
  const [tieConfirmed, setTieConfirmed] = useState(false);
  const [reason, setReason] = useState('조별 공식 성적 기준 진출팀 배정');
  const [error, setError] = useState<string | null>(null);
  const apply = useApplyCrossGroupRound12(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const teams = useMemo(() => new Map(preview.teams.map((team) => [team.registrationId, team])), [preview]);
  const recommended = crossGroupRecommendation(preview, picks);
  const ranked = order ?? recommended;
  const assignments = edited ?? ranked?.slice(0, 12) ?? [];
  const hasTies = preview.ranks.some((rank) => rank.candidates.length > 1) || !!ranked?.some((id, index) =>
    index % 5 !== 0 && compareCrossGroupTeams(teams.get(ranked[index - 1])!, teams.get(id)!) === 0);
  const changedCount = preview.targets.filter((target, index) => assignments[index] && assignments[index] !== target.currentRegistrationId).length;
  const name = (id: string | null) => id === null ? '팀 미정' : teams.get(id)?.teamName ?? '다른 배정팀';
  const id = useId();
  const canSave = assignments.length === 12 && (!hasTies || tieConfirmed) && reason.trim().length > 0 && changedCount > 0 && !apply.isPending;
  const updatePicks = (index: number, selected: string) => {
    setPicks((previous) => previous.map((value, i) => i === index ? selected : value));
    setOrder(null); setEdited(null); setTieConfirmed(false); setError(null);
  };
  const move = (index: number, offset: number) => {
    if (!ranked) return;
    const next = [...ranked];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setOrder(next); setEdited(null); setTieConfirmed(false);
  };
  const submit = async () => {
    if (!canSave || ranked === null) return;
    if (!await confirm({ title: '진출팀 배정 저장', message: `부전승·8강 직행을 포함해 ${changedCount}자리의 팀이 바뀌어요. 경기 시간과 장소는 유지돼요.`, confirmLabel: '배정 저장' })) return;
    try {
      await apply.mutateAsync({ version: preview.version, rankPicks: picks, rankingOrder: ranked, assignments, reason: reason.trim() });
      showToast('진출 12팀과 부전승·8강 직행 자리를 저장했어요.', 'success'); onClose();
    } catch (err) { setError(extractErrorMessage(err, '배정 저장에 실패했어요.')); }
  };
  const footer = <div className="flex flex-wrap gap-2">
      <Button variant="neutral" size="md" disabled={apply.isPending} onClick={onClose}>취소</Button>
      <Button variant="neutral" size="md" disabled={apply.isPending} onClick={() => { setEdited(null); setOrder(null); setTieConfirmed(false); }}>추천으로 되돌리기</Button>
      <Button variant="outline" size="md" disabled={apply.isPending} onClick={async () => {
        if ((!edited && !order) || await confirm({ title: '순위 다시 계산', message: '수정한 배정 초안을 지우고 최신 순위를 불러올까요?', confirmLabel: '다시 계산' })) {
          setEdited(null); setOrder(null); setTieConfirmed(false); onRefresh();
        }
      }}>다시 계산</Button>
      <Button variant="primary" size="md" className="flex-1" disabled={!canSave} loading={apply.isPending} onClick={() => void submit()}>배정 저장 · {changedCount}자리</Button>
    </div>;
  return <Round12Frame onClose={onClose} pending={apply.isPending} footer={footer}>
    <p className="tm-text-body font-semibold">20팀 → 12팀 진출 · 4팀 8강 직행 · 8팀 12강 경기</p>
    <p className="tm-text-caption text-[var(--text-muted)]">조 내 순위는 공식 순위를 따르고, 조 간 비교는 승점 → 골득실 → 다득점 순이에요. 같은 조 재대결은 경고하며 시드를 자동으로 바꾸지 않아요.</p>
    <details open={preview.ranks.some((rank) => rank.candidates.length > 1)}>
      <summary className="tm-text-label min-h-[44px] cursor-pointer font-semibold">조별 1·2·3위 확인 · 동률 팀 선택</summary>
      <div className="grid gap-3 md:grid-cols-3">
        {preview.ranks.map((rank, index) => <label key={rank.groupId + rank.rank} className="tm-text-label flex flex-col gap-1">
          {rank.groupName} {rank.rank}위{rank.candidates.length > 1 ? ' · 동률, 직접 선택' : ''}
          <select className="tm-input min-h-[44px]" value={picks[index]} disabled={apply.isPending || rank.candidates.length === 1}
            onChange={(event) => updatePicks(index, event.target.value)}>
            <option value="">팀 선택</option>
            {rank.candidates.map((candidate) => <option key={candidate} value={candidate}
              disabled={picks.some((picked, i) => i !== index && picked === candidate)}>{name(candidate)}</option>)}
          </select>
        </label>)}
      </div>
    </details>
    {ranked ? <details open>
      <summary className="tm-text-label min-h-[44px] cursor-pointer font-semibold">조 간 성적 비교 · 진출팀 선정 근거</summary>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((rank) => <div key={rank}>
          <h3 className="tm-text-label mb-2 font-semibold">조 {rank}위끼리 비교{rank === 3 ? ' · 상위 2팀만 진출' : rank === 1 ? ' · 상위 4팀 부전승' : ''}</h3>
          <ol className="flex flex-col gap-2">
            {ranked.slice((rank - 1) * 5, rank * 5).map((teamId, localIndex) => {
              const team = teams.get(teamId)!;
              const index = (rank - 1) * 5 + localIndex;
              const canMove = (offset: number) => localIndex + offset >= 0 && localIndex + offset < 5 &&
                compareCrossGroupTeams(team, teams.get(ranked[index + offset])!) === 0;
              return <li key={teamId} className="tm-text-label flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-soft)] p-3">
                <span>{localIndex + 1}. {team.teamName} · {team.groupName}<br />
                  <span className="tm-text-caption text-[var(--text-muted)]">승점 {team.points} · 골득실 {team.goalsFor - team.goalsAgainst} · 득점 {team.goalsFor}{rank === 3 && localIndex > 1 ? ' · 탈락' : ' · 진출'}</span>
                </span>
                <span className="flex gap-1">
                  {canMove(-1) ? <Button variant="neutral" size="md" disabled={apply.isPending} aria-label={`${team.teamName} 동률 순위 올리기`} onClick={() => move(index, -1)}>위로</Button> : null}
                  {canMove(1) ? <Button variant="neutral" size="md" disabled={apply.isPending} aria-label={`${team.teamName} 동률 순위 내리기`} onClick={() => move(index, 1)}>아래로</Button> : null}
                </span>
              </li>;
            })}
          </ol>
        </div>)}
      </div>
    </details> : <p role="status">동률인 조별 순위를 모두 선택하면 추천 대진이 나와요.</p>}
    {assignments.length === 12 ? <section className="flex flex-col gap-3">
      <SectionTitle title="배정 미리보기" />
      {edited ? <p className="tm-text-caption text-[var(--orange700)]">추천 시드와 다르게 배치하고 있어요. 부전승팀과 상대팀이 바뀔 수 있으니 저장 전에 확인해 주세요.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {preview.targets.map((target, index) => <label key={target.seed} className="tm-text-label flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4">
          <span className="font-semibold">{target.label}{edited && assignments[index] !== ranked?.[index] ? ' · 수동 수정' : ''}</span>
          <select aria-label={target.label} className="tm-input min-h-[44px]" value={assignments[index]} disabled={apply.isPending}
            onChange={(event) => setEdited(swapRound12Assignment(assignments, index, event.target.value))}>
            {ranked!.slice(0, 12).map((teamId) => <option key={teamId} value={teamId}>{name(teamId)} · {teams.get(teamId)!.groupName}</option>)}
          </select>
          <span className="tm-text-caption text-[var(--text-muted)]">현재 {name(target.currentRegistrationId)} → {name(assignments[index])}</span>
        </label>)}
      </div>
      {[[4, 11], [5, 10], [6, 9], [7, 8]].map(([home, away]) =>
        teams.get(assignments[home])!.groupId === teams.get(assignments[away])!.groupId
          ? <p key={home} className="tm-text-caption text-[var(--orange700)]">같은 조 재대결: {name(assignments[home])} vs {name(assignments[away])}</p> : null)}
    </section> : null}
    {hasTies ? <label className="tm-text-label flex min-h-[44px] items-center gap-2">
      <input type="checkbox" checked={tieConfirmed} disabled={apply.isPending} onChange={(event) => setTieConfirmed(event.target.checked)} />
      완전 동률 팀의 순서와 진출·부전승 여부를 직접 확인했어요.
    </label> : null}
    <label htmlFor={`${id}-reason`} className="tm-text-label flex flex-col gap-1">배정 사유
      <input id={`${id}-reason`} className="tm-input min-h-[44px]" value={reason} maxLength={500} disabled={apply.isPending} onChange={(event) => setReason(event.target.value)} />
    </label>
    {error ? <p role="alert" className="tm-text-label text-[var(--red700)]">{error}</p> : null}

    {ConfirmModal}
  </Round12Frame>;
}
