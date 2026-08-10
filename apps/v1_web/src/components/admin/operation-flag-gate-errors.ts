import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';

/**
 * 백엔드 에러코드 → 운영자에게 보여줄 한국어 안내. 게이트 스위치(setSimplifiedGate)와 개별 플래그
 * 간소 토글(simplifiedPatchFlag) 양쪽에서 던지는 코드를 모두 다룬다(각 함수의 에러 케이스는
 * apps/v1_api/src/config/game-operation-flags.ts 참고).
 */
export function friendlyGateErrorMessage(err: unknown): string {
  if (err instanceof V1ApiError) {
    switch (err.code) {
      case 'SIMPLIFIED_GATE_DISABLED':
        return '간소 전환 모드가 꺼져 있어요 — 먼저 위에서 켜야 아래 단계를 실행할 수 있어요.';
      case 'CUTOVER_ORDER_VIOLATION':
        return '아직 실행할 수 없어요 — 앞 단계가 먼저 끝나야 해요.';
      case 'VERSION_CONFLICT':
        return '다른 곳에서 이미 값이 바뀌었어요. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      case 'GATE_MODE_UNCHANGED':
        return '이미 그 상태예요. 화면을 새로고침해서 최신 상태를 확인해 주세요.';
      case 'PERMISSION_DENIED':
        return '이 작업은 운영진(ops) 이상 권한이 필요해요.';
      case 'SIMPLIFIED_GATE_KEY_NOT_ALLOWED':
        return '이 플래그는 간소 토글로 바꿀 수 없어요.';
      case 'CUTOVER_LATCHED':
        return '이미 새 시스템으로 첫 기록이 저장돼 되돌릴 수 없어요.';
      default:
        break;
    }
  }
  return extractErrorMessage(err, '처리에 실패했어요.');
}
