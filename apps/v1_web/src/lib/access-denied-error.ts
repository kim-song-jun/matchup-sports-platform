import { V1ApiError } from '@/lib/api-client';

/**
 * 다시 불러와도 결과가 같은 접근 거절인가 — 팀에서 내보내진 뒤 옛 팀 채팅·일정 주소로
 * 들어온 경우처럼 권한이 사라진 것이라 "네트워크 확인, 다시 시도"가 오히려 원인을 잘못 말한다.
 */
export function isAccessDeniedError(err: unknown): boolean {
  return err instanceof V1ApiError && (err.statusCode === 403 || err.code === 'PERMISSION_DENIED' || err.code === 'NOT_TEAM_MEMBER');
}

/**
 * 멤버 전용 일정은 비멤버에게 존재 자체를 숨겨 404 로 내려온다(서버 existence-hiding).
 * 403 과 구분되지 않으므로 화면은 "볼 수 없는 일정"으로 함께 안내한다.
 */
export function isHiddenFromViewerError(err: unknown): boolean {
  return isAccessDeniedError(err) || (err instanceof V1ApiError && err.statusCode === 404);
}
