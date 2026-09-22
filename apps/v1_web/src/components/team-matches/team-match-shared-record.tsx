'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ProfileAvatar } from '@/components/users/public-profile-client';
import {
  useTeamMatchRecord,
  useMutateTeamMatchRecord,
  type SharedGoal,
  type SharedRecord,
  type SharedSubMatch,
  type RecordCommand,
} from '@/hooks/use-team-match-record';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { randomUuid } from '@/lib/uuid';
import { sharedRecordPhaseLabel, sharedRecordActionLabel } from '@/lib/v1-status-labels';
import styles from './team-match-shared-record.module.css';

function goalLabel(data: SharedRecord, goal: SharedGoal | null) {
  if (!goal) return '기록 없음';
  const player = data.participants.find((p) => p.id === goal.participantId);
  const side = data.sides.find((s) => s.id === goal.sideId);
  const subMatch = data.subMatches?.find((row) => row.id === goal.subMatchId);
  return `${subMatch ? `${subMatch.title} · ` : ''}${side?.name ?? ''} · ${player?.name ?? '득점자 미상'}${goal.ownGoal ? ' (자책골)' : ''}${goal.minute === null ? '' : ` · ${goal.minute}분`}`;
}

function subMatchScore(data: SharedRecord, subMatch: SharedSubMatch, sideKey: 'HOME' | 'AWAY') {
  const sideId = data.sides.find((side) => side.key === sideKey)?.id;
  return subMatch.scores.find((score) => score.sideId === sideId)?.score ?? null;
}

function playerInitials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join('') || '?';
}

