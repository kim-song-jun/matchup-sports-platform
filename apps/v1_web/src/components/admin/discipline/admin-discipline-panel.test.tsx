import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminDisciplineOverview, V1AdminDisciplinePlayer } from '@/hooks/use-v1-admin-discipline';
import { AdminDisciplinePanel, disciplineRulesSummary } from './admin-discipline-panel';

const NOW = '2026-11-08T00:00:00.000Z';
const NEXT = { teamMatchId: 'm2', gameId: 'g2', startAt: '2026-11-14T09:00:00.000Z', opponentName: '광교FC' };
const RULES = { yellowAccumulationLimit: 2, redCardSuspensionMatches: 1 };

const player = (overrides: Partial<V1AdminDisciplinePlayer>): V1AdminDisciplinePlayer => ({
  userId: 'u1',
  displayName: '도윤',
  teamId: 'team-A',
  teamName: '수원FC',
  status: 'CARDS',
  yellowTotal: 0,
  redTotal: 0,
  remainingMatches: 0,
  reason: null,
  nextGame: NEXT,
  ...overrides,
});

const PLAYERS = [
  player({ userId: 'u1', realName: '김도윤', status: 'SUSPENDED', redTotal: 1, remainingMatches: 1, reason: '퇴장 1회로 1경기 출전정지예요.' }),
  player({ userId: 'u2', displayName: '서준', status: 'IMMINENT', yellowTotal: 1 }),
  player({ userId: 'u3', displayName: '하늘', teamName: '광교FC', teamId: 'team-C', status: 'CARDS', yellowTotal: 1, nextGame: null }),
];

function overview(overrides: Partial<V1AdminDisciplineOverview> = {}): V1AdminDisciplineOverview {
  return {
    competitionId: 'cup-1',
    title: '퀸즈컵',
    kind: 'TOURNAMENT',
    rules: RULES,
    summary: { suspended: 1, imminent: 1, withCards: 3 },
    players: PLAYERS,
    ...overrides,
  };
}

const server = setupServer();
let respond: () => Response;
let reads = 0;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  reads = 0;
  respond = () => HttpResponse.json({ status: 'success', data: overview(), timestamp: NOW });
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get('*/api/v1/admin/tournaments/cup-1/discipline', () => {
      reads += 1;
      return respond();
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminDisciplinePanel competitionId="cup-1" />
    </QueryClientProvider>,
  );
}

describe('disciplineRulesSummary', () => {
  it('켜진 규정만 말한다', () => {
    expect(disciplineRulesSummary(RULES)).toBe('경고 2장마다 1경기 · 퇴장 1경기 정지 · 결과가 바뀌면 바로 다시 계산해요');
    expect(disciplineRulesSummary({ yellowAccumulationLimit: null, redCardSuspensionMatches: 2 })).toBe('퇴장 2경기 정지 · 결과가 바뀌면 바로 다시 계산해요');
  });
});

describe('AdminDisciplinePanel', () => {
  it('정지 중인 선수가 있으면 정지 중부터 보여 주고, 사유와 다음 경기를 같이 말한다', async () => {
    renderPanel();
    expect(await screen.findByText('김도윤 (도윤)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정지 중 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('출전정지 1경기')).toBeInTheDocument();
    expect(screen.getByText(/퇴장 1회로 1경기 출전정지예요\. · 다음 경기 .* vs 광교FC에 못 뛰어요/)).toBeInTheDocument();
    expect(screen.queryByText('서준')).toBeNull();
    expect(reads).toBe(1);
  });

  it('경고 임박·카드 받은 선수를 고르면 목록이 바뀐다 — 남은 경기가 없는 선수는 그렇게 말한다', async () => {
    renderPanel();
    await screen.findByText('김도윤 (도윤)');

    fireEvent.click(screen.getByRole('button', { name: '경고 임박 1' }));
    expect(screen.getByText('서준')).toBeInTheDocument();
    expect(screen.getByText('경고 1/2장')).toBeInTheDocument();
    expect(screen.getByText(/한 장 더 받으면 다음 경기부터 정지예요/)).toBeInTheDocument();
    expect(screen.queryByText('김도윤 (도윤)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '카드 받은 선수 3' }));
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[2]).getByText(/남은 경기가 없어요/)).toBeInTheDocument();
  });

  it('이름·실명·팀으로 거르고, 결과가 없으면 알린다', async () => {
    renderPanel();
    await screen.findByText('김도윤 (도윤)');
    fireEvent.click(screen.getByRole('button', { name: '카드 받은 선수 3' }));

    fireEvent.change(screen.getByRole('searchbox', { name: '선수 이름 또는 팀으로 찾기' }), { target: { value: '광교' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('하늘')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '선수 이름 또는 팀으로 찾기' }), { target: { value: '김도윤' } });
    expect(screen.getByText('김도윤 (도윤)')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '선수 이름 또는 팀으로 찾기' }), { target: { value: '없는사람' } });
    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument();
  });

  it('정지 중인 선수가 없으면 카드 받은 선수 전체를 먼저 보여 준다', async () => {
    respond = () =>
      HttpResponse.json({
        status: 'success',
        data: overview({ summary: { suspended: 0, imminent: 1, withCards: 2 }, players: PLAYERS.slice(1) }),
        timestamp: NOW,
      });
    renderPanel();
    expect(await screen.findByText('서준')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카드 받은 선수 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('선택된 보기 칩만 선택 스타일을 가지고, 다른 칩을 누르면 옮겨 가요', async () => {
    renderPanel();
    await screen.findByText('김도윤 (도윤)');
    const suspended = screen.getByRole('button', { name: '정지 중 1' });
    const imminent = screen.getByRole('button', { name: '경고 임박 1' });
    expect(suspended).toHaveClass('tm-chip-active');
    expect(imminent).not.toHaveClass('tm-chip-active');
    fireEvent.click(imminent);
    expect(imminent).toHaveClass('tm-chip-active');
    expect(suspended).not.toHaveClass('tm-chip-active');
  });

  it('정지 규정이 없는 대회는 안내만 보인다', async () => {
    respond = () => HttpResponse.json({ status: 'success', data: overview({ rules: null, summary: { suspended: 0, imminent: 0, withCards: 0 }, players: [] }), timestamp: NOW });
    renderPanel();
    expect(await screen.findByText('정지 규정이 없는 대회예요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /정지 중/ })).toBeNull();
  });

  it('권한이 없으면(403) 서버 메시지와 다시 시도 버튼을 보인다', async () => {
    respond = () =>
      HttpResponse.json({ status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: '권한이 없어요.', timestamp: NOW }, { status: 403 });
    renderPanel();
    expect(await screen.findByText('징계 현황을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
