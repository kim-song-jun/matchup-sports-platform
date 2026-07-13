import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AddPlayer,
  useV1Registration,
  useV1RemovePlayer,
  useV1Tournament,
  useV1TournamentPlayers,
  useV1UpdatePlayer,
} from '@/hooks/use-v1-api';
import { TournamentRosterPageClient, getRosterDeadlineState } from './tournament-roster-client';

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: vi.fn(),
  useV1Registration: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1AddPlayer: vi.fn(),
  useV1UpdatePlayer: vi.fn(),
  useV1RemovePlayer: vi.fn(),
}));

const useV1TournamentMock = vi.mocked(useV1Tournament);
const useV1RegistrationMock = vi.mocked(useV1Registration);
const useV1TournamentPlayersMock = vi.mocked(useV1TournamentPlayers);
const useV1AddPlayerMock = vi.mocked(useV1AddPlayer);
const useV1UpdatePlayerMock = vi.mocked(useV1UpdatePlayer);
const useV1RemovePlayerMock = vi.mocked(useV1RemovePlayer);

const PAST_DEADLINE = '2020-01-01T00:00:00.000Z';
const FUTURE_DEADLINE = '2099-01-01T00:00:00.000Z';

function mockPlayer() {
  return {
    id: 'player-1',
    userId: 'user-1',
    realName: '홍길동',
    birthDateSnapshot: '1995-03-15',
    eligibilityStatus: 'non_pro' as const,
    eligibilityNote: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    removedAt: null,
  };
}

describe('TournamentRosterPageClient — 명단 제출 마감 배너/액션 차단', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    useV1TournamentPlayersMock.mockReturnValue({
      data: { players: [mockPlayer()], belowMinimum: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TournamentPlayers>);
    useV1AddPlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1AddPlayer>);
    useV1UpdatePlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1UpdatePlayer>);
    useV1RemovePlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1RemovePlayer>);
  });

  function mockTournament(rosterDeadlineAt: string | null) {
    useV1TournamentMock.mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt },
    } as unknown as ReturnType<typeof useV1Tournament>);
  }

  function mockRegistration(rosterDeadlineOverrideAt: string | null) {
    useV1RegistrationMock.mockReturnValue({
      data: {
        id: 'reg-1',
        teamId: 'team-1',
        status: 'confirmed',
        rosterLockedAt: null,
        rosterDeadlineOverrideAt,
      },
    } as unknown as ReturnType<typeof useV1Registration>);
  }

  it('shows no deadline banner and keeps the add-player action enabled before the deadline', () => {
    mockTournament(FUTURE_DEADLINE);
    mockRegistration(null);

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.queryByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선수 추가하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 수정' })).toBeInTheDocument();
  });

  it('shows the blocked banner and hides edit/remove actions once the deadline has passed with no override', () => {
    mockTournament(PAST_DEADLINE);
    mockRegistration(null);

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.getByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 수정' })).not.toBeInTheDocument();
  });

  it('keeps editing open and shows the override notice when an admin has granted a deadline exception', () => {
    mockTournament(PAST_DEADLINE);
    mockRegistration('2026-01-05T00:00:00.000Z');

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.queryByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 수정' })).toBeInTheDocument();
  });
});

describe('getRosterDeadlineState', () => {
  it('never blocks when there is no roster deadline set', () => {
    expect(getRosterDeadlineState(null, null)).toEqual({ blocked: false, overridden: false });
  });

  it('does not block before the deadline', () => {
    expect(getRosterDeadlineState(FUTURE_DEADLINE, null)).toEqual({
      blocked: false,
      overridden: false,
    });
  });

  it('blocks after the deadline when there is no override', () => {
    expect(getRosterDeadlineState(PAST_DEADLINE, null)).toEqual({
      blocked: true,
      overridden: false,
    });
  });

  it('does not block after the deadline when an override is present, and flags it as overridden', () => {
    expect(getRosterDeadlineState(PAST_DEADLINE, '2020-01-02T00:00:00.000Z')).toEqual({
      blocked: false,
      overridden: true,
    });
  });

  it('treats an invalid deadline string as not blocking', () => {
    expect(getRosterDeadlineState('not-a-date', null)).toEqual({ blocked: false, overridden: false });
  });
});
