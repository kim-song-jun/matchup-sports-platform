import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequiredFieldsNote, RequiredMark } from './required-mark';

describe('RequiredMark', () => {
  it('hides the asterisk from assistive tech and speaks the meaning as text', () => {
    render(<label>이름<RequiredMark /><input /></label>);

    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox')).toHaveAccessibleName('이름 (필수)');
  });
});

describe('RequiredFieldsNote', () => {
  it('explains the asterisk without relying on the symbol alone', () => {
    render(<RequiredFieldsNote />);

    const note = screen.getByText(/표시는 필수 입력이에요\./);
    expect(note).toHaveTextContent('별표 표시는 필수 입력이에요.');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets a screen say what the marked items are', () => {
    render(<RequiredFieldsNote>표시는 필수 정보예요.</RequiredFieldsNote>);

    expect(screen.getByText(/표시는 필수 정보예요\./)).toHaveTextContent('별표 표시는 필수 정보예요.');
  });
});
