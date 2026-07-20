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
