/**
 * 게임 커맨드가 "동시에 다른 커맨드가 이겨서" 실패한 것인지 판정한다.
 *
 * `GamesService.withCommand` 는 Serializable 트랜잭션 안에서 `SELECT ... FOR UPDATE`
 * (raw query)로 게임 행을 잠그고 시작한다. 두 커맨드가 겹치면 Postgres 가 40001
 * (`could not serialize access due to concurrent update`)을 던지는데, 그것이 **raw
 * query 안에서** 나면 Prisma 는 `P2034`(write conflict)가 아니라 `P2010`(raw query
 * failed)으로 감싼다. 기존 매핑이 `P2034`/`P2002` 만 보고 있어서 이 경로가 통째로
 * 빠져나가 500 이 됐다 — alpha 실측(2026-08-23, 몰수 동시 요청 2건 중 1건):
 *
 *   PrismaClientKnownRequestError: Invalid `prisma.$queryRaw()` invocation:
 *   Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`
 *     at GamesService.withCommand → LeagueMatchForfeitService.recordForfeit
 *
 * 이 파일은 `@prisma/client` 를 import 하지 않는다. 이 저장소의 공유 Prisma 클라이언트는
 * 로컬에서 재생성이 금지돼 있어(모노레포 공유 산출물) 그걸 import 하는 파일은 로컬에서
 * 컴파일·테스트가 안 된다. 판정 로직만 순수 함수로 떼어 두면 유닛 테스트가 가능하다.
 */

/** Prisma 가 raw query 실패를 감쌀 때 쓰는 코드. 원래 Postgres 코드는 meta/message 안에 있다. */
const RAW_QUERY_FAILED = 'P2010';

/** Postgres 트랜잭션 충돌 계열 — 재시도하면 풀리는 것들. */
const RETRYABLE_PG_CODES = ['40001', '40P01'] as const;

/** Prisma 가 자체 ORM 연산에서 직접 내는 충돌 코드. */
const PRISMA_CONFLICT_CODES = ['P2034', 'P2002'] as const;

function metaCode(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const code = (meta as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * @param code    `PrismaClientKnownRequestError.code`
 * @param meta    같은 에러의 `meta`
 * @param message 같은 에러의 `message` — meta 가 비는 Prisma 버전 대비 폴백
 */
export function isCommandConcurrencyConflict(
  code: string,
  meta?: unknown,
  message?: string,
): boolean {
  if ((PRISMA_CONFLICT_CODES as readonly string[]).includes(code)) return true;
  if (code !== RAW_QUERY_FAILED) return false;

  const pg = metaCode(meta);
  if (pg !== null) return (RETRYABLE_PG_CODES as readonly string[]).includes(pg);

  // meta 에 코드가 없으면 메시지 본문으로 판정한다. Prisma 의 raw 실패 메시지는
  // 항상 "Raw query failed. Code: `40001`." 형태로 원래 SQLSTATE 를 품고 있다.
  // 여기서 넓게 잡으면 무관한 SQL 오류가 409 로 둔갑하므로 백틱까지 붙여 좁힌다.
  if (typeof message !== 'string') return false;
  return RETRYABLE_PG_CODES.some((pgCode) => message.includes(`Code: \`${pgCode}\``));
}
