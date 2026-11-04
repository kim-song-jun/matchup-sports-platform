import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueManualFixtureModal, nextKickoffTime, type LeagueManualFixtureContext } from './league-manual-fixture-modal';

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

const TEAMS = [
  { id: 'team-a', label: 'A팀' },
  { id: 'team-b', label: 'B팀' },
  { id: 'team-c', label: 'C팀' },
  { id: 'team-d', label: 'D팀' },
];

function setup({
  onSubmit = vi.fn().mockResolvedValue({}),
  defaultPlace = null,
  defaultDuration = null,
  fixtures = [],
  weekLabel = null,
}: {
  onSubmit?: ReturnType<typeof vi.fn>;
  defaultPlace?: typeof SANGAM | null;
  defaultDuration?: { minutes: number; label: string } | null;
  fixtures?: LeagueManualFixtureContext[];
  weekLabel?: string | null;
} = {}) {
  const onClose = vi.fn();
  render(
    <LeagueManualFixtureModal
      teams={TEAMS}
      fixtures={fixtures}
      initialDate="2026-11-21"
      initialTime="10:00"
      weekLabel={weekLabel}
      defaultPlace={defaultPlace}
      recentVenues={[SANGAM]}
      defaultDuration={defaultDuration}
      isSubmitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
    />,
  );
  return { onSubmit, onClose };
}

function pickRow(row: number, home: string, away: string) {
  fireEvent.change(screen.getByLabelText(`${row}번째 경기 홈 팀`), { target: { value: home } });
  fireEvent.change(screen.getByLabelText(`${row}번째 경기 어웨이 팀`), { target: { value: away } });
}

const createButton = (count: number) => screen.getByRole('button', { name: `경기 ${count}개 만들기` });

