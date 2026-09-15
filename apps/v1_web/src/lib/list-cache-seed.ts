import type { QueryClient } from '@tanstack/react-query';

/**
 * 목록 캐시에서 상세 진입 대상을 찾아 첫 화면의 표시값으로 쓴다.
 *
 * 목록 → 상세는 이 앱에서 가장 흔한 동선인데, 상세 화면은 자기 쿼리를 처음부터 다시
 * 받는다 — 그 사이 사용자는 방금 눌렀던 카드의 제목조차 볼 수 없다. 목록에서 이미 받아
 * 둔 항목이 캐시에 있으므로 그걸 초기 표시값으로 넘겨 진입 즉시 제목·장소·날짜가 보이게
 * 한다(나머지 상세 전용 필드는 실제 응답이 도착하면 채워진다).
 *
 * 목록 쿼리키는 `[...prefix, filters]`, 상세는 `[...prefix, id]`로 접두사를 공유한다.
 * 여기서는 `items` 배열을 가진 캐시 항목만 목록으로 취급하므로 상세 캐시는 자연히 걸러진다.
 */
export function findInListCache<T>(
  client: QueryClient,
  listPrefix: readonly unknown[],
  isTarget: (item: T) => boolean,
): T | undefined {
  const entries = client.getQueriesData<{ items?: T[] }>({ queryKey: listPrefix });

  for (const [, data] of entries) {
    const items = data?.items;
    if (!Array.isArray(items)) continue;
    const found = items.find(isTarget);
    if (found) return found;
  }

  return undefined;
}
