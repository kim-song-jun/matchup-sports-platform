/**
 * T6-3/T6-4 — 대진 탭 행 액션이 결과 검토·정정 콘솔로 `fixtureId`+`from=admin` 딥링크를
 * 실어 보내고, 예정/진행중 경기에는 "운영 콘솔 열기" CTA를 함께 노출하는지 검증한다.
 * mock 세팅은 tournament-detail-bracket-publish.test.tsx의 beforeEach를 그대로 재사용한다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  useV1AdminBracket,
  useV1AdminTournamentPlayers,
  useV1AssignGroupTeam,
  useV1CreateFixture,
  useV1CreateGroup,
  useV1DeleteFixture,
  useV1DeleteGroup,
  useV1PublishTournamentBracket,
  useV1UnpublishTournamentBracket,
  useV1RecalculateStandings,
  useV1RemoveGroupTeam,
  useV1UpdateFixture,
  useV1UpdateGroup,
} from '@/hooks/use-v1-api';
import { BracketTab } from './tournament-detail-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: vi.fn(),
  useV1AdminTournamentPlayers: vi.fn(),
  useV1CreateGroup: vi.fn(),
  useV1AssignGroupTeam: vi.fn(),
  useV1CreateFixture: vi.fn(),
  useV1RecalculateStandings: vi.fn(),
  useV1UpdateFixture: vi.fn(),
  useV1DeleteFixture: vi.fn(),
  useV1UpdateGroup: vi.fn(),
  useV1DeleteGroup: vi.fn(),
  useV1PublishTournamentBracket: vi.fn(),
  useV1UnpublishTournamentBracket: vi.fn(),
  useV1RemoveGroupTeam: vi.fn(),
}));

function noopMutationHook<T>(): T {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

function fixture(overrides: Partial<import('@/types/api').V1AdminBracketFixture>) {
  return {
    id: 'fx-9', tournamentId: 'tournament-1', groupId: null, round: '조별 A', fixtureNumber: 3,
    legNumber: 1, parentFixtureId: null, homeRegistrationId: 'r1', homeTeamName: '팀A',
    awayRegistrationId: 'r2', awayTeamName: '팀B', scheduledAt: null, venue: null,
    status: 'scheduled', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    result: null, videos: [], ...overrides,
  };
}

describe('BracketTab 행 액션 (T6-1/T6-4)', () => {
  beforeEach(() => {
    vi.mocked(useV1AdminTournamentPlayers).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    vi.mocked(useV1CreateGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1AssignGroupTeam).mockReturnValue(noopMutationHook());
    vi.mocked(useV1CreateFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1RecalculateStandings).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UpdateFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1DeleteFixture).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UpdateGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1DeleteGroup).mockReturnValue(noopMutationHook());
    vi.mocked(useV1RemoveGroupTeam).mockReturnValue(noopMutationHook());
    vi.mocked(useV1PublishTournamentBracket).mockReturnValue(noopMutationHook());
    vi.mocked(useV1UnpublishTournamentBracket).mockReturnValue(noopMutationHook());
  });

  it('결과 없는 예정 경기 — result-review로 fixtureId+from=admin 딥링크, 운영 열기 CTA도 보임', () => {
    vi.mocked(useV1AdminBracket).mockReturnValue({
      data: { groups: [], fixtures: [fixture({ status: 'scheduled', result: null })], standings: [] },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminBracket>);

    render(<BracketTab tournamentId="tournament-1" showToast={vi.fn()} registrations={[]} registrationDeadlineAt={null} bracketPublishedAt={null} bracketPublishScheduledAt={null} canWrite />);

    // AdminDataTable(scrollOnMobile)은 데스크톱 테이블 + 모바일 컴팩트 테이블을 동시에
    // DOM에 렌더한다(CSS hidden/lg:hidden으로만 전환 — jsdom은 레이아웃을 계산하지
    // 않는다). 그래서 각 행 액션이 항상 2벌 존재한다 — admin-shell/tournament-ops-shell
    // 테스트와 동일한 convention으로 getAllByRole을 쓴다.
    const reviewLinks = screen.getAllByRole('link', { name: /결과 검토하러 가기/ });
    expect(reviewLinks.length).toBeGreaterThan(0);
    for (const link of reviewLinks) {
      expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/tournament-1/result-review?fixtureId=fx-9&from=admin');
    }
    const operateLinks = screen.getAllByRole('link', { name: /운영 콘솔 열기/ });
    expect(operateLinks.length).toBeGreaterThan(0);
    for (const link of operateLinks) {
      expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/tournament-1/fixtures/fx-9/operate?from=admin');
    }
  });

  it('결과 있는 종료 경기 — records/corrections로 딥링크, 운영 열기 CTA는 없음', () => {
    vi.mocked(useV1AdminBracket).mockReturnValue({
      data: {
        groups: [], standings: [],
        fixtures: [fixture({
          status: 'completed',
          result: { id: 'res-1', fixtureId: 'fx-9', homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null, note: null, recordedAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', goals: [] },
        })],
      },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminBracket>);

    render(<BracketTab tournamentId="tournament-1" showToast={vi.fn()} registrations={[]} registrationDeadlineAt={null} bracketPublishedAt={null} bracketPublishScheduledAt={null} canWrite />);

    const correctionLinks = screen.getAllByRole('link', { name: /결과 정정하러 가기/ });
    expect(correctionLinks.length).toBeGreaterThan(0);
    for (const link of correctionLinks) {
      expect(link).toHaveAttribute('href', '/tournament-ops/tournaments/tournament-1/records/corrections?fixtureId=fx-9&from=admin');
    }
    expect(screen.queryByRole('link', { name: /운영 콘솔 열기/ })).not.toBeInTheDocument();
  });

  it('in_progress 경기도 운영 열기 CTA가 보인다', () => {
    vi.mocked(useV1AdminBracket).mockReturnValue({
      data: { groups: [], fixtures: [fixture({ status: 'in_progress', result: null })], standings: [] },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminBracket>);
    render(<BracketTab tournamentId="tournament-1" showToast={vi.fn()} registrations={[]} registrationDeadlineAt={null} bracketPublishedAt={null} bracketPublishScheduledAt={null} canWrite />);
    expect(screen.getAllByRole('link', { name: /운영 콘솔 열기/ }).length).toBeGreaterThan(0);
  });
});
