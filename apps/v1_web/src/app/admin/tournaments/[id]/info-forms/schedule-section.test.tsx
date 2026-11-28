import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTournamentInfoFixture } from '@/test/msw/tournament-info-handlers';
import { renderInfoSheet, setupTournamentInfoBackend } from '@/test/tournament-info-sheet';
import type { V1Tournament } from '@/types/api';
import { InfoSummaryCard } from '../info-summary-card';
import { scheduleSection } from './schedule-section';

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

const start = setupTournamentInfoBackend();

// 신청 마감 12/17 23:59 KST, 시작 12/20 09:00 KST
const filled = { venue: '성수 풋살장', rosterDeadlineAt: '2026-12-18T14:59:00.000Z' } satisfies Partial<V1Tournament>;

describe('일정·장소 섹션 시트', () => {
  it('저장된 값이 한국 시간으로 채워져 열린다', () => {
    const view = renderInfoSheet(scheduleSection, start({ ...filled, parkingInfo: '지하 2시간 무료' }));

    expect(view.inSheet().getByLabelText('대회 시작')).toHaveValue('2026-12-20T09:00');
    expect(view.inSheet().getByLabelText('대회 종료')).toHaveValue('');
    expect(view.inSheet().getByLabelText('신청 마감')).toHaveValue('2026-12-17T23:59');
    expect(view.inSheet().getByLabelText('명단 제출 마감')).toHaveValue('2026-12-18T23:59');
    expect(view.inSheet().getByLabelText('장소')).toHaveValue('성수 풋살장');
    expect(view.inSheet().getByLabelText('주차 안내')).toHaveValue('지하 2시간 무료');
  });

  it('시작 시각만 바꾸면 PATCH 키는 scheduledAt 뿐이고 값은 한국 시간을 ISO 로 바꾼 것이다', async () => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('대회 시작'), { target: { value: '2026-12-21T10:30' } });
    view.save();
    await view.saved();

    expect(Object.keys(backend.state.patches[0]).sort()).toEqual(['expectedVersion', 'scheduledAt']);
    expect(backend.state.patches[0].scheduledAt).toBe('2026-12-21T01:30:00.000Z');
    expect(view.onSaved).toHaveBeenCalledWith('일정·장소 설정을 저장했어요.');
  });

  it('종료가 시작보다 빠르면 칸 아래에 알리고 요청하지 않는다', () => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);
    const end = view.inSheet().getByLabelText('대회 종료');

    fireEvent.change(end, { target: { value: '2026-12-19T18:00' } });
    view.save();

    expect(end).toHaveAccessibleDescription('대회 종료가 시작보다 빠를 수 없어요.');
    expect(end).toHaveFocus();
    expect(backend.state.patches).toEqual([]);
  });

  it('명단 제출 마감이 신청 마감보다 앞서면 알리고 요청하지 않는다', () => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);
    const roster = view.inSheet().getByLabelText('명단 제출 마감');

    fireEvent.change(roster, { target: { value: '2026-12-16T09:00' } });
    view.save();

    expect(roster).toHaveAccessibleDescription('명단 제출 마감은 신청 마감과 같거나 그 뒤여야 해요.');
    expect(backend.state.patches).toEqual([]);
  });

  it.each([
    ['신청 마감 뒤로', '2026-12-19T09:00', '2026-12-19T00:00:00.000Z'],
    ['비우면', '', null],
  ])('대조군: 명단 제출 마감을 %s 저장한다', async (_label, value, sent) => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('명단 제출 마감'), { target: { value } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['rosterDeadlineAt']);
    expect(backend.state.patches[0].rosterDeadlineAt).toBe(sent);
  });

  it('순서가 어긋난 채 만들어진 대회도 마감을 안 건드린 수정은 막지 않는다', async () => {
    const backend = start({ ...filled, rosterDeadlineAt: '2026-12-10T00:00:00.000Z' });
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('주차 안내'), { target: { value: '주차 불가' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['parkingInfo']);
  });

  it('장소를 안 건드리면 장소 계열 키를 하나도 보내지 않는다', async () => {
    const backend = start({ ...filled, venueProvider: 'kakao', venueProviderId: 'kakao-1', venueAddress: '서울 성동구', latitude: 37.5, longitude: 127 });
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('주차 안내'), { target: { value: '주차 불가' } });
    view.save();
    await view.saved();

    expect(view.patchKeys().filter((key) => key.startsWith('venue') || key === 'latitude' || key === 'longitude')).toEqual([]);
  });

  it('장소 이름을 바꾸면 venue 를 보낸다 — 직접 적은 이름이라 좌표 키는 없다', async () => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('장소'), { target: { value: '뚝섬 풋살장' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['venue']);
    expect(backend.state.patches[0].venue).toBe('뚝섬 풋살장');
  });

  it('장소를 비우면 venue 를 null 로 보낸다', async () => {
    const backend = start(filled);
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('장소'), { target: { value: '' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['venue']);
    expect(backend.state.patches[0].venue).toBeNull();
  });

  it('주차 안내를 비우면 parkingInfo 를 null 로 보낸다', async () => {
    const backend = start({ ...filled, parkingInfo: '지하 2시간 무료' });
    const view = renderInfoSheet(scheduleSection, backend);

    fireEvent.change(view.inSheet().getByLabelText('주차 안내'), { target: { value: '  ' } });
    view.save();
    await view.saved();

    expect(view.patchKeys()).toEqual(['parkingInfo']);
    expect(backend.state.patches[0].parkingInfo).toBeNull();
  });

  it.each([
    ['venue', '장소'],
    ['rosterDeadlineAt', '명단 제출 마감'],
  ])('딥링크가 가리킨 칸(%s)에 초점을 둔 채 열린다', (focusField, label) => {
    const view = renderInfoSheet(scheduleSection, start(), { focusField });

    expect(view.inSheet().getByLabelText(label)).toHaveFocus();
  });
});

