import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileAvatar } from './public-profile-client';

describe('ProfileAvatar', () => {
  it.each([null, '', '   '])('uses a person icon for an empty photo %s', (imageUrl) => {
    const { container } = render(<ProfileAvatar imageUrl={imageUrl} initials="김선" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveClass('lucide-user-round');
    expect(screen.queryByText('김선')).toBeNull();
  });
  it('returns to a person icon without initials when a photo fails', () => {
    const { container } = render(<ProfileAvatar imageUrl="https://example.test/broken.png" initials="김선" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('김선')).toBeNull();
    expect(container.querySelector('svg')).toHaveClass('lucide-user-round');
  });

  it('resets a loaded photo for a new URL and recovers from a failed URL', () => {
    const { container, rerender } = render(<ProfileAvatar imageUrl="https://example.test/first.png" initials="김선" />);
    fireEvent.load(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<ProfileAvatar imageUrl="https://example.test/broken.png" initials="김선" />);
    expect(container.querySelector('svg')).toHaveClass('lucide-user-round');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    rerender(<ProfileAvatar imageUrl="https://example.test/new.png" initials="김선" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/new.png');
    fireEvent.load(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<ProfileAvatar imageUrl={null} initials="김선" />);
    expect(container.querySelector('svg')).toHaveClass('lucide-user-round');
  });
});
