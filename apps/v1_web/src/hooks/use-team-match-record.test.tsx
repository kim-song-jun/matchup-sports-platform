/**
 * W4-V15: 친선 기록 화면에서 첫 득점을 기록해도 "늦게 온 선수 추가"가 다시 열어야 보였다 — 그 입구를 여는
 * 참석명단의 `lateAdditionAllowed` 가 기록 뒤 다시 읽히지 않았다. 무효화 호출을 세지 않고 **참석명단이 실제로
 * 다시 불려 새 값을 주는지**를 본다.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Post };
});

import { useV1TeamMatchLineup } from './use-v1-api';
import { useMutateTeamMatchRecord, useTeamMatchRecord, type SharedRecord } from './use-team-match-record';

const MATCH = 'match-1';
const server = { recordVersion: 3, lateAdditionAllowed: false };

function record(version: number): SharedRecord {
  return {
    leagueId: null, tournamentId: null, teamMatchId: MATCH, title: '한강 vs 마포', startsAt: '2026-10-01T01:55:00Z', phase: 'live', version,
    serverTime: '2026-10-01T02:00:00Z', canEdit: true, participant: true, operator: false, ownSideId: 'home',
    lineupReady: true, missingSides: [], sides: [], subMatches: [], participants: [], goals: [], history: [], confirmations: [], officialAt: null, officialCorrected: false,
  };
}

function lineupFetches() {
  return v1Get.mock.calls.filter(([path]) => path === `/team-matches/${MATCH}/lineup`).length;
}

function renderRecordScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => ({ record: useTeamMatchRecord(MATCH), lineup: useV1TeamMatchLineup(MATCH), save: useMutateTeamMatchRecord(MATCH) }),
    { wrapper },
  );
}

describe('공동 기록이 바뀌면 늦게 온 선수 추가 창을 다시 읽는다 (W4-V15)', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    server.recordVersion = 3;
    server.lateAdditionAllowed = false;
    v1Get.mockImplementation(async (path: string) => {
      if (path === `/team-matches/${MATCH}/record`) return record(server.recordVersion);
      if (path === `/team-matches/${MATCH}/lineup`) return { lateAdditionAllowed: server.lateAdditionAllowed };
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it('내가 첫 득점을 저장하면 같은 화면에서 추가 창이 열린다', async () => {
    const { result } = renderRecordScreen();
    await waitFor(() => expect(result.current.lineup.data?.lateAdditionAllowed).toBe(false));
    await waitFor(() => expect(result.current.record.data?.version).toBe(3));

    server.recordVersion = 4;
    server.lateAdditionAllowed = true;
    v1Post.mockResolvedValue(record(4));
    await act(() => result.current.save.mutateAsync({ commandId: 'cmd-1', expectedVersion: 3, action: 'add', sideId: 'home' }));

    await waitFor(() => expect(result.current.lineup.data?.lateAdditionAllowed).toBe(true));
  });

  it('상대 팀이 기록해 폴링으로 버전이 바뀌어도 열린다', async () => {
    const { result } = renderRecordScreen();
    await waitFor(() => expect(result.current.lineup.data?.lateAdditionAllowed).toBe(false));
    await waitFor(() => expect(result.current.record.data?.version).toBe(3));

    server.recordVersion = 4;
    server.lateAdditionAllowed = true;
    await act(() => result.current.record.refetch());

    await waitFor(() => expect(result.current.lineup.data?.lateAdditionAllowed).toBe(true));
  });

  it('대조군 — 기록 버전이 그대로면 폴링마다 참석명단을 다시 부르지 않는다', async () => {
    const { result } = renderRecordScreen();
    await waitFor(() => expect(result.current.record.data?.version).toBe(3));
    await waitFor(() => expect(lineupFetches()).toBe(1));

    await act(() => result.current.record.refetch());
    await act(() => result.current.record.refetch());

    expect(lineupFetches()).toBe(1);
  });
});
