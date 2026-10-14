import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitionFieldPicker } from './competition-field-picker';
import { LeagueFixtureScheduleModal } from '@/app/admin/league-matches/[leagueId]/league-fixture-schedule-modal';

const mocks = vi.hoisted(() => ({ fields: vi.fn(), submit: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TournamentFields: mocks.fields,
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));
beforeEach(() => {
  mocks.fields.mockReturnValue({ data: { items: [
    { id: 'a', name: '등록 A구장', active: true }, { id: 'b', name: '비활성 구장', active: false },
  ] }, isPending: false, isError: false, refetch: vi.fn() });
  mocks.submit.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('경기 설정의 등록 경기장 선택', () => {
  it('등록된 활성 필드를 선택하며 기존 inactive 배정은 표시한다', () => {
    const onChange = vi.fn();
    render(<CompetitionFieldPicker tournamentId="league" value="b" onChange={onChange} />);
    expect(screen.getByRole('option', { name: '비활성 구장 (사용 안 함)' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '등록된 경기장(필드)' }), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
  });
  it('목록 조회 실패는 빈 목록으로 숨기지 않고 재시도한다', () => {
    const refetch = vi.fn();
    mocks.fields.mockReturnValue({ isError: true, error: new Error('합성 목록 오류'), refetch });
    render(<CompetitionFieldPicker tournamentId="league" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('합성 목록 오류');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('실제 리그 수정 폼에서 선택한 필드만 전송하고 장소 입력과 충돌하지 않는다', async () => {
    render(<LeagueFixtureScheduleModal leagueId="league" fixture={{ teamMatchId: 'fixture', title: '1경기', homeTeamId: 'h',
      awayTeamId: 'a', startAt: '2026-10-20T10:00:00Z', placeName: '기존 구장', status: 'matched' }}
      defaultPlace={null} matchupLabel="홈 vs 원정" teams={[]} teamLockedReason={null} isSubmitting={false}
      onSubmit={mocks.submit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: '등록된 경기장(필드)' }), { target: { value: 'a' } });
    expect(screen.queryByText('다른 장소 사용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(mocks.submit).toHaveBeenCalledWith({ fieldId: 'a' });
  });
});
