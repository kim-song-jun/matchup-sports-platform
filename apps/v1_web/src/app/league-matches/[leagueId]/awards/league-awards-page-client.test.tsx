import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useV1ActivePopup, useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { LeagueAwardsPageClient } from './league-awards-page-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1LeagueMatch: vi.fn(),
  useV1LeagueMatchStandings: vi.fn(),
  useV1LeagueMatchPlayerRecords: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — league-match-standings-client.test.tsx와
  // 동일한 이유로 필요하다(<Providers>로 렌더하는 모든 테스트가 이 두 훅을 mocking해야 한다).
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1LeagueMatchMock = vi.mocked(useV1LeagueMatch, { partial: true });
const useV1LeagueMatchStandingsMock = vi.mocked(useV1LeagueMatchStandings, { partial: true });
const useV1LeagueMatchPlayerRecordsMock = vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true });

function renderAwards(leagueId = 'league-1') {
  return render(
    <Providers>
      <LeagueAwardsPageClient leagueId={leagueId} />
    </Providers>,
  );
}

describe('LeagueAwardsPageClient', () => {
  it('종료되지 않은 리그로 들어오면 빈 화면 대신 안내와 순위표로 돌아가는 링크를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: undefined } as never);

    const { container } = renderAwards();

    expect(await screen.findByText(/리그가 진행 중이에요/)).toBeInTheDocument();
    // 종료 전이므로 우승·순위 콘텐츠는 전혀 그려지지 않는다.
    expect(screen.queryByText('시상 결과')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/league-matches/league-1"]')).toBeInTheDocument();
  });

  it('준비 중(draft) 리그도 종료 전과 같은 안내로 처리한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '겨울 리그', state: 'draft',
        startsOn: '2026-12-01T00:00:00.000Z', endsOn: '2027-02-01T00:00:00.000Z',
        teamIds: [], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: undefined } as never);

    renderAwards();

    expect(await screen.findByText(/리그가 아직 시작되지 않았어요/)).toBeInTheDocument();
  });

  it('종료된 리그는 공동 우승 팀 둘 다 보여주고 최종 순위에 트로피로 표시한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2', 't3'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, points: 9, promotionKind: 'promoted', promotionToTierLabel: '1부' },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, points: 9, promotionKind: 'promoted', promotionToTierLabel: '1부' },
          { teamId: 't3', teamName: '연남 FC', teamLogoUrl: null, position: 3, played: 3, wins: 0, draws: 0, losses: 3, goalsFor: 0, goalsAgainst: 9, points: 0, promotionKind: 'relegated', promotionToTierLabel: '3부' },
        ],
        pendingFixtures: [],
        champions: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null },
        ],
        promotionDecided: true,
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        goals: [
          { userId: 'u1', nickname: '김민준', goals: 5 },
          { userId: 'u2', nickname: '이서준', goals: 5 },
        ],
        assists: [{ userId: 'u3', nickname: '박도윤', assists: 4 }],
      },
    } as never);

    renderAwards();

    // 히어로 캡션 + 아바타 캡션 양쪽에 두 우승팀 이름이 모두 보인다(팀명이 두 자리에서
    // 반복되므로 getByText 단수 매처 대신 textContent로 존재 여부만 확인한다).
    expect(await screen.findByText(/공동 우승을 축하드려요/)).toBeInTheDocument();
    const heroSection = screen.getByText('시상 결과').closest('section');
    expect(heroSection).not.toBeNull();
    expect(heroSection?.textContent).toContain('성수 FC');
    expect(heroSection?.textContent).toContain('망원 FC');

    // 최종 순위에도 세 팀이 전부 나오고, 강등팀은 강등 뱃지를 단다.
    const standingsSection = screen.getByText('최종 순위').closest('section');
    expect(within(standingsSection as HTMLElement).getByText('연남 FC')).toBeInTheDocument();
    expect(within(standingsSection as HTMLElement).getByText('강등')).toBeInTheDocument();

    // 공동 득점왕도 둘 다 보인다.
    const scorerSection = screen.getByText('득점왕').closest('section');
    expect(within(scorerSection as HTMLElement).getByText(/김민준/)).toBeInTheDocument();
    expect(within(scorerSection as HTMLElement).getByText(/이서준/)).toBeInTheDocument();
  });

  it('리그 조회가 실패하면 에러 상태와 재시도 버튼을 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    const refetch = vi.fn();
    useV1LeagueMatchMock.mockReturnValue({ data: undefined, isError: true, error: new Error('boom'), refetch } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: undefined } as never);

    renderAwards('bad-id');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    screen.getByRole('button', { name: '다시 시도하기' }).click();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});
