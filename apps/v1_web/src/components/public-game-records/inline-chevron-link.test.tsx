import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(chevron?.parentElement?.textContent).toBe('윤');
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
