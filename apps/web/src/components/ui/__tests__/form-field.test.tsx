import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '../form-field';
import { Input } from '../input';

describe('FormField', () => {
  it('associates the label with the input', () => {
    render(
      <FormField label="이메일" htmlFor="field-email" required>
        <Input id="field-email" />
      </FormField>,
    );

    expect(screen.getByLabelText(/이메일/)).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders hint and error copy together when provided', () => {
    render(
      <FormField
        label="닉네임"
        htmlFor="field-nickname"
        hint="2~12자"
        error="이미 사용 중입니다"
      >
        <Input id="field-nickname" />
      </FormField>,
    );

    expect(screen.getByText('2~12자')).toBeInTheDocument();
    expect(screen.getByText('이미 사용 중입니다')).toBeInTheDocument();
  });

  it('applies red border class when Input has error prop', () => {
    render(<Input error />);

    expect(screen.getByRole('textbox')).toHaveClass('border-red-500');
  });

  it('sets aria-invalid on Input when error prop is truthy', () => {
    render(<Input error />);

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when error prop is falsy', () => {
    render(<Input />);

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('injects aria-describedby into direct Input child when error is present', () => {
    render(
      <FormField label="이메일" htmlFor="field-email" error="이메일 형식이 올바르지 않아요">
        <Input id="field-email" />
      </FormField>,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'field-email-error');

    const errorEl = screen.getByText('이메일 형식이 올바르지 않아요');
    expect(errorEl).toHaveAttribute('id', 'field-email-error');
  });

  it('does not inject aria-describedby when error is absent', () => {
    render(
      <FormField label="이메일" htmlFor="field-email">
        <Input id="field-email" />
      </FormField>,
    );

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });
});
