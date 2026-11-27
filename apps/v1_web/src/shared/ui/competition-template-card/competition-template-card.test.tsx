import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompetitionTemplateCard, CompetitionTemplateGraphicView } from './competition-template-card';

describe('CompetitionTemplateCard', () => {
  it('radio card exposes its Korean name and updates the selected value through normal radio interaction', () => {
    const onChange = vi.fn();
    render(<CompetitionTemplateCard mode="radio" name="format" value="knockout" checked={false} onChange={onChange}
      graphic="knockout" title="토너먼트만" description="패하면 탈락해요." meta="4·8·12·16팀" />);

    const choice = screen.getByRole('radio', { name: '토너먼트만' });
    expect(choice).toHaveAccessibleDescription('패하면 탈락해요.');
    fireEvent.click(choice);
    expect(onChange).toHaveBeenCalledWith('knockout');
  });

  it('홈·원정 리그 그림은 용어표의 「홈·원정」으로 적고 「어웨이」는 쓰지 않는다', () => {
    const { container } = render(<CompetitionTemplateGraphicView type="league-double" />);

    expect(container).toHaveTextContent('홈·원정');
    expect(container).not.toHaveTextContent('어웨이');
  });
});
