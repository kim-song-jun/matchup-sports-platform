'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useLeagueConversionCommit, useLeagueConversionPreview, useLeagueConversionStatus } from '@/hooks/use-league-series-conversion';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { extractErrorMessage } from '@/lib/error-message';
import { leagueInputClass, leagueLabelClass } from '../../league-basic-fields';

export function LeagueConversionForm({ leagueId }: { leagueId: string }) {
  const id = useId();
  const router = useRouter();
  const league = useV1AdminLeagueMatch(leagueId);
  const status = useLeagueConversionStatus(leagueId);
  const canWrite = useAdminCanWrite();
  const preview = useLeagueConversionPreview(leagueId);
  const commit = useLeagueConversionCommit(leagueId);
  const { confirm, ConfirmModal } = useConfirm();
  const lock = useRef(false);
  const [title, setTitle] = useState('');
  const [tierCount, setTierCount] = useState(2);
  const [sizes, setSizes] = useState<string[]>(['3', '3']);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = preview.isPending || commit.isPending;
  const counts = sizes.map(Number);
  const invalid = counts.some((n) => !Number.isInteger(n) || n < 2) || counts.reduce((a, b) => a + b, 0) !== league.data?.teamIds.length;
  const reset = () => { preview.reset(); setAssignments({}); setReasons({}); setError(null); };
  const showPreview = async () => {
    setError(null);
    try {
      const result = await preview.mutateAsync(counts);
      setAssignments(Object.fromEntries(result.entries.map((e) => [e.teamId, e.suggestedTier])));
      setReasons({});
    } catch (err) { setError(extractErrorMessage(err, '배정 미리보기를 불러오지 못했어요.')); }
  };
  const submit = async () => {
    if (lock.current || !preview.data || !canWrite) return;
    lock.current = true;
    try {
      const ok = await confirm({ title: '리그 체계와 첫 시즌을 만들까요?', message: '기존 리그 기록은 유지돼요. 새 시즌의 대진은 생성 후 따로 만들어요. 최초 배정은 다시 확정할 수 없어요.', confirmLabel: '확정하고 만들기' });
      if (!ok) return;
      const result = await commit.mutateAsync({ title: title.trim(), tierSizes: counts, startsOn: new Date(`${start}T00:00:00+09:00`).toISOString(), endsOn: new Date(`${end}T23:59:59.999+09:00`).toISOString(), fingerprint: preview.data.fingerprint, entries: preview.data.entries.map((e) => ({ teamId: e.teamId, tier: assignments[e.teamId], reason: reasons[e.teamId] })) });
      router.push(`/admin/league-series/${result.seriesId}`);
    } catch (err) { setError(extractErrorMessage(err, '리그 체계를 만들지 못했어요.')); }
    finally { lock.current = false; }
  };
  if (league.isPending) return <p role="status">리그 정보를 불러오고 있어요.</p>;
  if (!league.data) return <div><p role="alert">{extractErrorMessage(league.error, '리그 정보를 불러오지 못했어요.')}</p><button className="tm-btn tm-btn-md tm-btn-neutral" onClick={() => void league.refetch()}>다시 시도</button></div>;
  if (!canWrite) return <p>리그 체계를 만들 권한이 없어요.</p>;
  if (status.isPending) return <p role="status">전환 이력을 확인하고 있어요.</p>;
  if (status.isError) return <div><p role="alert">{extractErrorMessage(status.error, '전환 이력을 불러오지 못했어요.')}</p><button className="tm-btn tm-btn-md tm-btn-neutral" onClick={() => void status.refetch()}>다시 시도</button></div>;
  if (status.data.seriesId) return <p>이미 리그 체계에 연결돼 있어요. <Link className="tm-btn tm-btn-md tm-btn-neutral" href={`/admin/league-series/${status.data.seriesId}`}>리그 체계 보기</Link></p>;
  if (league.data.state !== 'completed') return <p>종료된 독립 리그에서 사용할 수 있어요.</p>;
  const tied = new Set(preview.data?.boundaryTies.flatMap((g) => g.teamIds));
  const badAssignment = preview.data && (counts.some((n, i) => Object.values(assignments).filter((t) => t === i + 1).length !== n) || preview.data.entries.some((e) => (assignments[e.teamId] !== e.suggestedTier || tied.has(e.teamId)) && !reasons[e.teamId]?.trim()));
  return <section className="space-y-4">
    <h2 className="tm-text-body-lg font-bold">리그 체계로 전환</h2>
    <p className="tm-text-caption text-[var(--text-muted)]">공식 최종 순위로 첫 시즌의 티어를 나눠요. 기존 경기·순위·선수 기록은 그대로 남아요. 이후 시즌의 승강 규칙은 생성된 체계의 수정 화면에서 정해요.</p>
    <fieldset disabled={busy} className="space-y-4">
      <div><label className={leagueLabelClass} htmlFor={`${id}-title`}>리그 체계 이름</label><input id={`${id}-title`} className={leagueInputClass} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className={leagueLabelClass} htmlFor={`${id}-count`}>티어 수</label><select id={`${id}-count`} className={leagueInputClass} value={tierCount} onChange={(e) => { const n = Number(e.target.value); setTierCount(n); setSizes(Array.from({ length: n }, (_, i) => String(Math.floor(league.data!.teamIds.length / n) + (i < league.data!.teamIds.length % n ? 1 : 0)))); reset(); }}>{[1, 2, 3].map((n) => <option value={n} key={n}>{n}개</option>)}</select></div>
      <div className="grid gap-3 sm:grid-cols-3">{sizes.map((size, i) => <div key={i}><label className={leagueLabelClass} htmlFor={`${id}-size-${i}`}>{i + 1}부 팀 수</label><input id={`${id}-size-${i}`} className={leagueInputClass} type="number" min={2} max={100} value={size} onChange={(e) => { setSizes(sizes.map((s, j) => i === j ? e.target.value : s)); reset(); }} /></div>)}</div>
      <p className="tm-text-caption">총 {league.data.teamIds.length}팀을 빠짐없이 배정해 주세요. 각 티어에 최소 2팀이 필요해요.</p>
      <div className="grid gap-3 sm:grid-cols-2"><div><label className={leagueLabelClass} htmlFor={`${id}-start`}>첫 시즌 시작일</label><input id={`${id}-start`} type="date" className={leagueInputClass} value={start} onChange={(e) => setStart(e.target.value)} /></div><div><label className={leagueLabelClass} htmlFor={`${id}-end`}>첫 시즌 종료일</label><input id={`${id}-end`} type="date" className={leagueInputClass} value={end} onChange={(e) => setEnd(e.target.value)} /></div></div>
      <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" disabled={invalid} onClick={() => void showPreview()}>{preview.isPending ? '계산 중…' : '배정 미리보기'}</button>
      {preview.data && <div className="space-y-3"><p className="tm-text-caption">다른 티어로 바꾸면 사유를 적어 주세요. 완전 동률로 경계에 걸린 팀도 배정 사유가 필요해요.</p>{preview.data.entries.map((entry) => <div key={entry.teamId} className="grid gap-2 border-b border-[var(--border)] py-3 sm:grid-cols-3"><p>{entry.position}위 · {entry.teamName} · {entry.points}점{tied.has(entry.teamId) ? ' · 동률 확인 필요' : ''}</p><select aria-label={`${entry.teamName} 배정 티어`} className={leagueInputClass} value={assignments[entry.teamId]} onChange={(e) => setAssignments({ ...assignments, [entry.teamId]: Number(e.target.value) })}>{counts.map((_, i) => <option value={i + 1} key={i}>{i + 1}부</option>)}</select><input className={leagueInputClass} aria-label={`${entry.teamName} 배정 사유`} placeholder="배정 사유" maxLength={200} value={reasons[entry.teamId] ?? ''} onChange={(e) => setReasons({ ...reasons, [entry.teamId]: e.target.value })} /></div>)}<p className="tm-text-caption">{counts.map((n, i) => `${i + 1}부 ${Object.values(assignments).filter((t) => t === i + 1).length}/${n}팀`).join(' · ')}</p><button type="button" className="tm-btn tm-btn-md tm-btn-primary" disabled={!!badAssignment || !title.trim() || !start || !end || end < start} onClick={() => void submit()}>{commit.isPending ? '만드는 중…' : '확정하고 첫 시즌 만들기'}</button></div>}
    </fieldset>
    {error && <p role="alert" className="text-[var(--red700)]">{error}</p>}
    {ConfirmModal}
  </section>;
}
