import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonStyles } from '../button';

describe('Button', () => {
  it('renders button text and disabled state', () => {
    render(
      <Button disabled variant="primary">
        저장하기
      </Button>,
    );

    expect(screen.getByRole('button', { name: '저장하기' })).toBeDisabled();
  });

  it('applies full-width and size classes through helper', () => {
    const className = buttonStyles({ variant: 'dangerSoft', size: 'lg', fullWidth: true });

    expect(className).toContain('w-full');
    expect(className).toContain('border');
    expect(className).toContain('min-h-[48px]');
  });
});
