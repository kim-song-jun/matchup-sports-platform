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

  const maybeApiError = err as { code?: unknown };
  if (typeof maybeApiError.code === 'string' && maybeApiError.code) {
    return maybeApiError.code;
  }

  const maybeAxios = err as { response?: { data?: { code?: unknown } } };
  const responseCode = maybeAxios.response?.data?.code;
  if (typeof responseCode === 'string' && responseCode) {
    return responseCode;
  }

  return null;
}
