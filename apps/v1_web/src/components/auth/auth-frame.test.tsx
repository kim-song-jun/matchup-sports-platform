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

  // 상단바는 데스크톱에서 통째로 숨겨지므로, 단순 이동(backHref)도 in-card 내비가 있어야
  // 그 폭에서 화면을 빠져나갈 수 있다.
  it('backHref 만 주면 상단바와 데스크톱 in-card 내비 두 벌을 링크로 렌더한다', () => {
    render(<AuthFrame topTitle="회원가입" backHref="/terms">본문</AuthFrame>);
    const links = screen.getAllByRole('link', { name: '뒤로가기' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/terms');
  });

  // 둘 다 오면 이동과 동작이 섞인 뒤로가기가 둘 생기므로 backHref 를 정본으로 하나만 쓴다.
  it('backHref 와 onBack 이 함께 오면 버튼 뒤로가기는 렌더하지 않는다', () => {
    render(<AuthFrame topTitle="약관 동의" backHref="/login" onBack={vi.fn()}>본문</AuthFrame>);
    expect(screen.getAllByRole('link', { name: '뒤로가기' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '뒤로가기' })).not.toBeInTheDocument();
  });

  it('둘 다 없으면 뒤로가기 컨트롤이 없다', () => {
    render(<AuthFrame topTitle="약관 동의">본문</AuthFrame>);
    expect(screen.queryByRole('button', { name: /뒤로가기|그만두기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /뒤로가기/ })).not.toBeInTheDocument();
  });
});

// 데스크톱 2단(B안, 2026-09-04): stage 가 있으면 왼쪽 스테이지(슬로건·그래픽)를 그리고
// 프레임에 staged 클래스가 붙어 desktop/auth.css §11 이 2단으로 놓는다. 없으면 예전 폰 카드 그대로.
describe('AuthFrame 데스크톱 스테이지', () => {
  it('stage 를 주면 슬로건·부제·그래픽을 가진 aside 와 staged 프레임 클래스를 렌더한다', () => {
    const { container } = render(
      <AuthFrame stage={{ eyebrow: '로그인 확인', slogan: '다른 방법으로\n계속할 수 있어요', sub: '정보는 안전해요.', illustration: 'auth-notice' }}>본문</AuthFrame>,
    );
    expect(container.querySelector('.tm-auth-frame')).toHaveClass('tm-auth-frame-staged');
    const aside = container.querySelector('aside.tm-auth-stage');
    expect(aside).not.toBeNull();
    expect(aside).toHaveTextContent('다른 방법으로');
    expect(aside).toHaveTextContent('정보는 안전해요.');
    const img = aside!.querySelector('img.tm-auth-stage-illustration');
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img!.getAttribute('src') ?? '')).toContain('/illustrations/auth-notice-640.webp');
  });

  it('stage 가 없으면 aside 도 staged 클래스도 없다 — 약관·계정 삭제 안내는 폰 카드를 유지한다', () => {
    const { container } = render(<AuthFrame topTitle="약관 동의">본문</AuthFrame>);
    expect(container.querySelector('aside.tm-auth-stage')).toBeNull();
    expect(container.querySelector('.tm-auth-frame')).not.toHaveClass('tm-auth-frame-staged');
  });
});
