import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueManualFixtureModal } from './league-manual-fixture-modal';

const TEAMS = [
  { id: 'team-a', label: 'A팀' },
  { id: 'team-b', label: 'B팀' },
];

function setup(onSubmit = vi.fn().mockResolvedValue({})) {
  const onClose = vi.fn();
  render(
    <LeagueManualFixtureModal teams={TEAMS} isSubmitting={false} onSubmit={onSubmit} onClose={onClose} />,
  );
  return { onSubmit, onClose };
}

function pick(labelText: string, teamLabel: string) {
  const input = screen.getByLabelText(labelText);
  fireEvent.change(input, { target: { value: teamLabel } });
  // 두 피커가 같은 팀 이름을 보여줄 수 있다(홈에 고른 뒤 어웨이를 열면 둘 다 보인다).
  // **지금 열린 메뉴의 옵션**만 고른다 — 이름으로만 찾으면 앞 피커의 표시를 누른다.
  const options = screen.getAllByRole('option', { name: teamLabel });
  fireEvent.click(options[options.length - 1]);
}

describe('LeagueManualFixtureModal', () => {
  it('두 팀과 시작 일시를 채우면 그대로 보낸다', async () => {
    const { onSubmit } = setup();
    pick('홈 팀', 'A팀');
    pick('어웨이 팀', 'B팀');
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-09-30T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 만들기' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ homeTeamId: 'team-a', awayTeamId: 'team-b' }),
      ),
    );
  });

  it('같은 팀끼리는 만들 수 없다 — 화면에서 보이는 실수라 여기서 잡는다', async () => {
    const { onSubmit } = setup();
    pick('홈 팀', 'A팀');
    pick('어웨이 팀', 'A팀');
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-09-30T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 팀끼리는 경기를 만들 수 없어요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('시작 일시가 없으면 보내지 않는다', async () => {
    const { onSubmit } = setup();
    pick('홈 팀', 'A팀');
    pick('어웨이 팀', 'B팀');
    fireEvent.click(screen.getByRole('button', { name: '경기 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('경기 시작 일시를 입력해 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('경기 시간이 숫자가 아니면 보내지 않는다 — badInput 이 값을 비우는 자리다', async () => {
    const { onSubmit } = setup();
    pick('홈 팀', 'A팀');
    pick('어웨이 팀', 'B팀');
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-09-30T19:00' } });
    fireEvent.change(screen.getByLabelText('경기 시간(분)'), { target: { value: 'e' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('경기 시간은 숫자(분)로 입력해 주세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('경기 시간을 비우면 그 필드를 아예 안 보낸다 — 종료 시각 없이 만든다', async () => {
    const { onSubmit } = setup();
    pick('홈 팀', 'A팀');
    pick('어웨이 팀', 'B팀');
    fireEvent.change(screen.getByLabelText('시작 일시'), { target: { value: '2026-09-30T19:00' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 만들기' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('durationMinutes');
  });
});
