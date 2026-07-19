import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminContentPreview } from './admin-content-preview';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/notices',
}));

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
  if (originalBasePath === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
  }
});

describe('AdminContentPreview', () => {
  it('adds the configured basePath to the hard iframe navigation', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    render(
      <AdminContentPreview
        payload={{
          kind: 'notice',
          title: 'Preview notice',
          category: '안내',
          body: 'Preview body',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preview body' }] }],
          },
        }}
      />,
    );

    expect(screen.getByTitle(/미리보기/)).toHaveAttribute('src', '/v1/admin-content-preview');
  });
});
