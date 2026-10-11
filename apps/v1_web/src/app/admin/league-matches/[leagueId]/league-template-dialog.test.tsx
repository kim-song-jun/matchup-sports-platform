import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueTemplateDialog, type LeagueTemplateDialogProps } from './league-template-dialog';

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
    <LeagueTemplateDialog
      leagueStartsOn={STARTS_ON}
      initialTeamCount={4}
      defaultPlace={null}
      recentVenues={[]}
      replaceExisting={false}
      isSubmitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
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

    fireEvent.click(screen.getByRole('radio', { name: '홈앤어웨이' }));
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
    expect(screen.getByText(/기존 경기는 취소되고/)).toBeInTheDocument();
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ teamCount: 4, legs: 1, replaceExisting: true });
  });

  it('팀 수와 회전에 따라 필요한 라운드·경기 수 요약이 바뀐다', () => {
    setup();
    expect(screen.getByText('3라운드 · 6경기를 만들어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '홈앤어웨이' }));
    expect(screen.getByText('6라운드 · 12경기를 만들어요')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('팀 수'), { target: { value: '5' } });
    // 홀수 팀은 부전 한 자리를 더해 라운드가 5, 라운드당 2경기 → 홈앤어웨이 10라운드 20경기.
    expect(screen.getByText('10라운드 · 20경기를 만들어요')).toBeInTheDocument();
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
});
