import { randomUuid } from '@/lib/uuid';

type FixtureRequestKey = { content: string; clientCommandId: string };

// 대회별로 모듈 수준에 둔다 — 그림↔목록·반응형 폭 전환으로 워크스페이스가 다시 마운트돼도 재시도 키가 살아남아야 한다.
const keys = new Map<string, FixtureRequestKey>();

/** 같은 내용(content)이면 앞서 쓴 키를, 내용이 바뀌었거나 처음이면 새 키를 돌려준다. */
export function getFixtureRequestKey(tournamentId: string, content: string): string {
  const current = keys.get(tournamentId);
  if (current?.content === content) return current.clientCommandId;
  const next = { content, clientCommandId: randomUuid() };
  keys.set(tournamentId, next);
  return next.clientCommandId;
}

/** 키를 주면 그 키가 아직 대회의 현재 키일 때만 버린다 — 늦게 끝난 옛 요청이 새 내용의 키를 지우지 못하게. 생략하면 무조건 비운다. */
export function clearFixtureRequestKey(tournamentId: string, clientCommandId?: string): void {
  if (clientCommandId === undefined || keys.get(tournamentId)?.clientCommandId === clientCommandId) keys.delete(tournamentId);
}
