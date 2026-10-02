import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompetitionKindSegment, parseCompetitionKind } from './competition-kind-segment';

/**
 * 하단 탭에서 '리그'가 빠졌으므로, **대회 목록에서 리그로 건너갈 수단**은 이 세그먼트다
 * (리그로 오는 다른 길 — 홈 위젯 등 — 은 따로 있다). 그래서 이 테스트가 잡아야 하는 것은
 * 스타일이 아니라 **세 표면이 서로 도달 가능한가**다.
 *
 * ## 계약이 바뀌었다 — 이동 링크 → 같은 목록의 필터
 * 전에는 두 칸이 서로 **다른 페이지**(`/tournaments`, `/league-matches`)로 갔다. 이제 세 칸
 * 모두 **같은 페이지의 `?kind=`** 로 간다. 링크 목적지를 단언하는 아래 두 테스트가 그
 * 전환을 그대로 못박는다 — 목적지가 도로 갈라지면 red 가 된다.
 */
describe('CompetitionKindSegment', () => {
  it('대회를 보다가 리그로 건너갈 수 있다 (리그의 주된 진입 경로)', () => {
    render(<CompetitionKindSegment active="tournament" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute(
      'href',
      '/tournaments?kind=league',
    );
  });

  it('리그를 보다가 대회로 돌아갈 수 있다', () => {
    render(<CompetitionKindSegment active="league" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 대회' })).toHaveAttribute(
      'href',
      '/tournaments?kind=tournament',
    );
  });

  it('둘을 한 번에 보는 전체 칸이 있다 — 통합의 이유가 이 칸이다', () => {
    render(<CompetitionKindSegment active="tournament" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    // 기본값이 `all` 이라 쿼리 없는 주소가 곧 전체다 — 같은 화면에 주소를 둘 만들지 않는다.
    expect(within(nav).getByRole('link', { name: '전체' })).toHaveAttribute('href', '/tournaments');
  });

  it('현재 위치를 색이 아니라 aria-current 로도 알린다', () => {
    render(<CompetitionKindSegment active="league" />);
    const nav = screen.getByRole('navigation', { name: '대회 유형' });
    expect(within(nav).getByRole('link', { name: '정규 리그' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '정규 대회' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: '전체' })).not.toHaveAttribute('aria-current');
  });
});

/**
 * 주소창은 사용자가 아무거나 칠 수 있는 자리다. 모르는 값이 들어와도 목록이 비거나 깨지지
 * 않아야 한다 — 서버도 같은 이유로 `?? 'tournament'` 기본값을 둔다.
 */
describe('parseCompetitionKind', () => {
  it('아는 값은 그대로 읽는다', () => {
    expect(parseCompetitionKind('league', 'tournament')).toBe('league');
    expect(parseCompetitionKind('all', 'tournament')).toBe('all');
    expect(parseCompetitionKind('tournament', 'all')).toBe('tournament');
  });

  it('모르는 값·없음은 기본값으로 떨어진다', () => {
    expect(parseCompetitionKind('regular_league', 'tournament')).toBe('tournament');
    expect(parseCompetitionKind('', 'tournament')).toBe('tournament');
    expect(parseCompetitionKind(null, 'tournament')).toBe('tournament');
    // 기본값이 바뀌어도 같은 규칙이어야 한다 — 리다이렉트 커밋에서 'all' 로 뒤집는다.
    expect(parseCompetitionKind('nope', 'all')).toBe('all');
  });
});
