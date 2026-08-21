/**
 * 에러 객체에서 사람이 읽을 수 있는 메시지를 추출해요.
 *
 * 우선순위:
 *   1. Axios 스타일 에러: err.response.data.message 또는 err.response.data.error
 *   2. 직접 message 프로퍼티: err.message
 *   3. fallback 문자열
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;

  // Axios-style: err.response.data.message or err.response.data.error
  const maybeAxios = err as {
    response?: {
      data?: {
        message?: unknown;
        error?: unknown;
      };
    };
  };
  const responseData = maybeAxios.response?.data;
  if (responseData) {
    if (typeof responseData.message === 'string' && responseData.message) {
      return responseData.message;
    }
    if (typeof responseData.error === 'string' && responseData.error) {
      return responseData.error;
    }
  }

  // Direct .message property (V1ApiError / generic Error)
  const maybeError = err as { message?: unknown };
  if (typeof maybeError.message === 'string' && maybeError.message) {
    return maybeError.message;
  }

  return fallback;
}

/**
 * 에러 객체에서 도메인 에러 코드(`VERIFICATION_RESEND_COOLDOWN` 등)를 꺼내요.
 *
 * 같은 catch 블록에서 나온 실패라도 "정말 실패"와 "잠깐 기다려야 함"은 사용자에게
 * 다르게 보여야 하는데, 메시지 문자열 매칭으로 구분하면 카피가 바뀔 때마다 깨져요.
 * 코드로 구분하려고 메시지 추출과 같은 경로(V1ApiError.code → Axios body.code)를 봅니다.
 *
 * 코드를 찾지 못하면 null — 호출부는 "구분 불가"로 보고 기본(에러) 처리를 하면 돼요.
 */
export function extractErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;

  // 응답 본문의 코드를 먼저 본다 — Axios 에러는 최상위 `code` 에 자기 내부 코드
  // (`ERR_BAD_REQUEST` 등)를 담아서, 순서를 바꾸면 그 값이 도메인 코드를 가려 버린다.
  const maybeAxios = err as { response?: { data?: { code?: unknown } } };
  const responseCode = maybeAxios.response?.data?.code;
  if (typeof responseCode === 'string' && responseCode) {
    return responseCode;
  }

  // V1ApiError 는 응답 래퍼 없이 최상위 code 에 도메인 코드를 그대로 담는다.
  const maybeApiError = err as { code?: unknown };
  if (typeof maybeApiError.code === 'string' && maybeApiError.code) {
    return maybeApiError.code;
  }

  return null;
}

/**
 * 에러 객체에서 응답 본문의 `details` 를 꺼내요.
 *
 * `TEAM_CONTACT_ALREADY_ACTIVE` 처럼 code 만으로는 부족하고 부가 데이터(예:
 * `existingContactId`)가 필요한 경우를 위한 것 — extractErrorCode 와 같은 방어적
 * 스타일로, 호출부가 컴포넌트 안에서 직접 타입 단언을 하지 않도록 이 유틸을 거치게 해요.
 *
 * details 가 없거나 에러 형태를 못 찾으면 undefined — 호출부는 "부가 데이터 없음"으로
 * 보고 fallback 문구/링크를 쓰면 돼요.
 */
export function extractErrorDetails(err: unknown): unknown {
  if (!err || typeof err !== 'object') return undefined;

  // 응답 본문의 details 를 먼저 본다 — Axios 에러는 body 안에 담겨 온다.
  const maybeAxios = err as { response?: { data?: { details?: unknown } } };
  const responseDetails = maybeAxios.response?.data?.details;
  if (responseDetails !== undefined) {
    return responseDetails;
  }

  // V1ApiError 는 응답 래퍼 없이 최상위 details 에 부가 데이터를 그대로 담는다.
  const maybeApiError = err as { details?: unknown };
  if (maybeApiError.details !== undefined) {
    return maybeApiError.details;
  }

  return undefined;
}
