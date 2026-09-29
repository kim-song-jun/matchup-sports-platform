'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { MemberUnavailabilitySheet } from '@/components/game-roster/member-unavailability-sheet';
import { useV1AdminMe } from '@/hooks/use-v1-api';
import {
  useV1AdminRegistrationGameRosters,
  useV1ApplyGameRosterBatch,
  type V1TeamRosterCell,
  type V1TeamRosterMatrixGame,
  type V1TeamRosterMatrixPlayer,
} from '@/hooks/use-v1-game-roster';
import { extractErrorCode } from '@/lib/error-message';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import { gameRosterActorRoleLabel, gameRosterReasonLabel, gameRosterStatusLabel } from '@/lib/v1-status-labels';
import {
  cellKey,
  draftToBatchChanges,
  dropGamesFromDraft,
  effectiveStatus,
  isToggleable,
  startedGameIds,
  toggleCell,
  type TeamRosterDraft,
} from './game-roster-matrix-draft';

type Notice = { tone: 'info' | 'error'; message: string };

/**
 * 어드민 참가 신청의 팀 행 펼침(Task 178 어드민) — 선수 × 그 대회·리그의 시작 전 경기.
 * 칸을 누르면 그 경기에서 빼거나 되돌리고, 모아서 팀 일괄 API 한 번으로 저장한다(기록엔 운영자로 남는다).
 * 결장 기간 등록은 플랫폼 어드민만(지원 계정·대회 스태프 불가 — 서버 권한 표와 같다).
 */
