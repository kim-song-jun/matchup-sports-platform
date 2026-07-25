import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthFrame } from './auth-page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe('AuthFrame 뒤로가기 컨트롤', () => {
  // 데스크톱(≥1024)은 CSS 로 .tm-auth-topbar 를 숨긴다. onBack 은 화면을 빠져나가는
  // 유일한 수단이라 그 폭에서도 남아야 하므로 in-card 내비를 함께 렌더한다.
  it('onBack 만 주면 모바일 상단바와 데스크톱 in-card 내비 두 벌을 렌더한다', () => {
    render(<AuthFrame topTitle="카카오 가입" onBack={vi.fn()} backLabel="가입 그만두기">본문</AuthFrame>);
    expect(screen.getAllByRole('button', { name: '가입 그만두기' })).toHaveLength(2);
  });

  // 둘 다 오면 상단바는 링크, in-card 는 버튼이 되어 동작이 다른 뒤로가기가 둘 생긴다.
  it('backHref 가 함께 오면 in-card 내비는 렌더하지 않는다', () => {
    render(<AuthFrame topTitle="약관 동의" backHref="/login" onBack={vi.fn()}>본문</AuthFrame>);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '뒤로가기' })).not.toBeInTheDocument();
  });

  it('둘 다 없으면 뒤로가기 컨트롤이 없다', () => {
    render(<AuthFrame topTitle="약관 동의">본문</AuthFrame>);
    expect(screen.queryByRole('button', { name: /뒤로가기|그만두기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /뒤로가기/ })).not.toBeInTheDocument();
  });
});
