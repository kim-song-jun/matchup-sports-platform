import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentPlayerRecordsSections } from './player-records-sections';
import type { PublicTournamentPlayerRecordRow } from './types';

function row(overrides: Partial<PublicTournamentPlayerRecordRow>): PublicTournamentPlayerRecordRow {
  // profileHref 기본값은 (override 반영 후의) userId에서 파생한다 — userId만 바꾼
  // 케이스에서 href가 어긋난 픽스처가 만들어지지 않게(리뷰 지적).
  const userId = overrides.userId ?? 'u';
  return { userId, nickname: '선수', profileHref: `/users/${userId}`, goals: 0, assists: 0, ...overrides };
}

const base = {
  isLoading: false,
  isError: false,
  errorMessage: '기록을 불러오지 못했어요.',
  onRetry: vi.fn(),
} as const;

describe('TournamentPlayerRecordsSections', () => {
  it('공동 득점왕 두 명을 둘 다 1위로 매기고, 이름을 공개 프로필로 링크한다', () => {
    render(
      <TournamentPlayerRecordsSections
        {...base}
        goals={[
          row({ userId: 'a', nickname: '가', profileHref: '/users/a', goals: 5 }),
          row({ userId: 'b', nickname: '나', profileHref: '/users/b', goals: 5 }),
          row({ userId: 'c', nickname: '다', profileHref: '/users/c', goals: 3 }),
        ]}
        assists={[]}
        emptyBehavior="hide"
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['1. 가5골', '1. 나5골', '3. 다3골']);
    expect(
      screen.getByRole('link', { name: '득점 순위 1위 가 5골 — 공개 프로필 보기' }),
    ).toHaveAttribute('href', '/users/a');
  });

  it('도움 순위는 도움 수 기준으로 별도 섹션에 렌더한다', () => {
    render(
      <TournamentPlayerRecordsSections
        {...base}
        goals={[]}
        assists={[row({ userId: 'a', nickname: '가', assists: 2 })]}
        emptyBehavior="hide"
      />,
    );
    expect(screen.getByRole('heading', { name: '도움 순위' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '득점 순위' })).not.toBeInTheDocument();
    expect(screen.getByText('2도움')).toBeInTheDocument();
  });

  it('기록이 없으면 hide 모드는 아무것도 그리지 않는다', () => {
    const { container } = render(
      <TournamentPlayerRecordsSections {...base} goals={[]} assists={[]} emptyBehavior="hide" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('기록이 없으면 empty-state 모드는 EmptyState 문구를 보여준다', () => {
    render(
      <TournamentPlayerRecordsSections {...base} goals={[]} assists={[]} emptyBehavior="empty-state" />,
    );
    expect(screen.getByText('아직 기록이 없어요')).toBeInTheDocument();
  });

  it('에러면 재시도 가능한 ErrorState를 보여준다', () => {
    render(
      <TournamentPlayerRecordsSections
        {...base}
        isError
        goals={undefined}
        assists={undefined}
        emptyBehavior="hide"
      />,
    );
    expect(screen.getByText('기록을 불러오지 못했어요.')).toBeInTheDocument();
  });
});
