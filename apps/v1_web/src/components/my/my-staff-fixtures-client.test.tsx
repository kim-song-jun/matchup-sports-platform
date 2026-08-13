import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyStaffFixturesPageClient, selectMyFixtures } from './my-staff-fixtures-client';
import type { PublicScheduleEntry } from '@/components/public-game-records/types';
import type { V1MyTournamentStaffAssignment } from '@/types/api';

/**
 * 필드 담당자가 자기 경기 콘솔에 도달하는 유일한 경로의 회귀 테스트.
 *
 * 배경(2026-08-13 alpha 실측): 마이페이지 카드가 역할과 무관하게 운영 보드로 링크해서
 * 필드 담당자는 403 → 깨진 CTA(404)로 이어지는 막다른 길에 갇혔다. 이 화면이 그 사이를
 * 메우므로, "담당 경기만 나온다 / 콘솔로 링크된다 / 배정 없으면 정직하게 알린다"를 못박는다.
 */

const apiMocks = vi.hoisted(() => ({
  useV1MyTournamentStaffAssignments: vi.fn(),
  usePublicTournamentSchedule: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1MyTournamentStaffAssignments: apiMocks.useV1MyTournamentStaffAssignments,
}));

vi.mock('@/components/public-game-records/use-public-game-records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/public-game-records/use-public-game-records')>()),
  usePublicTournamentSchedule: apiMocks.usePublicTournamentSchedule,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/tournament-staff/t-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function entry(overrides: Partial<PublicScheduleEntry> & { fixtureId: string }): PublicScheduleEntry {
  return {
    round: '조별 1라운드',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: null,
    venue: null,
    fieldName: null,
    home: { registrationId: 'r-h', teamId: 'th', teamName: '성수 FC' },
    away: { registrationId: 'r-a', teamId: 'ta', teamName: '망원 FC' },
    visibilityMode: 'live',
    status: 'scheduled',
    resultState: 'none',
    scoreStatus: 'none',
    score: null,
    clock: null,
    periodBreak: null,
    scorers: [],
    hasVideo: false,
    ...overrides,
  } as PublicScheduleEntry;
}

function assignment(
  overrides: Partial<V1MyTournamentStaffAssignment> = {},
): V1MyTournamentStaffAssignment {
  return {
    id: 'a-1',
    role: 'FIELD_OPERATOR',
    fieldId: null,
    fieldName: null,
    fixtureIds: [],
    version: 0,
    expiresAt: null,
    ...overrides,
  } as V1MyTournamentStaffAssignment;
}

function mockData(assignments: V1MyTournamentStaffAssignment[], entries: PublicScheduleEntry[]) {
  apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
    data: {
      items: [
        { tournamentId: 't-1', tournamentTitle: '성수 5인제 컵', tournamentStatus: 'in_progress', assignments },
      ],
    },
    isLoading: false,
    isError: false,
  });
  apiMocks.usePublicTournamentSchedule.mockReturnValue({
    data: { pages: [{ items: entries, unscheduled: [] }] },
    isLoading: false,
    isError: false,
  });
}

describe('selectMyFixtures', () => {
  it('경기 스코프가 있으면 그 경기만 고른다', () => {
    const entries = [entry({ fixtureId: 'fx-1' }), entry({ fixtureId: 'fx-2' })];
    const picked = selectMyFixtures(entries, [assignment({ fixtureIds: ['fx-2'] })]);
    expect(picked.map((f) => f.fixtureId)).toEqual(['fx-2']);
  });

  it('필드 단위 배정은 같은 필드의 경기를 고른다', () => {
    const entries = [
      entry({ fixtureId: 'fx-1', fieldName: 'A구장' }),
      entry({ fixtureId: 'fx-2', fieldName: 'B구장' }),
    ];
    const picked = selectMyFixtures(entries, [assignment({ fieldId: 'f-1', fieldName: 'A구장' })]);
    expect(picked.map((f) => f.fixtureId)).toEqual(['fx-1']);
  });

  it('필드가 붙지 않은 경기는 필드 단위 배정으로 잡히지 않는다', () => {
    // alpha 실데이터가 정확히 이 상태다 — 경기에 필드가 하나도 배정돼 있지 않다.
    const entries = [entry({ fixtureId: 'fx-1', fieldName: null })];
    expect(selectMyFixtures(entries, [assignment({ fieldId: 'f-1', fieldName: 'A구장' })])).toEqual([]);
  });

  it('필드 담당자 배정이 없으면 아무것도 고르지 않는다', () => {
    const entries = [entry({ fixtureId: 'fx-1' })];
    expect(selectMyFixtures(entries, [assignment({ role: 'TOURNAMENT_DIRECTOR' })])).toEqual([]);
  });
});

describe('MyStaffFixturesPageClient', () => {
  it('담당 경기만 보여주고 각 행이 경기 콘솔로 링크된다', () => {
    mockData(
      [assignment({ fixtureIds: ['fx-1'] })],
      [
        entry({ fixtureId: 'fx-1', home: { registrationId: 'r', teamId: 't', teamName: '성수 FC' } }),
        entry({ fixtureId: 'fx-9', home: { registrationId: 'r', teamId: 't', teamName: '남의 팀' } }),
      ] as PublicScheduleEntry[],
    );

    render(<MyStaffFixturesPageClient tournamentId="t-1" />);

    const link = screen.getByRole('link', { name: /성수 FC 대 망원 FC, 경기 운영 콘솔 열기/ });
    expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/t-1/fixtures/fx-1/operate');
    expect(screen.queryByText(/남의 팀/)).toBeNull();
  });

  it('담당 경기가 없으면 이유를 정직하게 알린다', () => {
    mockData([assignment({ fieldId: 'f-1', fieldName: 'A구장' })], [entry({ fixtureId: 'fx-1', fieldName: null })]);

    render(<MyStaffFixturesPageClient tournamentId="t-1" />);

    expect(screen.getByText('아직 담당 경기가 배정되지 않았어요')).toBeInTheDocument();
  });

  it('이 대회 배정 자체가 없으면 배정 없음을 알린다', () => {
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
    });
    apiMocks.usePublicTournamentSchedule.mockReturnValue({
      data: { pages: [{ items: [], unscheduled: [] }] },
      isLoading: false,
      isError: false,
    });

    render(<MyStaffFixturesPageClient tournamentId="t-1" />);

    expect(screen.getByText('이 대회의 담당 배정이 없어요')).toBeInTheDocument();
  });
});
