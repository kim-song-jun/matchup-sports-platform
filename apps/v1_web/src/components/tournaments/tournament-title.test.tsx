import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentTitle } from './tournament-title';
import styles from './tournament-title.module.css';

describe('TournamentTitle', () => {
  it.each([
    '제2회 팀밋 풋살컵(비선출 남성부)',
    '팀밋 컵 (여성부) (초급)',
    '팀밋 컵（혼성부）',
    '팀밋 컵(서울(동부) 예선)',
    '팀밋 컵(닫히지 않은 설명',
    '팀밋 풋살컵',
    '팀밋 경기 중 대회 모집 중',
    '팀밋 컵(아주긴설명이공백없이계속이어져화면보다넓어지는경우)',
  ])('preserves the complete visible title: %s', (title) => {
    render(<h2><TournamentTitle title={title} /></h2>);
    expect(screen.getByRole('heading').textContent).toBe(title);
  });

  it('keeps the existing status phrases together outside qualifiers', () => {
    render(<TournamentTitle title="팀밋 경기 중 · 모집 중" />);
    expect(screen.getByText('경기 중')).toHaveStyle({ whiteSpace: 'nowrap' });
    expect(screen.getByText('모집 중')).toHaveStyle({ whiteSpace: 'nowrap' });
  });

  it('wraps the parenthetical qualifier as one unit at every viewport width', () => {
    render(<TournamentTitle title="제2회 팀밋 풋살컵(비선출 남성부)" />);
    expect(screen.getByText('(비선출 남성부)')).toHaveClass(styles.qualifier);
  });
});
