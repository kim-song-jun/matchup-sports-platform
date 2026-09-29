import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/** Task 178 명단 조정·결장·일괄 저장 에러 코드 → 사용자 문구. 이 도메인의 단일 소스. */
const GAME_ROSTER_ERROR_MESSAGES: Record<string, string> = {
  LINEUP_DEADLINE_PASSED: '경기가 시작돼서 명단을 바꿀 수 없어요. 바꿀 게 있으면 운영진에게 알려 주세요.',
  ROSTER_ADJUSTMENT_NOT_IN_ROSTER: '참가 명단에 없는 선수예요. 명단을 새로 불러와 주세요.',
  ROSTER_MANAGED_BY_ADJUSTMENTS: '대회·리그 경기는 경기 명단 화면에서 출전 선수를 바꿔요.',
  GAME_ROSTER_NOT_AVAILABLE: '이 경기는 명단을 조정할 수 없어요.',
};

/** 코드를 알면 이 도메인 문구, 모르면 서버 메시지, 그것도 없으면 fallback. */
export function gameRosterErrorMessage(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code !== null && GAME_ROSTER_ERROR_MESSAGES[code] !== undefined) return GAME_ROSTER_ERROR_MESSAGES[code];
  return extractErrorMessage(err, fallback);
}
