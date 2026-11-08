import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import type { V1LeagueTemplatePreview } from '@/types/league-match';
import { LeagueTemplateDialog, type LeagueTemplateDialogProps } from './league-template-dialog';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: vi.fn() };
});
const v1PostMock = vi.mocked(v1Post);

/** 4 teams, one leg, 3 games a day at 19:00, 25 min + 5 min break. Seat 3 plays games 2 and 3 of day 1 back to back. */
const PREVIEW: V1LeagueTemplatePreview = {
  teamCount: 4,
  legs: 1,
  totalRounds: 3,
  fixtureCount: 6,
  gamesPerDay: 3,
  days: [
    {
      day: 1, startTime: '19:00', endTime: '20:25',
      games: [
        { round: 1, order: 1, startTime: '19:00', endTime: '19:25', homePosition: 1, awayPosition: 4, backToBack: [] },
        { round: 1, order: 2, startTime: '19:30', endTime: '19:55', homePosition: 2, awayPosition: 3, backToBack: [] },
        { round: 2, order: 3, startTime: '20:00', endTime: '20:25', homePosition: 1, awayPosition: 3, backToBack: [{ position: 3, games: 2 }] },
      ],
    },
    {
      day: 2, startTime: '19:00', endTime: '20:25',
      games: [
        { round: 2, order: 1, startTime: '19:00', endTime: '19:25', homePosition: 4, awayPosition: 2, backToBack: [] },
        { round: 3, order: 2, startTime: '19:30', endTime: '19:55', homePosition: 1, awayPosition: 2, backToBack: [{ position: 2, games: 2 }] },
        { round: 3, order: 3, startTime: '20:00', endTime: '20:25', homePosition: 3, awayPosition: 4, backToBack: [] },
      ],
    },
  ],
  checks: { duplicateMeetings: 0, missingMeetings: 0, backToBackRuns: [{ day: 1, position: 3, fromOrder: 2, toOrder: 3, games: 2 }, { day: 2, position: 2, fromOrder: 1, toOrder: 2, games: 2 }] },
};

beforeEach(() => {
  v1PostMock.mockReset();
  v1PostMock.mockResolvedValue(PREVIEW);
});

vi.mock('@/hooks/use-v1-api', () => ({
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

const SANGAM = {
  name: '상암 풋살파크',
  address: '서울 마포구 월드컵로 240',
  latitude: 37.5683,
  longitude: 126.8972,
  provider: 'kakao' as const,
  providerPlaceId: 'kakao-sangam',
};

// 2030-01-07 은 월요일이다. 시작일을 먼 미래로 두면 "지금" 과 무관하게 요일 전개 결과가 고정된다.
const STARTS_ON = '2030-01-07T00:00:00.000Z';

function setup(overrides: Partial<LeagueTemplateDialogProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ slots: 4, fixtures: 6 });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LeagueTemplateDialog
      leagueId="league-1"
      leagueStartsOn={STARTS_ON}
      initialTeamCount={4}
      defaultPlace={null}
      recentVenues={[]}
      replaceExisting={false}
      isSubmitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />
    </QueryClientProvider>,
  );
  return { onSubmit, onClose };
}

function fillByWeekday() {
  fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
}

