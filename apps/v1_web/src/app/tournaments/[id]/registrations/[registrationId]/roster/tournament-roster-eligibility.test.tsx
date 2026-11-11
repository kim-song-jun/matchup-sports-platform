import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AddPlayer,
  useV1Registration,
  useV1RemovePlayer,
  useV1TeamDetail,
  useV1Tournament,
  useV1TournamentPlayers,
  useV1UpdatePlayer,
} from '@/hooks/use-v1-api';
import { TournamentRosterPageClient } from './tournament-roster-client';

/**
 * MD-QA #192 — 팀장 명단 화면의 선출 기준 안내와 운영진 확인 잠금.
 * 기준 문구는 사용자 확정(2026-11-11): 등급·기간을 하드코딩하지 않고 대회 요강에 맡긴다.
 */
vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: vi.fn(),
  useV1Registration: vi.fn(),
  useV1TeamDetail: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1AddPlayer: vi.fn(),
  useV1UpdatePlayer: vi.fn(),
  useV1UpdatePlayerJersey: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useV1RemovePlayer: vi.fn(),
}));

const CRITERIA = 'KFA 등록 이력(JoinKFA)으로 확인하고, 세부 기준은 대회 요강을 따라요.';

function player(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-1',
    jerseyNumber: null as number | null,
    userId: 'user-1',
    realName: '홍길동',
    nickname: '길동이',
    birthDateSnapshot: '1995-03-15',
    genderSnapshot: 'male' as const,
    personalInfoVisible: true,
    eligibilityStatus: 'non_pro' as const,
    eligibilityNote: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    removedAt: null,
    ...overrides,
  };
}

function mockPlayers(players: ReturnType<typeof player>[]) {
  vi.mocked(useV1TournamentPlayers).mockReturnValue({
    data: { players, belowMinimum: false },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useV1TournamentPlayers>);
}

describe('팀장 명단 — 선출 기준 안내와 운영진 확인 잠금 (MD-QA #192)', () => {
  beforeEach(() => {
    vi.mocked(useV1Tournament).mockReturnValue({
      data: { minPlayers: 1, maxPlayers: 20, rosterDeadlineAt: '2099-01-01T00:00:00.000Z', status: 'open' },
    } as unknown as ReturnType<typeof useV1Tournament>);
    vi.mocked(useV1Registration).mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as unknown as ReturnType<typeof useV1Registration>);
    vi.mocked(useV1TeamDetail).mockReturnValue({
      data: { viewer: { role: 'owner' } },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TeamDetail>);
    for (const hook of [useV1AddPlayer, useV1UpdatePlayer, useV1RemovePlayer] as const) {
      vi.mocked(hook).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('판정 전 선수를 고칠 때 선출 기준 문장과 JoinKFA 새 탭 링크를 보여 준다', () => {
    mockPlayers([player()]);
    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    fireEvent.click(screen.getByRole('button', { name: '길동이 수정' }));

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText(CRITERIA, { exact: false })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /JoinKFA에서 등록 이력 보기/ });
    expect(link).toHaveAttribute('href', 'https://www.joinkfa.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByText('(새 탭에서 열려요)')).toHaveClass('sr-only');
    expect(screen.getByText('Teameet은 JoinKFA에 선수 정보를 보내지 않아요.')).toBeInTheDocument();
  });

  it('운영진이 확인한 선수는 "운영진 확인 완료(방법)" 으로 잠기고 선출 여부를 고를 수 없다', () => {
    mockPlayers([player({ eligibilityAdminReviewed: true, eligibilityVerificationMethod: 'joinkfa' })]);
    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByText('운영진 확인 완료(JoinKFA)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '길동이 수정' }));

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText('변경이 필요하면 운영진에게 문의해 주세요.')).toBeInTheDocument();
  });

  it('확인 방법이 가려졌거나 옛 판정이면 괄호 없이 "운영진 확인 완료" 만 쓴다', () => {
    mockPlayers([player({ eligibilityAdminReviewed: true, eligibilityVerificationMethod: null })]);
    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByText('운영진 확인 완료')).toBeInTheDocument();
  });
});
