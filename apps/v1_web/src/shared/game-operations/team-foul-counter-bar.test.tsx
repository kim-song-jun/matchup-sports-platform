import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEAM_FOUL_WARNING_THRESHOLD } from '@/lib/team-foul-counter';
import type { GameSide } from '@/types/game-operations';
import { TeamFoulCounterBar } from './team-foul-counter-bar';

function side(id: string, sideKey: 'HOME' | 'AWAY', name: string): GameSide {
  return { id, gameId: 'g-1', sideKey, teamId: null, displayNameSnapshot: name, createdAt: '', updatedAt: '' };
}

const SIDES = [
  side('side-home', 'HOME', 'QA0929 마포 FC'),
  side('side-away', 'AWAY', 'QA0929 합정 유나이티드 아주 긴 팀 이름'),
];

describe('TeamFoulCounterBar', () => {
  it('팀마다 "파울 N" 을 한 덩어리로 보여준다', () => {
    render(<TeamFoulCounterBar sides={SIDES} counts={{ 'side-home': 1, 'side-away': 0 }} period={2} />);

    const group = screen.getByRole('group', { name: '후반 팀 파울' });
    expect(within(group).getByText('파울 1')).toBeInTheDocument();
    expect(within(group).getByText('파울 0')).toBeInTheDocument();
  });

  // F91 — 390px 에서 팀 이름이 길면 "파울 / 0" 으로 꺾였다. jsdom 은 레이아웃을 계산하지 않아
  // 꺾임 자체를 잴 수 없으므로, 숫자 묶음이 줄지도 꺾이지도 않게 걸어 둔 클래스를 계약으로 둔다.
  it('숫자 묶음은 꺾지 않고 공통 접두사가 있는 팀 이름 전체를 줄바꿈할 수 있다', () => {
    render(<TeamFoulCounterBar sides={SIDES} counts={{ 'side-home': 0, 'side-away': 0 }} period={1} />);

    const count = screen.getAllByText('파울 0')[1].parentElement as HTMLElement;
    expect(count).toHaveClass('shrink-0', 'whitespace-nowrap');
    for (const side of SIDES) {
      const name = screen.getByText(side.displayNameSnapshot);
      expect(name).toHaveClass('min-w-0', 'break-keep');
      expect(name).not.toHaveClass('truncate');
      expect(name).toHaveStyle({ overflowWrap: 'anywhere' });
    }
  });

  it('경고 임계치에 닿은 팀만 프리킥 안내를 보여준다 (대조군: 다른 팀은 임계치 미만)', () => {
    render(
      <TeamFoulCounterBar
        sides={SIDES}
        counts={{ 'side-home': TEAM_FOUL_WARNING_THRESHOLD, 'side-away': TEAM_FOUL_WARNING_THRESHOLD - 1 }}
        period={1}
      />,
    );

    expect(screen.getAllByText('다음부터 10m 프리킥')).toHaveLength(1);
  });

  // MD-QA #189: 팀 파울은 피리어드마다 새로 센다 — 어느 피리어드 숫자인지와 다음에 다시 센다는 사실을 보여 준다.
  it('전반에는 "전반 팀 파울"과 후반에 0부터 다시 센다는 안내를 보여 준다', () => {
    render(<TeamFoulCounterBar sides={SIDES} counts={{ 'side-home': 3 }} period={1} periodCount={2} hasNextPeriod />);

    const group = screen.getByRole('group', { name: '전반 팀 파울' });
    expect(within(group).getByText('전반 팀 파울')).toBeInTheDocument();
    expect(within(group).getByText('후반에는 0부터 다시 세요')).toBeInTheDocument();
    expect(within(group).getByText('파울 3')).toBeInTheDocument();
  });

  it('다음 피리어드가 없으면(후반·단판) 다시 센다는 안내가 없다', () => {
    const { unmount } = render(<TeamFoulCounterBar sides={SIDES} counts={{}} period={2} periodCount={2} />);
    expect(screen.getByText('후반 팀 파울')).toBeInTheDocument();
    expect(screen.queryByText(/0부터 다시 세요/)).toBeNull();
    unmount();

    render(<TeamFoulCounterBar sides={SIDES} counts={{}} period={1} periodCount={1} />);
    expect(screen.getByRole('group', { name: '경기 팀 파울' })).toBeInTheDocument();
    expect(screen.queryByText(/0부터 다시 세요/)).toBeNull();
  });

  it('팀이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<TeamFoulCounterBar sides={[]} counts={{}} period={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
