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

  it('separate-route card remains a real link with an understandable accessible name', () => {
    render(<CompetitionTemplateCard mode="link" href="/admin/league-matches/new" graphic="league-single"
      title="정규 리그 만들기" description="대회와 별도 화면에서 정규 리그를 만들어요." linkLabel="정규 리그 생성 화면으로 이동" />);

    expect(screen.getByRole('link', { name: /정규 리그 만들기/ })).toHaveAttribute('href', '/admin/league-matches/new');
    expect(screen.getByText('정규 리그 생성 화면으로 이동 →')).toBeInTheDocument();
  });
});
