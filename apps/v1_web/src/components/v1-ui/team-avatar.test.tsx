import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamAvatar } from './team-avatar';

describe('TeamAvatar', () => {
  it('shows the uploaded logo image when logoUrl is set', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl="/uploads/logo.png" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/uploads/logo.png');
  });

  it('falls back to the name initial when logoUrl is absent', () => {
    const { container } = render(<TeamAvatar seed="team-1" name="성수 러너스" logoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('성')).toBeInTheDocument();
  });

  it('picks a deterministic palette color from the seed, independent of name', () => {
    const { container: first } = render(<TeamAvatar seed="team-42" name="A팀" logoUrl={null} />);
    const { container: second } = render(<TeamAvatar seed="team-42" name="완전히 다른 팀 이름" logoUrl={null} />);
    const firstBg = (first.firstElementChild as HTMLElement).style.background;
    const secondBg = (second.firstElementChild as HTMLElement).style.background;
    expect(firstBg).toBe(secondBg);
  });
});