describe('LeagueManualFixtureModal (주차 단위 경기 추가, 2026-11-03 A안)', () => {
  it('날짜·시간을 한 번 정하고 여러 줄을 한 번에 보낸다 — 새 줄 시각은 앞 경기 + 경기 시간', async () => {
    const { onSubmit } = setup({ defaultDuration: { minutes: 50, label: '전·후반 25분' } });
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(screen.getByRole('button', { name: '+ 경기 줄 추가' }));
    expect(screen.getByLabelText('2번째 경기 시작 시각')).toHaveValue('10:50');
    pickRow(2, 'team-c', 'team-d');
    fireEvent.click(createButton(2));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { homeTeamId: 'team-a', awayTeamId: 'team-b', startsAt: '2026-11-21T01:00:00.000Z', durationMinutes: 50 },
      { homeTeamId: 'team-c', awayTeamId: 'team-d', startsAt: '2026-11-21T01:50:00.000Z', durationMinutes: 50 },
    ]);
  });

  it('주차 칸에서 열면 제목에 주차가 붙는다', () => {
    setup({ weekLabel: '2주차' });
    expect(screen.getByRole('heading', { name: '2주차 경기 추가' })).toBeInTheDocument();
  });

  it('한 줄이라도 팀을 안 고르면 보내지 않고 몇 번째 경기인지 알려 준다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(screen.getByRole('button', { name: '+ 경기 줄 추가' }));
    fireEvent.click(createButton(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('2번째 경기의 홈 팀과 어웨이 팀을 모두 골라 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('같은 팀끼리는 고를 수 없게 막는다 — 반대편에 고른 팀은 목록에서 비활성', () => {
    setup();
    fireEvent.change(screen.getByLabelText('1번째 경기 홈 팀'), { target: { value: 'team-a' } });
    const away = screen.getByLabelText('1번째 경기 어웨이 팀');
    expect(within(away).getByRole('option', { name: 'A팀' })).toBeDisabled();
    expect(within(away).getByRole('option', { name: 'B팀' })).not.toBeDisabled();
  });

  it('날짜가 없으면 보내지 않는다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '' } });
    fireEvent.click(createButton(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('날짜를 골라 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('시작 시각이 없으면 보내지 않는다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.change(screen.getByLabelText('1번째 경기 시작 시각'), { target: { value: '' } });
    fireEvent.click(createButton(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('1번째 경기의 시작 시각을 입력해 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('줄은 지울 수 있지만 마지막 한 줄은 지울 수 없다', () => {
    setup();
    expect(screen.getByRole('button', { name: '1번째 경기 지우기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '+ 경기 줄 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '2번째 경기 지우기' }));
    expect(screen.queryByLabelText('2번째 경기 홈 팀')).toBeNull();
    expect(createButton(1)).toBeInTheDocument();
  });

  it('이 주에 이미 있는 경기를 보여 주고, 같은 주에 두 경기인 팀은 막지 않고 알린다', async () => {
    const { onSubmit } = setup({
      fixtures: [
        // 11/22(일)은 고른 날짜(11/21 토)와 같은 주다. 11/29 는 다음 주, 취소 경기는 세지 않는다.
        { startAt: '2026-11-22T01:00:00.000Z', homeTeamId: 'team-a', awayTeamId: 'team-c', cancelled: false },
        { startAt: '2026-11-29T01:00:00.000Z', homeTeamId: 'team-b', awayTeamId: 'team-d', cancelled: false },
        { startAt: '2026-11-22T03:00:00.000Z', homeTeamId: 'team-b', awayTeamId: 'team-d', cancelled: true },
      ],
    });
    const week = screen.getByRole('region', { name: '이 주의 경기' });
    expect(within(week).getByText('이 주에 이미 있는 경기 1')).toBeInTheDocument();
    expect(within(week).getByText(/A팀 vs C팀/)).toBeInTheDocument();
    expect(within(week).queryByText(/B팀 vs D팀/)).toBeNull();

    pickRow(1, 'team-a', 'team-b');
    expect(within(week).getByText('같은 주에 두 경기 이상: A팀')).toBeInTheDocument();
    fireEvent.click(createButton(1));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('경기 시간이 숫자가 아니면 보내지 않는다 — badInput 이 값을 비우는 자리다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: 'e' } });
    fireEvent.click(createButton(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('경기 시간은 숫자(분)로 입력해 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('리그 피리어드 설정의 경기 시간을 미리 채우고, 지우면 안내가 사라지고 종료 시각 없이 만든다', async () => {
    const { onSubmit } = setup({ defaultDuration: { minutes: 40, label: '단판 40분' } });
    expect(screen.getByLabelText('경기 시간(분)')).toHaveValue('40');
    expect(screen.getByText(/단판 40분/)).toBeInTheDocument();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: '' } });
    expect(screen.queryByText(/단판 40분/)).toBeNull();
    fireEvent.click(createButton(1));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0][0]).not.toHaveProperty('durationMinutes');
  });

  it('제출 중에는 닫기(X)도 취소와 함께 잠근다', () => {
    // 한쪽만 잠그면 운영자는 **잠긴 버튼 옆의 안 잠긴 버튼**을 눌러 같은 이탈을 한다 —
    // 요청은 날아가는데 화면은 사라져, 경기가 만들어졌는지 알 수 없고 입력도 잃는다.
    render(
      <LeagueManualFixtureModal teams={TEAMS} initialDate="2026-11-21" defaultPlace={null} isSubmitting onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });

  it('기본 장소 사용(기본값)이면 장소 필드를 보내지 않아 서버가 기본 장소를 상속한다', async () => {
    const { onSubmit } = setup({ defaultPlace: SANGAM });
    expect(screen.getByRole('radio', { name: '기본 장소 사용 (상암 풋살파크)' })).toBeChecked();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(createButton(1));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(Object.keys(onSubmit.mock.calls[0][0][0]).filter((key) => key.startsWith('place'))).toEqual([]);
  });

  it('다른 장소를 고르면 모든 경기에 이름과 좌표 스냅샷을 함께 보낸다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(screen.getByRole('button', { name: '+ 경기 줄 추가' }));
    pickRow(2, 'team-c', 'team-d');
    fireEvent.click(screen.getByRole('radio', { name: '이 경기들만 다른 장소' }));
    fireEvent.click(screen.getByRole('button', { name: SANGAM.name }));
    fireEvent.click(createButton(2));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    for (const payload of onSubmit.mock.calls[0][0]) {
      expect(payload).toMatchObject({ placeName: '상암 풋살파크', placeLatitude: 37.5683, placeProviderId: 'kakao-sangam' });
    }
  });

  it('다른 장소를 골랐는데 장소가 없으면 보내지 않는다', async () => {
    const { onSubmit } = setup();
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(screen.getByRole('radio', { name: '이 경기들만 다른 장소' }));
    fireEvent.click(createButton(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 장소를 골라 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('서버가 거부하면 창을 닫지 않고 서버 메시지를 보여 준다', async () => {
    const { onClose } = setup({ onSubmit: vi.fn().mockRejectedValue({ response: { data: { message: '이 리그에 등록되지 않은 팀이에요.' } } }) });
    pickRow(1, 'team-a', 'team-b');
    fireEvent.click(createButton(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('이 리그에 등록되지 않은 팀이에요.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('nextKickoffTime', () => {
  it('분을 더하고, 자정을 넘기면 원래 시각을 둔다', () => {
    expect(nextKickoffTime('10:00', 50)).toBe('10:50');
    expect(nextKickoffTime('23:30', 60)).toBe('23:30');
    expect(nextKickoffTime('', 60)).toBe('');
  });
});
