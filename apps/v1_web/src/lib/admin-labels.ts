/**
 * 관리자 액션 코드를 사람이 읽을 수 있는 한국어 레이블로 변환해요.
 *
 * 백엔드가 기록하는 실제 action 코드(dot-notation)를 기준으로 매핑해요.
 * 알 수 없는 코드는 raw 문자열을 그대로 반환해 감사 정밀도를 유지해요.
 */
const ACTION_LABEL_MAP: Record<string, string> = {
  'user.status.update': '회원 상태 변경',
  'match.status.update': '매치 상태 변경',
  'team.status.update': '팀 상태 변경',
  'team_match.status.update': '팀매치 상태 변경',
};

export function adminActionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] ?? action;
}
