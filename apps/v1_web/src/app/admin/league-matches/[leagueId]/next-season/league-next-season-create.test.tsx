import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import type { LeagueSettings } from '@/types/league-settings';
import { LeagueNextSeasonCreate, nextSeasonPrefill } from './league-next-season-create';

const periodQuery = vi.hoisted(() => ({ value: {} as Record<string, unknown>, refetch: vi.fn() }));
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
      maxTeams: '8', plannedFixtureCount: '14', teamFoulThreshold: '', showTeamFouls: true, periodMinutes: ['25', '20'],
    });
  });

  it('지난 리그가 팀 파울 기준을 정했다면 다음 시즌에도 이어 가고, 기본값이었다면 비워 둔다', () => {
    const periods = [{ durationMinutes: 20 }, { durationMinutes: 20 }];
    expect(nextSeasonPrefill({ ...base, teamFoulThreshold: 7 } as V1AdminLeagueDetail, settings, periods).teamFoulThreshold).toBe('7');
    expect(nextSeasonPrefill({ ...base, teamFoulThreshold: null } as V1AdminLeagueDetail, settings, periods).teamFoulThreshold).toBe('');
    // 필드가 없던 구버전 응답도 기본값으로 읽는다.
    expect(nextSeasonPrefill(base, settings, periods).teamFoulThreshold).toBe('');
  });

  it('지난 리그가 관전 화면 팀 파울 표시를 껐다면 다음 시즌에도 꺼 두고, 필드가 없던 구버전 응답은 켜짐으로 읽는다', () => {
    const periods = [{ durationMinutes: 20 }, { durationMinutes: 20 }];
    expect(nextSeasonPrefill({ ...base, showTeamFouls: false } as V1AdminLeagueDetail, settings, periods).showTeamFouls).toBe(false);
    expect(nextSeasonPrefill({ ...base, showTeamFouls: true } as V1AdminLeagueDetail, settings, periods).showTeamFouls).toBe(true);
    expect(nextSeasonPrefill(base, settings, periods).showTeamFouls).toBe(true);
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

// 만들 수 있는 리그인지(전환·체계·상태·이미 이은 리그·권한)는 부르는 쪽 `LeagueNextSeasonManage` 가 가르고
// `league-next-season-manage.test.tsx` 가 본다. 여기는 만들 수 있다고 정해진 뒤의 개설 화면만 본다.
describe('LeagueNextSeasonCreate', () => {
  beforeEach(() => {
    periodQuery.refetch.mockReset();
    periodQuery.value = { data: { periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }] }, isPending: false, isError: false };
  });

  it('지난 시즌 설정을 채운 개설 화면을 연다', () => {
    render(<LeagueNextSeasonCreate league={base} />);
    expect(screen.getByText('개설 화면 · 가을 리그 다음 시즌')).toBeInTheDocument();
  });

  it.each([false, true])('PR 통합 회귀: 경기 시간 조회가 실패하면 기본값으로 숨기지 않고 재시도한다 (캐시 %s)', (cached) => {
    const success = periodQuery.value;
    periodQuery.value = { ...success, data: cached ? success.data : undefined, isError: true, error: new Error('경기 시간 조회 실패') };
    const { rerender } = render(<LeagueNextSeasonCreate league={base} />);
    expect(screen.getByText('경기 시간 조회 실패')).toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(periodQuery.refetch).toHaveBeenCalledOnce();
    periodQuery.value = success;
    rerender(<LeagueNextSeasonCreate league={base} />);
    expect(screen.getByText('개설 화면 · 가을 리그 다음 시즌')).toBeInTheDocument();
    expect(screen.getByText('경기 시간 · 25,25')).toBeInTheDocument();
  });
});
