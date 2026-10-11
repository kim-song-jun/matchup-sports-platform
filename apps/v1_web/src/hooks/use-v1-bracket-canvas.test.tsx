import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get: vi.fn(), v1Post: vi.fn(), v1Put: vi.fn(), v1Patch: vi.fn() };
});

import { V1ApiError, v1Get, v1Patch, v1Post, v1Put } from '@/lib/api-client';
import { clearFixtureRequestKey } from '@/lib/fixture-request-key-store';
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
  clearFixtureRequestKey('t1');
  clearFixtureRequestKey('t2');
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
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const apiError = (statusCode: number) =>
    new V1ApiError({ status: 'error', statusCode, code: statusCode === 0 ? 'NETWORK_ERROR' : 'SOME_CODE', message: 'x', timestamp: '2026-10-11T00:00:00.000Z' });
  const sentKeys = () => postMock.mock.calls.map(([, body]) => (body as { clientCommandId: string }).clientCommandId);
  const add = async (tournamentId: string, input: { groupId: string; round: string }) => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1AddBracketFixture(tournamentId), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
  };

  it('경기 번호는 보내지 않고 조·라운드와 요청 키(UUID)만 보낸다 — 번호는 서버가 정한다', async () => {
    postMock.mockResolvedValue({ id: 'new' });
    await add('t1', { groupId: 'g1', round: 'league_r2' });

    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/fixtures', { groupId: 'g1', round: 'league_r2', clientCommandId: expect.stringMatching(UUID) });
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

  // 키 수명은 훅 인스턴스가 아니라 대회 단위다 — 화면이 다시 마운트돼도(새 훅 인스턴스) 이어진다.
  it.each([
    ['연결 끊김', apiError(0)],
    ['5xx', apiError(503)],
  ])('%s 실패 뒤 다른 훅 인스턴스로 같은 내용을 다시 보내도 같은 키다', async (_name, failure) => {
    postMock.mockRejectedValueOnce(failure).mockResolvedValue({ id: 'new' });
    const input = { groupId: 'g1', round: 'league_r2' };
    await add('t1', input);
    await add('t1', input);
    const [first, retry] = sentKeys();
    expect(retry).toBe(first);
  });

  it('성공하면 키를 버려 다음 추가는 새 키를 쓴다', async () => {
    postMock.mockResolvedValue({ id: 'new' });
    const input = { groupId: 'g1', round: 'league_r2' };
    await add('t1', input);
    await add('t1', input);
    const [first, next] = sentKeys();
    expect(next).not.toBe(first);
  });

  it('서버가 4xx 로 거절하면 키를 버린다 — 같은 키로 다시 보내도 같은 답이다', async () => {
    postMock.mockRejectedValueOnce(apiError(409)).mockResolvedValue({ id: 'new' });
    const input = { groupId: 'g1', round: 'league_r2' };
    await add('t1', input);
    await add('t1', input);
    const [first, next] = sentKeys();
    expect(next).not.toBe(first);
  });

  it('실패 뒤 보내는 내용(조·라운드)이 바뀌면 새 키를 쓴다', async () => {
    postMock.mockRejectedValueOnce(apiError(0)).mockResolvedValue({ id: 'new' });
    await add('t1', { groupId: 'g1', round: 'league_r2' });
    await add('t1', { groupId: 'g1', round: 'league_r3' });
    const [first, changed] = sentKeys();
    expect(changed).not.toBe(first);
  });

  it('다른 대회는 키를 공유하지 않는다', async () => {
    postMock.mockRejectedValue(apiError(0));
    const input = { groupId: 'g1', round: 'league_r2' };
    await add('t1', input);
    await add('t2', input);
    await add('t1', input);
    const [t1First, t2, t1Retry] = sentKeys();
    expect(t2).not.toBe(t1First);
    expect(t1Retry).toBe(t1First);
  });

  it('늦게 끝난 옛 요청의 실패는 그 사이 새로 만든 키를 지우지 않는다', async () => {
    let rejectOld: (error: unknown) => void = () => undefined;
    postMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1AddBracketFixture('t1'), { wrapper });
    let oldRequest: Promise<unknown> = Promise.resolve();
    act(() => {
      oldRequest = result.current.mutateAsync({ groupId: 'g1', round: 'league_r2' }).catch(() => undefined);
    });
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));

    postMock.mockRejectedValueOnce(apiError(0));
    await add('t1', { groupId: 'g1', round: 'league_r3' });
    await act(async () => {
      rejectOld(apiError(409));
      await oldRequest;
    });
    postMock.mockResolvedValue({ id: 'new' });
    await add('t1', { groupId: 'g1', round: 'league_r3' });

    const [, newContent, newContentRetry] = sentKeys();
    expect(newContentRetry).toBe(newContent);
  });
});
