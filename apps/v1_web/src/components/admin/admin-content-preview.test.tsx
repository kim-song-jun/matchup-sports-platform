import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminContentPreview } from './admin-content-preview';

describe('AdminContentPreview', () => {
  it('points the preview iframe at the root-relative admin-content-preview route', () => {
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

    expect(screen.getByTitle(/미리보기/)).toHaveAttribute('src', '/admin-content-preview');
  });
});
