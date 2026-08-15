import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { legacyAwardIconKey, TournamentAwardIcon } from './tournament-award-icon';

describe('TournamentAwardIcon', () => {
  it('저장된 아이콘 선택값을 awardType보다 우선해 렌더링한다', () => {
    const { container } = render(<TournamentAwardIcon iconKey="star" awardType="mvp" />);
    expect(container.querySelector('.lucide-star')).not.toBeNull();
    expect(container.querySelector('.lucide-crown')).toBeNull();
  });

  it('기존 데이터는 awardType 기반 아이콘을 유지한다', () => {
    expect(legacyAwardIconKey('mvp')).toBe('crown');
    expect(legacyAwardIconKey('top_scorer')).toBe('goal');
    expect(legacyAwardIconKey('custom_award')).toBe('trophy');
  });
});