describe('LeagueTemplateDialog', () => {
  it('팀 수·회전·요일 전개 날짜·시각을 그대로 보내고 성공하면 닫는다 — replaceExisting 키는 없다', async () => {
    const { onSubmit, onClose } = setup();

    expect(screen.getByRole('radio', { name: '단일 리그' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '홈·어웨이 리그' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '홈·어웨이 리그' }));
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    // 4팀 홈앤어웨이 = 6라운드 = 6일. 시작일(월)부터 매주.
    expect(payload).toEqual({
      teamCount: 4,
      legs: 2,
      schedule: {
        dates: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28', '2030-02-04', '2030-02-11'],
        time: '19:00',
      },
    });
    expect(Object.keys(payload)).not.toContain('replaceExisting');
  });

  it('다시 만들기 모드는 replaceExisting 을 실어 보내고 기존 경기가 취소된다고 알린다', async () => {
    const { onSubmit } = setup({ replaceExisting: true });

    expect(screen.getByRole('dialog', { name: '템플릿으로 다시 만들기' })).toBeInTheDocument();
    expect(screen.getByText(/기존 경기는 목록에서 빠지고/)).toBeInTheDocument();
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ teamCount: 4, legs: 1, replaceExisting: true });
  });

  it('팀 수와 회전에 따라 필요한 라운드·경기 수 요약이 바뀐다', () => {
    setup();
    expect(screen.getByText('3라운드 · 6경기를 만들어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '홈·어웨이 리그' }));
    expect(screen.getByText('6라운드 · 12경기를 만들어요')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('팀 수'), { target: { value: '5' } });
    // 홀수 팀은 부전 한 자리를 더해 라운드가 5, 라운드당 2경기 → 홈앤어웨이 10라운드 20경기.
    expect(screen.getByText('10라운드 · 20경기를 만들어요')).toBeInTheDocument();
  });

  it('하루 경기 수를 넣으면 필요한 날짜가 총 경기 ÷ 하루 경기(올림)로 바뀌고, 리그 경기 시간·휴식과 함께 보낸다', async () => {
    const { onSubmit } = setup({ defaultGameMinutes: 50 });

    fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '4' } });
    // 4팀 단일 = 6경기 → 하루 4경기면 2일.
    expect(screen.getByText('3라운드 · 6경기를 만들어요 · 하루 4경기씩 2일')).toBeInTheDocument();
    expect(screen.getByLabelText('경기 시간(분)')).toHaveValue('50');
    fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5' } });
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ gamesPerDay: 4, gameDurationMinutes: 50, breakMinutes: 5 });
    expect(payload.schedule.dates).toEqual(['2030-01-07', '2030-01-14']);
  });

  it('하루 경기 수를 비우면 경기 시간·휴식 칸이 없고 그 키들도 보내지 않는다', async () => {
    const { onSubmit } = setup({ defaultGameMinutes: 50 });

    expect(screen.queryByLabelText('경기 시간(분)')).toBeNull();
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).not.toHaveProperty('gamesPerDay');
    expect(payload).not.toHaveProperty('gameDurationMinutes');
    expect(payload).not.toHaveProperty('breakMinutes');
  });

  it.each(['0', '51', 'x'])('하루 경기 수 %s 는 1~50 밖이라 보내지 않는다', (value) => {
    const { onSubmit } = setup();
    fillByWeekday();

    fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('하루 경기 수는 1~50 사이로 입력해 주세요.');
  });

  it('날짜가 라운드 수보다 모자라면 보내지 않고 몇 일이 필요한지 알린다', () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('경기 날짜가 3일 필요해요. 0일 골랐어요.');
  });

  it.each(['2', '21', 'abc', ''])('팀 수 %s 는 3~20 범위 밖이라 보내지 않는다', (value) => {
    const { onSubmit } = setup();
    fillByWeekday();

    fireEvent.change(screen.getByLabelText('팀 수'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('팀 수는 3팀에서 20팀 사이로 입력해 주세요.');
  });

  it('서버가 거부하면 메시지를 보이고 입력과 창을 그대로 둔다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('이미 시작했거나 결과가 있는 경기가 있어 바꿀 수 없어요.'));
    const { onClose } = setup({ onSubmit });
    fillByWeekday();

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 시작했거나 결과가 있는 경기가 있어 바꿀 수 없어요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('팀 수')).toHaveValue('4');
    expect(screen.getByLabelText('요일')).toHaveValue('1');
  });

  it('다른 장소 사용에서 추천 칩을 고르면 장소 스냅샷을 보낸다', async () => {
    const { onSubmit } = setup({ recentVenues: [SANGAM] });
    fillByWeekday();

    fireEvent.click(screen.getByRole('radio', { name: '다른 장소 사용' }));
    fireEvent.click(screen.getByRole('button', { name: /상암 풋살파크/ }));
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      placeName: '상암 풋살파크',
      placeLatitude: 37.5683,
      placeProviderId: 'kakao-sangam',
    });
  });

  it('기본 장소 사용(기본값)이면 장소 키를 하나도 보내지 않는다 — 서버가 기본 장소를 상속한다', async () => {
    const { onSubmit } = setup({ defaultPlace: SANGAM });
    fillByWeekday();
    expect(screen.getByRole('radio', { name: '기본 장소 사용 (상암 풋살파크)' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(Object.keys(onSubmit.mock.calls[0][0]).filter((key) => key.startsWith('place'))).toEqual([]);
  });

  it('리그 시작일을 읽을 수 없으면 요일 채우기를 막고 이유를 적는다', () => {
    setup({ leagueStartsOn: 'not-a-date' });
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });

    expect(screen.queryByRole('button', { name: '요일로 채우기' })).toBeNull();
    expect(screen.getByText('리그 시작일이 없어 요일로 채울 수 없어요.')).toBeInTheDocument();
  });

  describe('생성 미리보기', () => {
    const previewCalls = () => v1PostMock.mock.calls.filter(([path]) => String(path).endsWith('/fixtures/template/preview'));

    it('하루 경기 수·경기 시간·휴식·시작 시각을 서버에 보내 시간표와 연속 출전을 그대로 보여 준다', async () => {
      setup();

      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '25' } });
      fireEvent.change(screen.getByLabelText('휴식(분)'), { target: { value: '5' } });

      expect(await screen.findByText('1일째 · 19:00~20:25 · 3경기')).toBeInTheDocument();
      expect(previewCalls().at(-1)).toEqual([
        '/admin/league-matches/league-1/fixtures/template/preview',
        { teamCount: 4, legs: 1, time: '19:00', gamesPerDay: 3, gameDurationMinutes: 25, breakMinutes: 5 },
      ]);
      expect(screen.getByText('1번 자리 대 3번 자리')).toBeInTheDocument();
      expect(screen.getByText('3번 자리 2번 연속')).toBeInTheDocument();
      expect(screen.getByText(/2곳에서 한 팀이 쉬는 시간 없이 이어서 뛰어요/)).toBeInTheDocument();
      expect(screen.getByText(/중복·누락 없음/)).toBeInTheDocument();
      // The timetable scrolls inside a box, so keyboard users must be able to focus it.
      const region = screen.getByRole('region', { name: '날짜별 시간표' });
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toContainElement(screen.getByText('1일째 · 19:00~20:25 · 3경기'));
    });

    it('연속 출전이 없으면 그렇다고 알리고, 중복·누락이 있으면 숫자를 보여 준다', async () => {
      v1PostMock.mockResolvedValue({
        ...PREVIEW,
        checks: { duplicateMeetings: 1, missingMeetings: 2, backToBackRuns: [] },
        days: PREVIEW.days.map((day) => ({ ...day, games: day.games.map((game) => ({ ...game, backToBack: [] })) })),
      });
      setup();

      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '3' } });

      expect(await screen.findByText('중복 1경기 · 빠진 경기 2경기가 있어요.')).toBeInTheDocument();
      expect(screen.getByText('한 팀이 쉬는 시간 없이 이어서 뛰는 경기는 없어요.')).toBeInTheDocument();
      expect(screen.queryByText(/번 연속/)).toBeNull();
    });

    it('하루 경기 수가 없거나 범위 밖이면 요청도 영역도 없다', async () => {
      setup();

      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '99' } });
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(previewCalls()).toHaveLength(0);
      expect(screen.queryByText('생성 미리보기')).toBeNull();
    });

    it('입력이 이어지는 동안은 요청하지 않고 멈춘 뒤 마지막 값으로 한 번만 보낸다', async () => {
      setup();
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '2' } });
      await pause(120);
      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '3' } });
      await pause(120);
      expect(previewCalls()).toHaveLength(0);
      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '4' } });

      expect(await screen.findByText(/1일째/)).toBeInTheDocument();
      expect(previewCalls()).toHaveLength(1);
      expect(previewCalls()[0][1]).toMatchObject({ gamesPerDay: 4 });
    });

    it('서버가 거부하면 그 메시지를 미리보기 자리에 보여 준다', async () => {
      const { V1ApiError } = await import('@/lib/api-client');
      v1PostMock.mockRejectedValue(new V1ApiError({ status: 'error', timestamp: '2030-01-01T00:00:00.000Z', statusCode: 422, code: 'LEAGUE_FIXTURE_DURATION_REQUIRED', message: '이 리그의 기본 경기 시간을 알 수 없어요. 경기 시간(분)을 입력해 주세요.' }));
      setup();

      fireEvent.change(screen.getByLabelText('하루 경기 수'), { target: { value: '3' } });

      expect(await screen.findByText(/기본 경기 시간을 알 수 없어요/)).toBeInTheDocument();
    });
  });
});
