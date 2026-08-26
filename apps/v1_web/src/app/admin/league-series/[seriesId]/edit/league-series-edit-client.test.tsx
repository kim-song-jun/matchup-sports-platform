import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1AdminLeagueSeries,
  useV1MasterRegions,
  useV1MasterSports,
  useV1UpdateLeagueSeries,
} from '@/hooks/use-v1-api';
import LeagueSeriesEditClient from './league-series-edit-client';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/league-series/series-1/edit',
}));

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueSeries: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1UpdateLeagueSeries: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다.
  useV1ActivePopup: vi.fn(() => ({ data: undefined, isPending: false })),
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1AdminLeagueSeriesMock = vi.mocked(useV1AdminLeagueSeries, { partial: true });
const useV1MasterRegionsMock = vi.mocked(useV1MasterRegions, { partial: true });
const useV1MasterSportsMock = vi.mocked(useV1MasterSports, { partial: true });
const useV1UpdateLeagueSeriesMock = vi.mocked(useV1UpdateLeagueSeries, { partial: true });

const SERIES = {
  id: 'series-1',
  title: '강남구 풋살 리그',
  sportId: 'sport-futsal',
  regionId: 'region-1',
  tierCount: 2,
  tierLabels: ['1부', '2부'],
  promotionRule: { mode: 'ratio' as const, ratio: 0.2, rounding: 'ceil' as const, minSlots: 1 },
  state: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  seasons: [],
};

function renderClient() {
  return render(
    <Providers>
      <LeagueSeriesEditClient seriesId="series-1" />
    </Providers>,
  );
}

describe('LeagueSeriesEditClient', () => {
  it('기존 시리즈 값으로 폼을 채우고, 저장하면 그 값 그대로 수정 mutation을 호출한다', async () => {
    const mutate = vi.fn();
    useV1AdminLeagueSeriesMock.mockReturnValue({
      data: SERIES,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [{ id: 'region-1', name: '서울', parentId: null }] } as never);
    useV1UpdateLeagueSeriesMock.mockReturnValue({ mutate, isPending: false } as never);

    renderClient();

    // 기존 값이 폼에 채워진다.
    const titleInput = (await screen.findByLabelText('이름')) as HTMLInputElement;
    expect(titleInput.value).toBe('강남구 풋살 리그');
    expect(screen.getByLabelText('종목')).toHaveValue('풋살');
    expect(screen.getByLabelText('지역')).toHaveValue('서울');
    expect(screen.getByLabelText('티어 수')).toHaveValue('2');

    // 이름만 바꾸고 저장한다.
    fireEvent.change(titleInput, { target: { value: '강남구 풋살 리그(수정)' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        {
          title: '강남구 풋살 리그(수정)',
          tierCount: 2,
          promotionRule: SERIES.promotionRule,
        },
        expect.anything(),
      ),
    );
  });

  it('티어 수를 줄여 저장했다가 서버가 고아 리그 충돌로 막으면 그 문구를 그대로 보여준다', async () => {
    const mutate = vi.fn((_body, opts) => {
      opts.onError({ response: { data: { message: '이미 2부까지 리그가 만들어져 있어서 티어 수를 줄일 수 없어요.' } } });
    });
    useV1AdminLeagueSeriesMock.mockReturnValue({
      data: SERIES,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-futsal', name: '풋살', levels: [] }] } as never);
    useV1MasterRegionsMock.mockReturnValue({ data: [{ id: 'region-1', name: '서울', parentId: null }] } as never);
    useV1UpdateLeagueSeriesMock.mockReturnValue({ mutate, isPending: false } as never);

    renderClient();

    fireEvent.change(await screen.findByLabelText('티어 수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('이미 2부까지 리그가 만들어져 있어서 티어 수를 줄일 수 없어요.')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
