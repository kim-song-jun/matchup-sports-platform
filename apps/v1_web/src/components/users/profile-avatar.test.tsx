import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileAvatar } from './public-profile-client';

describe('ProfileAvatar', () => {
  it('사진 URL 이 깨지면 빈 원이 아니라 이니셜로 되돌아간다', () => {
    const { container } = render(<ProfileAvatar imageUrl="https://example.test/broken.png" initials="김선" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('김선')).toBeInTheDocument();
  });

  it('새 사진으로 갱신되면 이전 실패에 갇히지 않고 다시 그린다', () => {
    const { container, rerender } = render(<ProfileAvatar imageUrl="https://example.test/broken.png" initials="김선" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<ProfileAvatar imageUrl="https://example.test/new.png" initials="김선" />);

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/new.png');
  });
});
