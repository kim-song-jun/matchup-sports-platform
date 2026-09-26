import { extractErrorCode, extractErrorDetails } from './error-message';

/**
 * 전역 ValidationPipe 의 400 `VALIDATION_ERROR` 에서 필드별 메시지를 꺼낸다.
 * `details` 는 `[{ field, messages[] }]` 모양이다(apps/v1_api/src/main.ts exceptionFactory).
 * 검증 오류가 아니거나 모양이 다르면 빈 객체 — 호출부는 폼 전체 오류로 처리한다.
 */
export function validationFieldMessages(err: unknown): Record<string, string[]> {
  if (extractErrorCode(err) !== 'VALIDATION_ERROR') return {};
  const details = extractErrorDetails(err);
  if (!Array.isArray(details)) return {};
  const result: Record<string, string[]> = {};
  for (const entry of details) {
    if (!entry || typeof entry !== 'object') continue;
    const { field, messages } = entry as { field?: unknown; messages?: unknown };
    if (typeof field !== 'string') continue;
    result[field] = Array.isArray(messages) ? messages.filter((m): m is string => typeof m === 'string') : [];
  }
  return result;
}