export function TeamMatchSharedRecord({ teamMatchId }: { teamMatchId: string }) {
  const query = useTeamMatchRecord(teamMatchId);
  const mutation = useMutateTeamMatchRecord(teamMatchId);
  const [editing, setEditing] = useState<{ goal: SharedGoal | null; version: number; subMatchId: string | null } | null>(null);
  const [subMatchForm, setSubMatchForm] = useState<{ subMatch: SharedSubMatch | null; version: number; title: string } | null>(null);
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
      setEditing(null);
      setSubMatchForm(null);
      setEndPrompt(null);
    } catch {
      // useMutation exposes the actual error while local form state stays intact.
    }
  }

  if (!data) {
    return query.isError
      ? <main className={styles.page}><h1>경기 기록을 불러오지 못했어요</h1><p role="alert">{extractErrorMessage(query.error, '경기 기록을 불러오지 못했어요.')}</p><Button onClick={() => void query.refetch()}>다시 불러오기</Button></main>
      : <PageSkeleton />;
  }
  if (data.phase === 'legacy' || data.phase === 'managed') {
    return <main className={styles.page}><h1>경기 결과</h1><p>이 경기는 기존 경기 기록 화면에서 확인할 수 있어요.</p><Link className="tm-btn tm-btn-primary" href={`/team-matches/${teamMatchId}/result`}>경기 결과 보기</Link></main>;
  }

  const home = data.sides.find((s) => s.key === 'HOME');
  const away = data.sides.find((s) => s.key === 'AWAY');
  const subMatches = data.subMatches ?? [];
  const disabled = mutation.isPending || uncertain || query.isError;
  const ownConfirmed = data.confirmations.some((c) => c.sideId === data.ownSideId);
  const controlsOpen = !!editing || !!subMatchForm;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <Link href={`/team-matches/${teamMatchId}?view=detail`} className={styles.muted}>← 매치 상세</Link>
        <h1>함께 쓰는 경기 기록</h1>
        <p className={styles.muted}>{data.title}</p>
      </div>
      <span className="tm-badge tm-badge-green">{sharedRecordPhaseLabel(data.phase)}</span>
    </header>

    <div role="status" className="sr-only">{announcement}</div>
    {query.isError && <div role="alert" className={`${styles.notice} ${styles.error}`}>동기화가 끊겼어요. 마지막으로 받은 기록을 표시하고 있어요. <Button size="sm" onClick={() => void query.refetch()}>다시 연결</Button></div>}
    {mutation.isError && <div role="alert" className={`${styles.notice} ${styles.error}`}>
      {extractErrorMessage(mutation.error, '저장하지 못했어요.')}
      {uncertain && <><p>저장 여부를 확인하지 못했어요. 같은 요청으로 재시도하면 중복 등록되지 않아요.</p><Button onClick={() => { if (mutation.variables) mutation.mutate(mutation.variables, { onSuccess: () => { setEditing(null); setSubMatchForm(null); setEndPrompt(null); } }); }}>저장 재시도</Button></>}
    </div>}

    <section className={styles.board} aria-label="공동 점수판">
      <div className={styles.muted}>{data.phase === 'official' ? '양 팀이 확인한 최종 결과' : data.canEdit ? '양 팀 참가자가 함께 기록하고 있어요 · 2초마다 자동 반영' : '경기 현황'}</div>
      <div className={styles.score}>
        <div className={styles.team}>{home?.name}</div>
        <strong aria-label={`점수 ${home?.score ?? '?'} 대 ${away?.score ?? '?'}`}>{home?.score ?? '?'} : {away?.score ?? '?'}</strong>
        <div className={styles.team}>{away?.name}</div>
      </div>
      {subMatches.length > 0 && <p className={styles.aggregateNote}>서브매치의 모든 골을 합산한 팀매치 최종 점수예요.</p>}
      {data.canEdit && subMatches.length === 0 && <Button block onClick={() => { mutation.reset(); setEditing({ goal: null, version: data.version, subMatchId: null }); }} disabled={disabled || controlsOpen}>득점 추가</Button>}
      {data.phase === 'official' && <p className={styles.confirmed}>결과가 확정되어 기록이 잠겼어요.</p>}
      {!data.participant && <p className={styles.muted}>기록 편집은 양 팀의 제출된 라인업 참가자에게 열려 있어요.</p>}
      {data.phase === 'scheduled' && <p className={styles.muted}>상대팀 확정 후 경기 시작 시간이 되면 기록할 수 있어요.</p>}
    </section>

    <div className={styles.columns}>
      <div className={styles.stack}>
        {(subMatches.length > 0 || data.canEdit) && <section className={styles.section} aria-labelledby="submatch-heading">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="submatch-heading">서브매치</h2>
              <p className={styles.muted}>필요할 때만 나눠 기록해요. 전체 점수는 각 서브매치의 골을 자동으로 합산해요.</p>
            </div>
            {data.canEdit && <Button
              size="sm"
              variant="outline"
              disabled={disabled || controlsOpen || subMatches.length >= 20}
              onClick={() => { mutation.reset(); setSubMatchForm({ subMatch: null, version: data.version, title: `${subMatches.length + 1}경기` }); }}
            >
              서브매치 추가
            </Button>}
          </div>

          {subMatchForm && !subMatchForm.subMatch && <form className={styles.inlineForm} onSubmit={(event) => {
            event.preventDefault();
            if (!subMatchForm.title.trim() || subMatchForm.version !== data.version) return;
            void command({
              action: subMatchForm.subMatch ? 'submatch_edit' : 'submatch_add',
              ...(subMatchForm.subMatch ? { subMatchId: subMatchForm.subMatch.id } : {}),
              title: subMatchForm.title.trim(),
            }, subMatchForm.version);
          }}>
            <label className={styles.field}>
              서브매치 이름
              <input
                value={subMatchForm.title}
                maxLength={40}
                autoFocus
                onChange={(event) => setSubMatchForm({ ...subMatchForm, title: event.target.value })}
              />
            </label>
            {subMatchForm.version !== data.version && <p className={styles.error}>다른 참가자가 기록을 바꿨어요. 최신 내용을 확인하고 다시 시도해 주세요.</p>}
            <div className={styles.actions}>
              <Button type="submit" disabled={disabled || !subMatchForm.title.trim() || subMatchForm.version !== data.version}>{subMatchForm.subMatch ? '이름 저장' : '서브매치 만들기'}</Button>
              <Button type="button" variant="ghost" onClick={() => setSubMatchForm(null)} disabled={disabled}>취소</Button>
            </div>
          </form>}

          {subMatches.length === 0
            ? <p className={styles.muted}>서브매치 없이도 지금처럼 공동 점수판을 사용할 수 있어요.</p>
            : <div className={styles.subMatchList}>
              {subMatches.map((subMatch) => {
                const subGoals = data.goals.filter((goal) => goal.subMatchId === subMatch.id);
                return <article className={styles.subMatchCard} key={subMatch.id}>
                  {subMatchForm?.subMatch?.id === subMatch.id ? <form className={styles.cardRenameForm} aria-label={`${subMatch.title} 이름 변경`} onSubmit={(event) => {
                    event.preventDefault();
                    if (!subMatchForm.title.trim() || subMatchForm.version !== data.version) return;
                    void command({ action: 'submatch_edit', subMatchId: subMatch.id, title: subMatchForm.title.trim() }, subMatchForm.version);
                  }}>
                    <label className={styles.field}>
                      서브매치 이름
                      <input value={subMatchForm.title} maxLength={40} autoFocus onChange={(event) => setSubMatchForm({ ...subMatchForm, title: event.target.value })} />
                    </label>
                    {subMatchForm.version !== data.version && <p className={styles.error}>다른 참가자가 기록을 바꿨어요. 최신 내용을 확인하고 다시 시도해 주세요.</p>}
                    <div className={styles.actions}>
                      <Button type="submit" disabled={disabled || !subMatchForm.title.trim() || subMatchForm.version !== data.version}>이름 저장</Button>
                      <Button type="button" variant="ghost" onClick={() => setSubMatchForm(null)} disabled={disabled}>취소</Button>
                    </div>
                  </form> : <div className={styles.subMatchHead}>
                    <div className={styles.subMatchSummary}>
                      <div className={styles.subMatchTitle}>{subMatch.title}</div>
                      <div className={styles.subScore} aria-label={`${subMatch.title} 점수 ${subMatchScore(data, subMatch, 'HOME') ?? '?'} 대 ${subMatchScore(data, subMatch, 'AWAY') ?? '?'}`}>
                        <span>{home?.name}</span>
                        <strong>{subMatchScore(data, subMatch, 'HOME') ?? '?'} : {subMatchScore(data, subMatch, 'AWAY') ?? '?'}</strong>
                        <span>{away?.name}</span>
                      </div>
                    </div>
                    {data.canEdit && <div className={styles.actions}>
                      <Button size="sm" variant="ghost" disabled={disabled || controlsOpen} onClick={() => { mutation.reset(); setSubMatchForm({ subMatch, version: data.version, title: subMatch.title }); }}>이름 수정</Button>
                      <Button size="sm" variant="ghost" disabled={disabled || controlsOpen} onClick={() => void command({ action: 'submatch_delete', subMatchId: subMatch.id })}>삭제</Button>
                    </div>}
                  </div>}
                  {data.canEdit && <Button block size="sm" variant="outline" disabled={disabled || controlsOpen} onClick={() => { mutation.reset(); setEditing({ goal: null, version: data.version, subMatchId: subMatch.id }); }}>이 서브매치에 득점 추가</Button>}
                  {editing && editing.subMatchId === subMatch.id && data.canEdit && <GoalForm
                    key={editing.goal?.id ?? `new-${subMatch.id}`}
                    data={data}
                    goal={editing.goal}
                    subMatchId={subMatch.id}
                    disabled={disabled}
                    stale={editing.version !== data.version}
                    onRefresh={() => setEditing(null)}
                    onCancel={() => setEditing(null)}
                    onSave={(goal) => command({ action: editing.goal ? 'edit' : 'add', ...(editing.goal ? { goalId: editing.goal.id } : {}), ...goal }, editing.version)}
                  />}
                  <GoalRows data={data} goals={subGoals} disabled={disabled || controlsOpen} canEdit={data.canEdit} onEdit={(goal) => { mutation.reset(); setEditing({ goal, version: data.version, subMatchId: subMatch.id }); }} onDelete={(goal) => void command({ action: 'delete', goalId: goal.id })} />
                </article>;
              })}
            </div>}
        </section>}

        {subMatches.length === 0 && <section className={styles.section}>
          <h2>득점 기록</h2>
          {editing && data.canEdit && <GoalForm
            key={editing.goal?.id ?? 'new'}
            data={data}
            goal={editing.goal}
            subMatchId={null}
            disabled={disabled}
            stale={editing.version !== data.version}
            onRefresh={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onSave={(goal) => command({ action: editing.goal ? 'edit' : 'add', ...(editing.goal ? { goalId: editing.goal.id } : {}), ...goal }, editing.version)}
          />}
          <GoalRows data={data} goals={data.goals} disabled={disabled || controlsOpen} canEdit={data.canEdit} onEdit={(goal) => { mutation.reset(); setEditing({ goal, version: data.version, subMatchId: null }); }} onDelete={(goal) => void command({ action: 'delete', goalId: goal.id })} />
        </section>}
      </div>

      <aside className={styles.stack}>
        {data.participant && <section className={styles.section}>
          <h2>경기 종료 확인</h2>
          <p className={styles.muted}>각 팀에서 한 명씩 현재 기록을 확인하면 팀매치 한 경기의 최종 결과로 확정돼요. 기록을 수정하면 이전 확인은 취소돼요.</p>
          {data.sides.map((side) => <div className={styles.row} key={side.id}>
            <span>{side.name}</span>
            <span className={data.confirmations.some((c) => c.sideId === side.id) ? styles.confirmed : styles.muted}>{data.confirmations.some((c) => c.sideId === side.id) ? '확인 완료' : '확인 대기'}</span>
          </div>)}
          {data.canEdit && (endPrompt !== null
            ? <div className={styles.notice}>
                <p>실제 경기가 끝났고, 전체 점수와 모든 서브매치의 득점자가 맞나요?</p>
                {endPrompt !== data.version && <p className={styles.error}>기록이 바뀌었어요. 취소 후 최신 기록을 확인해 주세요.</p>}
                <div className={styles.actions}>
                  <Button disabled={disabled || endPrompt !== data.version} onClick={() => void command({ action: 'confirm' }, endPrompt)}>이 기록으로 종료 확인</Button>
                  <Button variant="ghost" onClick={() => setEndPrompt(null)}>취소</Button>
                </div>
              </div>
            : <Button block disabled={disabled || controlsOpen} variant={ownConfirmed ? 'outline' : 'primary'} onClick={() => ownConfirmed ? void command({ action: 'reopen' }) : setEndPrompt(data.version)}>{ownConfirmed ? '종료 확인 취소' : '우리 팀 종료 확인'}</Button>)}
        </section>}

        {data.participant && <details className={styles.section}>
          <summary className={styles.historyTitle}>변경 이력 · {data.history.length}건</summary>
          <p className={styles.muted}>최근 100건 · 누가 바꿨는지 함께 확인해요.</p>
          <ul className={styles.history}>
            {data.history.map((change) => <li key={change.id}>
              <strong>{change.actorName}</strong> · {sharedRecordActionLabel(change.action)}
              <time>{new Date(change.at).toLocaleString('ko-KR')}</time>
              {change.goalId && <p className={styles.muted}>{goalLabel(data, change.before as SharedGoal | null)} → {goalLabel(data, change.after as SharedGoal | null)}</p>}
              {change.subMatchId && !change.goalId && <p className={styles.muted}>{(change.before as SharedSubMatch | null)?.title ?? '없음'} → {(change.after as SharedSubMatch | null)?.title ?? '삭제'}</p>}
              {data.canEdit && change.goalId && <Button variant="ghost" size="sm" disabled={disabled || controlsOpen} onClick={() => void command({ action: 'undo', changeId: change.id })}>이 변경 되돌리기</Button>}
            </li>)}
          </ul>
          {!data.history.length && <p className={styles.muted}>첫 기록을 기다리고 있어요.</p>}
        </details>}
      </aside>
    </div>
  </main>;
}

