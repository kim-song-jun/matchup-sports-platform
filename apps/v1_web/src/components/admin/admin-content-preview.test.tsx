import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminContentPreview } from './admin-content-preview';
import { NavigationScopeProvider } from '@/components/providers/navigation-scope';

describe('AdminContentPreview', () => {
  it('does not load the real admin preview document from an isolated demo', () => {
    render(<NavigationScopeProvider scope={{ allow: (href) => href.startsWith('/tournament-ops-demo/'), reason: '실제 서비스로 연결되는 이 화면은 체험에서 열 수 없어요.' }}>
      <AdminContentPreview payload={{ kind: 'popup', title: '샘플 팝업', body: '내용', content: { type: 'doc', content: [] } }} />
    </NavigationScopeProvider>);
    expect(screen.queryByTitle(/미리보기/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('실제 서비스로 연결되는 이 화면은 체험에서 열 수 없어요.');
    expect(screen.queryByRole('button', { name: '웹' })).not.toBeInTheDocument();
  });
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
