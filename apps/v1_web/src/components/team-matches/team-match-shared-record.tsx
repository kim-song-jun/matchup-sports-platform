'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useTeamMatchRecord, useMutateTeamMatchRecord, type SharedGoal, type SharedRecord, type RecordCommand } from '@/hooks/use-team-match-record';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { randomUuid } from '@/lib/uuid';
import { sharedRecordPhaseLabel, sharedRecordActionLabel } from '@/lib/v1-status-labels';
import styles from './team-match-shared-record.module.css';

function goalLabel(data: SharedRecord, goal: SharedGoal | null) {
  if (!goal) return '기록 없음';
  const player = data.participants.find((p) => p.id === goal.participantId);
  const side = data.sides.find((s) => s.id === goal.sideId);
  return `${side?.name ?? ''} · ${player?.name ?? '득점자 미상'}${goal.ownGoal ? ' (자책골)' : ''}${goal.minute === null ? '' : ` · ${goal.minute}분`}`;
}

export function TeamMatchSharedRecord({ teamMatchId }: { teamMatchId: string }) {
  const query = useTeamMatchRecord(teamMatchId);
  const mutation = useMutateTeamMatchRecord(teamMatchId);
  const [editing, setEditing] = useState<{ goal: SharedGoal | null; version: number } | null>(null);
  const [endPrompt, setEndPrompt] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const previousVersion = useRef<number | null>(null);
  const data = query.data;
  useEffect(() => {
    if (data && previousVersion.current !== null && previousVersion.current !== data.version) setAnnouncement('공동 경기 기록이 업데이트됐어요.');
    if (data) previousVersion.current = data.version;
  }, [data]);
  const uncertain = mutation.isError && (!(mutation.error instanceof V1ApiError) || mutation.error.statusCode >= 500);
  async function command(input: Omit<RecordCommand, 'commandId' | 'expectedVersion'>, version = data?.version ?? 0) {
    try {
      await mutation.mutateAsync({ ...input, expectedVersion: version, commandId: randomUuid() });
      setEditing(null); setEndPrompt(null);
    } catch { /* useMutation exposes the actual error and keeps the user's draft below. */ }
  }
  if (!data) return query.isError ? <main className={styles.page}><h1>경기 기록을 불러오지 못했어요</h1><p role="alert">{extractErrorMessage(query.error, '경기 기록을 불러오지 못했어요.')}</p><Button onClick={() => void query.refetch()}>다시 불러오기</Button></main> : <PageSkeleton />;
  if (data.phase === 'legacy' || data.phase === 'managed') return <main className={styles.page}><h1>경기 결과</h1><p>이 경기는 기존 경기 기록 화면에서 확인할 수 있어요.</p><Link className="tm-btn tm-btn-primary" href={`/team-matches/${teamMatchId}/result`}>경기 결과 보기</Link></main>;
  const home = data.sides.find((s) => s.key === 'HOME');
  const away = data.sides.find((s) => s.key === 'AWAY');
  const disabled = mutation.isPending || uncertain || query.isError;
  const ownConfirmed = data.confirmations.some((c) => c.sideId === data.ownSideId);
  return <main className={styles.page}>
    <header className={styles.header}><div><Link href={`/team-matches/${teamMatchId}?view=detail`} className={styles.muted}>← 매치 상세</Link><h1>함께 쓰는 경기 기록</h1><p className={styles.muted}>{data.title}</p></div><span className="tm-badge tm-badge-green">{sharedRecordPhaseLabel(data.phase)}</span></header>
    <div role="status" className="sr-only">{announcement}</div>
    {query.isError && <div role="alert" className={`${styles.notice} ${styles.error}`}>동기화가 끊겼어요. 마지막으로 받은 기록을 표시하고 있어요. <Button size="sm" onClick={() => void query.refetch()}>다시 연결</Button></div>}
    {mutation.isError && <div role="alert" className={`${styles.notice} ${styles.error}`}>{extractErrorMessage(mutation.error, '저장하지 못했어요.')}{uncertain && <><p>저장 여부를 확인하지 못했어요. 같은 요청으로 재시도하면 중복 등록되지 않아요.</p><Button onClick={() => { if (mutation.variables) mutation.mutate(mutation.variables, { onSuccess: () => { setEditing(null); setEndPrompt(null); } }); }}>저장 재시도</Button></>}</div>}
    <section className={styles.board} aria-label="공동 점수판"><div className={styles.muted}>{data.phase === 'official' ? '양 팀이 확인한 최종 결과' : data.canEdit ? '양 팀 참가자가 함께 기록하고 있어요 · 2초마다 자동 반영' : '경기 현황'}</div><div className={styles.score}><div className={styles.team}>{home?.name}</div><strong aria-label={`점수 ${home?.score ?? '—'} 대 ${away?.score ?? '—'}`}>{home?.score ?? '—'} : {away?.score ?? '—'}</strong><div className={styles.team}>{away?.name}</div></div>
      {data.canEdit && <Button block onClick={() => { mutation.reset(); setEditing({ goal: null, version: data.version }); }} disabled={disabled || !!editing}>득점 추가</Button>}
      {data.phase === 'official' && <p className={styles.confirmed}>결과가 확정되어 기록이 잠겼어요.</p>}
      {!data.participant && <p className={styles.muted}>기록 편집은 양 팀의 제출된 라인업 참가자에게 열려 있어요.</p>}
      {data.phase === 'scheduled' && <p className={styles.muted}>상대팀 확정 후 경기 시작 시간이 되면 기록할 수 있어요.</p>}
    </section>
    <div className={styles.columns}><section className={styles.section}><h2>득점 기록</h2>
      {editing && data.canEdit && <GoalForm key={editing.goal?.id ?? 'new'} data={data} goal={editing.goal} disabled={disabled} stale={editing.version !== data.version} onRefresh={() => setEditing(null)} onCancel={() => setEditing(null)} onSave={(goal) => command({ action: editing.goal ? 'edit' : 'add', ...(editing.goal ? { goalId: editing.goal.id } : {}), ...goal }, editing.version)} />}
      {data.goals.length === 0 && <p className={styles.muted}>{data.participant ? '아직 등록된 득점이 없어요.' : '참가자들의 공동 기록으로 점수가 갱신돼요.'}</p>}
      {data.goals.map((goal) => <div className={styles.row} key={goal.id}><div><strong>{data.participants.find((p) => p.id === goal.participantId)?.name ?? '득점자 미상'}{goal.ownGoal ? ' · 자책골' : ''}</strong><p className={styles.muted}>{data.sides.find((s) => s.id === goal.sideId)?.name}{goal.minute !== null ? ` · ${goal.minute}분` : ' · 시간 미입력'}</p></div>{data.canEdit && <div className={styles.actions}><Button size="sm" variant="ghost" disabled={disabled || !!editing} aria-label={`${goalLabel(data, goal)} 수정`} onClick={() => { mutation.reset(); setEditing({ goal, version: data.version }); }}>수정</Button><Button size="sm" variant="ghost" disabled={disabled || !!editing} aria-label={`${goalLabel(data, goal)} 삭제`} onClick={() => void command({ action: 'delete', goalId: goal.id })}>삭제</Button></div>}</div>)}
    </section><aside className={styles.stack}>
      {data.participant && <section className={styles.section}><h2>경기 종료 확인</h2><p className={styles.muted}>각 팀에서 한 명씩 현재 기록을 확인하면 최종 결과로 확정돼요. 기록을 수정하면 이전 확인은 취소돼요.</p>{data.sides.map((side) => <div className={styles.row} key={side.id}><span>{side.name}</span><span className={data.confirmations.some((c) => c.sideId === side.id) ? styles.confirmed : styles.muted}>{data.confirmations.some((c) => c.sideId === side.id) ? '확인 완료' : '확인 대기'}</span></div>)}
      {data.canEdit && (endPrompt !== null ? <div className={styles.notice}><p>실제 경기가 끝났고, 현재 점수와 득점자가 맞나요?</p>{endPrompt !== data.version && <p className={styles.error}>기록이 바뀌었어요. 취소 후 최신 기록을 확인해 주세요.</p>}<div className={styles.actions}><Button disabled={disabled || endPrompt !== data.version} onClick={() => void command({ action: 'confirm' }, endPrompt)}>이 기록으로 종료 확인</Button><Button variant="ghost" onClick={() => setEndPrompt(null)}>취소</Button></div></div> : <Button block disabled={disabled || !!editing} variant={ownConfirmed ? 'outline' : 'primary'} onClick={() => ownConfirmed ? void command({ action: 'reopen' }) : setEndPrompt(data.version)}>{ownConfirmed ? '종료 확인 취소' : '우리 팀 종료 확인'}</Button>)}
      </section>}
      {data.participant && <details className={styles.section}><summary className={styles.historyTitle}>변경 이력 · {data.history.length}건</summary><p className={styles.muted}>최근 100건 · 누가 바꿨는지 함께 확인해요.</p><ul className={styles.history}>{data.history.map((change) => <li key={change.id}><strong>{change.actorName}</strong> · {sharedRecordActionLabel(change.action)}<time>{new Date(change.at).toLocaleString('ko-KR')}</time>{change.goalId && <p className={styles.muted}>{goalLabel(data, change.before)} → {goalLabel(data, change.after)}</p>}{data.canEdit && change.goalId && <Button variant="ghost" size="sm" disabled={disabled || !!editing} onClick={() => void command({ action: 'undo', changeId: change.id })}>이 변경 되돌리기</Button>}</li>)}</ul>{!data.history.length && <p className={styles.muted}>첫 기록을 기다리고 있어요.</p>}</details>}
    </aside></div>
  </main>;
}

