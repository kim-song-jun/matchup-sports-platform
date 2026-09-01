/**
 * 팀·공지 상세 seed 계약.
 *
 * 두 화면 모두 서버 컴포넌트가 구조화 데이터·존재 확인을 위해 이미 응답을 받는다. 그것을
 * 넘겨 첫 화면을 채우되, 팀 응답은 **비인증**이라 `viewer` 가 "비로그인"으로 채워져 온다
 * (alpha 실측: role='none', canRequestJoin=false, disabledReason='LOGIN_REQUIRED').
 * `viewer` 는 required 라 지울 수 없으므로 화면이 `isPlaceholderData` 로 잠근다 —
 * 여기서는 그 전제(seed 가 placeholder 로 들어오고 곧 실응답으로 교체된다)를 고정한다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Get: vi.fn().mockImplementation((path: string) =>
      path.startsWith('/teams/')
        ? Promise.resolve({ id: 't1', teamId: 't1', name: '서버가 준 진짜 팀', viewer: { role: 'owner', membershipId: 'm1', joinState: 'joined', canRequestJoin: false, disabledReason: null, manageRoute: '/my/teams/t1' } })
        : Promise.resolve({ notice: { noticeId: 'n1', title: '서버가 준 진짜 공지' } }),
    ),
  };
});

import { useV1Notice, useV1TeamDetail } from './use-v1-api';
import type { V1NoticeResponse, V1TeamDetail } from '@/types/api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const teamSeed = {
  id: 't1',
  teamId: 't1',
  name: '서버에서 받아 둔 팀',
  // 비인증 응답이 실제로 주는 모양 그대로.
  viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false, disabledReason: 'LOGIN_REQUIRED', manageRoute: null },
} as unknown as V1TeamDetail;

const noticeSeed = { notice: { noticeId: 'n1', title: '서버에서 받아 둔 공지' } } as unknown as V1NoticeResponse;

describe('useV1TeamDetail — 서버 seed', () => {
  it('seed 가 있으면 첫 렌더부터 팀 이름이 보이고 placeholder 로 표시된다', async () => {
    const { result } = renderHook(() => useV1TeamDetail('t1', { seed: teamSeed }), { wrapper });

    expect(result.current.data?.name).toBe('서버에서 받아 둔 팀');
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.name).toBe('서버가 준 진짜 팀');
    // 실응답에는 이 사용자의 진짜 권한이 담긴다 — 화면 잠금은 이 시점에 풀린다.
    expect(result.current.data?.viewer.role).toBe('owner');
  });

  it('seed 가 없으면 placeholder 없이 로딩부터 시작한다', () => {
    const { result } = renderHook(() => useV1TeamDetail('t1'), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

describe('useV1Notice — 서버 seed', () => {
  it('seed 가 있으면 첫 렌더부터 공지 제목이 보인다', async () => {
    const { result } = renderHook(() => useV1Notice('n1', { seed: noticeSeed }), { wrapper });

    expect(result.current.data?.notice?.title).toBe('서버에서 받아 둔 공지');
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.notice?.title).toBe('서버가 준 진짜 공지');
  });
});
