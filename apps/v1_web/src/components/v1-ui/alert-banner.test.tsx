import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertBanner } from './primitives';

describe('AlertBanner 공지 방식', () => {
  it('error 는 즉시 읽히는 alert 이고, info·warning 은 흐름을 끊지 않는 status 다', () => {
    const { rerender } = render(<AlertBanner tone="error" message="실패했어요" />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');

    rerender(<AlertBanner tone="info" message="알려 드려요" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    rerender(<AlertBanner tone="warning" message="확인해 주세요" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('assertive 를 켜면 error 가 아닌 tone 도 즉시 읽히지만 글자 모양은 tone 그대로다', () => {
    render(<AlertBanner tone="warning" assertive message="하던 일이 처음으로 돌아갔어요" />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
    expect(banner).toHaveTextContent('하던 일이 처음으로 돌아갔어요');
    expect(banner.style.color).toBe('var(--orange700)');
    expect(banner.style.fontWeight).toBe('');
  });
});
