/**
 * Prisma 에러가 "지금 서버가 감당을 못 해서" 실패한 것인지 판정한다 — 요청 자체는
 * 멀쩡하고, 잠시 뒤 그대로 다시 보내면 성공하는 부류다.
 *
 * 배경(alpha 실측 2026-08-23, 승강 확정 동시 6건):
 *
 *   PrismaClientKnownRequestError: Transaction API error:
 *     Unable to start a transaction in the given time.
 *       at LeagueSeriesAdminService.runCommitTransaction
 *   occurrenceCount: 6
 *
 * 6건 전부 500 INTERNAL_ERROR 였고 도메인 코드조차 없었다. 같은 body 를 단발로 보내면
 * 201 이라 요청 내용 문제가 아니다 — 커넥션 풀이 포화돼 인터랙티브 트랜잭션을 **시작조차**
 * 못 한 것이다. 운영자 화면에는 "서버 오류"로만 보여서 "장애인가 혼잡인가"를 구분할 수 없다.
 *
 * **충돌(conflict) 계열과는 다른 부류다.** 두 요청이 같은 행을 놓고 다투다 진 것
 * (40001·40P01·P2034·P2002)은 도메인이 의미를 붙여야 하므로
 * `games/command-concurrency-error.ts` 의 `isCommandConcurrencyConflict` 가
 * 각 도메인에서 409 로 번역한다. 반면 "풀이 없어서 못 열었다"는 어떤 도메인도 의미를
 * 붙일 수 없다 — 전역에서 503 으로 처리하는 게 맞다.
 *
 * 이 파일은 `@prisma/client` 를 import 하지 않는다. 공유 Prisma 클라이언트는 로컬에서
 * 재생성이 금지돼 있어(모노레포 공유 산출물) 그걸 import 하는 파일은 로컬에서 컴파일·
 * 테스트가 안 된다. 판정만 순수 함수로 떼면 유닛 테스트가 된다 —
 * `command-concurrency-error.ts` 가 같은 이유로 같은 모양을 하고 있다.
 */

/** 커넥션 풀에서 커넥션을 못 받아 시간 초과. */
const POOL_TIMEOUT = 'P2024';

/**
 * 인터랙티브 트랜잭션 API 오류. 시작 실패·시간 초과·이미 닫힘이 모두 이 코드로 온다.
 * 셋 다 "잠시 뒤 재시도"가 유일한 대처라 같은 부류로 묶는다.
 */
const TRANSACTION_API_ERROR = 'P2028';

const AVAILABILITY_CODES = [POOL_TIMEOUT, TRANSACTION_API_ERROR] as const;

/**
 * Prisma 가 아닌 곳에서 온 에러도 이 필터를 지나가므로, 코드가 없을 때 메시지만으로
 * 넘겨짚지 않는다. 폴백은 **Prisma 형태의 에러**(code 필드가 P 로 시작)일 때만 쓴다.
 */
const AVAILABILITY_MESSAGE_HINTS = [
  'Unable to start a transaction in the given time',
  'Timed out fetching a new connection from the connection pool',
] as const;

export interface PrismaLikeError {
  code?: unknown;
  message?: unknown;
}

/**
 * 재시도로 풀릴 가용성 실패인가.
 *
 * @param error `PrismaClientKnownRequestError` 형태(code/message)면 무엇이든 받는다.
 *              필터가 `instanceof` 대신 형태로 판정해야 하는 이유는 파일 상단 주석 참고.
 */
export function isPrismaAvailabilityError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as PrismaLikeError;

  if (typeof code === 'string' && (AVAILABILITY_CODES as readonly string[]).includes(code)) {
    return true;
  }

  // Prisma 버전에 따라 같은 상황이 다른 코드로 오거나 코드가 비는 경우가 있어 메시지도
  // 본다. 다만 Prisma 계열 에러(P 로 시작하는 코드)로 한정해, 무관한 라이브러리의
  // 비슷한 문구가 503 으로 둔갑하지 않게 한다.
  if (typeof code !== 'string' || !/^P\d{4}$/.test(code)) return false;
  if (typeof message !== 'string') return false;
  return AVAILABILITY_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

/** 503 응답에 실어 보낼 재시도 간격(초). 풀 회복은 보통 수 초면 끝난다. */
export const PRISMA_AVAILABILITY_RETRY_AFTER_SECONDS = 5;

export const PRISMA_AVAILABILITY_CODE = 'SERVICE_TEMPORARILY_BUSY';
export const PRISMA_AVAILABILITY_MESSAGE =
  '요청이 몰려 잠시 처리할 수 없어요. 잠깐 뒤에 다시 시도해 주세요.';
