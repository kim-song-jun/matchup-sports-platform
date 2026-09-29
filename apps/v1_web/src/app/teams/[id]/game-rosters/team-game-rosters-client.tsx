'use client';

import { useMemo, useState } from 'react';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useUnsavedChangesGuard } from '@/components/v1-ui/use-unsaved-changes-guard';
import { MemberUnavailabilitySheet } from '@/components/game-roster/member-unavailability-sheet';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import {
  useV1ApplyGameRosterBatch,
  useV1TeamGameRosters,
  type V1TeamRosterMatrixGame,
  type V1TeamRosterMatrixPlayer,
} from '@/hooks/use-v1-game-roster';
import { V1ApiError } from '@/lib/api-client';
import { formatKstMonthDaySlash, formatKstTime } from '@/lib/date-utils';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { gameRosterReasonLabel, gameRosterStatusLabel } from '@/lib/v1-status-labels';
import {
  batchFailureRecovery,
  cellKey,
  draftToBatchChanges,
  effectiveStatus,
  isToggleable,
  liveDraft,
  toggleCell,
  type TeamRosterDraft,
} from '@/components/game-roster/game-roster-matrix-draft';

type Notice = { tone: 'info' | 'error'; message: string };

/**
 * 경기 명단 관리(Task 179 팀 B) — 선수 × 다가오는 대회·리그 경기.
 * 칩을 누르면 그 경기에서 빠지고(다시 누르면 되돌림), 변경을 모아 팀 일괄 API 한 번으로 저장한다.
 * 결장·출전정지 칸은 계산 결과라 누를 수 없다. 친선은 참석명단 방식이라 여기 없다.
 */
