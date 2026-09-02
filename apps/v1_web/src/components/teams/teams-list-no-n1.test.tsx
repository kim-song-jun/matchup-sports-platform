/**
 * 팀 목록은 **팀마다 상세를 부르지 않는다**.
 *
 * 예전에는 목록 항목에 활동 정보가 없으면 `useQueries` 로 팀마다 `/teams/:id` 를 불러
 * 채우려는 폴백이 있었다. 그 폴백은 성립할 수 없다 — 목록과 상세가 서버에서 **같은
 * 표현식**으로 같은 값을 만들기 때문이다(`apps/v1_api/src/teams/teams.service.ts` 의
 * 목록 190행·상세 2141행이 둘 다 `formatTeamActivitySummary(team.profile)`).
 * 목록이 비어 있다는 건 `team.profile` 에 활동 데이터가 없다는 뜻이고, 상세를 불러도 비어 있다.
 *
 * 실측(alpha, 2026-09-01): 팀 탭 진입 시 `/teams/:id` 가 44회 나갔고 개별 응답 980ms,
 * 응답시간 합 32.8초. 그 44회가 화면에 더해 준 값은 **없었다**.
 *
 * 주의 — 이 폴백은 **렌더를 막지 않는다**. 카드는 목록 응답만으로 그려지므로 탭 전환은
 * MutationObserver 기준 346ms 로 이미 빠르다(초기에 4.3초로 잰 것은 스켈레톤 대기
 * 타임아웃이 섞인 측정 오류였다). 이 테스트가 지키는 것은 체감 속도가 아니라 **아무
 * 값도 얻지 못하는 44회 요청이 다시 생기지 않는 것** 이다 — 서버 부하·모바일 데이터·배터리.
 *
 * 이 테스트가 잡는 버그: 누군가 같은 폴백을 되살려 N+1 이 다시 생기는 것.
 * 폴백을 되돌리면 `v1Get` 이 팀 상세 경로로 불려 red 가 된다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Team } from '@/types/api';

const apiClientMocks = vi.hoisted(() => ({
  // 경로 인자를 타입에 남겨 둔다 — 인자 없는 vi.fn 으로 두면 mock.calls 가 [][] 라
  // 아래 `.map(([path]) => ...)` 구조분해가 TS2493 으로 깨진다.
  v1Get: vi.fn(async (_path: string) => ({}) as unknown),
}));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  ...apiClientMocks,
}));

const hookMocks = vi.hoisted(() => ({
  useV1Teams: vi.fn(),
  useV1MasterSports: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecentSearches: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecordSearch: vi.fn(() => ({ mutate: vi.fn() })),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { TeamListPageClient } from './teams-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** 폴백이 걸리던 바로 그 조건 — 활동 정보가 둘 다 비어 있는 팀. */
function teamWithoutActivity(index: number): V1Team {
  return {
    id: `team-${index}`,
    teamId: `team-${index}`,
    name: `활동정보없는팀 ${index}`,
    sportName: '풋살',
    regionName: '서울 송파구',
    memberCount: 6,
    activitySummary: null,
    activityAreaText: null,
    activityDays: [],
    activityFrequency: null,
    activityTimeSlots: [],
    activityTypes: [],
    activityMemo: null,
  } as unknown as V1Team;
}

describe('팀 목록 N+1 방지', () => {
  beforeEach(() => {
    apiClientMocks.v1Get.mockClear();
    const items = Array.from({ length: 12 }, (_, i) => teamWithoutActivity(i));
    hookMocks.useV1Teams.mockReturnValue({ data: { items }, isLoading: false, isError: false });
  });

  it('활동 정보가 없는 팀이 12개여도 팀 상세를 한 번도 부르지 않는다', async () => {
    render(<TeamListPageClient />);
    await waitFor(() => expect(screen.getByText('활동정보없는팀 0')).toBeInTheDocument());

    // 렌더가 끝난 뒤에도 지연 발사가 없는지 한 틱 더 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const detailCalls = apiClientMocks.v1Get.mock.calls
      .map(([path]) => String(path))
      // `/teams/:id` 만 잡는다 — `/teams` 목록이나 `/teams/:id/members` 같은 하위 경로는 대상이 아니다.
      .filter((path) => /^\/teams\/[^/]+$/.test(path));

    expect(detailCalls).toEqual([]);
  });

  it('팀 수가 늘어도 상세 호출은 여전히 0이다 (N 에 비례하지 않는다)', async () => {
    const items = Array.from({ length: 44 }, (_, i) => teamWithoutActivity(i));
    hookMocks.useV1Teams.mockReturnValue({ data: { items }, isLoading: false, isError: false });

    render(<TeamListPageClient />);
    await waitFor(() => expect(screen.getByText('활동정보없는팀 43')).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const detailCalls = apiClientMocks.v1Get.mock.calls
      .map(([path]) => String(path))
      .filter((path) => /^\/teams\/[^/]+$/.test(path));

    expect(detailCalls).toHaveLength(0);
  });
});