function GoalForm({ data, goal, disabled, stale, onCancel, onRefresh, onSave }: { data: SharedRecord; goal: SharedGoal | null; disabled: boolean; stale: boolean; onCancel: () => void; onRefresh: () => void; onSave: (goal: Omit<SharedGoal, 'id'>) => Promise<void> }) {
  const [sideId, setSideId] = useState(goal?.sideId ?? data.ownSideId ?? data.sides[0]?.id ?? '');
  const [participantId, setParticipantId] = useState(goal?.participantId ?? '');
  const [ownGoal, setOwnGoal] = useState(goal?.ownGoal ?? false);
  const [minute, setMinute] = useState(goal?.minute?.toString() ?? '');
  const candidates = data.participants.filter((p) => ownGoal ? p.sideId !== sideId : p.sideId === sideId);
  const duplicate = !goal && data.goals.some((g) => g.sideId === sideId && g.participantId === (participantId || null) && g.minute === (minute === '' ? null : Number(minute)) && g.ownGoal === ownGoal);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  useEffect(() => setDuplicateConfirmed(false), [sideId, participantId, minute, ownGoal]);
  return <form className={styles.form} aria-label={goal ? '득점 수정' : '득점 추가'} onSubmit={(event) => { event.preventDefault(); if (!stale && (!duplicate || duplicateConfirmed)) void onSave({ sideId, participantId: participantId || null, ownGoal, minute: minute === '' ? null : Number(minute) }); }}>
    <label className={styles.field}>득점 팀<select value={sideId} onChange={(e) => { setSideId(e.target.value); setParticipantId(''); }}>{data.sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}</select></label>
    <label><input type="checkbox" checked={ownGoal} onChange={(e) => { setOwnGoal(e.target.checked); setParticipantId(''); }} /> 자책골 (선수의 상대팀 점수로 반영)</label>
    <label className={styles.field}>{ownGoal ? '자책골 선수' : '득점 선수'}<select value={participantId} onChange={(e) => setParticipantId(e.target.value)}><option value="">득점자 미상 · 나중에 지정</option>{candidates.map((p) => <option key={p.id} value={p.id}>{p.jerseyNumber !== null ? `#${p.jerseyNumber} ` : ''}{p.name}</option>)}</select></label>
    <label className={styles.field}>득점 시간 (선택)<input type="number" min="0" max="999" step="1" inputMode="numeric" placeholder="예: 12분" value={minute} onChange={(e) => setMinute(e.target.value)} /></label>
    {duplicate && <label className={styles.notice}><input type="checkbox" checked={duplicateConfirmed} onChange={(e) => setDuplicateConfirmed(e.target.checked)} /> 같은 선수·시간의 기록이 있어요. 별개의 득점이 맞아요.</label>}
    {stale && <div role="alert" className={styles.notice}>작성 중 다른 참가자가 기록을 바꿨어요. 입력 내용은 유지했어요. 최신 기록을 확인하고 다시 입력해 주세요. <Button type="button" variant="ghost" onClick={onRefresh}>최신 기록 확인</Button></div>}
    <div className={styles.actions}><Button type="submit" disabled={disabled || stale || (duplicate && !duplicateConfirmed)}>{goal ? '수정 저장' : '득점 등록'}</Button><Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>취소</Button></div>
  </form>;
}

