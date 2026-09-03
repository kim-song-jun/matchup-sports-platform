/**
 * 웨이브 1 감사(2026-09-04)에서 인증 안내 7종이 전부 같은 문구의 "안내" 카드로 가운데를 채우고
 * 그래픽은 0장이었다. 카드는 삭제하고 그래픽 슬롯이 그 자리를 맡는다 — 카드가 되살아나거나
 * 그래픽이 빠지면 여기서 잡는다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthExceptionPageView, LoginPageView, SignupCompletePageView } from './auth-page';
import { getAuthExceptionViewModel, getLoginViewModel, getSignupCompleteViewModel } from './auth.view-model';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const srcOf = (img: Element) => decodeURIComponent(img.getAttribute('src') ?? '');

describe('인증 안내 화면', () => {
  it('"안내" 카드 대신 auth-notice 그래픽을 타이틀 위에 그린다', () => {
    const { container } = render(<AuthExceptionPageView model={getAuthExceptionViewModel('blocked')} />);
    expect(screen.queryByText('입력하신 정보는 안전하게 유지돼요. 다시 시도해 주세요.')).not.toBeInTheDocument();
    expect(container.querySelector('.tm-auth-exception-card')).toBeNull();
    const imgs = [...container.querySelectorAll('img.tm-auth-illustration')].filter((img) => srcOf(img).includes('/illustrations/auth-notice-640.webp'));
    // 모바일 슬롯(카드 안, 데스크톱에서 숨김) + 데스크톱 스테이지 한 벌씩
    expect(imgs).toHaveLength(2);
    expect(imgs.some((img) => img.classList.contains('tm-hide-desktop'))).toBe(true);
    expect(imgs.some((img) => img.classList.contains('tm-auth-stage-illustration'))).toBe(true);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('현재 계정은 이용할 수 없어요');
  });
});

describe('로그인 화면', () => {
  it('로고 원 대신 auth-welcome 그래픽을 쓰고 CTA 순서는 그대로다', () => {
    const { container } = render(<LoginPageView model={getLoginViewModel(null)} />);
    expect(container.querySelector('.tm-auth-logo')).toBeNull();
    expect([...container.querySelectorAll('img.tm-auth-illustration')].some((img) => srcOf(img).includes('auth-welcome-640.webp'))).toBe(true);
    expect(screen.getByRole('link', { name: '이메일로 로그인' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 없이 시작하기' })).toBeInTheDocument();
  });
});

describe('가입 완료 화면', () => {
  it('체크 아이콘 대신 journey-done 그래픽을 그리고 완료 카드는 유지한다', () => {
    const { container } = render(<SignupCompletePageView model={getSignupCompleteViewModel()} />);
    expect(container.querySelector('.tm-auth-complete-icon')).toBeNull();
    expect([...container.querySelectorAll('img.tm-auth-illustration')].some((img) => srcOf(img).includes('journey-done-640.webp'))).toBe(true);
    expect(container.querySelectorAll('.tm-auth-step-card').length).toBeGreaterThan(0);
  });
});
