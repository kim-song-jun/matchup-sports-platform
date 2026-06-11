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
