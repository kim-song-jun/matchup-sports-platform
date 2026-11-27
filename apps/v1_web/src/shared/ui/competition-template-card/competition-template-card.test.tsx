import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompetitionTemplateCard } from './competition-template-card';

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
});
