import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentFlowSection } from './tournament-flow-section';
import type { V1TournamentFormat } from '@/types/api';

describe('TournamentFlowSection', () => {
  it.each([
    ['league', ['풀리그', '순위 집계', '시상']],
    ['group_knockout', ['조별 리그', '결선 진출', '결선 토너먼트']],
    ['knockout', ['대진 편성', '토너먼트', '결승 · 시상']],
  ] as const)('%s는 선택한 방식의 단계만 보여준다', (format, titles) => {
    render(<TournamentFlowSection tournament={{ format, kind: 'regular_tournament' }} />);
    const region = screen.getByRole('region', { name: '대회 진행 방식' });
    expect(within(region).getAllByRole('listitem').map((item) => item.querySelector('.tm-text-label')?.textContent)).toEqual(titles);
  });

  it('같은 화면에서 진행 방식을 바꾸면 이전 방식의 안내를 남기지 않는다', () => {
    const { rerender } = render(<TournamentFlowSection tournament={{ format: 'group_knockout', kind: 'regular_tournament' }} />);
    for (const format of ['league', 'knockout', 'group_knockout'] as V1TournamentFormat[]) {
      rerender(<TournamentFlowSection tournament={{ format, kind: 'regular_tournament' }} />);
      expect(screen.queryByText('결선 진출', { exact: true }) !== null).toBe(format === 'group_knockout');
      expect(screen.queryByText('순위 집계', { exact: true }) !== null).toBe(format === 'league');
    }
  });

  it('정규 리그의 기본 format이 group_knockout이어도 리그 안내를 유지한다', () => {
    render(<TournamentFlowSection tournament={{ format: 'group_knockout', kind: 'regular_league' }} />);
    expect(screen.getByText('풀리그', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('결선 진출', { exact: true })).not.toBeInTheDocument();
  });
});
