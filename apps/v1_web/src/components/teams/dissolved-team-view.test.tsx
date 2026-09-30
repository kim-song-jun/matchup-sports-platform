/**
 * 해체된 팀 페이지(Task 180 H3 결정 "기록 전부 보존 + 읽기 전용") — `/teams/:id` 가 보관 팀에
 * `dissolution` 을 담아 주면 운영 화면 대신 읽기 전용 화면이 뜨고, 전적으로 가는 길이 남는다.
 * 페이지는 서버가 받은 응답을 seed 로 넘기므로(page.tsx) 여기서도 seed 로 그린다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamDetail, V1TeamDissolutionInfo } from '@/types/api';
import { TeamDetailPageClient } from './teams-client';

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-old',
}));

function dissolvedTeam(dissolution: V1TeamDissolutionInfo): V1TeamDetail {
  return {
    teamId: 'team-old',
    name: '망원 새벽 FC',
    status: 'archived',
    visibility: 'public',
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-mapo', name: '마포구', parentName: '서울' },
    membersVisibilityEnabled: false,
    canViewMembers: false,
    profile: {
      logoUrl: null,
      coverImageUrl: null,
      introduction: null,
      activityAreaText: null,
      activityDays: [],
      activityFrequency: null,
      activityTimeSlots: [],
      activityTypes: [],
      activityMemo: null,
      activitySummary: null,
      skillLevelText: null,
      joinPolicy: 'approval_required',
      memberGoalCount: null,
    },
    membersPreview: [],
    memberCount: 12,
    managerCount: 1,
    owner: { userId: 'user-owner', displayName: '김도윤', profileImageUrl: null },
    trust: { trustState: 'sample', score: null },
    viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false, disabledReason: 'TEAM_DISSOLVED', manageRoute: null },
    dissolution,
  };
}

let server: ReturnType<typeof setupServer>;
let unhandled: string[];
let seed: V1TeamDetail;

function start(team: V1TeamDetail) {
  seed = team;
  unhandled = [];
  server = setupServer(
    http.get('*/api/v1/teams/:teamId', () => HttpResponse.json({ status: 'success', data: team, timestamp: '2026-10-01T00:00:00.000Z' })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:unhandled', ({ request }) => unhandled.push(`${request.method} ${new URL(request.url).pathname}`));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  navigation.searchParams = new URLSearchParams();
});

afterEach(() => {
  // 읽기 전용 페이지는 활동 팀 조회(로그인 확인·가입 자격·팀매치·리그)를 부르지 않는다.
  expect(unhandled).toEqual([]);
  server.close();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamDetailPageClient teamId="team-old" seed={seed} />
    </QueryClientProvider>,
  );
}

const EXPIRED: V1TeamDissolutionInfo = { dissolvedAt: '2026-08-01T03:00:00.000Z', restoreDeadlineAt: '2026-08-31T03:00:00.000Z', canRestore: false };

describe('해체된 팀 페이지', () => {
  it('읽기 전용으로 팀 이름·해체일을 보여 주고, 가입·운영 입구 없이 전적으로 가는 길을 남긴다', async () => {
    start(dissolvedTeam(EXPIRED));
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: '망원 새벽 FC' })).toBeInTheDocument();
    expect(screen.getByText('해체된 팀')).toBeInTheDocument();
    expect(screen.getByText(/8월 1일 \(토\)에 해체된 팀이에요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /팀 전적·지난 경기/ })).toHaveAttribute('href', '/teams/team-old/records?from=%2Fteams%2Fteam-old');
    expect(screen.queryByRole('button', { name: /가입/ })).not.toBeInTheDocument();
    expect(screen.queryByText('잘못 해체했나요?')).not.toBeInTheDocument();
  });

  it('알림에서 들어와도 막다른 길이 아니다 — 전적 링크가 알림 출처까지 이어 싣는다', async () => {
    navigation.searchParams = new URLSearchParams({ from: '/notifications' });
    start(dissolvedTeam(EXPIRED));
    renderPage();

    const records = await screen.findByRole('link', { name: /팀 전적·지난 경기/ });
    const from = new URL(records.getAttribute('href') ?? '', 'https://teameet.test').searchParams.get('from');
    expect(from).toBe('/teams/team-old?from=%2Fnotifications');
  });

  it('30일 안의 팀장에게만 복구 안내와 해체한 팀 목록 링크를 준다', async () => {
    start(dissolvedTeam({ dissolvedAt: '2026-09-20T06:00:00.000Z', restoreDeadlineAt: '2026-10-20T06:00:00.000Z', canRestore: true }));
    renderPage();

    expect(await screen.findByText('잘못 해체했나요?')).toBeInTheDocument();
    expect(screen.getByText(/10\/20 \(화\) 15:00까지 마이 > 팀 > 해체한 팀에서 복구할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '해체한 팀에서 복구하기' })).toHaveAttribute('href', '/my/teams');
  });
});
