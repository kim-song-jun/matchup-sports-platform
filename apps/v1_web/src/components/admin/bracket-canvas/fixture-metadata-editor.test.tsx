import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { FixtureMetadataEditor } from './fixture-metadata-editor';

const save = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
  useV1UpdateFixture: () => ({ mutateAsync: save, isPending: false }),
  useV1TournamentFields: () => ({ data: { items: [{ id: 'field-a', name: 'A구장', active: true }] }, isPending: false, isError: false }),
}));
afterEach(cleanup);
beforeEach(() => { save.mockReset(); save.mockResolvedValue({}); });
const group = makeGroup({ id: 'semi', name: '준결승', phase: 'semi' });
const source = makeFixture({ id: 'source', groupId: group.id, fixtureNumber: 12 });
const fixture = makeFixture({ id: 'final', groupId: null, fixtureNumber: 13, scheduledAt: '2026-10-25T05:00:00.000Z', fieldId: 'field-a', venue: 'A구장', homeDisplayLabel: '준결승 A 승자', bracketSources: [{ fixtureId: 'source', side: 'HOME', outcome: 'WINNER' }] });
function editor(f = fixture, s = source) { return <FixtureMetadataEditor tournamentId="t-1" fixture={f} fixtures={[s, f]} groups={[group]} slots={[]} canWrite />; }

describe('shared fixture metadata editor', () => {
  it('hydrates existing list metadata, clears time explicitly, and restores the automatic label without changing edges', async () => {
    render(editor());
    expect(screen.getByLabelText('경기 시각')).toHaveValue('2026-10-25T14:00');
    expect(screen.getByRole('combobox')).toHaveValue('field-a');
    fireEvent.click(screen.getByRole('button', { name: '홈 자동 문구 복원' }));
    fireEvent.click(screen.getByRole('button', { name: '시각 비우기' }));
    fireEvent.click(screen.getByRole('button', { name: '경기 정보 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', homeDisplayLabel: null, scheduledAt: null }));
    expect(screen.getByRole('status')).toHaveTextContent('저장했어요');
  });
  it('keeps entered data after server rejection and retries the same fixture', async () => {
    save.mockRejectedValueOnce(new Error('저장 실패'));
    render(editor());
    fireEvent.change(screen.getByLabelText('어웨이 표시 문구'), { target: { value: '준결승 B 승자' } });
    fireEvent.change(screen.getByLabelText('경기 번호'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 정보 저장' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('어웨이 표시 문구')).toHaveValue('준결승 B 승자');
    expect(screen.getByLabelText('경기 번호')).toHaveValue(21);
    fireEvent.click(screen.getByRole('button', { name: '경기 정보 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toEqual({ fixtureId: 'final', fixtureNumber: 21, awayDisplayLabel: '준결승 B 승자' });
  });
  it('updates automatic preview after source renumbering while preserving a custom draft', () => {
    const view = render(editor());
    fireEvent.change(screen.getByLabelText('홈 표시 문구'), { target: { value: '직접 입력' } });
    view.rerender(editor(fixture, { ...source, fixtureNumber: 22 }));
    expect(screen.getByText('자동 문구: 준결승 22번 경기 승자')).toBeInTheDocument();
    expect(screen.getByLabelText('홈 표시 문구')).toHaveValue('직접 입력');
  });
  it('unassigns the registered field and stored place together', async () => {
    render(editor());
    fireEvent.click(screen.getByRole('button', { name: '경기장 비우기' }));
    fireEvent.click(screen.getByRole('button', { name: '경기 정보 저장' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ fixtureId: 'final', fieldId: null, venue: '' }));
  });
});
