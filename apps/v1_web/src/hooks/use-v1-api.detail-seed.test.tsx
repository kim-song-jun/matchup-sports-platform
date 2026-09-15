/**
 * 상세 화면 첫 표시값(seed) 회귀 테스트.
 *
 * 상세 `page.tsx` 는 존재 확인·메타데이터 때문에 어차피 그 매치를 서버에서 받는데,
 * 그 응답을 버리고 클라이언트가 같은 매치를 처음부터 다시 받았다. 그래서 딥링크·푸시·
 * 새로고침으로 들어오면 첫 화면이 비어 있었다(목록을 거친 진입만 캐시 승계 혜택을 봤다).
 *
 * 여기서 못박는 계약은 두 가지다.
 *  1. seed 가 있으면 첫 렌더부터 그 값이 보이고 `isPlaceholderData` 가 true 다.
 *  2. seed 에 뷰어 상태가 실려 와도 **화면에 넘기지 않는다** — 비인증 공개 응답이라
 *     그 값은 "이 사용자"의 상태가 아니다. 그대로 쓰면 이미 신청한 매치에 "참가 신청"이
 *     뜨거나, 남의 신청 상태가 내 것처럼 보인다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Get: vi.fn().mockResolvedValue({
      id: 'match-1',
      matchId: 'match-1',
      title: '서버가 준 진짜 응답',
      sportName: '풋살',
      placeName: '신도림 풋살파크',
      startsAt: '2026-09-10T10:00:00.000Z',
      capacityText: '3/10',
      status: 'open',
      viewerState: 'requested',
    }),
  };
});

import { useV1Match } from './use-v1-api';
import type { V1Match } from '@/types/api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const seed = {
  id: 'match-1',
  matchId: 'match-1',
  title: '서버에서 받아 둔 매치',
  sportName: '풋살',
  placeName: '신도림 풋살파크',
  startsAt: '2026-09-10T10:00:00.000Z',
  capacityText: '3/10',
  status: 'open',
  // 공개(비인증) 응답에는 원래 없지만, 있더라도 화면으로 새면 안 된다.
  viewerState: 'host',
  viewer: { state: 'host', applicationId: 'app-1', participantId: null, canApply: false },
  participantsPreview: [{ participantId: 'p-1', userId: 'u-1', displayName: '남의 이름', role: 'host', status: 'confirmed' }],
} as unknown as V1Match;

describe('useV1Match — 서버 seed', () => {
  it('seed 가 있으면 첫 렌더부터 제목이 보이고 placeholder 로 표시된다', async () => {
    const { result } = renderHook(() => useV1Match('match-1', { seed }), { wrapper });

    expect(result.current.data?.title).toBe('서버에서 받아 둔 매치');
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.title).toBe('서버가 준 진짜 응답');
  });

  it('seed 의 뷰어 상태·참가자는 화면으로 넘기지 않는다', () => {
    const { result } = renderHook(() => useV1Match('match-1', { seed }), { wrapper });

    expect(result.current.data?.viewerState).toBeUndefined();
    expect(result.current.data?.viewer).toBeUndefined();
    expect(result.current.data?.participantsPreview).toBeUndefined();
  });

  it('seed 가 없으면 placeholder 없이 로딩부터 시작한다', () => {
    const { result } = renderHook(() => useV1Match('match-1'), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });
});