function GoalRows({ data, goals, disabled, canEdit, onEdit, onDelete }: {
  data: SharedRecord;
  goals: SharedGoal[];
  disabled: boolean;
  canEdit: boolean;
  onEdit: (goal: SharedGoal) => void;
  onDelete: (goal: SharedGoal) => void;
}) {
  if (goals.length === 0) return <p className={styles.muted}>{data.participant ? '아직 등록된 득점이 없어요.' : '참가자들의 공동 기록으로 점수가 갱신돼요.'}</p>;
  return <div className={styles.goalList}>{goals.map((goal) => {
    const participant = data.participants.find((row) => row.id === goal.participantId);
    return <div className={styles.row} key={goal.id}>
    <div className={styles.goalPlayer}>
      <ProfileAvatar imageUrl={participant?.profileImageUrl} initials={playerInitials(participant?.name ?? '?')} size={40} />
      <div>
        <strong>{participant?.name ?? '득점자 미상'}{goal.ownGoal ? ' · 자책골' : ''}</strong>
        <p className={styles.muted}>{data.sides.find((s) => s.id === goal.sideId)?.name}{goal.minute !== null ? ` · ${goal.minute}분` : ' · 시간 미입력'}</p>
      </div>
    </div>
    {canEdit && <div className={styles.actions}>
      <Button size="sm" variant="ghost" disabled={disabled} aria-label={`${goalLabel(data, goal)} 수정`} onClick={() => onEdit(goal)}>수정</Button>
      <Button size="sm" variant="ghost" disabled={disabled} aria-label={`${goalLabel(data, goal)} 삭제`} onClick={() => onDelete(goal)}>삭제</Button>
    </div>}
  </div>})}</div>;
}

