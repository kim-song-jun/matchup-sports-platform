'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ProfileAvatar } from '@/components/users/public-profile-client';
import { TeamMatchClaimMyRecordSection } from '@/components/public-game-records/claim-my-record';
import { useV1TeamMatch } from '@/hooks/use-v1-api';
import {
  useTeamMatchRecord,
  useMutateTeamMatchRecord,
  type SharedGoal,
  type SharedPublicGoalEvent,
  type SharedRecord,
  type SharedSubMatch,
  type RecordCommand,
} from '@/hooks/use-team-match-record';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { randomUuid } from '@/lib/uuid';
import { sanitizeRedirectPath, withFromPath } from '@/lib/session-storage';
import { sharedRecordPhaseLabel, sharedRecordActionLabel } from '@/lib/v1-status-labels';
import {
  eventPresentation,
  presentGameEventParticipantName,
} from '@/components/public-game-records/format';
import styles from './team-match-shared-record.module.css';

function goalLabel(data: SharedRecord, goal: SharedGoal | null) {
  if (!goal) return '기록 없음';
  const player = data.participants.find((p) => p.id === goal.participantId);
  const side = data.sides.find((s) => s.id === (player?.sideId ?? (goal.ownGoal ? null : goal.sideId)));
  const creditedSide = data.sides.find((s) => s.id === goal.sideId);
  const subMatch = data.subMatches?.find((row) => row.id === goal.subMatchId);
  return `${subMatch ? `${subMatch.title} · ` : ''}${side?.name ?? '소속팀 미상'} · ${player?.name ?? '득점자 미상'}${goal.ownGoal ? ` (자책골 · ${creditedSide?.name ?? '상대팀'} 득점으로 반영)` : ''}${goal.minute === null ? '' : ` · ${goal.minute}분`}`;
}

function subMatchScore(data: SharedRecord, subMatch: SharedSubMatch, sideKey: 'HOME' | 'AWAY') {
  const sideId = data.sides.find((side) => side.key === sideKey)?.id;
  return subMatch.scores.find((score) => score.sideId === sideId)?.score ?? null;
}

function playerInitials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join('') || '?';
}

const RESULT_AXIS_COLUMNS = 'minmax(0, 1fr) 64px minmax(0, 1fr)';

function GoalIcon({ ownGoal }: { ownGoal: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.goalIcon}
      data-goal-marker={ownGoal ? 'own-goal' : 'goal'}
      style={{ color: ownGoal ? 'var(--red500)' : 'var(--text-strong)' }}
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z" />
      <path d="m9 9.2-3.2.2M15 9.2l3.2.2M10.1 12.7l-2 3M13.9 12.7l2 3M8.1 15.7l.7 3M15.9 15.7l-.7 3" />
    </svg>
  );
}

function GoalEventRow({
  event,
  sideKey,
}: {
  event: SharedPublicGoalEvent;
  sideKey: 'HOME' | 'AWAY';
}) {
  const eventType = event.ownGoal ? 'OWN_GOAL' : 'GOAL';
  const presentation = eventPresentation({ type: eventType, cardColor: null });
  const playerName = presentGameEventParticipantName(eventType, event.participantName);
  const content = (
    <span>
      {event.minute === null ? '' : `${event.minute}′ `}
      {playerName}
    </span>
  );

  return (
    <div
      role="listitem"
      aria-label={`${sideKey === 'HOME' ? '홈' : '원정'} ${event.minute === null ? '' : `${event.minute}분 `}${playerName} ${presentation.label}`}
      className={styles.goalEventRow}
      style={{ gridTemplateColumns: RESULT_AXIS_COLUMNS }}
    >
      <div className={styles.goalEventHome}>{sideKey === 'HOME' ? content : null}</div>
      <div className={styles.goalEventMarker}>
        <GoalIcon ownGoal={event.ownGoal} />
        <span className="sr-only">{presentation.label}</span>
        {presentation.badge ? <span className={styles.ownGoalBadge}>{presentation.badge}</span> : null}
      </div>
      <div className={styles.goalEventAway}>{sideKey === 'AWAY' ? content : null}</div>
    </div>
  );
}

function GoalEventList({
  events,
  sides,
}: {
  events: readonly SharedPublicGoalEvent[];
  sides: SharedRecord['sides'];
}) {
  const sideKeyById = new Map(sides.map((side) => [side.id, side.key] as const));
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.minute ?? Number.MAX_SAFE_INTEGER) - (b.event.minute ?? Number.MAX_SAFE_INTEGER) || a.index - b.index);
  return (
    <div role="list" aria-label="득점 기록" className={styles.goalEventList}>
      {ordered.map(({ event, index }) => {
        const sideKey = sideKeyById.get(event.sideId);
        const key = `${event.subMatchId ?? 'match'}-${event.minute ?? 'unknown'}-${index}`;
        if (!sideKey) {
          return (
            <div key={key} role="listitem" className={styles.invalidGoalEvent}>
              득점 팀 정보를 확인할 수 없어요.
            </div>
          );
        }
        return <GoalEventRow key={key} event={event} sideKey={sideKey} />;
      })}
    </div>
  );
}

