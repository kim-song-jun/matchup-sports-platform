import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ useTeamInternalMatches: vi.fn() }));
vi.mock('@/hooks/use-team-internal-matches', () => hook);

import { TeamInternalMatchesSection, internalMatchScoreText } from './team-internal-matches-section';

const match = (id: string, scores: Array<number | null>, over = {}) => ({
  id, playedAt: '2026-11-20T01:00:00.000Z', resultRecorded: scores[0] !== null, viewerSideNumber: 1,
  sides: scores.map((score, i) => ({ sideNumber: i + 1, name: `${i + 1}팀`, score, playerCount: 5 })), ...over,
});

describe('TeamInternalMatchesSection', () => {
  beforeEach(() => hook.useTeamInternalMatches.mockReset());

  it('점수·내 팀을 보여 주고 상세로 연결한다', () => {
    hook.useTeamInternalMatches.mockReturnValue({ isLoading: false, isError: false, data: { items: [match('m1', [3, 2])], hasMore: false } });
    render(<TeamInternalMatchesSection teamId="t1" canManage={false} />);
    const link = screen.getByRole('link', { name: /1팀 3 : 2팀 2/ });
    expect(link.getAttribute('href')).toBe('/teams/t1/internal-matches/m1');
    expect(link.textContent).toContain('내 팀 1팀');
    expect(screen.queryByText('팀 내 경기 만들기')).toBeNull();
  });

  it('운영진에게는 만들기 버튼이 보이고, 기록이 없어도 섹션이 남는다', () => {
    hook.useTeamInternalMatches.mockReturnValue({ isLoading: false, isError: false, data: { items: [], hasMore: false } });
    render(<TeamInternalMatchesSection teamId="t1" canManage />);
    expect(screen.getByRole('link', { name: /팀 내 경기 만들기/ }).getAttribute('href')).toBe('/teams/t1/internal-matches/new');
  });

  it('기록이 없고 운영진도 아니면, 불러오는 중이거나 실패해도 아무것도 그리지 않는다', () => {
    for (const state of [
      { isLoading: false, isError: false, data: { items: [], hasMore: false } },
      { isLoading: true, isError: false, data: undefined },
      { isLoading: false, isError: true, data: undefined },
    ]) {
      hook.useTeamInternalMatches.mockReturnValue(state);
      const { container, unmount } = render(<TeamInternalMatchesSection teamId="t1" canManage={false} />);
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it('결과가 없으면 "결과 미입력", 3팀 이상이면 팀별 점수를 모두 보여 준다', () => {
    expect(internalMatchScoreText(match('a', [null, null]))).toBe('결과 미입력');
    expect(internalMatchScoreText(match('b', [2, 1, 0]))).toBe('1팀 2 : 2팀 1 : 3팀 0');
  });
});
