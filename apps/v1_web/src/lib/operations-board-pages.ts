export const OPERATIONS_BOARD_PAGE_LIMIT = 100;
/** 한 번에 읽는 서버 페이지 상한(2,000경기). 서버가 커서를 잘못 주어도 요청이 끝없이 이어지지 않게 한다. */
export const OPERATIONS_BOARD_MAX_PAGES = 20;

/**
 * 보드 서버 페이지를 다음 커서가 없을 때까지 읽어 페이지 배열로 돌려준다. 한 페이지라도 실패하면 전체가 실패한다.
 * 커서가 없거나, 이미 쓴 커서가 다시 오거나, 빈 페이지가 오면 거기서 멈춘다.
 */
export async function readOperationsBoardPages<P extends { items: readonly unknown[]; nextCursor?: string | null }>(
  fetchPage: (cursor: string | null) => Promise<P>,
): Promise<P[]> {
  const pages: P[] = [];
  const usedCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageCount = 0; pageCount < OPERATIONS_BOARD_MAX_PAGES; pageCount += 1) {
    const page: P = await fetchPage(cursor);
    pages.push(page);
    const next = page.nextCursor;
    if (!next || page.items.length === 0 || usedCursors.has(next)) break;
    usedCursors.add(next);
    cursor = next;
  }
  return pages;
}
