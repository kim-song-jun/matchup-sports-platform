import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoginPageView, OnboardingPageView } from './auth-page';
import { getLoginViewModel, getOnboardingViewModel } from './auth.view-model';

describe('auth Open Design contract', () => {
  it('renders honest login providers without fake social success paths', () => {
    render(<LoginPageView model={getLoginViewModel()} />);

    expect(screen.getByTestId('auth-open-design')).toHaveClass('tm-auth-open-design');
    expect(screen.getByRole('link', { name: '이메일로 로그인' })).toHaveAttribute('href', '/login/email');
    expect(screen.getByRole('button', { name: '네이버' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apple' })).toBeDisabled();
  });

  it('preserves onboarding persistence copy and supported skip route', () => {
    render(<OnboardingPageView model={getOnboardingViewModel('sport')} />);

    expect(screen.getByTestId('auth-open-design')).toHaveClass('tm-auth-open-design');
    expect(screen.getByRole('link', { name: '건너뛰기' })).toHaveAttribute('href', '/home');
    expect(screen.getByText('선택한 종목을 기준으로 다음 실력 입력 단계가 구성됩니다.')).toBeInTheDocument();
  });
});
