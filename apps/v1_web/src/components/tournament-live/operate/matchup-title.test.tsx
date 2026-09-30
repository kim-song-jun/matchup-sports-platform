import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchupTitle } from './matchup-title';

describe('MatchupTitle (F70)', () => {
  it('홈·원정을 한 줄씩, 응답 순서와 무관하게 홈을 위에 둔다 — 긴 원정팀 이름이 잘려 사라지지 않는다', () => {
    const { container } = render(
      <MatchupTitle
        sides={[
          { id: 'away', sideKey: 'AWAY', displayNameSnapshot: 'QA0929 합정 유나이티드' },
          { id: 'home', sideKey: 'HOME', displayNameSnapshot: 'QA0929 마포 FC' },
        ]}
      />,
    );

    const lines = [...container.querySelectorAll('p')].map((line) => line.textContent);
    expect(lines).toEqual(['홈QA0929 마포 FC', '원정QA0929 합정 유나이티드']);
    expect(container.querySelector('.truncate')).toBeNull();
  });

  it('사이드를 아직 못 받았으면 "경기 운영"', () => {
    render(<MatchupTitle sides={[]} />);
    expect(screen.getByText('경기 운영')).toBeInTheDocument();
  });
});