export function TeamGameRostersClient({ teamId }: { teamId: string }) {
  const matrix = useV1TeamGameRosters(teamId);
  const authMe = useV1AuthMe();
  const batch = useV1ApplyGameRosterBatch(teamId);
  const [draft, setDraft] = useState<TeamRosterDraft>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sheetTarget, setSheetTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const data = matrix.data;
  const changes = useMemo(() => (data === undefined ? [] : draftToBatchChanges(draft, data)), [draft, data]);
  const shownDraft = useMemo(() => (data === undefined ? {} : liveDraft(draft, data)), [draft, data]);
  const dirty = changes.length > 0;
  const { UnsavedChangesModal } = useUnsavedChangesGuard(dirty);

  if (matrix.isError) return <MatrixLoadError error={matrix.error} onRetry={() => void matrix.refetch()} />;
  if (data === undefined) return <PageSkeleton variant="detail" />;

  const viewerUserId = authMe.data?.user?.id ?? null;
  // 팀장·매니저는 경기가 모두 시작됐어도 결장 기간을 등록할 수 있다. 플랫폼 운영자는 표만으로
  // 쓰기 권한(지원 계정은 읽기 전용)을 구분할 수 없어 편집 가능한 경기가 있을 때만 연다.
  const canManageUnavailability = data.viewerRole === 'TEAM_MANAGER' || data.games.some((game) => game.editable);

  async function save() {
    setNotice(null);
    try {
      await batch.mutateAsync(changes);
      setDraft({});
      setNotice({ tone: 'info', message: `변경 ${changes.length}건을 저장했어요.` });
    } catch (caught) {
      const recovery = batchFailureRecovery(caught);
      setDraft(recovery.nextDraft);
      if (recovery.refetch) void matrix.refetch();
      setNotice({ tone: 'error', message: recovery.message });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: `16px var(--v1-shell-page-x) ${dirty || data.games.some((g) => g.editable) ? 112 : 16}px`,
      }}
    >
      <p className="tm-text-caption" style={{ margin: 0 }}>
        다가오는 대회·리그 경기 {data.games.length}개 · 칩을 누르면 그 경기에서 빠져요
      </p>
      {notice !== null ? <AlertBanner tone={notice.tone} message={notice.message} /> : null}
      {data.games.length === 0 || data.players.length === 0 ? (
        <EmptyState
          title={data.games.length === 0 ? '다가오는 대회·리그 경기가 없어요' : '참가 명단이 확정된 경기가 없어요'}
          sub="대진이 잡히면 여기서 경기마다 빠질 선수를 정할 수 있어요. 친선 매치는 참석명단에서 따로 관리해요."
        />
      ) : (
        <>
          <ul style={playerGridStyle} aria-label="선수별 경기 출전">
            {data.players.map((player) => (
              <li key={player.userId}>
                <PlayerCard
                  player={player}
                  games={data.games}
                  draft={shownDraft}
                  onToggle={(index) => {
                    setNotice(null);
                    const cell = player.cells[index];
                    if (cell !== undefined) setDraft((current) => toggleCell(liveDraft(current, data), cell, player.userId));
                  }}
                  onOpenUnavailability={
                    canManageUnavailability && player.userId !== viewerUserId
                      ? () => {
                          setSheetTarget({ userId: player.userId, displayName: player.displayName });
                          setSheetOpen(true);
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ul>
          <p className="tm-text-caption" style={{ margin: 0 }}>
            친선 매치는 참석명단에서 따로 관리해요.
          </p>
        </>
      )}
      {data.games.some((game) => game.editable) ? (
        <div className="tm-fixed-cta">
          <Button variant="primary" size="lg" block loading={batch.isPending} disabled={!dirty} onClick={() => void save()}>
            {dirty ? `변경 ${changes.length}건 저장` : '저장'}
          </Button>
        </div>
      ) : null}
      {sheetTarget !== null ? (
        <MemberUnavailabilitySheet
          open={sheetOpen}
          teamId={teamId}
          userId={sheetTarget.userId}
          displayName={sheetTarget.displayName}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
      {UnsavedChangesModal}
    </div>
  );
}

function PlayerCard({
  player,
  games,
  draft,
  onToggle,
  onOpenUnavailability,
}: {
  player: V1TeamRosterMatrixPlayer;
  games: V1TeamRosterMatrixGame[];
  draft: TeamRosterDraft;
  onToggle: (index: number) => void;
  onOpenUnavailability: (() => void) | null;
}) {
  const summary = playerSummary(player, draft);
  const labels = gameChipLabels(games);
  return (
    <Card pad={16} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="tm-text-label" style={{ minWidth: 0, flex: '1 1 auto', overflowWrap: 'anywhere' }}>
          {player.displayName}
        </span>
        {summary === null ? (
          <span className="tm-text-caption">전부 출전</span>
        ) : (
          <span className={`tm-badge tm-badge-sm ${summary.tone === 'red' ? 'tm-badge-red' : 'tm-badge-grey'}`}>{summary.text}</span>
        )}
      </div>
      <div role="group" aria-label={`${player.displayName} 경기별 출전`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {games.map((game, index) => {
          const cell = player.cells[index];
          if (cell === undefined) return null;
          const status = effectiveStatus(cell, draft, player.userId);
          const toggleable = isToggleable(game, cell);
          const changed = cellKey(game.gameId, player.userId) in draft;
          const label = labels[index];
          const playing = status === 'PARTICIPATING';
          return (
            <button
              key={game.gameId}
              type="button"
              className="tm-chip"
              aria-pressed={toggleable ? playing : undefined}
              disabled={!toggleable}
              onClick={() => onToggle(index)}
              aria-label={chipAriaLabel(label, status, cell.remainingMatches, toggleable, changed)}
              style={{
                ...(playing ? null : offChipStyle),
                ...(changed ? changedChipStyle : null),
              }}
            >
              {label}
              {playing ? null : <span aria-hidden="true"> · {gameRosterStatusLabel(status)}</span>}
            </button>
          );
        })}
      </div>
      {onOpenUnavailability !== null ? (
        <Button variant="neutral" size="sm" onClick={onOpenUnavailability} aria-label={`${player.displayName} 결장 기간`}>
          결장 기간
        </Button>
      ) : null}
    </Card>
  );
}

/** 카드 오른쪽 배지 — 출전정지가 가장 무겁고, 그다음 결장, 빠짐 순. 모두 출전이면 null. */
function playerSummary(player: V1TeamRosterMatrixPlayer, draft: TeamRosterDraft): { text: string; tone: 'red' | 'grey' } | null {
  const suspended = player.cells.find((cell) => cell.status === 'SUSPENDED');
  if (suspended !== undefined) return { text: gameRosterStatusLabel('SUSPENDED', suspended.remainingMatches), tone: 'red' };
  const unavailable = player.cells.find((cell) => cell.status === 'UNAVAILABLE');
  if (unavailable !== undefined) {
    return { text: gameRosterReasonLabel(unavailable.reason) ?? gameRosterStatusLabel('UNAVAILABLE'), tone: 'grey' };
  }
  const excluded = player.cells.filter((cell) => effectiveStatus(cell, draft, player.userId) === 'EXCLUDED');
  if (excluded.length === 0) return null;
  const reason = excluded.map((cell) => gameRosterReasonLabel(cell.reason)).find((label) => label !== null) ?? null;
  return { text: `${reason === null ? '' : `${reason} · `}${excluded.length}경기 빠짐`, tone: 'grey' };
}

/** 같은 날 같은 상대 경기가 둘 이상이면 시각을 붙여 칩을 가른다(대회 하루 2경기). */
function gameChipLabels(games: readonly V1TeamRosterMatrixGame[]): string[] {
  const parts = games.map((game) => ({
    day: formatKstMonthDaySlash(game.scheduledAt) ?? '날짜 미정',
    opponent: game.opponentName ?? game.competitionTitle ?? '상대 미정',
  }));
  return games.map((game, index) => {
    const { day, opponent } = parts[index];
    const twin = parts.some((other, j) => j !== index && other.day === day && other.opponent === opponent);
    return twin && game.scheduledAt !== null ? `${day} ${formatKstTime(game.scheduledAt)} ${opponent}` : `${day} ${opponent}`;
  });
}

function chipAriaLabel(label: string, status: string, remaining: number | null, toggleable: boolean, changed: boolean): string {
  const now = gameRosterStatusLabel(status, remaining);
  const hint = !toggleable ? '' : status === 'PARTICIPATING' ? ', 누르면 빠져요' : ', 누르면 출전으로 돌아가요';
  return `${label} ${now}${changed ? '(저장 전)' : ''}${hint}`;
}

function MatrixLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof V1ApiError && error.statusCode === 403) {
    return <ErrorState title="팀장·매니저만 볼 수 있어요" message="경기 명단 관리는 팀장·매니저가 해요. 빠져야 하면 팀장에게 알려 주세요." />;
  }
  return (
    <ErrorState
      title="경기 명단을 불러오지 못했어요"
      message={gameRosterErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
      onRetry={onRetry}
    />
  );
}

const playerGridStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
  gap: 12,
};
// 빠진 칩은 색만이 아니라 "· 빠짐" 글자와 취소선으로도 구분한다. 글자는 grey100 위 AA 를 넘는 grey700.
const offChipStyle: React.CSSProperties = {
  background: 'var(--grey100)',
  color: 'var(--grey700)',
  textDecoration: 'line-through',
};
// 저장 전 칩은 점선 테두리 — outline 은 .tm-chip:focus-visible 포커스 링 자리라 쓰지 않는다.
// 테두리가 1px 두꺼워진 만큼 좌우 여백을 줄여 칩 폭을 그대로 둔다.
const changedChipStyle: React.CSSProperties = {
  borderWidth: 2,
  borderStyle: 'dashed',
  borderColor: 'var(--blue500)',
  paddingInline: 11,
};
