import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavigationScopeProvider, ScopedLink } from './navigation-scope';

describe('체험 경계의 링크와 prefetch', () => {
  it('실제 화면에서는 기존 Next 링크를 그대로 사용한다', () => {
    render(<ScopedLink href="/admin/tournaments/real-id/overview">개요</ScopedLink>);
    expect(screen.getByRole('link', { name: '개요' })).toHaveAttribute('href', '/admin/tournaments/real-id/overview');
  });
  it('체험 밖 링크는 실제 anchor를 만들지 않고 비활성 사유를 제공한다', () => {
    render(<NavigationScopeProvider scope={{ allow: (href) => href.startsWith('/tournament-ops-demo/'), reason: '체험에서 미지원' }}>
      <ScopedLink href="/admin/live/sample-id/fixtures/sample-fixture/operate">운영 콘솔</ScopedLink>
      <ScopedLink href="/tournament-ops-demo/bracket">대진 관리</ScopedLink>
    </NavigationScopeProvider>);
    const blocked = screen.getByRole('link', { name: '운영 콘솔 · 체험에서 미지원' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).not.toHaveAttribute('href');
    expect(blocked.tagName).toBe('SPAN');
    expect(screen.getByRole('link', { name: '대진 관리' })).toHaveAttribute('href', '/tournament-ops-demo/bracket');
  });
});
