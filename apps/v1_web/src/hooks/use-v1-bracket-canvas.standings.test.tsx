// apps/v1_web/src/hooks/use-v1-bracket-canvas.standings.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1SlotStandingsPreview } from '@/types/bracket-standings-fill';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { useV1FillSlotsFromStandings, useV1SlotStandingsPreview } from './use-v1-bracket-canvas';

const PREVIEW: V1SlotStandingsPreview = {
  slots: [
    { slotId: 's1', label: 'A조 1위', state: 'ready', candidateRegistrationId: 'r1', candidateTeamName: '가FC', tiedRegistrationIds: [], currentRegistrationId: null },
  ],
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe('useV1SlotStandingsPreview', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('enabled=false 인 동안은 읽지 않고, true 가 되면 계약 경로로 읽는다', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ enabled }) => useV1SlotStandingsPreview('t1', enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(v1Get).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual(PREVIEW));
    expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview');
  });

  it('창을 다시 열 때마다 새로 읽는다 — 이전에 본 순위를 캐시로 보여 주지 않는다', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    const { wrapper } = makeWrapper();
    const first = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(v1Get).toHaveBeenCalledTimes(2));
    second.unmount();
  });
});

describe('useV1FillSlotsFromStandings', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('override 없이 부르면 빈 본문, 있으면 그대로 계약 경로로 보낸다', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(v1Post).toHaveBeenLastCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {});
    await act(async () => {
      await result.current.mutateAsync({ overrides: [{ slotId: 's2', registrationId: 'r2' }] });
    });
    expect(v1Post).toHaveBeenLastCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's2', registrationId: 'r2' }],
    });
  });

  it('성공하면 같은 화면의 순위 미리보기와 대진 캐시가 다시 읽힌다 (채운 자리가 currentRegistrationId 로 보이도록)', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    v1Post.mockResolvedValue({ assignments: [{ slotId: 's1', registrationId: 'r1' }], skipped: [] });
    const { wrapper } = makeWrapper();
    const preview = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(preview.result.current.isSuccess).toBe(true));
    const fill = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await fill.result.current.mutateAsync({});
    });
    await waitFor(() => expect(v1Get).toHaveBeenCalledTimes(2));
  });

  it('실패하면 캐시를 건드리지 않는다 (입력을 유지한 채 다시 시도할 수 있다)', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    v1Post.mockRejectedValue(new Error('SLOT_LOCKED'));
    const { wrapper } = makeWrapper();
    const preview = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(preview.result.current.isSuccess).toBe(true));
    const fill = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await expect(fill.result.current.mutateAsync({})).rejects.toThrow('SLOT_LOCKED');
    });
    expect(v1Get).toHaveBeenCalledTimes(1);
  });
});