export function AdminRegistrationGameRosters({
  tournamentId,
  registrationId,
  teamName,
  correctionHref,
}: {
  tournamentId: string;
  registrationId: string;
  teamName: string;
  correctionHref: string;
}) {
  const matrix = useV1AdminRegistrationGameRosters(tournamentId, registrationId);
  const adminMe = useV1AdminMe();
  const data = matrix.data;
  const batch = useV1ApplyGameRosterBatch(data?.teamId ?? '');
  const [draft, setDraft] = useState<TeamRosterDraft>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sheetUserId, setSheetUserId] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const pickerId = useId();

  const changes = useMemo(() => (data === undefined ? [] : draftToBatchChanges(draft, data)), [draft, data]);

  if (matrix.isError) {
    return (
      <div role="alert" className="rounded-xl bg-[var(--red50)] p-4 text-[length:var(--font-size-label)] text-[var(--red700)]">
        <p>{gameRosterErrorMessage(matrix.error, '경기별 명단을 불러오지 못했어요.')}</p>
        <button
          type="button"
          onClick={() => void matrix.refetch()}
          className="mt-3 min-h-[44px] rounded-lg bg-[var(--card-surface)] px-4 font-semibold text-[var(--red700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (data === undefined) {
    return <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">경기별 명단을 불러오는 중…</p>;
  }

  const anyEditable = data.games.some((game) => game.editable);
  // 표에는 시작 전 경기만 온다 — 경기가 있는데 바꿀 칸이 없으면 보기 권한만 있는 계정이다(지원 계정 등).
  const usageHint = anyEditable
    ? '칸을 누르면 그 경기에서 빼거나 되돌려요 · '
    : data.games.length > 0
      ? '보기 권한만 있어 명단을 바꿀 수 없어요 · '
      : '';
  // 결장 기간은 팀의 모든 대회·리그 경기에 걸린다 — 서버가 플랫폼 어드민(지원 계정 제외)만 허용한다.
  const canRegisterUnavailability =
    data.viewerRole === 'ADMIN' && adminMe.data !== undefined && adminMe.data.adminRole !== 'support';
  const adjustedCount = data.players.reduce(
    (sum, player) => sum + player.cells.filter((cell) => cell.status === 'EXCLUDED' || cell.status === 'UNAVAILABLE').length,
    0,
  );
  const sheetPlayer = data.players.find((player) => player.userId === sheetUserId) ?? null;

  async function save() {
    setNotice(null);
    try {
      await batch.mutateAsync(changes);
      setDraft({});
      setNotice({ tone: 'info', message: `변경 ${changes.length}건을 저장했어요.` });
    } catch (caught) {
      const code = extractErrorCode(caught);
      if (code === 'LINEUP_DEADLINE_PASSED') {
        const startedIds = startedGameIds(caught);
        setDraft((current) => (startedIds.length > 0 ? dropGamesFromDraft(current, startedIds) : {}));
        void matrix.refetch();
        setNotice({
          tone: 'error',
          message: '그사이 시작된 경기가 있어 저장하지 못했어요. 그 경기 변경은 뺐으니 나머지를 다시 저장해 주세요.',
        });
        return;
      }
      if (code === 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER') void matrix.refetch();
      setNotice({ tone: 'error', message: gameRosterErrorMessage(caught, '명단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.') });
    }
  }

  return (
    <section aria-label={`${teamName} 경기별 명단`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">경기별 명단</span>
        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          다가오는 경기 {data.games.length}개 · 선수 {data.players.length}명
        </span>
        {adjustedCount > 0 ? <span className="tm-badge tm-badge-sm tm-badge-orange">조정 {adjustedCount}</span> : null}
      </div>
      {notice !== null ? <AlertBanner tone={notice.tone} message={notice.message} /> : null}
      {data.games.length === 0 || data.players.length === 0 ? (
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">
          {data.games.length === 0 ? '시작 전인 경기가 없어요.' : '참가 명단이 확정된 경기가 없어요.'}
        </p>
      ) : (
        // 데스크톱 폭 기준 표 — 좁은 화면에서는 표만 가로로 스크롤한다.
        <div className="overflow-x-auto" role="region" aria-label={`${teamName} 선수별 경기 출전 표`} tabIndex={0}>
          <table className="w-full min-w-[640px] border-collapse text-[length:var(--font-size-label)] text-[var(--text-body)]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-2 text-left text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
                  선수
                </th>
                {data.games.map((game) => (
                  <th key={game.gameId} scope="col" className="px-3 py-2 text-left text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
                    {gameColumnLabel(game)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-left text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
                  결장 기간
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.players.map((player) => (
                <tr key={player.userId}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-[var(--text-strong)]">
                    {player.displayName}
                  </th>
                  {data.games.map((game, index) => {
                    const cell = player.cells[index];
                    return (
                      <td key={game.gameId} className="px-3 py-1 align-middle">
                        {cell === undefined ? null : (
                          <RosterCell
                            game={game}
                            player={player}
                            cell={cell}
                            draft={draft}
                            onToggle={() => {
                              setNotice(null);
                              setDraft((current) => toggleCell(current, cell, player.userId));
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-middle text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                    {unavailabilitySummary(player)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {usageHint}시작된 경기는{' '}
          <Link href={correctionHref} className="font-semibold text-[var(--blue700)] underline underline-offset-2">
            결과 정정
          </Link>
          에서 고쳐요
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {canRegisterUnavailability && data.players.length > 0 ? (
            <>
              <label htmlFor={pickerId} className="sr-only">
                결장 기간을 등록할 선수
              </label>
              <select
                id={pickerId}
                value={sheetUserId}
                onChange={(event) => setSheetUserId(event.target.value)}
                className="min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">선수 선택</option>
                {data.players
                  .filter((player) => player.accountLinked)
                  .map((player) => (
                    <option key={player.userId} value={player.userId}>
                      {player.displayName}
                    </option>
                  ))}
              </select>
              <Button variant="outline" size="sm" disabled={sheetPlayer === null} onClick={() => setSheetOpen(true)}>
                결장 기간 등록
              </Button>
            </>
          ) : null}
          {anyEditable ? (
            <Button variant="primary" size="sm" loading={batch.isPending} disabled={changes.length === 0} onClick={() => void save()}>
              {changes.length > 0 ? `변경 ${changes.length}건 저장` : '저장'}
            </Button>
          ) : null}
        </div>
      </div>
      {sheetPlayer !== null ? (
        <MemberUnavailabilitySheet
          open={sheetOpen}
          teamId={data.teamId}
          userId={sheetPlayer.userId}
          displayName={sheetPlayer.displayName}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </section>
  );
}

function RosterCell({
  game,
  player,
  cell,
  draft,
  onToggle,
}: {
  game: V1TeamRosterMatrixGame;
  player: V1TeamRosterMatrixPlayer;
  cell: V1TeamRosterCell;
  draft: TeamRosterDraft;
  onToggle: () => void;
}) {
  const status = effectiveStatus(cell, draft, player.userId);
  const changed = cellKey(game.gameId, player.userId) in draft;
  const label = cellLabel(cell, status, changed);
  const content =
    status === 'PARTICIPATING' ? (
      <span>{label}</span>
    ) : status === 'NOT_IN_ROSTER' ? (
      <span className="text-[var(--text-muted)]">{label}</span>
    ) : (
      <span className={`tm-badge tm-badge-sm ${status === 'SUSPENDED' ? 'tm-badge-red' : 'tm-badge-grey'}`}>{label}</span>
    );
  if (!isToggleable(game, cell)) return content;
  const playing = status === 'PARTICIPATING';
  return (
    <button
      type="button"
      aria-pressed={playing}
      aria-label={`${player.displayName} ${gameColumnLabel(game)} ${label}, ${playing ? '누르면 빠져요' : '누르면 출전으로 돌아가요'}`}
      onClick={onToggle}
      className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      // 저장 전 칸은 점선 테두리 — 색이 아니라 패턴과 "저장 전" 글자로도 구분한다.
      style={changed ? { outline: '2px dashed var(--blue500)', outlineOffset: -2 } : undefined}
    >
      {content}
    </button>
  );
}

/** 목업 표기: "빠짐 · 부상 · 팀장", "빠짐 · 결장", "출전정지". 저장 전이면 " · 저장 전". */
function cellLabel(cell: V1TeamRosterCell, status: string, changed: boolean): string {
  const suffix = changed ? ' · 저장 전' : '';
  if (status === 'PARTICIPATING') return `출전${suffix}`;
  if (status === 'NOT_IN_ROSTER') return '명단 밖';
  if (status === 'SUSPENDED') return gameRosterStatusLabel('SUSPENDED', cell.remainingMatches);
  if (status === 'UNAVAILABLE') return '빠짐 · 결장';
  if (changed) return `빠짐${suffix}`;
  return ['빠짐', gameRosterReasonLabel(cell.reason), gameRosterActorRoleLabel(cell.actorRole)]
    .filter((part) => part !== null)
    .join(' · ');
}

function gameColumnLabel(game: V1TeamRosterMatrixGame): string {
  const when = formatTournamentDateTimeShort(game.scheduledAt) ?? '일정 미정';
  const against = game.opponentName === null ? '상대 미정' : `vs ${game.opponentName}`;
  return `${when} ${against}`;
}

/** 표에는 기간 날짜가 없어 이 경기들에 걸린 결장만 요약한다(기간은 등록 시트에서 본다). */
function unavailabilitySummary(player: V1TeamRosterMatrixPlayer): string {
  const cell = player.cells.find((row) => row.status === 'UNAVAILABLE');
  if (cell === undefined) return '—';
  return ['결장', gameRosterReasonLabel(cell.reason), gameRosterActorRoleLabel(cell.actorRole)]
    .filter((part) => part !== null)
    .join(' · ');
}
