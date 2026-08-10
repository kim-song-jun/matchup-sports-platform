import { describe, expect, it } from 'vitest';
import { gameOperationsErrorMessage, isRetryableGameOperationsErrorCode } from './use-v1-game-operations-console';

/**
 * 실측 사고(alpha, 6건 기록 시도 중 2건 실패) 사후조사에서 드러난 요구:
 * 서버(games.service.ts)가 던질 수 있는 코드인데 콘솔이 매핑을 두지 않아
 * 전부 default("이벤트를 기록하지 못했어요. 다시 시도해주세요.")로 뭉개고
 * 있었다. 이 테스트는
 *  1) 그 미매핑 코드들이 이제 default가 아닌 자기 문구를 갖는지,
 *  2) 재시도가 무의미한 코드에서 "다시 시도해주세요"라는 문구를 쓰지 않는지,
 *  3) 문구와 `isRetryableGameOperationsErrorCode`의 재시도 가능 여부가 서로
 *     모순되지 않는지(재시도 불가인데 "다시 시도"라고 말하거나, 그 반대)를
 *     실제로 깨질 수 있는 계약으로 검증한다.
 */

const PREVIOUSLY_UNMAPPED_CODES = [
  'TERMINAL_GAME_IMMUTABLE',
  'EVENT_INVALID',
  'PARTICIPANT_SIDE_MISMATCH',
  'SCORER_REQUIRED',
  'COMMAND_IDEMPOTENCY_KEY_MISMATCH',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
  'INVALID_ACTOR_SCOPE',
  'COMMAND_CONCURRENCY_CONFLICT',
  'INTERNAL_ERROR',
];

const NON_RETRYABLE_CODES = [
  'STAFF_SCOPE_DENIED',
  'INVALID_ACTOR_SCOPE',
  'TERMINAL_GAME_IMMUTABLE',
  'PERIOD_ALREADY_ENDED',
  'NO_NEXT_PERIOD',
  'EVENT_LATE',
  'EVENT_INVALID',
  'PARTICIPANT_SIDE_MISMATCH',
  'SCORER_REQUIRED',
  'COMMAND_IDEMPOTENCY_KEY_MISMATCH',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
];

describe('gameOperationsErrorMessage — 미매핑 코드', () => {
  it('예전엔 전부 default 문구로 뭉개졌던 코드마다 자기만의 문구를 갖는다', () => {
    const genericDefault = gameOperationsErrorMessage('__NOT_A_REAL_CODE__');
    for (const code of PREVIOUSLY_UNMAPPED_CODES) {
      expect(gameOperationsErrorMessage(code)).not.toBe(genericDefault);
    }
  });

  it('재시도가 불가능한 코드는 "다시 시도" 문구를 쓰지 않는다', () => {
    for (const code of NON_RETRYABLE_CODES) {
      expect(gameOperationsErrorMessage(code)).not.toContain('다시 시도');
    }
  });

  // alpha 실사고(2026-08) 근본 원인: 옐로카드/파울 기록이 VALIDATION_ERROR로
  // 거부됐는데 매핑이 없어 default("이벤트를 기록하지 못했어요")로 뭉개졌다.
  // 실제 원인은 `medianOffsetMs()`가 반환하던 소수 offset이 `clockMs`까지
  // 전파돼 서버의 정수 요구를 어긴 것(`game-operations-clock.ts`에서 고침) —
  // `retryFailedEvent`가 재시도 시점에 정수로 보정 + payloadHash 재계산까지
  // 하므로(`use-v1-game-operations-console.ts`) 이 코드는 재시도가 실제로
  // 의미 있다. 고유 문구 + 재시도 가능 판정을 계약으로 고정한다.
  it('VALIDATION_ERROR는 default가 아닌 자기 문구를 갖고 재시도 가능으로 분류된다', () => {
    const genericDefault = gameOperationsErrorMessage('__NOT_A_REAL_CODE__');
    expect(gameOperationsErrorMessage('VALIDATION_ERROR')).not.toBe(genericDefault);
    expect(isRetryableGameOperationsErrorCode('VALIDATION_ERROR')).toBe(true);
  });
});

describe('isRetryableGameOperationsErrorCode — 문구와의 정합성', () => {
  it('비재시도 코드 목록과 실제 판정이 일치한다', () => {
    for (const code of NON_RETRYABLE_CODES) {
      expect(isRetryableGameOperationsErrorCode(code)).toBe(false);
    }
  });

  it('버전/토큰/동시성처럼 조건이 바뀌면 풀리는 코드는 재시도 가능으로 남는다', () => {
    for (const code of [
      'VERSION_CONFLICT',
      'OFFLINE_EVENT_REBASE_CONFLICT',
      'TAKEOVER_TOKEN_EXPIRED',
      'TAKEOVER_UNAVAILABLE',
      'CLOCK_DRIFT',
      'COMMAND_CONCURRENCY_CONFLICT',
      'PERIOD_NOT_STARTED',
      'INTERNAL_ERROR',
    ]) {
      expect(isRetryableGameOperationsErrorCode(code)).toBe(true);
    }
  });
});
