import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineChevronLink } from './inline-chevron-link';

describe('InlineChevronLink', () => {
  it('글자가 곧 링크 이름이고, 밑줄 대신 chevron 이 링크라는 단서를 준다', () => {
    render(<p><InlineChevronLink href="/users/u-1" label="김도윤" /></p>);
    const link = screen.getByRole('link', { name: '김도윤' });
    expect(link).toHaveAttribute('href', '/users/u-1');
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(getComputedStyle(link).textDecoration).not.toContain('underline');
  });

  it('마지막 글자와 chevron 이 한 덩어리라 좁은 폭에서 chevron 만 떨어지지 않는다', () => {
    render(<InlineChevronLink href="/users/u-1" label="김도윤" />);
    const chevron = screen.getByRole('link').querySelector('svg');
    const tail = chevron?.parentElement;
    expect(tail?.textContent).toBe('윤');
    // 줄바꿈을 막는 것은 이 묶음의 nowrap 이다 — 묶기만 하고 nowrap 이 없으면 chevron 앞에서 끊긴다.
    expect(getComputedStyle(tail as Element).whiteSpace).toBe('nowrap');
  });

  it.each([
    ['국기 이모지로 끝나는 이름', '팀🇰🇷', '🇰🇷'],
    ['ZWJ 이모지로 끝나는 이름', '팀👨‍👩‍👧', '👨‍👩‍👧'],
    ['분해형(NFD) 한글로 끝나는 이름', '김도윤'.normalize('NFD'), '윤'.normalize('NFD')],
  ])('%s 도 마지막 글자 하나가 통째로 chevron 과 묶인다', (_name, label, lastGlyph) => {
    render(<InlineChevronLink href="/users/u-1" label={label} />);
    const link = screen.getByRole('link');
    expect(link.querySelector('svg')?.parentElement?.textContent).toBe(lastGlyph);
    expect(link.textContent).toBe(label);
  });

  it('한 글자 이름도 글자째로 chevron 과 묶이고 링크 이름을 지킨다', () => {
    render(<InlineChevronLink href="/users/u-1" label="윤" />);
    const link = screen.getByRole('link', { name: '윤' });
    expect(link.querySelector('svg')?.parentElement?.textContent).toBe('윤');
  });

  it('열 수 없는 이름(href null)은 링크도 chevron 도 없이 글자만 그린다', () => {
    const { container } = render(<p><InlineChevronLink href={null} label="김도윤" /></p>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container).toHaveTextContent('김도윤');
  });
});

describe('Intl.Segmenter 가 없는 브라우저', () => {
  it('모듈을 불러와도 깨지지 않고 마지막 글자와 chevron 을 묶어 그린다', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    try {
      const { InlineChevronLink: Fresh } = await import('./inline-chevron-link');
      render(<Fresh href="/users/u-1" label="김도윤" />);
      const link = screen.getByRole('link', { name: '김도윤' });
      expect(link.querySelector('svg')?.parentElement?.textContent).toBe('윤');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
