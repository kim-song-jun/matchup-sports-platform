import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/** Task 178 명단 조정·결장·일괄 저장 에러 코드 → 사용자 문구. 이 도메인의 단일 소스. */
const GAME_ROSTER_ERROR_MESSAGES: Record<string, string> = {
  LINEUP_DEADLINE_PASSED: '경기가 시작돼서 명단을 바꿀 수 없어요. 바꿀 게 있으면 운영진에게 알려 주세요.',
  ROSTER_ADJUSTMENT_NOT_IN_ROSTER: '참가 명단에 없는 선수예요. 명단을 새로 불러와 주세요.',
  ROSTER_MANAGED_BY_ADJUSTMENTS: '대회·리그 경기는 경기 명단 화면에서 출전 선수를 바꿔요.',
  GAME_ROSTER_NOT_AVAILABLE: '이 경기는 명단을 조정할 수 없어요.',
  GAME_SIDE_NOT_FOUND: '대진이 바뀌어 이 팀이 뛰지 않게 된 경기가 있어요. 명단을 새로 불러왔어요.',
  // 명단 쓰기에서는 "저장하는 사이 경기 팀이 바뀌었다" 뜻으로만 온다.
  COMMAND_CONCURRENCY_CONFLICT: '저장하는 사이 경기 팀이 바뀌었어요. 명단을 새로 불러왔으니 다시 확인해 주세요.',
};

/**
 * 화면이 낡아 거절된 쓰기 — 그대로 다시 눌러도 같은 에러다. 경기가 시작됐거나, 참가 명단·대진이 바뀌었거나,
 * 신청 확정이 풀렸거나, 그사이 권한(매니저 → 팀원)이 바뀌었다. 명단을 다시 받아 화면을 맞춘다.
 */
const STALE_WRITE_CODES = new Set([
  'LINEUP_DEADLINE_PASSED',
  'ROSTER_ADJUSTMENT_NOT_IN_ROSTER',
  'GAME_SIDE_NOT_FOUND',
  'GAME_ROSTER_NOT_AVAILABLE',
  'GAME_NOT_FOUND',
  'PERMISSION_DENIED',
  'COMMAND_CONCURRENCY_CONFLICT',
]);

export function isStaleGameRosterWrite(err: unknown): boolean {
  const code = extractErrorCode(err);
  return code !== null && STALE_WRITE_CODES.has(code);
}

/** 코드를 알면 이 도메인 문구, 모르면 서버 메시지, 그것도 없으면 fallback. */
export function gameRosterErrorMessage(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code !== null && GAME_ROSTER_ERROR_MESSAGES[code] !== undefined) return GAME_ROSTER_ERROR_MESSAGES[code];
  return extractErrorMessage(err, fallback);
}
