import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Post: vi.fn(), v1Delete: vi.fn() };
});

import { v1Delete, v1Post } from '@/lib/api-client';
import { useLeagueResultToast } from '@/components/admin/bracket-canvas/use-league-result-toast';
import { v1Keys } from '@/lib/query-keys';
import { useV1CreateFixture, useV1DeleteFixture } from './use-v1-api';
import { useV1ApplyLeagueTemplate, useV1RandomFillSlots } from './use-v1-bracket-canvas';

const postMock = vi.mocked(v1Post);
const deleteMock = vi.mocked(v1Delete);

const publicKeys = (id: string) => [
  v1Keys.leagueMatch(id),
  v1Keys.leagueMatchStandings(id),
  v1Keys.leagueMatchPlayerRecords(id),
  v1Keys.leagueClaimableFixtures(id),
  v1Keys.tournament(id),
];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const id of ['target', 'other']) {
    for (const key of [...publicKeys(id), v1Keys.adminLeagueMatch(id), v1Keys.adminTournamentBracket(id)]) client.setQueryData(key, { id });
  }
  client.setQueryData(v1Keys.leagueMatches({ status: 'recruiting' }), { items: [] });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const invalidated = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;
  return { client, wrapper, invalidated };
}

beforeEach(() => {
  postMock.mockReset();
  deleteMock.mockReset();
});

describe('리그 대진 변경 뒤 공개 캐시', () => {
  it('무작위 채우기는 공개 리그 상세·순위·선수 기록·대회 키를 무효화하고 다른 리그는 건드리지 않는다', async () => {
    postMock.mockResolvedValue({ assignments: [] });
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useV1RandomFillSlots('target', 'league'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    for (const key of [...publicKeys('target'), v1Keys.adminLeagueMatch('target')]) expect(invalidated(key)).toBe(true);
    for (const key of publicKeys('other')) expect(invalidated(key)).toBe(false);
    expect(invalidated(v1Keys.leagueMatches({ status: 'recruiting' }))).toBe(true);
  });

  it('리그 템플릿 적용도 같은 공개 키 묶음을 무효화한다', async () => {
    postMock.mockResolvedValue({});
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('target'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    for (const key of [...publicKeys('target'), v1Keys.adminLeagueMatch('target')]) expect(invalidated(key)).toBe(true);
    for (const key of publicKeys('other')) expect(invalidated(key)).toBe(false);
    expect(invalidated(v1Keys.leagueMatches({ status: 'recruiting' }))).toBe(true);
  });

  it('결과 토스트는 성공일 때만 공개 리그 키까지 무효화한다', () => {
    const { wrapper, invalidated } = setup();
    const showToast = vi.fn();
    const { result } = renderHook(() => useLeagueResultToast('target', showToast), { wrapper });

    act(() => result.current('실패했어요', 'error'));
    for (const key of [...publicKeys('target'), v1Keys.adminLeagueMatch('target')]) expect(invalidated(key)).toBe(false);

    act(() => result.current('저장했어요'));
    for (const key of [...publicKeys('target'), v1Keys.adminLeagueMatch('target')]) expect(invalidated(key)).toBe(true);
    for (const key of publicKeys('other')) expect(invalidated(key)).toBe(false);
  });
});

describe('경기 삭제 뒤 공개 캐시', () => {
  it('어드민 대진과 공개 대회 키를 함께 무효화한다', async () => {
    deleteMock.mockResolvedValue({ deleted: true });
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useV1DeleteFixture('target'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('f1');
    });

    expect(invalidated(v1Keys.adminTournamentBracket('target'))).toBe(true);
    expect(invalidated(v1Keys.tournament('target'))).toBe(true);
    expect(invalidated(v1Keys.tournament('other'))).toBe(false);
  });
});

describe('경기 생성 뒤 공개 캐시', () => {
  it('어드민 대진과 공개 대회 키를 함께 무효화하고 다른 대회는 건드리지 않는다', async () => {
    postMock.mockResolvedValue({ id: 'f-new' });
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useV1CreateFixture('target'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });

    expect(invalidated(v1Keys.adminTournamentBracket('target'))).toBe(true);
    expect(invalidated(v1Keys.tournament('target'))).toBe(true);
    expect(invalidated(v1Keys.tournament('other'))).toBe(false);
    expect(invalidated(v1Keys.adminTournamentBracket('other'))).toBe(false);
  });
});