function GoalForm({ data, goal, subMatchId, disabled, stale, onCancel, onRefresh, onSave }: {
  data: SharedRecord;
  goal: SharedGoal | null;
  subMatchId: string | null;
  disabled: boolean;
  stale: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onSave: (goal: Omit<SharedGoal, 'id'>) => Promise<void>;
}) {
  const [sideId, setSideId] = useState(goal?.sideId ?? data.ownSideId ?? data.sides[0]?.id ?? '');
  const [participantId, setParticipantId] = useState(goal?.participantId ?? '');
  const [ownGoal, setOwnGoal] = useState(goal?.ownGoal ?? false);
  const [minute, setMinute] = useState(goal?.minute?.toString() ?? '');
  const candidates = data.participants.filter((p) => ownGoal ? p.sideId !== sideId : p.sideId === sideId);
  const duplicate = !goal && data.goals.some((g) => g.subMatchId === subMatchId && g.sideId === sideId && g.participantId === (participantId || null) && g.minute === (minute === '' ? null : Number(minute)) && g.ownGoal === ownGoal);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  useEffect(() => setDuplicateConfirmed(false), [sideId, participantId, minute, ownGoal]);

  return <form className={styles.form} aria-label={goal ? '득점 수정' : '득점 추가'} onSubmit={(event) => {
    event.preventDefault();
    if (!stale && (!duplicate || duplicateConfirmed)) void onSave({ sideId, participantId: participantId || null, ownGoal, minute: minute === '' ? null : Number(minute), subMatchId });
  }}>
    <label className={styles.field}>득점 팀<select value={sideId} onChange={(event) => { setSideId(event.target.value); setParticipantId(''); }}>{data.sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}</select></label>
    <label><input type="checkbox" checked={ownGoal} onChange={(event) => { setOwnGoal(event.target.checked); setParticipantId(''); }} /> 자책골 (선수의 상대팀 점수로 반영)</label>
    <fieldset className={styles.playerField}>
      <legend>{ownGoal ? '자책골 선수' : '득점 선수'}</legend>
      <div className={styles.playerChoices}>
        <label className={styles.playerChoice} data-selected={participantId === ''}>
          <input type="radio" name="scorer" value="" checked={participantId === ''} onChange={(event) => setParticipantId(event.target.value)} />
          <ProfileAvatar imageUrl={null} initials="?" size={40} />
          <span><strong>득점자 미상</strong><small>나중에 지정</small></span>
        </label>
        {candidates.map((participant) => <label className={styles.playerChoice} data-selected={participantId === participant.id} key={participant.id}>
          <input type="radio" name="scorer" value={participant.id} checked={participantId === participant.id} onChange={(event) => setParticipantId(event.target.value)} />
          <ProfileAvatar imageUrl={participant.profileImageUrl} initials={playerInitials(participant.name)} size={40} />
          <span><strong>{participant.jerseyNumber !== null ? `#${participant.jerseyNumber} ` : ''}{participant.name}</strong><small>{data.sides.find((side) => side.id === participant.sideId)?.name}</small></span>
        </label>)}
      </div>
    </fieldset>
    <label className={styles.field}>득점 시간 (선택)<input type="number" min="0" max="999" step="1" inputMode="numeric" placeholder="예: 12분" value={minute} onChange={(event) => setMinute(event.target.value)} /></label>
    {duplicate && <label className={styles.notice}><input type="checkbox" checked={duplicateConfirmed} onChange={(event) => setDuplicateConfirmed(event.target.checked)} /> 같은 선수·시간의 기록이 있어요. 별개의 득점이 맞아요.</label>}
    {stale && <div role="alert" className={styles.notice}>작성 중 다른 참가자가 기록을 바꿨어요. 입력 내용은 유지했어요. 최신 기록을 확인하고 다시 입력해 주세요. <Button type="button" variant="ghost" onClick={onRefresh}>최신 기록 확인</Button></div>}
    <div className={styles.actions}><Button type="submit" disabled={disabled || stale || (duplicate && !duplicateConfirmed)}>{goal ? '수정 저장' : '득점 등록'}</Button><Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>취소</Button></div>
  </form>;
}

