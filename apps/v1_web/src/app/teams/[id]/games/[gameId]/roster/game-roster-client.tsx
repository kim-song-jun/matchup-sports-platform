'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
} from '@/components/game-roster/game-roster-player-row';
import { GameRosterHistoryList } from '@/components/game-roster/game-roster-history';
import { GameRosterReasonChips } from '@/components/game-roster/game-roster-reason-chips';
import { TEAM_UPCOMING_GAMES_ANCHOR } from '@/components/teams/team-upcoming-games-card';
import {
  useV1ApplyGameRosterBatch,
  useV1GameRoster,
  useV1GameRosterAdjustments,
  type V1GameRosterBatchChange,
  type V1GameRosterView,
} from '@/hooks/use-v1-game-roster';
import { V1ApiError } from '@/lib/api-client';
import { gameRosterErrorMessage, isStaleGameRosterWrite } from '@/lib/game-roster-errors';
import { gameRosterEditStateLabel } from '@/lib/v1-status-labels';
import { formatExclusiveEndRangeShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { draftToChanges, resetToRegistrationChanges, type GameRosterDraft } from '@/components/game-roster/game-roster-draft';
import { useGameRosterSide } from '@/components/game-roster/use-game-roster-side';

type Notice = { tone: 'info' | 'error'; message: string };

/**
 * 대회·리그 경기 한 팀의 출전 명단(Task 178 ②④).
 * 경기 명단 = 참가 명단 − 이번 경기 빠짐 − 결장 − 출전정지. 여기서 바꾸는 건 "이번 경기 빠짐"뿐이고,
 * 변경은 모아 두었다가 한 번에 저장한다(팀 일괄 API — 한 트랜잭션이라 일부만 저장되지 않는다).
 */
export function GameRosterClient({ teamId, gameId }: { teamId: string; gameId: string }) {
  const side = useGameRosterSide(teamId, { gameId });

  if (side.status === 'loading') return <PageSkeleton variant="detail" />;
  if (side.status === 'friendly') {
    return (
      <EmptyState
        title="친선 경기는 참석명단으로 관리해요"
        sub="대회·리그 경기만 경기 명단을 조정해요. 친선 경기는 참석명단에서 출전 선수를 정해 주세요."
        cta={side.teamMatchId === null ? undefined : '참석명단 열기'}
        ctaHref={side.teamMatchId === null ? undefined : `/team-matches/${side.teamMatchId}/lineup`}
      />
    );
  }
  if (side.status === 'not-found') {
    return (
      <ErrorState
        title="이 경기에서 우리 팀을 찾을 수 없어요"
        message="대진이 바뀌었을 수 있어요. 팀 상세의 다가오는 경기에서 다시 들어와 주세요."
      />
    );
  }
  if (side.status === 'error') {
    const forbidden = side.error instanceof V1ApiError && side.error.statusCode === 403;
    return (
      <ErrorState
        title={forbidden ? '이 경기 명단은 볼 수 없어요' : '경기 정보를 불러오지 못했어요'}
        message={
          forbidden
            ? '시작된 대회 경기의 명단은 팀장·매니저와 운영자가 볼 수 있어요.'
            : '잠시 후 다시 시도해 주세요.'
        }
      />
    );
  }
  return (
    <GameRosterScreen teamId={teamId} gameId={gameId} sideId={side.sideId} opponentName={side.opponentName} />
  );
}

function GameRosterScreen({
  teamId,
  gameId,
  sideId,
  opponentName,
}: {
  teamId: string;
  gameId: string;
  sideId: string;
  opponentName: string | null;
}) {
  const roster = useV1GameRoster(gameId, sideId);
  const history = useV1GameRosterAdjustments(gameId, sideId);
  const batch = useV1ApplyGameRosterBatch(teamId);
  const { confirm, ConfirmModal } = useConfirm();
  const [draft, setDraft] = useState<GameRosterDraft>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);

  const data = roster.data;
  const changes = useMemo(() => (data === undefined ? [] : draftToChanges(draft, data)), [draft, data]);
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
      setNotice({ tone: 'info', message: successMessage });
    } catch (caught) {
      // 화면이 낡은 거절(시작·명단·대진·권한 변경)이면 최신으로 다시 받고, 이미 무의미한 초안은 버린다.
      if (isStaleGameRosterWrite(caught)) {
        setDraft({});
        void roster.refetch();
        void history.refetch();
      }
      setNotice({
        tone: 'error',
        message: gameRosterErrorMessage(caught, '명단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
      });
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

  if (roster.isError) return <RosterLoadError error={roster.error} onRetry={() => void roster.refetch()} />;
  if (data === undefined) return <PageSkeleton variant="detail" />;

  const started = data.gameState !== 'SCHEDULED';
  const teamMember = data.viewerRole === 'TEAM_MANAGER' || data.viewerRole === 'TEAM_MEMBER';
  const joined = data.participants.filter((row) => row.joinedAfterFixtureCreated);
  const events = history.data?.events;
  const historyShown = started || historyOpen;
  const pendingExcludes = changes.filter((change) => change.op === 'EXCLUDE').length;
  const pendingRevokes = changes.length - pendingExcludes;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: canEdit ? 112 : 16 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0, overflowWrap: 'anywhere' }}>
            {opponentName === null ? '경기 명단' : `vs ${opponentName}`}
          </h1>
          <StateBadge view={data} />
        </div>
        <p className="tm-text-caption" style={{ margin: '4px 0 0' }}>
          {started
            ? '경기가 시작돼 명단을 바꿀 수 없어요.'
            : `${formatTournamentDateTimeShort(data.deadline) ?? '경기'} 시작 전까지 바꿀 수 있어요.`}
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
        sub={canEdit && data.participants.length > 0 ? GAME_ROSTER_PLAYING_HINT : undefined}
        action={
          canEdit && data.excluded.length > 0 ? (
            <Button variant="ghost" size="sm" disabled={batch.isPending} onClick={() => void resetToRegistration(data)}>
              참가 명단대로
            </Button>
          ) : null
        }
      >
        {data.participants.length === 0 ? (
          <p className="tm-text-caption" style={{ margin: 0 }}>
            출전하는 선수가 없어요.
          </p>
        ) : canEdit ? (
          <ul style={listStyle}>
            {data.participants.map((row) => {
              const entry = draft[row.userId];
              const leaving = entry?.op === 'EXCLUDE' ? entry : null;
              return (
                <li key={row.userId} style={rowItemStyle}>
                  <GameRosterPlayerRow
                    jerseyNumber={row.jerseyNumber}
                    displayName={row.displayName}
                    accountLinked={row.accountLinked}
                    status={leaving ? 'EXCLUDED' : 'PARTICIPATING'}
                    reason={leaving?.reason ?? null}
                    note={leaving ? '저장하면 이번 경기에서 빠져요' : row.joinedAfterFixtureCreated ? '새로 추가' : null}
                    trailing={
                      <GameRosterPlayingCheckbox
                        displayName={row.displayName}
                        playing={leaving === null}
                        onChange={(playing) => setEntry(row.userId, playing ? null : { op: 'EXCLUDE', reason: null })}
                      />
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
              </li>
            ))}
          </ul>
        )}
      </RosterSection>

      {data.excluded.length > 0 ? (
        <RosterSection title={`이번 경기 빠짐 ${data.excluded.length}명`}>
          <ul style={listStyle}>
            {data.excluded.map((row) => {
              const returning = draft[row.userId]?.op === 'REVOKE';
              return (
                <li key={row.userId} style={rowItemStyle}>
                  <GameRosterPlayerRow
                    jerseyNumber={row.jerseyNumber}
                    displayName={row.displayName}
                    accountLinked={row.accountLinked}
                    status="EXCLUDED"
                    reason={row.reason}
                    actorRole={row.actor.role}
                    note={returning ? '저장하면 출전으로 돌아가요' : null}
                    trailing={
                      canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEntry(row.userId, returning ? null : { op: 'REVOKE' })}
                          aria-label={`${row.displayName} ${returning ? '되돌리기 취소' : '출전으로 되돌리기'}`}
                        >
                          {returning ? '되돌리기 취소' : '되돌리기'}
                        </Button>
                      ) : undefined
                    }
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
                  displayName={row.displayName}
                  accountLinked={row.accountLinked}
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
                  displayName={row.displayName}
                  accountLinked={row.accountLinked}
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
        <div className="tm-fixed-cta">
          <Button
            variant="primary"
            size="lg"
            block
            loading={batch.isPending}
            disabled={!dirty}
            onClick={() => void submit(changes, '명단을 저장했어요.')}
          >
            {dirty ? `저장 (${changes.length}건)` : '저장'}
          </Button>
        </div>
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
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card pad={16}>
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
    </Card>
  );
}

function RosterLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = error instanceof V1ApiError ? error.statusCode : null;
  if (status === 404) {
    return (
      <EmptyState
        title="이 경기는 명단을 조정할 수 없어요"
        sub="참가 신청이 확정되지 않았거나 상대가 아직 정해지지 않은 경기예요."
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