describe('일정·장소 섹션 요약 카드', () => {
  const rows = (overrides: Partial<V1Tournament> = {}) => {
    render(<InfoSummaryCard definition={scheduleSection} context={{ tournament: createTournamentInfoFixture(overrides) }} canWrite onEdit={vi.fn()} />);
    return within(screen.getByRole('region', { name: '일정·장소' }));
  };
  const rowOf = (card: ReturnType<typeof rows>, label: string) => within(card.getByText(label).nextElementSibling as HTMLElement);

  it('비어 있는 장소와 명단 제출 마감에 「채워야 해요」 가 붙고, 주차 안내는 「선택」 이다', () => {
    const card = rows();

    expect(rowOf(card, '장소').getByText('채워야 해요')).toBeInTheDocument();
    expect(rowOf(card, '명단 제출 마감').getByText('채워야 해요')).toBeInTheDocument();
    expect(rowOf(card, '주차 안내').getByText('선택')).toBeInTheDocument();
    expect(rowOf(card, '주차 안내').getByText('비어 있음')).toBeInTheDocument();
  });

  it('대조군: 채워진 값에는 「채워야 해요」 가 없다', () => {
    const card = rows(filled);

    expect(card.queryByText('채워야 해요')).toBeNull();
    expect(rowOf(card, '장소').getByText('성수 풋살장')).toBeInTheDocument();
  });

  it('끝난 대회는 비어 있어도 「채워야 해요」 를 붙이지 않는다', () => {
    expect(rows({ status: 'completed' }).queryByText('채워야 해요')).toBeNull();
  });

  it('지난 명단 제출 마감은 팀이 명단을 낼 수 없다고 알린다', () => {
    const card = rows({ ...filled, rosterDeadlineAt: '2020-01-01T00:00:00.000Z' });

    expect(rowOf(card, '명단 제출 마감').getByText('지남 — 팀이 명단을 낼 수 없어요')).toBeInTheDocument();
  });

  it('대조군: 아직 남은 명단 제출 마감에는 그 안내가 없다', () => {
    expect(rows({ ...filled, rosterDeadlineAt: '2999-01-01T00:00:00.000Z' }).queryByText(/팀이 명단을 낼 수 없어요/)).toBeNull();
  });
});