/** Detail stays public; only authenticated lineup participants enter the editor automatically. */
export function TeamMatchRecordEntry({
  teamMatchId,
  detailOnly = false,
}: {
  teamMatchId: string;
  detailOnly?: boolean;
}) {
  const query = useTeamMatchRecord(teamMatchId);
  const router = useRouter();
  const data = query.data;

  useEffect(() => {
    if (
      !detailOnly &&
      data?.participant &&
      (data.phase === 'live' || data.phase === 'official')
    ) {
      router.replace(`/team-matches/${teamMatchId}/record`);
    }
  }, [data?.participant, data?.phase, detailOnly, router, teamMatchId]);

  if (query.isError) {
    return (
      <div className={styles.notice} role="alert">
        경기 기록을 불러오지 못했어요.
        <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (
    !data ||
    ['legacy', 'managed', 'cancelled', 'scheduled'].includes(data.phase)
  ) {
    return null;
  }

  return (
    <section className={styles.board} aria-label="경기 현황">
      <strong>{sharedRecordPhaseLabel(data.phase)}</strong>
      <p className={styles.team}>
        {data.sides
          .map((side) => `${side.name}${side.score === null ? '' : ` ${side.score}`}`)
          .join(' : ')}
      </p>
      {(data.subMatches?.length ?? 0) > 0 && (
        <div className={styles.detailSubMatches}>
          {data.subMatches.map((subMatch) => (
            <div key={subMatch.id}>
              <span>{subMatch.title}</span>
              <strong>
                {subMatchScore(data, subMatch, 'HOME') ?? '?'} :{' '}
                {subMatchScore(data, subMatch, 'AWAY') ?? '?'}
              </strong>
            </div>
          ))}
        </div>
      )}
      {data.participant ? (
        <Link className={styles.openLink} href={`/team-matches/${teamMatchId}/record`}>
          공동 경기 기록 열기
        </Link>
      ) : (
        <p className={styles.notice}>라인업 참가자는 경기 시작 뒤 공동 기록에 참여할 수 있어요.</p>
      )}
    </section>
  );
}
