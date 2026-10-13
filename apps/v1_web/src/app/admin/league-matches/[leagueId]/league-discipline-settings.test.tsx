import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import { LeagueDisciplineSettings } from './league-discipline-settings';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1UpdateLeagueDiscipline: () => ({ mutateAsync: save, isPending: false }) }));
const league = (extra: Partial<V1AdminLeagueDetail> = {}): V1AdminLeagueDetail => ({
  leagueId: 'league-1', yellowAccumulationLimit: null, redCardSuspensionMatches: null, fixtures: [], ...extra,
} as V1AdminLeagueDetail);
beforeEach(() => { save.mockReset().mockResolvedValue({}); });

describe('리그 출전정지 규정', () => {
  it('두 규정을 저장하고 빈 값은 미적용으로 보낸다', async () => {
    const toast = vi.fn();
    render(<LeagueDisciplineSettings league={league({ redCardSuspensionMatches: 2 })} canWrite showToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('경고 누적 기준 (장)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('퇴장 출전정지 (경기)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('출전정지 규정을 저장했어요.', 'success'));
    expect(save).toHaveBeenCalledWith({ yellowAccumulationLimit: 3, redCardSuspensionMatches: null });
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });
  it('이미 시작된 경기와 읽기 전용 권한은 편집을 열지 않는다', () => {
    const { rerender } = render(<LeagueDisciplineSettings league={league({ fixtures: [{ gameState: 'LIVE' } as never] })} canWrite showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    expect(screen.getByText(/이미 시작한 경기/)).toBeInTheDocument();
    rerender(<LeagueDisciplineSettings league={league()} canWrite={false} showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
  });
  it('잘못된 범위와 저장 실패는 입력을 유지하며 알려 준다', async () => {
    render(<LeagueDisciplineSettings league={league()} canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('경고 누적 기준 (장)'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1부터 20');
    expect(save).not.toHaveBeenCalled();
    save.mockRejectedValue(new Error('서버 저장 실패'));
    fireEvent.change(screen.getByLabelText('경고 누적 기준 (장)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('서버 저장 실패'));
    expect(screen.getByLabelText('경고 누적 기준 (장)')).toHaveValue('3');
  });
});
