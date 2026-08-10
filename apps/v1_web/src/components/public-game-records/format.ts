import type { PublicResultState, PublicScore, PublicScoreStatus } from './types';

/**
 * D-03/D-11 consent gating -- the backend sends `displayName: null` for a
 * lineup slot, goal/card event, or MVP whenever the participant is an
 * unlinked guest, has no consent snapshot, was revoked, or the grant's
 * `effectiveAt` is later than the fact being shown. This is the single
 * place the frontend decides what to render for that `null`: a fixed,
 * anonymized label -- never an empty string, "undefined", or anything that
 * could be mistaken for a real (if unusual) player name.
 */
export const WITHHELD_IDENTITY_LABEL = '비공개 선수';

export function presentParticipantName(displayName: string | null): string {
  return displayName ?? WITHHELD_IDENTITY_LABEL;
}

/** `pending | official | corrected | void` -> Korean label shown next to a result. */
const RESULT_STATE_LABEL: Record<PublicResultState, string> = {
  pending: '결과 대기',
  official: '확정 결과',
  corrected: '정정된 결과',
  void: '무효 처리',
};

export function resultStateLabel(state: PublicResultState): string {
  return RESULT_STATE_LABEL[state];
}

/** `void`/`corrected` are the two states that must never be shown as if they were a plain final score. */
export function isCorrectedOrVoid(state: PublicResultState): boolean {
  return state === 'corrected' || state === 'void';
}

const FIXTURE_STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  live: '진행 중',
  ended: '종료',
  cancelled: '취소',
};

export function fixtureStatusLabel(status: string): string {
  return FIXTURE_STATUS_LABEL[status] ?? status;
}

/**
 * Scoreline text for a schedule row or match header. A `void`/`pending`
 * fixture with `scoreStatus: 'unavailable'` (or `status_only` mode, which
 * the server already forces to a null score) must never show a numeric
 * score -- showing "0:0" there would misrepresent an unplayed or voided
 * game as a real result.
 */
export function formatScoreline(score: PublicScore | null, scoreStatus: PublicScoreStatus): string {
  if (scoreStatus === 'unavailable' || score === null) return '- : -';
  return `${score.home} : ${score.away}`;
}

const TEAM_RECORD_RESULT_LABEL: Record<string, string> = { WON: '승', DRAWN: '무', LOST: '패' };

/** Team-record row result ('WON'|'DRAWN'|'LOST' as a plain string, see `PublicTeamRecordItem.result`). */
export function teamRecordResultLabel(result: string): string {
  return TEAM_RECORD_RESULT_LABEL[result] ?? result;
}

/** User-record row result -- `null` means the score could not be resolved (no fixture side match). */
export function userRecordResultLabel(result: 'WON' | 'LOST' | 'DRAWN' | null): string {
  if (result === null) return '-';
  return TEAM_RECORD_RESULT_LABEL[result] ?? '-';
}

/**
 * `N′` minute-only clock for the schedule card's compact scorer summary
 * (narrow-width context, one row per fixture) -- deliberately coarser than
 * `formatClock`'s `mm:ss`, which the full match-detail timeline uses where
 * there is room for exact seconds. `null` (no clock captured) renders as an
 * empty string so a caller can still show the scorer's name without a
 * dangling "′".
 */
export function formatGoalMinute(clockMs: number | null): string {
  if (clockMs === null) return '';
  return `${Math.floor(clockMs / 60_000)}′`;
}

/** `mm:ss` from a game clock in milliseconds, used for goal/card event rows. */
export function formatClock(clockMs: number | null): string {
  if (clockMs === null) return '';
  const totalSeconds = Math.max(0, Math.floor(clockMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Lane 1 -- period label for the public match/schedule clock. Mirrors the
 * operations console's own convention (`period-label.ts`, `tournament-ops`)
 * without importing it: that file lives under a directory this lane must
 * not couple to, and the rule is three lines. "전반"/"후반" for football's
 * always-exactly-2-period games; a numbered fallback once a sport/format
 * has more periods than that.
 */
export function periodLabel(periodNumber: number): string {
  if (periodNumber === 1) return '전반';
  if (periodNumber === 2) return '후반';
  return `${periodNumber}피리어드`;
}

/** `m:ss` elapsed-time display for the public live clock -- same precision as `formatClock`. */
export function formatElapsedClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
