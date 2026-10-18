'use client';

import Link from 'next/link';
import { useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { RosterManagerNavigation, useRosterEditorNavigation } from '@/components/game-roster/roster-manager-navigation';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useUnsavedChangesGuard } from '@/components/v1-ui/use-unsaved-changes-guard';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import {
  GAME_ROSTER_PLAYING_HINT,
  GameRosterPlayerRow,
  GameRosterPlayingCheckbox,
  RosterPlayerColumns,
} from '@/components/game-roster/game-roster-player-row';
import { GameRosterHistoryList } from '@/components/game-roster/game-roster-history';
import { GameRosterJerseySheet, nextPlayerWithoutJersey } from '@/components/game-roster/game-roster-jersey-sheet';
import { GameRosterReasonChips } from '@/components/game-roster/game-roster-reason-chips';
import { RegistrationRosterEntry } from '@/components/game-roster/registration-roster-entry';
import { TEAM_UPCOMING_GAMES_ANCHOR } from '@/components/teams/team-upcoming-games-card';
import {
  useV1ApplyGameRosterBatch,
  useV1TeamGameRoster,
  useV1GameRosterAdjustments,
  type V1GameRosterBatchChange,
  type V1GameRosterView,
} from '@/hooks/use-v1-game-roster';
import { V1ApiError } from '@/lib/api-client';
import { gameRosterErrorMessage, isStaleGameRosterWrite } from '@/lib/game-roster-errors';
import { gameRosterEditStateLabel } from '@/lib/v1-status-labels';
import { formatExclusiveEndRangeShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { draftToChanges, resetToRegistrationChanges, type GameRosterDraft } from '@/components/game-roster/game-roster-draft';
import { compareRosterPlayers, GAME_ROSTER_SCOPE, GAME_ROSTER_TITLE, ROSTER_SAVE_LABEL, rosterPersonLabel } from '@/lib/roster-presentation';

type Notice = { tone: 'info' | 'error'; message: string };

/**
 * 대회·리그 경기 한 팀의 출전 명단(Task 179 ②④).
 * 경기 명단 = 참가 명단 − 이번 경기 빠짐 − 결장 − 출전정지. 여기서 바꾸는 건 "이번 경기 빠짐"뿐이고,
 * 변경은 모아 두었다가 한 번에 저장한다(팀 일괄 API — 한 트랜잭션이라 일부만 저장되지 않는다).
 * 경로에 사이드가 없어 팀·경기로 명단을 받는다 — 권한(팀원 읽기·팀장/운영자 쓰기·지원 계정 읽기)은 서버 판정이다.
 */
export function GameRosterClient({ teamId, gameId }: { teamId: string; gameId: string }) {
  const managerNavigation = useContext(RosterManagerNavigation);
  const roster = useV1TeamGameRoster(teamId, gameId);
  const history = useV1GameRosterAdjustments(gameId, roster.data?.sideId ?? null);
  const batch = useV1ApplyGameRosterBatch(teamId);
  const { confirm, ConfirmModal } = useConfirm();
  const [draft, setDraft] = useState<GameRosterDraft>({});
  const [goalkeepers, setGoalkeepers] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 등번호 시트 — 닫히는 동안에도 내용이 남도록 대상은 유지하고 열림만 끈다.
  const [jersey, setJersey] = useState<{ userId: string; open: boolean } | null>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  const data = roster.data;
  const changes = useMemo(() => data === undefined ? [] : [
    ...draftToChanges(draft, data),
    ...data.base.flatMap((row): V1GameRosterBatchChange[] =>
      data.goalkeeperEditable === false || goalkeepers[row.userId] === undefined || goalkeepers[row.userId] === row.goalkeeper ? [] :
        [{ gameId: data.gameId, userId: row.userId, op: 'SET_GOALKEEPER', goalkeeper: goalkeepers[row.userId] }]),
  ], [draft, goalkeepers, data]);
  const canEdit = data?.editable === true;
  const dirty = canEdit && changes.length > 0;
  const { UnsavedChangesModal } = useUnsavedChangesGuard(dirty);

  function setEntry(userId: string, entry: GameRosterDraft[string] | null) {
    setNotice(null);
    setDraft((current) => {
      const next = { ...current };
      if (entry === null) delete next[userId];
      else next[userId] = entry;
      return next;
    });
  }

  async function submit(batchChanges: V1GameRosterBatchChange[], successMessage: string) {
    setNotice(null);
    try {
      await batch.mutateAsync(batchChanges);
      setDraft({});
      setGoalkeepers({});
      setNotice({ tone: 'info', message: successMessage });
      return true;
    } catch (caught) {
      // 화면이 낡은 거절(시작·명단·대진·권한 변경)이면 최신으로 다시 받고, 이미 무의미한 초안은 버린다.
      if (isStaleGameRosterWrite(caught)) {
        setDraft({});
        setGoalkeepers({});
        void roster.refetch();
        void history.refetch();
      }
      setNotice({
        tone: 'error',
        message: gameRosterErrorMessage(caught, '명단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
      });
      return false;
    }
  }

  async function resetToRegistration(view: V1GameRosterView) {
    const ok = await confirm({
      title: '참가 명단대로 되돌릴까요?',
      message: `이번 경기에서 뺀 ${view.excluded.length}명을 모두 출전으로 되돌려요.${
        dirty ? ' 저장하지 않은 변경도 사라져요.' : ''
      } 결장·출전정지 선수는 그대로 빠져요.`,
      confirmLabel: '되돌리기',
    });
    if (!ok) return;
    await submit(resetToRegistrationChanges(view), '참가 명단대로 되돌렸어요.');
  }

  function openHistory() {
    setHistoryOpen(true);
    requestAnimationFrame(() => {
      historyHeadingRef.current?.scrollIntoView({ block: 'start' });
      historyHeadingRef.current?.focus();
    });
  }

  useRosterEditorNavigation({ dirty, busy: batch.isPending,
    save: () => submit(changes, '명단을 저장했어요.'),
    discard: () => { setDraft({}); setGoalkeepers({}); },
  });

  if (roster.isError) return <RosterLoadError error={roster.error} onRetry={() => void roster.refetch()} />;
  if (data === undefined) return <PageSkeleton variant="detail" />;

  const started = data.gameState !== 'SCHEDULED';
  const teamMember = data.viewerRole === 'TEAM_MANAGER' || data.viewerRole === 'TEAM_MEMBER';
  const joined = data.participants.filter((row) => row.joinedAfterFixtureCreated);
  const events = history.data?.events;
  const historyShown = started || historyOpen;
  const pendingExcludes = changes.filter((change) => change.op === 'EXCLUDE').length;
  const pendingRevokes = changes.filter((change) => change.op === 'REVOKE').length;
  // 등번호 칸은 팀장·매니저의 편집 목록에서만 버튼이다. 참가 명단이 없는 팀은 칸을 눌러도 입력 대신 이유를 안내한다.
  // 시작한 경기는 편집 목록 자체가 없어 번호가 읽기 전용이고, 그 이유는 아래 `jerseyLocked` 가 말한다.
  // 잠기거나 제출 마감이 지난 참가 명단은 저장이 409 라 칸을 열지 않는다(`jerseyEditable`).
  const jerseyPressable =
    !managerNavigation &&
    data.viewerRole === 'TEAM_MANAGER' &&
    ((data.jerseyRegistrationId !== null && data.jerseyEditable) || data.baseSource === 'TEAM_MEMBERS');
  const jerseyLocked = started && data.viewerRole === 'TEAM_MANAGER' && data.baseSource === 'REGISTRATION';
  const jerseyTarget = jersey === null ? null : (data.base.find((row) => row.userId === jersey.userId) ?? null);
  const competitionNoun = data.competitionKind === 'LEAGUE' ? '리그' : '대회';
  const selectionPlayers = [...data.participants, ...data.excluded].sort(compareRosterPlayers);
  const excludedIds = new Set(data.excluded.map((row) => row.userId));

  // 통합 명단에서 GK는 참가 선수 탭이 맡지만, 그 탭은 팀 전용이다. 팀원이 아닌 운영진은 여기서 바로 GK를 정한다.
  const goalkeeperInPlayersTab = managerNavigation !== null && (data.viewerRole === 'TEAM_MANAGER' || data.viewerRole === 'TEAM_MEMBER');

  function goalkeeperControl(row: { userId: string; displayName: string; goalkeeper: boolean }) {
    const checked = goalkeepers[row.userId] ?? row.goalkeeper;
    if (goalkeeperInPlayersTab) return <span className="tm-text-caption" style={{ minWidth: 44, textAlign: 'center' }}>{checked ? 'GK' : ''}</span>;
    return canEdit && data?.goalkeeperEditable !== false ? (
      <Button
        variant={checked ? 'primary' : 'outline'}
        size="sm"
        style={{ minWidth: 'var(--size-control-md)', padding: '0 var(--spacing-2)' }}
        aria-label={checked ? row.displayName + ', 골키퍼 지정 해제' : row.displayName + ' 골키퍼로 지정'}
        aria-pressed={checked}
        disabled={batch.isPending || data?.legacyLineupPending}
        onClick={() => {
          setNotice(null);
          setGoalkeepers((current) => ({ ...current, [row.userId]: !(current[row.userId] ?? row.goalkeeper) }));
        }}
      >
        GK
      </Button>
    ) : row.goalkeeper ? <span className="tm-text-caption">GK</span> : null;
  }

  const historySection = historyShown ? (
    <Card pad={16}>
      <h2
        ref={historyHeadingRef}
        tabIndex={-1}
        className="tm-text-body-lg"
        style={{ fontWeight: 700, margin: '0 0 4px', outline: 'none' }}
      >
        변경 기록
      </h2>
      {history.isError ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            변경 기록을 불러오지 못했어요.
          </p>
          <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
            다시 불러오기
          </Button>
        </div>
      ) : events === undefined ? (
        <p className="tm-text-caption" style={{ margin: 0 }}>
          변경 기록을 불러오는 중이에요.
        </p>
      ) : (
        <GameRosterHistoryList events={events} />
      )}
    </Card>
  ) : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        // 아래 고정 저장 바(.tm-fixed-cta)는 안전영역만큼 커진다 — 여백도 같이 늘린다.
        padding: `16px var(--v1-shell-page-x) ${canEdit && !managerNavigation ? 'calc(112px + var(--v1-shell-safe-bottom))' : '16px'}`,
      }}
    >
      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0, overflowWrap: 'anywhere' }}>
            {data.opponentName === null ? GAME_ROSTER_TITLE : `vs ${data.opponentName}`}
          </h1>
          <StateBadge view={data} />
        </div>
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          {started
            ? '경기가 시작돼 명단을 바꿀 수 없어요.'
            : `${formatTournamentDateTimeShort(data.deadline) ?? '경기'} 시작 전까지 ${canEdit ? '바꿀 수 있어요.' : '명단이 바뀔 수 있어요.'}`}
          {data.baseSource === 'TEAM_MEMBERS' ? ' 참가 명단이 없어 팀원 전체가 기준이에요.' : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {started ? null : (
            <button type="button" className="tm-section-action" onClick={openHistory} style={linkButtonStyle}>
              변경 기록{events === undefined ? '' : ` ${events.length}건`}
              <ChevronRightIcon size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
          {teamMember ? (
            <Link className="tm-section-action" href={`/teams/${teamId}#${TEAM_UPCOMING_GAMES_ANCHOR}`} style={linkButtonStyle}>
              우리 팀 다른 경기
              <ChevronRightIcon size={14} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </Card>

      {started ? (
        <AlertBanner tone="info" message="현장 변동은 운영진에게 알려 주세요. 경기 중 바뀐 출전은 운영진이 결과 정정으로 고쳐요." />
      ) : !canEdit ? (
        <AlertBanner
          tone="info"
          message={
            data.viewerRole === 'TEAM_MEMBER'
              ? '명단은 팀장·매니저가 바꿀 수 있어요. 빠져야 하면 팀장에게 알려 주세요.'
              : '이 명단은 볼 수만 있어요.'
          }
        />
      ) : null}
      {data.legacyLineupPending ? (
        <AlertBanner
          tone="warning"
          message="예전에 저장한 참석명단이 아직 경기 기록에 쓰이고 있어요. 여기서 바꾼 내용은 기록되고, 옮기는 작업이 끝나면 경기 명단에 반영돼요."
        />
      ) : null}
      {joined.length > 0 ? (
        <AlertBanner
          tone="info"
          message={`${joined.map((row) => row.displayName).join(', ')} 선수가 참가 명단에 추가돼 이 경기 출전에 들어갔어요.`}
        />
      ) : null}
      {notice !== null ? <AlertBanner tone={notice.tone} message={notice.message} /> : null}

      {started ? historySection : null}

      <RosterSection
        title={`출전 ${data.participants.length - pendingExcludes + pendingRevokes}명`}
        sub={
          canEdit && selectionPlayers.length > 0 ? (
            <>
              {GAME_ROSTER_PLAYING_HINT}
              <br />{GAME_ROSTER_SCOPE}
              <br />{goalkeeperInPlayersTab ? '번호·GK는 참가 선수 탭의 공통 설정이에요.' : data.goalkeeperEditable === false ? 'GK는 팀장·매니저와 대회 운영진이 관리해요.' : `GK는 ${competitionNoun} 공통 설정이에요. 여러 명을 지정할 수 있고, 시작 전 경기에도 반영돼요.`}
              {!managerNavigation && data.jerseyRegistrationId !== null ? (
                <>
                  <br />
                  {data.jerseyEditable
                    ? `등번호도 ${competitionNoun} 참가 명단에 공통으로 저장돼요. 번호 칸을 눌러 등록해 주세요.`
                    : `${competitionNoun} 참가 명단이 마감돼 번호를 바꿀 수 없어요. 운영진에게 문의해 주세요.`}
                </>
              ) : null}
            </>
          ) : jerseyLocked ? (
            '경기가 시작돼 이 경기의 번호는 바꿀 수 없어요.'
          ) : undefined
        }
        action={
          canEdit && data.excluded.length > 0 ? (
            <Button variant="ghost" size="sm" disabled={batch.isPending} onClick={() => void resetToRegistration(data)}>
              참가 명단대로
            </Button>
          ) : null
        }
      >
        {managerNavigation ? <RosterPlayerColumns action="출전" /> : null}
        {selectionPlayers.length === 0 ? (
          <p className="tm-text-caption" style={{ margin: 0 }}>
            출전하는 선수가 없어요.
          </p>
        ) : canEdit || managerNavigation ? (
          <ul style={listStyle}>
            {selectionPlayers.map((row) => {
              const entry = draft[row.userId];
              const leaving = entry?.op === 'EXCLUDE' ? entry : null;
              const wasExcluded = excludedIds.has(row.userId);
              const playing = entry === undefined ? !wasExcluded : entry.op === 'REVOKE';
              return (
                <li key={row.userId} style={rowItemStyle}>
                  <GameRosterPlayerRow
                    jerseyNumber={row.jerseyNumber}
                    displayName={rosterPersonLabel(row)}
                    accountLinked={row.accountLinked}
                    status={playing ? 'PARTICIPATING' : 'EXCLUDED'}
                    reason={playing ? null : leaving?.reason ?? ('reason' in row ? row.reason : null)}
                    actorRole={!playing && 'actor' in row ? row.actor.role : undefined}
                    note={leaving
                      ? '저장하면 이번 경기에서 빠져요'
                      : entry?.op === 'REVOKE'
                        ? '저장하면 출전으로 돌아가요'
                        : 'joinedAfterFixtureCreated' in row && row.joinedAfterFixtureCreated ? '새로 추가' : null}
                    onJerseyPress={jerseyPressable ? () => setJersey({ userId: row.userId, open: true }) : undefined}
                    trailing={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-1)' }}>
                        {goalkeeperControl(row)}
                        <GameRosterPlayingCheckbox
                          displayName={row.displayName}
                          playing={playing}
                          disabled={batch.isPending || !canEdit}
                          onChange={(next) => setEntry(row.userId,
                            next === !wasExcluded ? null : next ? { op: 'REVOKE' } : { op: 'EXCLUDE', reason: null },
                          )}
                        />
                      </div>
                    }
                  />
                  {leaving ? (
                    <GameRosterReasonChips
                      playerName={row.displayName}
                      value={leaving.reason}
                      onChange={(reason) => setEntry(row.userId, { op: 'EXCLUDE', reason })}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul style={{ ...listStyle, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.participants.map((row) => (
              <li key={row.userId} className="tm-badge tm-badge-grey">
                {row.jerseyNumber === null ? row.displayName : `${row.jerseyNumber} ${row.displayName}`}
                {row.goalkeeper ? " · GK" : null}
              </li>
            ))}
          </ul>
        )}
        {managerNavigation ? <Button variant="ghost" size="sm" onClick={managerNavigation.showPlayers}>선수 추가·번호·GK 관리</Button> : <RegistrationRosterEntry view={data} variant="block" />}
      </RosterSection>

      {!canEdit && !managerNavigation && data.excluded.length > 0 ? (
        <RosterSection title={`이번 경기 빠짐 ${data.excluded.length}명`}>
          <ul style={listStyle}>
            {data.excluded.map((row) => {
              return (
                <li key={row.userId} style={rowItemStyle}>
                  <GameRosterPlayerRow
                    jerseyNumber={row.jerseyNumber}
                    displayName={rosterPersonLabel(row)}
                    accountLinked={row.accountLinked}
                    extraBadges={goalkeeperControl(row)}
                    status="EXCLUDED"
                    reason={row.reason}
                    actorRole={row.actor.role}
                  />
                </li>
              );
            })}
          </ul>
        </RosterSection>
      ) : null}

      {data.unavailable.length > 0 ? (
        <RosterSection
          title={`결장 ${data.unavailable.length}명`}
          sub="결장 기간 안의 경기에서는 자동으로 빠져요. 기간은 여기서 바꿀 수 없고, 팀 멤버 관리에서 바꿔요."
        >
          <ul style={listStyle}>
            {data.unavailable.map((row) => (
              <li key={row.userId} style={rowItemStyle}>
                <GameRosterPlayerRow
                  jerseyNumber={row.jerseyNumber}
                  displayName={rosterPersonLabel(row)}
                  accountLinked={row.accountLinked}
                  extraBadges={goalkeeperControl(row)}
                  status="UNAVAILABLE"
                  reason={row.reason}
                  actorRole={row.actor.role}
                  note={unavailabilityRange(row.startsAt, row.endsAt)}
                />
              </li>
            ))}
          </ul>
        </RosterSection>
      ) : null}

      {data.suspended.length > 0 ? (
        <RosterSection
          title={`출전정지 ${data.suspended.length}명`}
          sub="대회 규정에 따라 자동으로 빠져요. 팀에서 되돌릴 수 없어요."
        >
          <ul style={listStyle}>
            {data.suspended.map((row) => (
              <li key={row.userId} style={rowItemStyle}>
                <GameRosterPlayerRow
                  jerseyNumber={row.jerseyNumber}
                  displayName={rosterPersonLabel(row)}
                  accountLinked={row.accountLinked}
                  extraBadges={goalkeeperControl(row)}
                  status="SUSPENDED"
                  remainingMatches={row.remainingMatches}
                  note={row.reason}
                />
              </li>
            ))}
          </ul>
        </RosterSection>
      ) : null}

      {started ? null : historySection}

      {canEdit ? (
        <div className={managerNavigation ? undefined : 'tm-fixed-cta'}>
          <Button
            variant="primary"
            size="lg"
            block
            loading={batch.isPending}
            disabled={!dirty}
            onClick={() => void submit(changes, '명단을 저장했어요.')}
          >
            {ROSTER_SAVE_LABEL}{dirty ? ` (${changes.length}건)` : ''}
          </Button>
        </div>
      ) : null}
      {jersey !== null && jerseyTarget !== null ? (
        <GameRosterJerseySheet
          open={jersey.open}
          onClose={() => setJersey({ ...jersey, open: false })}
          teamId={teamId}
          competitionId={data.competitionId}
          competitionKind={data.competitionKind}
          registrationId={data.jerseyRegistrationId}
          player={jerseyTarget}
          teammates={data.base}
          next={nextPlayerWithoutJersey(data.participants, jerseyTarget.userId)}
          onSelect={(userId) => setJersey({ userId, open: true })}
          onStale={() => void roster.refetch()}
        />
      ) : null}
      {ConfirmModal}
      {UnsavedChangesModal}
    </div>
  );
}

function StateBadge({ view }: { view: V1GameRosterView }) {
  return (
    <span className={`tm-badge tm-badge-sm ${view.editable ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
      {gameRosterEditStateLabel(view)}
    </span>
  );
}

function RosterSection({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const unified = useContext(RosterManagerNavigation);
  const content = <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
          {title}
        </h2>
        {action ?? null}
      </div>
      {sub !== undefined ? (
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          {sub}
        </p>
      ) : null}
      <div style={{ marginTop: 8 }}>{children}</div>
  </>;
  return unified ? <section>{content}</section> : <Card pad={16}>{content}</Card>;
}

function RosterLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = error instanceof V1ApiError ? error.statusCode : null;
  // 서버는 "이 팀이 뛰지 않는 경기"·친선·명단 없음을 같은 404 로 준다 — 셋을 함께 안내한다.
  if (status === 404) {
    return (
      <EmptyState
        title="이 경기는 경기 명단이 없어요"
        sub="이 팀이 뛰는 대회·리그 경기가 아니거나, 대진이 바뀌었거나, 참가 신청이 아직 확정되지 않았어요. 친선 경기는 참석명단에서 출전 선수를 정해요."
      />
    );
  }
  if (status === 403) {
    return <ErrorState title="이 경기 명단은 볼 수 없어요" message="경기 명단은 그 팀 팀원과 운영자만 볼 수 있어요." />;
  }
  return (
    <ErrorState
      title="경기 명단을 불러오지 못했어요"
      message={gameRosterErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
      onRetry={onRetry}
    />
  );
}

function unavailabilityRange(startsAt: string, endsAt: string): string {
  const range = formatExclusiveEndRangeShort(startsAt, endsAt);
  return range === null ? '결장 기간' : `${range} 결장`;
}

const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };
const rowItemStyle: React.CSSProperties = { borderBottom: '1px solid var(--border)' };
const linkButtonStyle: React.CSSProperties = { display: 'inline-flex', gap: 2, paddingLeft: 0 };
