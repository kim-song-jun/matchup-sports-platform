/**
 * 어드민 목록의 페이지 번호 페이지네이션.
 *
 * 기존 목록은 전부 cursor 기반이었다. cursor 는 무한 스크롤에는 맞지만 어드민 표에서는
 * "몇 번째 페이지를 보고 있는지", "전체가 몇 건인지"를 알 수 없어 운영자가 위치를 잃는다.
 * page 를 받되 cursor 도 계속 지원해 기존 호출자를 깨뜨리지 않는다 — 둘 다 오면 page 가
 * 이긴다(명시적으로 페이지를 고른 쪽이 의도가 분명하다).
 */
export interface PageableQuery {
  readonly page?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

/** Prisma findMany 에 그대로 펼쳐 넣는 skip/cursor 인자. */
export function paginationArgs(
  query: PageableQuery,
  limit: number,
): { skip?: number; cursor?: { id: string } } {
  if (query.page && query.page > 1) {
    return { skip: (query.page - 1) * limit };
  }
  if (query.cursor) {
    // cursor 가 가리키는 행 자체는 이전 페이지의 마지막이므로 건너뛴다.
    return { cursor: { id: query.cursor }, skip: 1 };
  }
  return {};
}

export interface PageInfo {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  readonly nextCursor: string | null;
}

/**
 * 표 하단의 "전체 N건 중 M–K" 와 페이지 버튼을 그리는 데 필요한 값을 한 번에 만든다.
 * total 이 없으면(비용이 큰 집계를 피한 경우) totalPages 는 0 이고 프론트는 이전/다음만
 * 보여주면 된다 — 페이지 번호를 억지로 만들어내지 않는다.
 */
export function buildPageInfo(input: {
  page?: number;
  limit: number;
  total?: number | null;
  hasNext: boolean;
  nextCursor?: string | null;
}): PageInfo {
  const page = input.page && input.page > 0 ? input.page : 1;
  const total = typeof input.total === 'number' ? input.total : 0;
  const totalPages = total > 0 ? Math.ceil(total / input.limit) : 0;
  return {
    page,
    limit: input.limit,
    total,
    totalPages,
    hasNext: input.hasNext,
    hasPrev: page > 1,
    nextCursor: input.nextCursor ?? null,
  };
}
