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
});
