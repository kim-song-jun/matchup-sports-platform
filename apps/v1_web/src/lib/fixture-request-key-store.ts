import { randomUuid } from '@/lib/uuid';

// 대회별·내용별로 모듈 수준에 둔다 — 그림↔목록·반응형 폭 전환으로 워크스페이스가 다시 마운트돼도,
// 다른 조·라운드를 시도한 뒤 돌아와도 처리 여부를 모르는 요청의 재시도 키가 살아남아야 한다.
const keys = new Map<string, Map<string, string>>();

/** 같은 대회·내용(content)이면 앞서 쓴 키를, 처음이면 새 키를 돌려준다. */
export function getFixtureRequestKey(tournamentId: string, content: string): string {
  let byContent = keys.get(tournamentId);
  if (!byContent) {
    byContent = new Map();
    keys.set(tournamentId, byContent);
  }
  const current = byContent.get(content);
  if (current) return current;
  const next = randomUuid();
  byContent.set(content, next);
  return next;
}

/**
 * 결과가 확정된 내용의 키만 버린다. clientCommandId 를 주면 그 키가 아직 현재 키일 때만 버린다 — 늦게 끝난 옛 요청이
 * 같은 내용으로 새로 만든 키를 지우지 못하게. content 를 생략하면 그 대회의 키를 모두 비운다.
 */
export function clearFixtureRequestKey(tournamentId: string, content?: string, clientCommandId?: string): void {
  if (content === undefined) {
    keys.delete(tournamentId);
    return;
  }
  const byContent = keys.get(tournamentId);
  if (!byContent || (clientCommandId !== undefined && byContent.get(content) !== clientCommandId)) return;
  byContent.delete(content);
  if (byContent.size === 0) keys.delete(tournamentId);
}
