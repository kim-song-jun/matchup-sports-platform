import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Get: vi.fn().mockResolvedValue({ items: [] }),
    v1Post: vi.fn().mockResolvedValue({ id: 'dispute-1', status: 'accepted', resolution: 'correction', alreadyProcessed: false }),
  };
});

import { v1Get, v1Post } from '@/lib/api-client';
import {
  useV1AdminLeagueDisputes,
  useV1RejectLeagueDispute,
  useV1ResolveLeagueDispute,
} from './use-v1-api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

// D2 (E4): 어드민 이의 목록·처리 훅 — status 필터가 쿼리 파라미터로 실제 전달되는지,
// 수락/거부가 정확한 엔드포인트·body 로 나가는지를 검증한다(태스크 문서 테스트 요구사항).
describe('useV1AdminLeagueDisputes', () => {
  it('status 파라미터를 쿼리스트링으로 전달한다', async () => {
    const { result } = renderHook(() => useV1AdminLeagueDisputes('open'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1Get).toHaveBeenCalledWith('/admin/league-match-disputes', { status: 'open' });
  });

  it('status 가 없으면 쿼리 파라미터를 생략한다(전체 조회)', async () => {
    const { result } = renderHook(() => useV1AdminLeagueDisputes(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1Get).toHaveBeenCalledWith('/admin/league-match-disputes', undefined);
  });
});

describe('useV1ResolveLeagueDispute', () => {
  it('정정 요청을 disputeId 경로 + resolution/note/homeScore/awayScore body 로 보낸다', async () => {
    const { result } = renderHook(() => useV1ResolveLeagueDispute(), { wrapper });

    result.current.mutate({
      disputeId: 'dispute-1',
      body: { resolution: 'correction', note: '심판 오심 확인', homeScore: 3, awayScore: 1 },
    });

    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/league-match-disputes/dispute-1/resolve', {
      resolution: 'correction',
      note: '심판 오심 확인',
      homeScore: 3,
      awayScore: 1,
    });
  });

  it('무효 요청은 스코어 없이 보낸다', async () => {
    const { result } = renderHook(() => useV1ResolveLeagueDispute(), { wrapper });

    result.current.mutate({ disputeId: 'dispute-2', body: { resolution: 'void', note: '경기 자체가 무효' } });

    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/league-match-disputes/dispute-2/resolve', {
      resolution: 'void',
      note: '경기 자체가 무효',
    });
  });
});

describe('useV1RejectLeagueDispute', () => {
  it('거부 요청을 disputeId 경로 + note body 로 보낸다', async () => {
    const { result } = renderHook(() => useV1RejectLeagueDispute(), { wrapper });

    result.current.mutate({ disputeId: 'dispute-3', body: { note: '근거 부족' } });

    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/league-match-disputes/dispute-3/reject', { note: '근거 부족' });
  });
});
