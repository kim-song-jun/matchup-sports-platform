import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KakaoSymbol } from '@/components/auth/kakao-symbol';
import { ProviderMark } from './provider-mark';

function renderMark(props: Parameters<typeof ProviderMark>[0]) {
  const { container } = render(<ProviderMark {...props} />);
  const circle = container.firstElementChild as HTMLElement;
  return { circle, svg: circle.querySelector('svg') };
}

const symbolPathOfLoginButton = () => {
  const { container } = render(<KakaoSymbol />);
  return container.querySelector('path')?.getAttribute('d') ?? null;
};

describe('ProviderMark 카카오', () => {
  it('lucide 말풍선 대신 로그인 버튼과 같은 공식 심볼을 노란 원 안에 그려요', () => {
    const buttonPath = symbolPathOfLoginButton();
    expect(buttonPath).toMatch(/^M24\.0014 14C/);

    const { circle, svg } = renderMark({ provider: 'kakao' });

    expect(circle.getAttribute('style')).toContain('var(--kakao-yellow)');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class') ?? '').not.toContain('lucide');
    const path = svg?.querySelector('path');
    expect(path?.getAttribute('d')).toBe(buttonPath);
    expect(path?.getAttribute('fill')).toBe('var(--static-black)');
  });

  it.each([
    ['md' as const, 36],
    ['sm' as const, 24],
  ])('size=%s 에서는 원과 그림이 모두 %ipx 이고 비율이 같은 48 칸 좌표예요', (size, box) => {
    const { circle, svg } = renderMark({ provider: 'kakao', size });

    expect(circle.style.width).toBe(`${box}px`);
    expect(circle.style.height).toBe(`${box}px`);
    expect(svg).toHaveAttribute('width', String(box));
    expect(svg).toHaveAttribute('height', String(box));
    expect(svg).toHaveAttribute('viewBox', '0 0 48 48');
  });

  it('그림은 장식이라 보조기기에서 숨기고 포커스도 받지 않아요', () => {
    const { circle, svg } = renderMark({ provider: 'kakao' });

    expect(circle).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});

describe('ProviderMark 다른 수단은 그대로예요', () => {
  it('이메일은 메일 아이콘이고 크기마다 18·14 예요', () => {
    const md = renderMark({ provider: 'email' });
    expect(md.svg?.getAttribute('class')).toContain('lucide-mail');
    expect(md.svg).toHaveAttribute('width', '18');

    const sm = renderMark({ provider: 'email', size: 'sm' });
    expect(sm.svg).toHaveAttribute('width', '14');
  });

  it('Apple 은 Apple 이 준 그림을 배경으로 쓰고 안에 아이콘을 넣지 않아요', () => {
    const { circle, svg } = renderMark({ provider: 'apple' });

    expect(circle.getAttribute('style')).toContain('/apple/sign-in-mark-on-black.png');
    expect(svg).toBeNull();
  });

  it('그 밖의 수단은 링크 아이콘이에요', () => {
    const { svg } = renderMark({ provider: 'other' });

    expect(svg?.getAttribute('class')).toContain('lucide-link');
  });

  it.each(['email', 'kakao', 'apple', 'other'] as const)('%s 표시는 바깥 요소가 aria-hidden 이에요', (provider) => {
    const { circle } = renderMark({ provider });

    expect(circle).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('KakaoSymbol (로그인 버튼의 심볼)', () => {
  it('표시가 같은 그림을 쓰게 되어도 버튼 쪽 DOM 은 그대로예요', () => {
    const { container } = render(<KakaoSymbol />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('tm-auth-kakao-symbol');
    expect(svg).toHaveAttribute('viewBox', '13 14 22 21');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg?.querySelector('path')).toHaveAttribute('fill', 'currentColor');
  });
});
