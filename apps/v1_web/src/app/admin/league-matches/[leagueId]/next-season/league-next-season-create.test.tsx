import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import type { LeagueSettings } from '@/types/league-settings';
import { LeagueNextSeasonCreate, nextSeasonPrefill } from './league-next-season-create';

const canWrite = vi.hoisted(() => ({ value: true }));
const league = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const periodQuery = vi.hoisted(() => ({ value: {} as Record<string, unknown>, refetch: vi.fn() }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminLeagueMatch: () => league.value }));
vi.mock('@/hooks/use-league-settings', () => ({
  useLeagueSettings: () => ({ data: { regionId: 'region-1', genderCategory: 'mixed' }, isPending: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => ({ ...periodQuery.value, refetch: periodQuery.refetch }),
}));
vi.mock('../../league-create-wizard', () => ({
  LeagueCreateWizard: ({ prefill }: { prefill: { title: string; periodMinutes: string[] | null } }) => <>
    <p>{`개설 화면 · ${prefill.title}`}</p>
    <p>{`경기 시간 · ${prefill.periodMinutes?.join(',') ?? '종목 기본값'}`}</p>
  </>,
}));

const base = {
  leagueId: 'league-1', title: '가을 리그', sportId: 'sport-futsal', seriesId: null, state: 'completed',
  entryFee: 30000, entryFeeConfiguredAt: '2026-09-01T00:00:00.000Z',
  bankName: '팀밋은행', bankAccount: '123', bankHolder: '운영자',
  minPlayers: 6, maxPlayers: 12, maxTeams: 8, plannedFixtureCount: 14,
} as unknown as V1AdminLeagueDetail;
const settings = { regionId: 'region-1', genderCategory: 'male' } as unknown as LeagueSettings;

describe('nextSeasonPrefill', () => {
  it('지난 시즌 설정을 옮기고 제목에 다음 시즌을 붙인다', () => {
    expect(nextSeasonPrefill(base, settings, [{ durationMinutes: 25 }, { durationMinutes: 20 }])).toEqual({
      previousLeagueId: 'league-1', previousTitle: '가을 리그', title: '가을 리그 다음 시즌',
      sportId: 'sport-futsal', regionId: 'region-1', genderCategory: 'male',
      entryFee: 30000, bankName: '팀밋은행', bankAccount: '123', bankHolder: '운영자',
      rosterLimit: { unlimited: false, minPlayers: '6', maxPlayers: '12' },
      maxTeams: '8', plannedFixtureCount: '14', periodMinutes: ['25', '20'],
    });
  });

  it('참가비를 정한 적 없으면 비워 두고, 명단 제한이 없으면 제한 없음으로, 피리어드가 셋 이상이면 종목 기본값으로 둔다', () => {
    const prefill = nextSeasonPrefill(
      { ...base, entryFee: 0, entryFeeConfiguredAt: null, maxPlayers: null, maxTeams: null, plannedFixtureCount: null },
      settings,
      [{ durationMinutes: 10 }, { durationMinutes: 10 }, { durationMinutes: 10 }],
    );
    expect(prefill.entryFee).toBeNull();
    expect(prefill.rosterLimit.unlimited).toBe(true);
    expect(prefill.maxTeams).toBe('');
    expect(prefill.plannedFixtureCount).toBe('');
    expect(prefill.periodMinutes).toBeNull();
  });
});

describe('LeagueNextSeasonCreate', () => {
  const loaded = (overrides: Record<string, unknown> = {}) => ({ data: { ...base, ...overrides }, isPending: false, refetch: vi.fn() });
  beforeEach(() => {
    canWrite.value = true;
    league.value = loaded();
    periodQuery.refetch.mockReset();
    periodQuery.value = { data: { periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }] }, isPending: false, isError: false };
  });

  it('이을 수 있으면 지난 시즌 설정을 채운 개설 화면을 연다', () => {
    render(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText('개설 화면 · 가을 리그 다음 시즌')).toBeInTheDocument();
  });

  it('이미 다음 시즌을 이었으면 개설 화면 대신 그 리그로 보낸다', () => {
    league.value = loaded({ nextSeason: { leagueId: 'league-2', title: '겨울 리그' } });
    render(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText('이미 "겨울 리그"이 다음 시즌으로 이어져 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다음 시즌 관리로 가기' })).toHaveAttribute('href', '/admin/league-matches/league-2');
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
  });

  it.each([
    ['리그 체계로 전환한 리그', { convertedToSeries: true }, '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.'],
    ['리그 체계 안의 리그', { seriesId: 'series-1' }, '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.'],
    ['시작 전 리그', { state: 'draft' }, '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들 수 있어요.'],
  ])('%s는 개설 화면을 열지 않는다', (_name, overrides, message) => {
    league.value = loaded(overrides);
    render(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
  });

  it('조회 전용 관리자는 만들 수 없다', () => {
    canWrite.value = false;
    render(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText('조회 권한으로는 다음 시즌을 만들 수 없어요.')).toBeInTheDocument();
  });

  it.each([false, true])('PR 통합 회귀: 경기 시간 조회가 실패하면 기본값으로 숨기지 않고 재시도한다 (캐시 %s)', (cached) => {
    const success = periodQuery.value;
    periodQuery.value = { ...success, data: cached ? success.data : undefined, isError: true, error: new Error('경기 시간 조회 실패') };
    const { rerender } = render(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText('경기 시간 조회 실패')).toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(periodQuery.refetch).toHaveBeenCalledOnce();
    periodQuery.value = success;
    rerender(<LeagueNextSeasonCreate leagueId="league-1" />);
    expect(screen.getByText('개설 화면 · 가을 리그 다음 시즌')).toBeInTheDocument();
    expect(screen.getByText('경기 시간 · 25,25')).toBeInTheDocument();
  });
});
