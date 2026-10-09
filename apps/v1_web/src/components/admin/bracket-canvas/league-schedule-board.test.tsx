import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { LeagueScheduleBoard, type LeagueScheduleBoardProps } from './league-schedule-board';

const TEAMS: V1AdminLeagueTeam[] = [
  { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
  { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
  { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r3' },
];

const SLOTS = [
  makeSlot({ id: 's1', position: 1, label: '1번 자리' }),
  makeSlot({ id: 's2', position: 2, label: '2번 자리' }),
  makeSlot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
  makeSlot({ id: 's4', position: 4, label: '4번 자리', registrationId: 'r2', teamName: '호랑이FC' }),
];

const OFFICIAL_QUICK: V1AdminBracketFixtureGame = makeGame({
  id: 'g1',
  state: 'ENDED',
  version: 2,
  latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
});

function fixture(overrides: Partial<V1LeagueFixture> & { teamMatchId: string }): V1LeagueFixture {
  return { title: '가을 리그', homeTeamId: 't1', awayTeamId: 't2', startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched', ...overrides };
}

const FIXTURES: V1LeagueFixture[] = [
  fixture({ teamMatchId: 'fx-empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
  fixture({ teamMatchId: 'fx-full', homeTeamId: 't3', awayTeamId: 't2', homeSlotId: 's3', awaySlotId: 's4', startAt: '2030-01-14T10:00:00.000Z', game: OFFICIAL_QUICK }),
  fixture({ teamMatchId: 'fx-legacy', startAt: '2030-01-21T10:00:00.000Z' }),
];

const onOpenTemplate = vi.fn();
const onShowList = vi.fn();

function renderBoard(overrides: Partial<LeagueScheduleBoardProps> = {}) {
  return render(
    <LeagueScheduleBoard
      fixtures={FIXTURES}
      slots={SLOTS}
      teams={TEAMS}
      canWrite
      onOpenTemplate={onOpenTemplate}
      onShowList={onShowList}
      {...overrides}
    />,
  );
}

const cardOf = (name: string) => screen.getByRole('listitem', { name });

describe('LeagueScheduleBoard — 렌더', () => {
  it('경기일마다 "N주차 · 날짜" 열을 만들고 자리 라벨·팀 이름·상태를 카드에 싣는다', () => {
    renderBoard();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(3);
    expect(headings.map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^1주차 · /),
      expect.stringMatching(/^2주차 · /),
      expect.stringMatching(/^3주차 · /),
    ]);
    const empty = cardOf('1번 자리 대 2번 자리 경기');
    expect(within(empty).getByText('1번 자리')).toBeInTheDocument();
    expect(within(empty).getByText('2번 자리')).toBeInTheDocument();
    expect(within(empty).getAllByText('비어 있음')).toHaveLength(2);
    expect(within(empty).getByText('예정')).toBeInTheDocument();
    expect(within(empty).getByText(/망원 유수지/)).toBeInTheDocument();

    const full = cardOf('사자FC 대 호랑이FC 경기');
    expect(within(full).queryByText('비어 있음')).toBeNull();
    expect(within(full).getByText('확정')).toBeInTheDocument();
    expect(within(full).getByText('2 : 1')).toBeInTheDocument();
    expect(within(full).getByText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('공개 대기 표시는 팀이 빈 자리 경기에만 붙는다 — 다 찬 경기·자리 없는 기존 경기에는 없다', () => {
    renderBoard();

    expect(within(cardOf('1번 자리 대 2번 자리 경기')).getByText('공개 대기')).toBeInTheDocument();
    expect(within(cardOf('사자FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(within(cardOf('독수리FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(screen.getByText(/자리 2\/4 배정/)).toBeInTheDocument();
    expect(screen.getByText(/공개 대기 1경기/)).toBeInTheDocument();
  });

  it('읽기 전용이면 안내를 보인다', () => {
    renderBoard({ canWrite: false });
    expect(screen.getByRole('status')).toHaveTextContent('읽기 전용');
  });

  it('경기가 없으면 빈 상태에서 템플릿을 권하고(쓰기 권한 있을 때만) 목록으로 가는 길을 남긴다', () => {
    const { unmount } = renderBoard({ fixtures: [], slots: [] });
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(onOpenTemplate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /목록으로/ }));
    expect(onShowList).toHaveBeenCalledTimes(1);
    unmount();

    renderBoard({ fixtures: [], slots: [], canWrite: false });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).toBeNull();
  });

  it('경기가 있어도 자리가 없는 리그는 팀 넣기를 쓸 수 없다고 알린다', () => {
    renderBoard({ slots: [] });
    expect(screen.getByText(/자리 없이 만든 대진/)).toBeInTheDocument();
  });
});
