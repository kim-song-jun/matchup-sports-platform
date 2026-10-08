import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { MatchPageClient } from './match-page-client';

const { v1Get } = vi.hoisted(() => ({ v1Get: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(), v1Get,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/matches/fx-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/game-roster/use-my-match-roster-team', () => ({ useMyMatchRosterTeam: () => ({ status: 'none' }) }));
vi.mock('@/components/game-roster/match-team-roster-card', () => ({ MatchTeamRosterCard: () => null }));
vi.mock('@/components/public-game-records/attest-requests', () => ({ AttestRequestsSection: () => null }));
vi.mock('@/components/public-game-records/claim-my-record', () => ({ ClaimMyRecordSection: () => null }));
vi.mock('@/components/tournaments/tournament-inquiry-section', () => ({ TournamentInquirySection: () => null }));
vi.mock('@/components/public-game-records/match-detail-content', () => ({
  MatchDetailContent: ({ data }: { data: { score: { home: number; away: number } } }) => (
    <div data-testid="record">{`${data.score.home}:${data.score.away}`}</div>
  ),
}));

const RECORD_PATH = '/tournaments/t1/matches/fx-1';
const live = (home: number, away: number) => ({
  gameId: 'game-1', status: 'live', scheduledAt: '2026-10-08T10:00:00.000Z', score: { home, away },
});
const apiError = (statusCode: number) =>
  new V1ApiError({ status: 'error', timestamp: '', statusCode, code: statusCode === 404 ? 'TOURNAMENT_NOT_FOUND' : 'INTERNAL_ERROR', message: '', details: null });

/** 호출 순서대로 응답을 돌려주고, 대본이 끝나면 마지막 응답을 반복한다. */
function script(steps: Array<() => unknown>) {
  let calls = 0;
  v1Get.mockImplementation(async (path: string) => {
    if (path !== RECORD_PATH) throw new Error(`Unexpected route: ${path}`);
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    return step();
  });
}
const ok = (home: number, away: number) => () => live(home, away);
const fail = (statusCode: number) => () => { throw apiError(statusCode); };

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // 쿼리 옵저버의 React 알림은 한 틱 뒤에 도착한다.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}
async function renderScreen() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MatchPageClient tournamentId="t1" fixtureId="fx-1" />
    </QueryClientProvider>,
  );
  await advance(0);
  return client;
}

describe('대회 경기 상세: 기록 재조회가 실패해도 옛 기록을 성공 화면으로 두지 않는다', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:30:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    v1Get.mockReset();
  });

  it('진행 중 2:1 을 보여 주다 재조회가 404 면 점수가 사라지고 찾을 수 없음 처리로 바뀌며 더는 조회하지 않는다', async () => {
    script([ok(2, 1), fail(404)]);
    await renderScreen();
    expect(screen.getByTestId('record')).toHaveTextContent('2:1');

    await advance(10_000);
    expect(screen.queryByTestId('record')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();

    expect(v1Get).toHaveBeenCalledTimes(2);
    await advance(120_000);
    expect(v1Get).toHaveBeenCalledTimes(2);
  });

  it('재조회가 500 으로 계속 실패하면 재시도 2회 뒤 ErrorState 로 바뀌고 옛 점수가 남지 않는다', async () => {
    script([ok(2, 1), fail(500)]);
    await renderScreen();
    expect(screen.getByTestId('record')).toHaveTextContent('2:1');

    await advance(10_000);
    await advance(1_000);
    await advance(2_000);
    expect(screen.queryByTestId('record')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    // 최초 1 + 폴링 1 + 재시도 2.
    expect(v1Get).toHaveBeenCalledTimes(4);
  });

  it('대조군: 500 이 한 번뿐이면 재시도로 복구돼 화면이 라이브 내용을 유지한다', async () => {
    script([ok(2, 1), fail(500), ok(3, 1)]);
    await renderScreen();

    await advance(10_000);
    expect(screen.getByTestId('record')).toHaveTextContent('2:1');
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
    await advance(1_000);
    expect(screen.getByTestId('record')).toHaveTextContent('3:1');
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
  });

  it('대조군: 정상 응답이면 10초마다 계속 조회하고 점수를 갱신한다', async () => {
    script([ok(0, 0), ok(1, 0), ok(2, 0)]);
    await renderScreen();
    await advance(10_000);
    expect(screen.getByTestId('record')).toHaveTextContent('1:0');
    await advance(10_000);
    expect(screen.getByTestId('record')).toHaveTextContent('2:0');
    expect(v1Get).toHaveBeenCalledTimes(3);
  });

  it('서버가 준 seed 로 첫 화면을 그리고, 첫 조회가 실패하면 seed 점수 대신 ErrorState 를 보인다', async () => {
    script([fail(500)]);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MatchPageClient tournamentId="t1" fixtureId="fx-1" seed={live(5, 5) as never} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('record')).toHaveTextContent('5:5');
    await advance(0);
    await advance(1_000);
    await advance(2_000);
    expect(screen.queryByTestId('record')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });
});
