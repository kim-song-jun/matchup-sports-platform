import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import { resolveNextImageSrc } from '@/test/next-image';
import { TeamAvatar } from './team-avatar';

describe('TeamAvatar', () => {
  it.each(['sm', 'md', 'lg', 'xl'] as const)('uses a neutral team icon at %s without a logo', (size) => {
    const { container } = render(<TeamAvatar seed="team-1" name="팀" size={size} />);
    expect(container.querySelector('svg')).toHaveClass('lucide-users-round');
    expect(container.querySelector('svg rect')).toBeNull();
    expect(container.firstElementChild).toHaveStyle({ background: 'var(--grey150)' });
  });

  it.each([null, '', '   '])('treats %j as an absent logo', (logoUrl) => {
    const { container } = render(<TeamAvatar seed="team-1" name="팀" logoUrl={logoUrl} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveClass('lucide-users-round');
  });

  it('uses the same default icon for different team identities', () => {
    const { container, rerender } = render(<TeamAvatar seed="team-a" name="A팀" />);
    const original = container.innerHTML;
    rerender(<TeamAvatar seed="team-b" name="B팀" />);
    expect(container.innerHTML).toBe(original);
  });

  it('shows the uploaded logo only after it loads and uses a solid image surface', async () => {
    const { container } = render(<TeamAvatar seed="team-1" name="팀" logoUrl="/uploads/logo.png" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(resolveNextImageSrc(img)).toBe(publicAssetPath('/uploads/logo.png'));
    expect(container.querySelector('svg')).not.toBeNull();
    fireEvent.load(img);
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    expect(img.style.opacity).toBe('1');
    expect(container.firstElementChild).toHaveStyle({ background: 'var(--card-surface)' });
  });

  it('resets the fallback when a loaded logo changes, recovers after failure, and clears a removed logo', async () => {
    const { container, rerender } = render(<TeamAvatar seed="team-1" name="팀" logoUrl="/uploads/first.png" />);
    fireEvent.load(container.querySelector('img') as HTMLImageElement);
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    rerender(<TeamAvatar seed="team-1" name="팀" logoUrl="/uploads/broken.png" />);
    expect(container.querySelector('svg')).toHaveClass('lucide-users-round');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    rerender(<TeamAvatar seed="team-1" name="팀" logoUrl="/uploads/fixed.png" />);
    fireEvent.load(container.querySelector('img') as HTMLImageElement);
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    rerender(<TeamAvatar seed="team-1" name="팀" logoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveClass('lucide-users-round');
  });
});
