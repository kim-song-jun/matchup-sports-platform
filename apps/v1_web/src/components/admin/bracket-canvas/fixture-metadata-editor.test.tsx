import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { FixtureMetadataEditor } from './fixture-metadata-editor';

const save = vi.hoisted(() => vi.fn());
const periods = vi.hoisted(() => ({ match: null as null | Record<string, unknown>, save: vi.fn() }));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentMatchPeriods: () => ({ data: periods.match ?? undefined, isPending: !periods.match, isError: false }),
  useUpdateTournamentPeriodSettings: () => ({ mutateAsync: periods.save, isPending: false }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
  useV1UpdateFixture: () => ({ mutateAsync: save, isPending: false }),
  useV1TournamentFields: () => ({ data: { items: [{ id: 'field-a', name: 'A구장', active: true }, { id: 'field-b', name: 'B구장', active: true }] }, isPending: false, isError: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1SetBracketSources: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
afterEach(() => { cleanup(); periods.match = null; });
beforeEach(() => { save.mockReset(); save.mockResolvedValue({}); });
const showToast = vi.fn();
const group = makeGroup({ id: 'semi', name: '준결승', phase: 'semi' });
const source = makeFixture({ id: 'source', groupId: group.id, fixtureNumber: 12 });
const fixture = makeFixture({ id: 'final', groupId: null, fixtureNumber: 13, scheduledAt: '2026-10-25T05:00:00.000Z', fieldId: 'field-a', venue: 'A구장', homeDisplayLabel: '준결승 A 승자', bracketSources: [{ fixtureId: 'source', side: 'HOME', outcome: 'WINNER' }] });
function editor(f = fixture, s = source, canWrite = true) {
  return <FixtureMetadataEditor tournamentId="t-1" fixture={f} fixtures={[s, f]} groups={[group]} slots={[]} canWrite={canWrite} showToast={showToast} />;
}
const openMore = () => fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
const saveButton = () => screen.getByRole('button', { name: '저장' });

describe('shared fixture metadata editor', () => {
  it('기본에는 날짜·시각·구장과 「더 보기」만 있고 경기 번호·표시 문구·경기 방식은 펼쳐야 보인다', () => {
    render(editor());
    expect(screen.getByLabelText('날짜')).toHaveValue('2026-10-25');
    expect(screen.getByLabelText('시각')).toHaveValue('14:00');
    expect(screen.getByLabelText('등록된 구장')).toHaveValue('field-a');
    expect(screen.queryByLabelText('경기 번호')).toBeNull();
    expect(screen.queryByLabelText('경기 제목')).toBeNull();
    expect(screen.queryByLabelText('구장 직접 입력')).toBeNull();
    const more = screen.getByRole('button', { name: '더 보기' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('표시 문구 · 경기 방식 · 번호 · 이긴 팀이 갈 경기')).toBeInTheDocument();
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('경기 번호')).toHaveValue(13);
    expect(screen.getByLabelText('경기 제목')).toBeInTheDocument();
    expect(screen.getByLabelText('원정 표시 문구')).toBeInTheDocument();
  });

  it('접어 둔 더 보기 값도 저장된다: 펼쳐 번호를 7로 바꾸고 접은 뒤 「저장」 → payload fixtureNumber 7', async () => {
    render(editor());
    openMore();
    fireEvent.change(screen.getByLabelText('경기 번호'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByLabelText('경기 번호')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', fixtureNumber: 7 }));
  });

  it('saves a per-fixture title, hydrates it on reopen and restores automatic text when cleared', async () => {
    const view = render(editor());
    openMore();
    fireEvent.change(screen.getByLabelText('경기 제목'), { target: { value: '  A조 2차전  ' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', displayTitle: 'A조 2차전' }));
    view.unmount();
    render(editor({ ...fixture, displayTitle: 'A조 2차전' }));
    openMore();
    expect(screen.getByLabelText('경기 제목')).toHaveValue('A조 2차전');
    fireEvent.change(screen.getByLabelText('경기 제목'), { target: { value: '' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({ fixtureId: 'final', displayTitle: null }));
  });

  it('「날짜·시각 비우기」가 scheduledAt: null 로 저장된다', async () => {
    render(editor());
    fireEvent.click(screen.getByRole('button', { name: '날짜·시각 비우기' }));
    expect(screen.getByLabelText('날짜')).toHaveValue('');
    expect(screen.getByLabelText('시각')).toHaveValue('');
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', scheduledAt: null }));
    expect(screen.getByRole('status')).toHaveTextContent('저장했어요');
  });

  it('날짜 2026-12-20 + 시각 09:00 → scheduledAt 2026-12-20T00:00:00.000Z(KST 고정)', async () => {
    render(editor());
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-12-20' } });
    fireEvent.change(screen.getByLabelText('시각'), { target: { value: '09:00' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', scheduledAt: '2026-12-20T00:00:00.000Z' }));
  });

  it.each([
    ['날짜만', { 날짜: '2026-12-20' }],
    ['시각만', { 시각: '09:00' }],
  ])('%s 넣고 저장하면 요청 없이 오류가 나고 입력은 남는다', (_name, values) => {
    render(editor(makeFixture({ id: 'final', groupId: null, fixtureNumber: 13 })));
    for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent('날짜와 시각을 함께 정해 주세요.');
    expect(save).not.toHaveBeenCalled();
    for (const [label, value] of Object.entries(values)) expect(screen.getByLabelText(label)).toHaveValue(value);
  });

  it('「자동 문구 복원」 버튼이 없고, 표시 문구를 지우면 흐린 자동 문구가 placeholder 로 남는다', async () => {
    render(editor());
    openMore();
    expect(screen.queryByRole('button', { name: /자동 문구 복원/ })).toBeNull();
    expect(screen.queryByText(/자동 문구:/)).toBeNull();
    const home = screen.getByLabelText('홈 표시 문구');
    expect(home).toHaveValue('준결승 A 승자');
    expect(home).toHaveAttribute('placeholder', '준결승 12번 경기 승자');
    fireEvent.change(home, { target: { value: '' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', homeDisplayLabel: null }));
  });

  it('keeps entered data after server rejection and retries the same fixture', async () => {
    save.mockRejectedValueOnce(new Error('저장 실패'));
    render(editor());
    openMore();
    fireEvent.change(screen.getByLabelText('원정 표시 문구'), { target: { value: '준결승 B 승자' } });
    fireEvent.change(screen.getByLabelText('경기 번호'), { target: { value: '21' } });
    fireEvent.click(saveButton());
    await screen.findByRole('alert');
    expect(screen.getByLabelText('원정 표시 문구')).toHaveValue('준결승 B 승자');
    expect(screen.getByLabelText('경기 번호')).toHaveValue(21);
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toEqual({ fixtureId: 'final', fixtureNumber: 21, awayDisplayLabel: '준결승 B 승자' });
  });

  it('updates automatic preview after source renumbering while preserving a custom draft', () => {
    const view = render(editor());
    openMore();
    fireEvent.change(screen.getByLabelText('홈 표시 문구'), { target: { value: '직접 입력' } });
    view.rerender(editor(fixture, { ...source, fixtureNumber: 22 }));
    expect(screen.getByLabelText('홈 표시 문구')).toHaveAttribute('placeholder', '준결승 22번 경기 승자');
    expect(screen.getByLabelText('홈 표시 문구')).toHaveValue('직접 입력');
  });

  it('구장 선택(등록 구장)이 fieldId 로 저장되고, 「구장 직접 입력」은 더 보기 안에서만 보인다', async () => {
    const placed = makeFixture({ id: 'final', groupId: null, fixtureNumber: 13 });
    render(editor(placed));
    expect(screen.queryByLabelText('구장 직접 입력')).toBeNull();
    fireEvent.change(screen.getByLabelText('등록된 구장'), { target: { value: 'field-b' } });
    openMore();
    expect(screen.queryByLabelText('구장 직접 입력')).toBeNull();
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', fieldId: 'field-b' }));
    fireEvent.change(screen.getByLabelText('등록된 구장'), { target: { value: '' } });
    expect(await screen.findByLabelText('구장 직접 입력')).toBeInTheDocument();
  });

  it('unassigns the registered field and stored place together', async () => {
    render(editor());
    openMore();
    fireEvent.click(screen.getByRole('button', { name: '구장 비우기' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', fieldId: null, venue: '' }));
  });

  it('경기 방식만 바꾸면 경기 정보 PATCH 없이 이 경기에만 저장한다', async () => {
    const half = (durationMinutes: number, code: string, label: string) => ({ code, label, durationMinutes, extraTime: false });
    periods.match = {
      tournamentId: 't-1', teamMatchId: 'final', expectedVersion: 'v-1', overridden: false, editable: true,
      periods: [half(10, 'FIRST_HALF', '전반'), half(10, 'SECOND_HALF', '후반')], legacyPeriodCount: null,
      inherited: { source: 'stage', phase: 'final', groupName: null, periods: [half(10, 'FIRST_HALF', '전반'), half(10, 'SECOND_HALF', '후반')], legacyPeriodCount: null },
    };
    periods.save.mockReset().mockResolvedValue({});
    render(editor());
    openMore();
    expect(screen.getByRole('radio', { name: /위 설정 따르기/ }).closest('label')).toHaveTextContent('결승 설정 · 전·후반 각 10분');
    fireEvent.click(screen.getByRole('radio', { name: '이 경기만 따로' }));
    fireEvent.click(screen.getByRole('button', { name: '단판' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(periods.save).toHaveBeenCalledWith({ expectedVersion: 'v-1', teamMatchId: 'final', periods: [{ durationMinutes: 20 }] }));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('저장했어요');
  });

  it('keeps a label draft while pristine time and place follow external assignment changes', async () => {
    const current = { ...fixture, fieldId: null, venue: '옛 구장' };
    const view = render(editor(current));
    openMore();
    fireEvent.change(screen.getByLabelText('경기 제목'), { target: { value: '편집 중인 제목' } });
    view.rerender(editor({ ...current, scheduledAt: '2026-10-25T06:30:00.000Z', fieldId: 'field-a', venue: 'A구장' }));
    expect(screen.getByLabelText('날짜')).toHaveValue('2026-10-25');
    expect(screen.getByLabelText('시각')).toHaveValue('15:30');
    expect(screen.getByLabelText('경기 제목')).toHaveValue('편집 중인 제목');
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', displayTitle: '편집 중인 제목' }));
  });

  it('읽기 전용: 입력 비활성·「저장」 없음', () => {
    render(editor(fixture, source, false));
    expect(screen.getByLabelText('날짜')).toBeDisabled();
    expect(screen.getByLabelText('시각')).toBeDisabled();
    expect(screen.getByLabelText('등록된 구장')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    openMore();
    expect(screen.getByLabelText('경기 번호')).toBeDisabled();
    expect(screen.getByLabelText('경기 제목')).toBeDisabled();
  });

  it.each([false, true])('시간·구장이 겹치면 window.confirm 이 아니라 앱 확인 창을 띄운다 (그대로 저장: %s)', async accepted => {
    const native = vi.spyOn(window, 'confirm');
    const other = makeFixture({ id: 'other', groupId: group.id, fixtureNumber: 14, scheduledAt: '2026-10-25T06:00:00.000Z', fieldId: 'field-a', venue: 'A구장' });
    try {
      render(<FixtureMetadataEditor tournamentId="t-1" fixture={fixture} fixtures={[source, fixture, other]} groups={[group]} slots={[]} canWrite showToast={showToast} />);
      fireEvent.change(screen.getByLabelText('시각'), { target: { value: '15:00' } });
      fireEvent.click(saveButton());
      const dialog = await screen.findByRole('dialog');
      expect(native).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent('시간·구장이 겹쳐요');
      expect(dialog).toHaveTextContent('14번 경기');
      expect(save).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: accepted ? '그대로 저장' : '취소' }));
      if (accepted) await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      else await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(save).toHaveBeenCalledTimes(accepted ? 1 : 0);
    } finally { native.mockRestore(); }
  });
});
