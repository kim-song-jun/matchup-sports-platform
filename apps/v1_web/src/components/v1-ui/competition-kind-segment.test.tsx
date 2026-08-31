import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompetitionKindSegment } from './competition-kind-segment';

/**
 * 하단 탭에서 '리그'가 빠졌으므로, **대회 목록에서 리그로 건너갈 수단**은 이 세그먼트다
 * (리그로 오는 다른 길 — 홈 위젯 등 — 은 따로 있다). 그래서 이 테스트가 잡아야 하는 것은
 * 스타일이 아니라 **두 목록이 서로 도달 가능한가**다.
 */
describe('CompetitionKindSegment', () => {
  it('대회 목록에서도 리그로 갈 수 있다 (리그의 유일한 진입 경로)', () => {
    render(<CompetitionKindSegment active="tournament" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute('href', '/league-matches');
  });

  it('리그 목록에서도 대회로 돌아갈 수 있다', () => {
    render(<CompetitionKindSegment active="league" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 대회' })).toHaveAttribute('href', '/tournaments');
  });

  it('현재 위치를 색이 아니라 aria-current 로도 알린다', () => {
    render(<CompetitionKindSegment active="league" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '정규 대회' })).not.toHaveAttribute('aria-current');
  });
});
