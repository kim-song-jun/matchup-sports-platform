/**
 * 어드민 명단 추가·제외 후 "추가 가능 팀원" 목록이 다시 조회되는지 못박는다.
 *
 * 이 목록의 `eligible` / `alreadyOnRoster` 는 **명단에서 파생된 값**이라 명단이 바뀌면 같이
 * 낡는다. 그런데 두 쿼리 키는 마지막 조각만 다르다:
 *
 *   명단     ['v1','admin','registrations',rid,'players']
 *   선택목록 ['v1','admin','registrations',rid,'eligible-players']
 *
 * React Query 의 무효화는 **접두사 매칭**이라 앞의 키로 무효화해도 뒤의 키는 걸리지 않는다.
 * 그래서 추가 직후에도 방금 넣은 팀원이 계속 선택 가능해 보이고(다시 누르면 서버가 거절),
 * 제외한 팀원은 "이미 명단에 있어요" 로 잠긴 채 남았다.
 *
 * 훅이 v1Get 을 다시 부르는지를 본다 — 무효화 호출 여부를 세는 테스트는 키를 틀리게 넘겨도
 * 통과하므로 이 버그를 못 잡는다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post, v1Delete } = vi.hoisted(() => ({
  v1Get: vi.fn(),
  v1Post: vi.fn(),
  v1Delete: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Post, v1Delete };
});

import {
  useV1AdminAddPlayer,
  useV1AdminRemovePlayer,
  useV1AdminRosterEligibleMembers,
  useV1TournamentPlayers,
} from './use-v1-api';

const REGISTRATION_ID = 'registration-1';
const TOURNAMENT_ID = 'tournament-1';
const ELIGIBLE_PATH = `/admin/registrations/${REGISTRATION_ID}/eligible-players`;
const CONSUMER_ROSTER_PATH = `/tournaments/${TOURNAMENT_ID}/registrations/${REGISTRATION_ID}/players`;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

/** 모달이 열려 있는 상태 — 선택 목록 쿼리와 mutation 이 같은 캐시를 공유한다. */
function renderOpenModalHooks() {
  return renderHook(
    () => ({
      eligible: useV1AdminRosterEligibleMembers(REGISTRATION_ID, true),
      add: useV1AdminAddPlayer(REGISTRATION_ID),
      remove: useV1AdminRemovePlayer(REGISTRATION_ID),
    }),
    { wrapper: makeWrapper() },
  );
}

function eligibleFetchCount() {
  return v1Get.mock.calls.filter(([path]) => path === ELIGIBLE_PATH).length;
}

describe('어드민 명단 변경 후 선택 목록 동기화', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    v1Delete.mockReset();
    v1Get.mockResolvedValue({ members: [] });
    v1Post.mockResolvedValue({ id: 'player-1' });
    v1Delete.mockResolvedValue({ id: 'player-1' });
  });

  it('선수를 추가하면 선택 목록을 다시 불러온다', async () => {
    const { result } = renderOpenModalHooks();
    await waitFor(() => expect(eligibleFetchCount()).toBe(1));

    result.current.add.mutate({ userId: 'user-1', realName: '김명철' });

    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    await waitFor(() => expect(eligibleFetchCount()).toBe(2));
  });

  it('선수를 제외하면 선택 목록을 다시 불러온다', async () => {
    const { result } = renderOpenModalHooks();
    await waitFor(() => expect(eligibleFetchCount()).toBe(1));

    result.current.remove.mutate('player-1');

    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
    await waitFor(() => expect(eligibleFetchCount()).toBe(2));
  });

  // 소비자와 어드민이 같은 명단을 다른 키로 캐싱한다. 어드민 훅은 tournamentId 를 모르는
  // 자리라 predicate 로 소비자 키를 찾는데, 그 매칭이 깨지면 어드민이면서 팀 매니저인
  // 사용자에게 방금 바꾼 명단이 옛 값으로 남는다.
  it('어드민이 선수를 추가하면 소비자 명단 캐시도 다시 불러온다', async () => {
    const { result } = renderHook(
      () => ({
        consumerRoster: useV1TournamentPlayers(TOURNAMENT_ID, REGISTRATION_ID),
        add: useV1AdminAddPlayer(REGISTRATION_ID),
      }),
      { wrapper: makeWrapper() },
    );

    const consumerFetchCount = () =>
      v1Get.mock.calls.filter(([path]) => path === CONSUMER_ROSTER_PATH).length;
    await waitFor(() => expect(consumerFetchCount()).toBe(1));

    result.current.add.mutate({ userId: 'user-1', realName: '김명철' });

    await waitFor(() => expect(result.current.add.isSuccess).toBe(true));
    await waitFor(() => expect(consumerFetchCount()).toBe(2));
  });
});
