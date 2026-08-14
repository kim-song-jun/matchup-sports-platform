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

/**
 * 스코어라인 아래에 작게 붙는 승부차기 보조 텍스트. 정규시간 스코어를 대체하지
 * 않는다 — 축구에서 승부차기는 정규시간 무승부(예: 1 : 1)를 유지한 채 진출팀만
 * 가르는 것이라, 큰 숫자를 `4 : 3`으로 바꿔버리면 기록 자체가 왜곡된다.
 *
 * 승부차기가 없었던 경기(`penalties === null`)와 애초에 숫자를 보여줄 수 없는
 * 경기(`unavailable`/`status_only`)는 `null` 을 돌려주고, 호출부는 아무것도
 * 렌더하지 않는다.
 */
export function formatPenaltyScoreline(
  score: PublicScore | null,
  scoreStatus: PublicScoreStatus,
): string | null {
  // `== null` 로 null 과 undefined 를 함께 거른다 — 서버는 두 emission 지점 모두 키를 채우지만,
  // 배포 과도기나 React Query 캐시에 남은 구 응답에는 penalties 키가 아예 없을 수 있다.
  // 시스템 경계에서 들어오는 값이므로 키 부재를 정상 입력으로 취급한다.
  if (scoreStatus === 'unavailable' || score === null || score.penalties == null) return null;
  return `승부차기 ${score.penalties.home}-${score.penalties.away}`;
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

/**
 * alpha 실측 사고(2026-08) -- 대회 픽스처 하나의 골 이벤트가 `clockMs`
 * 27,166,083ms(≈452분)로 기록돼 공개 일정 화면에 `452′`가 그대로 나갔다.
 * 원인은 `clockMs`에 상한 검증이 아예 없다는 것(운영자가 경기 종료를 누르지
 * 않으면 클럭이 계속 흐른다, `apps/v1_api/.../game-invariants.ts`의
 * `validateEventShape` 참고) -- 그리고 이 저장소는 그 값을 서버에서 하드
 * 거부하지 않기로 했다(현장 기록을 막는 게 잘못된 숫자가 남는 것보다 나쁘고,
 * 이미 기록된 이벤트를 소급 거부할 수도 없다). 그래서 공개 화면의 책임은
 * "숫자를 고치거나 숨기는" 게 아니라 "이상하다는 신호를 함께 보여주는" 것
 * 뿐이다 -- `formatGoalMinute`/`formatClock`은 그대로 실제 값을 반환하고,
 * 이 함수가 그 값이 신뢰할 만한 범위를 벗어났는지만 별도로 판정한다.
 *
 * 임계값 90분 -- 이 저장소가 실제로 정의한 두 프리셋(`competition-config.
 * presets.ts`) 중 가장 긴 단일 피리어드는 축구 전/후반 각 45분이다. 그
 * 두 배를 골랐다: 정규 시간 + 추가시간을 아무리 넉넉히 잡아도 한 피리어드가
 * 90분을 실제로 넘는 경기는 없고, 그 이상이면 사실상 항상 "경기 종료를 못
 * 눌러 시계가 계속 흐른" 운영 실수다. 운영 콘솔의 확인 게이트
 * (`lib/game-operations-clock.ts`의 `isClockSuspicious`)는 대회마다 실제
 * 설정된 `durationMinutes`를 대조해 배율(×2)을 곱하는 더 정확한 판정을 쓰지만,
 * 이 화면(공개 일정/상세)이 받는 `clockMs`에는 그 대회의 피리어드 설정이 함께
 * 오지 않는다 -- 그래서 여기서는 "알려진 모든 프리셋의 최댓값의 2배"로 고정한
 * 상수를 대신 쓴다(디자인 여지가 있는 표시 신호일 뿐이라 운영 게이트만큼
 * 정밀할 필요는 없다).
 */
const ABNORMAL_CLOCK_THRESHOLD_MS = 90 * 60_000;

/** `clockMs`(또는 이미 분으로 접힌 값을 ms로 환산한 값)가 신뢰할 만한 범위를
 * 벗어났는지. `null`은 "시각 자체가 없음"이지 이상값이 아니므로 항상 false. */
export function isClockAbnormal(clockMs: number | null): boolean {
  return clockMs !== null && clockMs > ABNORMAL_CLOCK_THRESHOLD_MS;
}

/** `m:ss` elapsed-time display for the public live clock -- same precision as `formatClock`. */
export function formatElapsedClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
