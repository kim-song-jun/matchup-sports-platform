import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import { LeagueTeamFoulThresholdSettings } from './league-team-foul-threshold-settings';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1UpdateLeagueDiscipline: () => ({ mutateAsync: save, isPending: false }) }));
const league = (extra: Partial<V1AdminLeagueDetail> = {}): V1AdminLeagueDetail => ({
  leagueId: 'league-1', teamFoulThreshold: null, fixtures: [], ...extra,
} as V1AdminLeagueDetail);
beforeEach(() => { save.mockReset().mockResolvedValue({}); });

describe('리그 팀 파울 기준', () => {
  it('값을 비워 둔 리그는 기본 5개로 보여 주고, 정한 리그는 그 개수를 보여 준다', () => {
    const { rerender } = render(<LeagueTeamFoulThresholdSettings league={league()} canWrite showToast={vi.fn()} />);
    expect(screen.getByText('기본 5개')).toBeInTheDocument();
    rerender(<LeagueTeamFoulThresholdSettings league={league({ teamFoulThreshold: 7 })} canWrite showToast={vi.fn()} />);
    expect(screen.getByText('7개')).toBeInTheDocument();
  });

  it('입력한 개수를 이 칸만 담아 저장한다(출전정지 칸을 같이 보내지 않는다)', async () => {
    const toast = vi.fn();
    render(<LeagueTeamFoulThresholdSettings league={league()} canWrite showToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('팀 파울 기준 (개)'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('팀 파울 기준을 저장했어요.', 'success'));
    // 출전정지 칸(`yellowAccumulationLimit`·`redCardSuspensionMatches`)이 섞이면 첫 경기 뒤 서버가 잠금(409)으로 거절한다.
    expect(save).toHaveBeenCalledWith({ teamFoulThreshold: 8 });
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('칸을 비우고 저장하면 null(기본값으로 되돌리기)을 보낸다', async () => {
    render(<LeagueTeamFoulThresholdSettings league={league({ teamFoulThreshold: 7 })} canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByLabelText('팀 파울 기준 (개)')).toHaveValue('7');
    fireEvent.change(screen.getByLabelText('팀 파울 기준 (개)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ teamFoulThreshold: null }));
  });

  // 출전정지 규정 카드는 첫 경기가 시작되면 잠기지만, 이 값은 "중간 수정" 요구라 진행 중에도 열려 있어야 한다.
  it('이미 시작·종료된 경기가 있어도 수정할 수 있다', async () => {
    render(
      <LeagueTeamFoulThresholdSettings
        league={league({ fixtures: [{ gameState: 'LIVE' }, { gameState: 'ENDED' }] as never })}
        canWrite
        showToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('팀 파울 기준 (개)'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ teamFoulThreshold: 4 }));
  });

  it('관전 화면 팀 파울 스위치는 누르는 즉시 이 칸만 담아 저장하고, 진행 중인 리그도 바꿀 수 있다', async () => {
    const toast = vi.fn();
    render(
      <LeagueTeamFoulThresholdSettings
        league={league({ showTeamFouls: true, fixtures: [{ gameState: 'LIVE' }] as never })}
        canWrite
        showToast={toast}
      />,
    );
    const toggle = screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(save).toHaveBeenCalledWith({ showTeamFouls: false }));
    expect(toast).toHaveBeenCalledWith('관전 화면에서 팀 파울을 숨겼어요.', 'success');
  });

  it('필드가 없던 구버전 응답은 스위치를 켜짐으로 읽지만 저장은 막고, 읽기 전용 권한은 스위치를 보여 주지 않는다', () => {
    const { unmount } = render(<LeagueTeamFoulThresholdSettings league={league({ teamFoulThreshold: undefined })} canWrite showToast={vi.fn()} />);
    expect(screen.queryByRole('switch')).toBeNull();
    unmount();
    render(<LeagueTeamFoulThresholdSettings league={league()} canWrite={false} showToast={vi.fn()} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('표시 설정 저장이 실패하면 이유를 알린다', async () => {
    save.mockRejectedValueOnce(new Error('boom'));
    const toast = vi.fn();
    render(<LeagueTeamFoulThresholdSettings league={league({ showTeamFouls: false })} canWrite showToast={toast} />);
    fireEvent.click(screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), 'error'));
  });

  it('읽기 전용 권한은 수정을 열지 않는다', () => {
    render(<LeagueTeamFoulThresholdSettings league={league()} canWrite={false} showToast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    expect(screen.getByText('기본 5개')).toBeInTheDocument();
  });

  it('필드가 없던 구버전 응답은 기본값으로 읽지 않고 불러오지 못했다고 알리며 수정을 막는다', () => {
    render(<LeagueTeamFoulThresholdSettings league={league({ teamFoulThreshold: undefined })} canWrite showToast={vi.fn()} />);
    expect(screen.getByText(/불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
  });

  it('범위 밖 값은 저장하지 않고 이유를 알리며, 저장 실패는 입력을 유지한 채 알려 준다', async () => {
    render(<LeagueTeamFoulThresholdSettings league={league()} canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    for (const bad of ['0', '21', '2.5']) {
      fireEvent.change(screen.getByLabelText('팀 파울 기준 (개)'), { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      expect(screen.getByRole('alert')).toHaveTextContent('1부터 20');
    }
    expect(save).not.toHaveBeenCalled();

    save.mockRejectedValue(new Error('서버 저장 실패'));
    fireEvent.change(screen.getByLabelText('팀 파울 기준 (개)'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('서버 저장 실패'));
    expect(screen.getByLabelText('팀 파울 기준 (개)')).toHaveValue('6');
  });
});
