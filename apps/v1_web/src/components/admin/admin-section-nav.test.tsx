import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminSectionNav, type AdminSectionNavGroup } from './admin-section-nav';

const groups: AdminSectionNavGroup[] = [
  { label: '운영', items: [{ slug: 'overview', label: '개요' }, { slug: 'items', label: '목록', count: 3 }] },
  {
    label: '노출',
    items: [{ slug: 'popups', label: '팝업', externalHref: '/admin/content?tab=popups', externalNote: '전역 팝업 화면으로 이동' }],
  },
];

function renderNav(pathname: string, query?: string) {
  return render(<AdminSectionNav ariaLabel="섹션" groups={groups} basePath="/admin/things/1" pathname={pathname} query={query} />);
}

describe('AdminSectionNav', () => {
  it('섹션 주소는 basePath 아래이고, 현재 경로와 같은 섹션만 현재 위치로 표시한다', () => {
    renderNav('/admin/things/1/overview');

    const bar = screen.getByRole('navigation', { name: '섹션' });
    expect(within(bar).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['운영', '노출']);
    expect(within(bar).getByRole('link', { name: '개요' })).toHaveAttribute('href', '/admin/things/1/overview');
    expect(within(bar).getByRole('link', { name: '개요' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('link', { name: '목록 3' })).not.toHaveAttribute('aria-current');
  });

  it('쿼리는 섹션 링크에만 붙고, 셸 밖으로 나가는 링크는 그대로 둔다', () => {
    renderNav('/admin/things/1/overview', '?from=%2Fadmin%2Fthings');

    expect(screen.getByRole('link', { name: '개요' })).toHaveAttribute('href', '/admin/things/1/overview?from=%2Fadmin%2Fthings');
    expect(screen.getByRole('link', { name: /팝업/ })).toHaveAttribute('href', '/admin/content?tab=popups');
  });

  it('셸 밖으로 나가는 항목은 현재 위치가 될 수 없고, 접근 가능한 이름에 안내 문구가 붙는다', () => {
    renderNav('/admin/things/1/popups');

    const external = screen.getByRole('link', { name: '팝업 전역 팝업 화면으로 이동' });
    expect(external).not.toHaveAttribute('aria-current');
  });
});