/** Detail stays public; only authenticated lineup participants enter the editor automatically. */
export function TeamMatchRecordEntry({ teamMatchId, detailOnly = false }: { teamMatchId: string; detailOnly?: boolean }) {
  const query = useTeamMatchRecord(teamMatchId);
  const router = useRouter();
  const data = query.data;
  useEffect(() => {
    if (!detailOnly && data?.participant && (data.phase === 'live' || data.phase === 'official')) router.replace(`/team-matches/${teamMatchId}/record`);
  }, [data?.participant, data?.phase, detailOnly, router, teamMatchId]);
  if (query.isError) return <div className={styles.notice} role="alert">경기 기록을 불러오지 못했어요. <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>;
  if (!data || ['legacy', 'managed', 'cancelled', 'scheduled'].includes(data.phase)) return null;
  return <section className={styles.board} aria-label="경기 현황"><strong>{sharedRecordPhaseLabel(data.phase)}</strong><p className={styles.team}>{data.sides.map((s) => `${s.name}${s.score === null ? '' : ` ${s.score}`}`).join(' : ')}</p>{data.participant ? <Link className="tm-btn tm-btn-primary" href={`/team-matches/${teamMatchId}/record`}>공동 경기 기록 열기</Link> : <p className={styles.muted}>{data.sides.some((s) => s.score === null) ? '점수는 경기 공개 설정에 따라 표시돼요.' : '양 팀 참가자들이 함께 작성한 경기 기록이에요.'}</p>}</section>;
}
