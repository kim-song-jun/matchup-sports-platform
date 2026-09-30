/**
 * 홈 응답은 받은 초대 수·대기 가입 신청 수(유도 배너)와 팀 소속·다음 경기를 싣는다(Task 180 G7).
 * 초대·가입 신청을 처리한 뒤 홈으로 돌아왔을 때 배너가 남지 않도록, 처리 훅이 홈을 다시 불러오는지
 * 본다 — 무효화 호출 횟수를 세면 키를 틀리게 넘겨도 통과하므로 `v1Get('/home')` 재호출을 센다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Post };
});

import {
  useV1AcceptTeamInvitation,
  useV1ApproveTeamJoinApplication,
  useV1DeclineTeamInvitation,
  useV1Home,
  useV1RejectTeamJoinApplication,
} from './use-v1-api';

const TEAM_ID = 'team-1';

function renderWithHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => ({
      home: useV1Home(),
      accept: useV1AcceptTeamInvitation(),
      decline: useV1DeclineTeamInvitation(),
      approve: useV1ApproveTeamJoinApplication(TEAM_ID),
      reject: useV1RejectTeamJoinApplication(TEAM_ID),
    }),
    { wrapper },
  );
}

const homeFetchCount = () => v1Get.mock.calls.filter(([path]) => path === '/home').length;

describe('초대·가입 신청 처리 뒤 홈 다시 불러오기', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    v1Get.mockResolvedValue({});
    v1Post.mockResolvedValue({});
  });

  it.each([
    ['초대 수락', (r: ReturnType<typeof renderWithHome>['result']) => r.current.accept.mutateAsync({ invitationId: 'inv-1' })],
    ['초대 거절', (r: ReturnType<typeof renderWithHome>['result']) => r.current.decline.mutateAsync({ invitationId: 'inv-1' })],
    ['가입 신청 승인', (r: ReturnType<typeof renderWithHome>['result']) => r.current.approve.mutateAsync({ applicationId: 'app-1' })],
    ['가입 신청 거절', (r: ReturnType<typeof renderWithHome>['result']) => r.current.reject.mutateAsync({ applicationId: 'app-1' })],
  ])('%s 뒤 홈을 다시 불러온다', async (_label, act) => {
    const { result } = renderWithHome();
    await waitFor(() => expect(homeFetchCount()).toBe(1));

    await act(result);

    await waitFor(() => expect(homeFetchCount()).toBe(2));
  });
});
