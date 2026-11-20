/**
 * @vitest-environment node
 *
 * Server render of the modal scaffolding. A sheet whose `open` is derived from the URL
 * (`?sheet=filter`) is open on the very first render, which on the server has no DOM at all.
 */
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './bottom-sheet';
import { useModalA11y } from './use-modal-a11y';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function Modal() {
  const { dialogRef, mounted } = useModalA11y({ open: true, onClose: () => undefined });
  if (!mounted) return null;
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="확인">
      <button type="button">확인</button>
    </div>
  );
}

describe('useModalA11y server render', () => {
  it('has no document on the server', () => {
    expect(typeof document).toBe('undefined');
  });

  it('renders a URL-opened BottomSheet', () => {
    const html = renderToString(
      <BottomSheet open ariaLabel="매치 필터" closeHref="/matches">
        <p>필터 본문</p>
      </BottomSheet>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('필터 본문');
  });

  it('renders a modal that is open on its first render', () => {
    expect(renderToString(<Modal />)).toContain('role="dialog"');
  });
});
