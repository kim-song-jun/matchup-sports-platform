import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichContentRenderer } from './rich-content-renderer';
import type { V1RichContentDocument } from '@/types/api';

function docWithLink(href: string): V1RichContentDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  };
}

describe('RichContentRenderer link handling', () => {
  it('renders a lowercase https link as an external anchor with rel-noopener protections', () => {
    render(<RichContentRenderer content={docWithLink('https://example.com')} />);

    const anchor = screen.getByRole('link', { name: '링크' });
    expect(anchor.tagName).toBe('A');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('still treats an uppercase-scheme HTTPS link as external (case-insensitive scheme match)', () => {
    render(<RichContentRenderer content={docWithLink('HTTPS://example.com')} />);

    const anchor = screen.getByRole('link', { name: '링크' });
    expect(anchor.tagName).toBe('A');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('renders a relative path link via next/link (no rel-noopener, internal navigation)', () => {
    render(<RichContentRenderer content={docWithLink('/tournaments/1')} />);

    const anchor = screen.getByRole('link', { name: '링크' });
    expect(anchor).toHaveAttribute('href', '/tournaments/1');
    expect(anchor).not.toHaveAttribute('target');
  });
});

function docWithImage(src: string): V1RichContentDocument {
  return { type: 'doc', content: [{ type: 'image', attrs: { src, alt: '공지 사진' } }] };
}

describe('RichContentRenderer 이미지', () => {
  it('업로드 이미지는 원본이 아니라 최적화기를 거친 폭 후보로 받는다', () => {
    render(<RichContentRenderer content={docWithImage('/uploads/2026/11/notice.png')} />);

    const img = screen.getByRole('img', { name: '공지 사진' });
    const src = new URL(img.getAttribute('src') ?? '', 'http://localhost');
    expect(src.pathname).toBe('/_next/image');
    expect(src.searchParams.get('url')).toBe('/uploads/2026/11/notice.png');
    const widths = (img.getAttribute('srcset') ?? '').split(',').map((entry) => {
      const [candidate] = entry.trim().split(' ');
      return Number(new URL(candidate, 'http://localhost').searchParams.get('w'));
    });
    // sizes="(max-width: 640px) 100vw, 760px" 에서 고를 수 있도록 좁은 폭부터 넓은 폭까지 후보가 있다.
    expect(Math.min(...widths)).toBeLessThanOrEqual(640);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(760);
  });

  it('최적화기가 받아 올 수 없는 외부 이미지 URL 은 그대로 둔다', () => {
    render(<RichContentRenderer content={docWithImage('https://images.example.com/notice.png')} />);

    const img = screen.getByRole('img', { name: '공지 사진' });
    expect(img).toHaveAttribute('src', 'https://images.example.com/notice.png');
    expect(img).not.toHaveAttribute('srcset');
  });
});
