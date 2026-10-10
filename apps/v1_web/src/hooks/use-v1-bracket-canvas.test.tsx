import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get: vi.fn(), v1Post: vi.fn(), v1Put: vi.fn(), v1Patch: vi.fn() };
});

import { v1Get, v1Patch, v1Post, v1Put } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { resultReviewKeys } from '@/hooks/use-tournament-result-review';
import {
  useV1AddBracketFixture,
  useV1ApplyBracketTemplate,
  useV1AssignTournamentSlot,
  useV1QuickResult,
  useV1RandomFillSlots,
  useV1SetBracketSources,
} from './use-v1-bracket-canvas';

const getMock = vi.mocked(v1Get);
const postMock = vi.mocked(v1Post);
const putMock = vi.mocked(v1Put);
const patchMock = vi.mocked(v1Patch);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { wrapper, invalidate, client };
}

const invalidatedKeys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([filters]) => filters?.queryKey);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  patchMock.mockReset();
});

describe('useV1QuickResult', () => {
  it('clientCommandId 를 본문과 Idempotency-Key 헤더에 같은 값으로 보내고, 호출마다 새로 만든다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 2, away: 1 } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1QuickResult('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } });
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } });
    });

    const [path, body, init] = postMock.mock.calls[0];
    expect(path).toBe('/admin/games/g1/quick-result');
    const sent = body as { clientCommandId: string; expectedVersion: number; score: unknown };
    expect(sent.clientCommandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sent).toMatchObject({ expectedVersion: 3, score: { home: 2, away: 1 } });
    expect((init as RequestInit).headers).toEqual({ 'Idempotency-Key': sent.clientCommandId });
    const second = postMock.mock.calls[1][1] as { clientCommandId: string };
    expect(second.clientCommandId).not.toBe(sent.clientCommandId);
  });

  it('성공하면 대진·공개 대회·그 경기의 결과 키를 모두 무효화한다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 1, away: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1QuickResult('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 1, away: 0 } });
    });

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(v1Keys.adminTournamentBracket('t1'));
    expect(keys).toContainEqual(v1Keys.tournament('t1'));
    expect(keys).toContainEqual(resultReviewKeys.game('g1'));
    expect(keys).toContainEqual(resultReviewKeys.revisions('g1'));
  });

  it('리그 범위는 리그 상세 키만 무효화하고 대회 대진 키는 건드리지 않는다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 1, away: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1QuickResult('l1', 'league'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 1, away: 0 } });
    });

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(v1Keys.adminLeagueMatch('l1'));
    expect(keys).not.toContainEqual(v1Keys.adminTournamentBracket('l1'));
  });
});

describe('useV1AssignTournamentSlot', () => {
  it('PUT /admin/tournament-slots/:slotId/assignment 에 registrationId(비우기는 null)를 보낸다', async () => {
    putMock.mockResolvedValue({ slot: { id: 's1' }, affectedTeamMatchIds: [] });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1AssignTournamentSlot('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ slotId: 's1', registrationId: 'reg1' });
      await result.current.mutateAsync({ slotId: 's1', registrationId: null });
    });

    expect(putMock).toHaveBeenNthCalledWith(1, '/admin/tournament-slots/s1/assignment', { registrationId: 'reg1' });
    expect(putMock).toHaveBeenNthCalledWith(2, '/admin/tournament-slots/s1/assignment', { registrationId: null });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});

describe('useV1RandomFillSlots · useV1ApplyBracketTemplate', () => {
  it('무작위 채우기는 본문 없이 POST 한다', async () => {
    postMock.mockResolvedValue({ assignments: [] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1RandomFillSlots('t1', 'tournament'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/slots/random-fill');
  });

  it('템플릿은 kind 별 필드를 평탄하게 보내고 replaceExisting 을 그대로 전달한다', async () => {
    postMock.mockResolvedValue({ groups: 3, slots: 8, fixtures: 7, edges: 6 });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1ApplyBracketTemplate('t1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ kind: 'knockout', size: 8, thirdPlace: false, replaceExisting: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/bracket/template', {
      kind: 'knockout',
      size: 8,
      thirdPlace: false,
      replaceExisting: true,
    });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});

describe('useV1SetBracketSources', () => {
  it('경기별 bracket-sources 로 홈·어웨이 원천을 보내고 대진 캐시를 무효화한다', async () => {
    patchMock.mockResolvedValue({});
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1SetBracketSources('t1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ fixtureId: 'f9', homeSourceFixtureId: 'q1', awaySourceFixtureId: null });
    });

    expect(patchMock).toHaveBeenCalledWith('/admin/fixtures/f9/bracket-sources', {
      homeSourceFixtureId: 'q1',
      awaySourceFixtureId: null,
    });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});

describe('useV1AddBracketFixture', () => {
  it('경기 번호는 보내지 않고 조와 라운드만 보낸다 — 번호는 서버가 정한다', async () => {
    postMock.mockResolvedValue({ id: 'new' });
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1AddBracketFixture('t1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ groupId: 'g1', round: 'league_r2' });
    });

    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/fixtures', { groupId: 'g1', round: 'league_r2' });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('만든 뒤 어드민 대진과 대회 상세·공개 일정 캐시를 같이 무효화한다', async () => {
    postMock.mockResolvedValue({ id: 'new' });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1AddBracketFixture('t1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ groupId: 'g1', round: 'league_r1' });
    });

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(v1Keys.adminTournamentBracket('t1'));
    expect(keys).toContainEqual(v1Keys.tournament('t1'));
  });
});