function GoalEventsAccordion({ data }: { data: SharedRecord }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const events = data.goalEvents;
  const scoresVisible = data.sides.length > 0 && data.sides.every((side) => side.score !== null);
  if (data.phase !== 'official' || !scoresVisible || events === undefined) return null;
  if (events.length === 0) return <p className={styles.noGoals}>등록된 득점이 없어요.</p>;

  const sections = data.subMatches.length === 0
    ? [{ id: 'match', title: null, events }]
    : [
        ...data.subMatches.map((subMatch) => ({
          id: subMatch.id,
          title: subMatch.title,
          events: events.filter((event) => event.subMatchId === subMatch.id),
        })),
        {
          id: 'unassigned',
          title: '기타',
          events: events.filter((event) => event.subMatchId === null),
        },
      ].filter((section) => section.events.length > 0);

  return (
    <div className={styles.goalAccordion}>
      <button
        type="button"
        className={styles.goalAccordionToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{expanded ? '득점 기록 접기' : '득점 기록 보기'} ({events.length})</span>
        <ChevronDown aria-hidden="true" size={18} className={styles.goalAccordionChevron} data-expanded={expanded} />
      </button>
      {expanded ? (
        <div id={panelId} className={styles.goalAccordionPanel}>
          {sections.map((section) => (
            <section key={section.id} aria-label={section.title ?? '전체 득점 기록'}>
              {section.title ? <h3 className={styles.goalSectionTitle}>{section.title}</h3> : null}
              <GoalEventList events={section.events} sides={data.sides} />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TeamMatchSharedRecord({ teamMatchId, admin = false }: { teamMatchId: string; admin?: boolean }) {
  const query = useTeamMatchRecord(teamMatchId);
  const mutation = useMutateTeamMatchRecord(teamMatchId);
  const [editing, setEditing] = useState<{ goal: SharedGoal | null; version: number; subMatchId: string | null } | null>(null);
  const [subMatchForm, setSubMatchForm] = useState<{ subMatch: SharedSubMatch | null; version: number; title: string } | null>(null);
  const [endPrompt, setEndPrompt] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const previousVersion = useRef<number | null>(null);
  const data = query.data;
  const router = useRouter();
  const fromPath = sanitizeRedirectPath(useSearchParams().get('from'));
  // 공동 기록 이전 경기는 이 화면에 보여줄 기록이 없다 — 목록에서 곧장 들어와도 매치 상세로 넘기고
  // 출처를 이어 실어 뒤로가기가 목록으로 돌아가게 한다. view=detail 은 참가자 자동 진입을 막는다.
  const handoffHref = !admin && (data?.phase === 'legacy' || data?.phase === 'managed')
    ? withFromPath(`/team-matches/${teamMatchId}?view=detail`, fromPath)
    : null;
  useEffect(() => {
    if (handoffHref) router.replace(handoffHref);
  }, [handoffHref, router]);

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
  if (handoffHref) return <PageSkeleton />;

  const home = data.sides.find((s) => s.key === 'HOME');
  const away = data.sides.find((s) => s.key === 'AWAY');
  const subMatches = data.subMatches ?? [];
  const disabled = mutation.isPending || uncertain || query.isError;
  const ownConfirmed = data.confirmations.some((c) => c.sideId === data.ownSideId);
  const controlsOpen = !!editing || !!subMatchForm;

  return <main className={styles.page}>
    {admin && <Link className={styles.openLink} href={`/admin/team-matches/${teamMatchId}`}>팀매치 운영 상세로</Link>}
    <header className={styles.header}>
      <div>
        <h1>함께 쓰는 경기 기록</h1>
        <p className={styles.muted}>{data.title}</p>
      </div>
      <span className={`tm-badge ${data.phase === 'cancelled' ? 'tm-badge-grey' : 'tm-badge-green'}`}>{sharedRecordPhaseLabel(data.phase)}</span>
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
      {data.operator && <p className={styles.muted}>Teameet 운영으로 양 팀과 함께 기록해요. 수정하면 기존 종료 확인이 초기화되며, 최종 확인은 양 팀이 직접 진행해요.</p>}
      {!data.participant && !data.operator && <p className={styles.muted}>기록 편집은 양 팀의 제출된 참석명단 참가자와 플랫폼 주관 경기의 운영자에게 열려 있어요.</p>}
      {admin && (data.phase === 'legacy' || data.phase === 'managed') && <p className={styles.muted}>이 경기는 공동 기록 대상이 아니에요. 기존 경기 운영 화면을 이용해 주세요.</p>}
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
        {data.participant && data.phase !== 'cancelled' && <section className={styles.section}>
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

        {(data.participant || data.operator) && <details className={styles.section}>
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
    {/* 이름만 올라간 게스트를 본인으로 연결하는 입구 — 리그 경기 상세와 같은 컴포넌트다. 경기 기록이 생긴 뒤에만 뜻이 있다. */}
    {!admin && (data.phase === 'live' || data.phase === 'official') ? <TeamMatchClaimEntry teamMatchId={teamMatchId} /> : null}
  </main>;
}

/** 참가팀 소속으로 확인된 사람에게만 — 비참가자는 모달을 연 뒤에야 403 을 받으므로 입구부터 숨긴다. */
function TeamMatchClaimEntry({ teamMatchId }: { teamMatchId: string }) {
  const viewer = useV1TeamMatch(teamMatchId).data?.viewer;
  const isParticipant =
    viewer?.manageableHostTeam === true || viewer?.manageableOpponentTeam === true || viewer?.participantMember === true;
  return isParticipant ? <TeamMatchClaimMyRecordSection teamMatchId={teamMatchId} /> : null;
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
    const participantName = participant?.name ?? '득점자 미상';
    const sideName = data.sides.find((side) => side.id === (participant?.sideId ?? (goal.ownGoal ? null : goal.sideId)))?.name ?? '소속팀 미상';
    const creditedSideName = data.sides.find((side) => side.id === goal.sideId)?.name ?? '상대팀';
    return <div className={styles.goalRow} key={goal.id} role="group" aria-label={`${participantName} 득점 기록`}>
    <div className={styles.goalPlayer}>
      <ProfileAvatar imageUrl={participant?.profileImageUrl} initials={playerInitials(participantName)} size={40} />
      <div className={styles.goalPlayerText}>
        <div className={styles.goalTitleRow}>
          <strong>{participantName}</strong>
          <span className={styles.goalTime} aria-label={goal.minute !== null ? `득점 시간 ${goal.minute}분` : '득점 시간 없음'}>
            {goal.minute !== null ? `${goal.minute}분` : '시간 없음'}
          </span>
        </div>
        <p className={styles.goalMeta}>
          <span className={styles.goalTeam}>{sideName}</span>
          <span aria-hidden="true">·</span>
          <span>{goal.ownGoal ? '자책골' : '득점'}</span>
        </p>
        {goal.ownGoal ? <p className={styles.goalMeta}>{creditedSideName} 득점으로 반영</p> : null}
      </div>
    </div>
    {canEdit && <div className={styles.goalActions} role="group" aria-label={`${participantName} 득점 관리`}>
      <Button size="sm" variant="ghost" disabled={disabled} aria-label={`${goalLabel(data, goal)} 수정`} onClick={() => onEdit(goal)}>수정</Button>
      <Button size="sm" variant="ghost" className={styles.goalDeleteAction} disabled={disabled} aria-label={`${goalLabel(data, goal)} 삭제`} onClick={() => onDelete(goal)}>삭제</Button>
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
  fromHref = null,
}: {
  teamMatchId: string;
  detailOnly?: boolean;
  fromHref?: string | null;
}) {
  const query = useTeamMatchRecord(teamMatchId);
  const router = useRouter();
  const data = query.data;
  // 뒤로가기는 매치 상세를 거치지 않고 이 화면이 받은 출처로 곧장 돌아간다 — 활동기록 등에서
  // 들어왔다면 거기로 바로 돌아가는 게 맞고, 매치 상세는 이제 중간 경유지가 아니다.
  // 출처가 아예 없을 때만(공유 링크로 바로 들어온 경우) route-chrome 의 정적 backHref가
  // `?view=detail`로 매치 상세를 가리킨다 — 그 값이 없으면 매치 상세가 이 화면과 같은 조건
  // (참가자 + live/official)에서 즉시 이 화면으로 되튕겨 뒤로가기가 제자리로 돌아와 버린다
  // (route-chrome/fragments/team-matches.ts 참고, 2026-09-29 실사고).
  const recordHref = withFromPath(`/team-matches/${teamMatchId}/record`, fromHref);

  useEffect(() => {
    if (
      !detailOnly &&
      data?.participant &&
      (data.phase === 'live' || data.phase === 'official')
    ) {
      router.replace(recordHref);
    }
  }, [data?.participant, data?.phase, detailOnly, recordHref, router]);

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
      <GoalEventsAccordion data={data} />
      {data.participant ? (
        <Link className={styles.openLink} href={recordHref}>
          공동 경기 기록 열기
        </Link>
      ) : (
        <p className={styles.notice}>참석명단에 등록된 참가자는 경기 시작 뒤 공동 기록에 참여할 수 있어요.</p>
      )}
    </section>
  );
}
