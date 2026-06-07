import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoginPageView, OnboardingPageView } from './auth-page';
import { AdminLoginPageView } from './admin-login-page';
import { getLoginViewModel, getOnboardingViewModel } from './auth.view-model';

describe('auth Open Design contract', () => {
  it('renders honest login providers without fake social success paths', () => {
    render(<LoginPageView model={getLoginViewModel()} />);

    expect(screen.getByTestId('auth-open-design')).toHaveClass('tm-auth-open-design');
    expect(screen.getByRole('link', { name: '이메일로 로그인' })).toHaveAttribute('href', '/login/email');
    expect(screen.getByRole('button', { name: '네이버' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apple' })).toBeDisabled();
  });

  it('renders an operations login entry without guest continuation when redirecting to admin workspace', () => {
    render(<AdminLoginPageView redirect="/admin/audit" />);

    const authPage = screen.getByTestId('auth-open-design');
    expect(authPage.querySelector('.tm-desktop-nav-admin')).toBeInTheDocument();
    expect(authPage.querySelector('.tm-auth-admin-kicker')).toHaveTextContent('Teameet 운영');
    expect(screen.getByRole('heading', { name: '업체 운영 로그인' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이메일로 운영 로그인' })).toHaveAttribute('href', '/login/email?redirect=%2Fadmin%2Faudit');
    expect(screen.queryByRole('link', { name: '홈' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '매치' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '팀' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '로그인 없이 시작하기' })).not.toBeInTheDocument();
  });

  it('preserves onboarding persistence copy and supported skip route', () => {
    render(<OnboardingPageView model={getOnboardingViewModel('sport')} />);

    expect(screen.getByTestId('auth-open-design')).toHaveClass('tm-auth-open-design');
    expect(screen.getByRole('link', { name: '건너뛰기' })).toHaveAttribute('href', '/home');
    expect(screen.getByText('선택한 종목을 기준으로 다음 실력 입력 단계가 구성됩니다.')).toBeInTheDocument();
  });
});
