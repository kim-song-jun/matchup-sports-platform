import { QueryClient, dehydrate, onlineManager, type Query } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { V1_PERSIST_DEHYDRATE_OPTIONS, shouldPersistQuery } from './query-persist';

/**
 * shouldPersistQuery 는 순수 함수지만 계약이 깨지면 실제로 개인정보가 localStorage 에
 * 새는 Critical 보안 결함이 된다 — `viewer.applicationId` 같은 개인화 필드를 담은 쿼리가
 * 화이트리스트를 통과하면, 계정을 바꿔도 이전 사용자의 신청/참가 상태가 다음 기동 시
 * 그대로 복원돼 새 사용자 화면에 노출된다.
 */
function fakeQuery(queryKey: readonly unknown[], status: 'success' | 'pending' | 'error' = 'success'): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

describe('shouldPersistQuery', () => {
  it('허용된 4개 도메인은 통과시킨다', () => {
    expect(shouldPersistQuery(fakeQuery(['v1', 'master', 'sports']))).toBe(true);
    expect(shouldPersistQuery(fakeQuery(['v1', 'notices', {}]))).toBe(true);
    expect(shouldPersistQuery(fakeQuery(['v1', 'public', 'kakaoMapsKey']))).toBe(true);
    expect(shouldPersistQuery(fakeQuery(['v1', 'tournaments', 'campaigns', {}]))).toBe(true);
  });

  it('viewer 필드를 가진 matches/match 도메인은 거부한다', () => {
    expect(shouldPersistQuery(fakeQuery(['v1', 'matches', {}]))).toBe(false);
    expect(shouldPersistQuery(fakeQuery(['v1', 'matches', 'm1']))).toBe(false);
  });

  it('도메인이 허용 목록에 있어도 me/admin/auth 세그먼트를 포함하면 거부한다', () => {
    expect(shouldPersistQuery(fakeQuery(['v1', 'my', 'profile']))).toBe(false);
    expect(shouldPersistQuery(fakeQuery(['v1', 'master', 'me', 'sports']))).toBe(false);
    expect(shouldPersistQuery(fakeQuery(['v1', 'admin', 'stats']))).toBe(false);
  });

  it('v1 이외의 루트를 가진 키는 거부한다', () => {
    expect(shouldPersistQuery(fakeQuery(['other', 'master']))).toBe(false);
  });

  it('status가 success가 아니면 거부한다', () => {
    expect(shouldPersistQuery(fakeQuery(['v1', 'master', 'sports'], 'pending'))).toBe(false);
    expect(shouldPersistQuery(fakeQuery(['v1', 'master', 'sports'], 'error'))).toBe(false);
  });
});

describe('V1_PERSIST_DEHYDRATE_OPTIONS', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('멈춘 쓰기(mutation)는 저장하지 않는다 — 복원돼도 보낼 함수가 없어 조용히 사라진다. 허용된 조회는 그대로 저장한다', () => {
    const client = new QueryClient();
    client.setQueryData(['v1', 'master', 'sports'], { items: [] });
    client.setQueryData(['v1', 'matches', 'm1'], { id: 'm1' });
    onlineManager.setOnline(false);
    void client.getMutationCache().build(client, { mutationFn: async () => 'sent' }).execute(undefined);

    // 대조군 — 기본 옵션이면 이 멈춘 쓰기가 저장 대상이다(빈 캐시를 보고 통과하지 않게).
    expect(dehydrate(client).mutations).toHaveLength(1);

    const persisted = dehydrate(client, V1_PERSIST_DEHYDRATE_OPTIONS);
    expect(persisted.mutations).toHaveLength(0);
    expect(persisted.queries.map((query) => query.queryKey)).toEqual([['v1', 'master', 'sports']]);
  });
});
