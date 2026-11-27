import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installMatchMedia } from '@/test/match-media';
import { AdminTabNav, type AdminTabNavProps } from './admin-tab-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/things/1/overview' }));

let media: ReturnType<typeof installMatchMedia>;

beforeEach(() => {
  media = installMatchMedia(1024);
});

afterEach(() => {
  media.restore();
  __resetOverlayHistoryForTests();
});

const props: AdminTabNavProps = {
  ariaLabel: '섹션',
  basePath: '/admin/things/1',
  pathname: '/admin/things/1/overview',
  tabs: [
    { slug: 'overview', label: '개요' },
    { slug: 'registrations', label: '신청', count: 3 },
    { slug: 'info', label: '대회 정보' },
  ],
  more: {
    label: '더보기',
    groups: [
      {
        label: '홍보',
        items: [
          { slug: 'sponsors', label: '협찬' },
          { slug: 'popups', label: '팝업', externalHref: '/admin/content?tab=popups', externalNote: '전역 팝업 화면으로 이동해요' },
        ],
      },
      { label: '운영', items: [{ slug: 'discipline', label: '징계 현황' }] },
    ],
  },
};

const renderNav = (overrides: Partial<AdminTabNavProps> = {}) => render(<AdminTabNav {...props} {...overrides} />);
const nav = () => screen.getByRole('navigation', { name: '섹션' });

describe('AdminTabNav', () => {
  it('탭은 링크이고 현재 경로와 같은 탭만 aria-current=page 이며 이름에 건수가 붙는다', () => {
    renderNav();

    expect(within(nav()).getByRole('link', { name: '개요' })).toHaveAttribute('href', '/admin/things/1/overview');
    expect(within(nav()).getByRole('link', { name: '개요' })).toHaveAttribute('aria-current', 'page');
    const registrations = within(nav()).getByRole('link', { name: '신청 3' });
    expect(registrations).toHaveAttribute('href', '/admin/things/1/registrations');
    expect(registrations).not.toHaveAttribute('aria-current');
    expect(within(nav()).getByRole('link', { name: '대회 정보' })).not.toHaveAttribute('aria-current');
  });

  it('하위 경로에서도 그 탭이 현재 위치다', () => {
    renderNav({ pathname: '/admin/things/1/registrations/team-1' });
    expect(within(nav()).getByRole('link', { name: '신청 3' })).toHaveAttribute('aria-current', 'page');
  });

  it('모든 탭 링크는 min-h-[44px]·min-w-[44px] 이다', () => {
    renderNav();
    for (const link of within(nav()).getAllByRole('link')) {
      expect(link.className).toContain('min-h-[44px]');
      expect(link.className).toContain('min-w-[44px]');
    }
    expect(within(nav()).getByRole('button', { name: /더보기/ }).className).toContain('min-h-[44px]');
  });

  it('현재 탭이 바뀌면 그 탭이 화면 안으로 스크롤된다', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = renderNav();
      scrollIntoView.mockClear();

      rerender(<AdminTabNav {...props} pathname="/admin/things/1/registrations" />);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
      expect((scrollIntoView.mock.contexts.at(-1) as HTMLElement).getAttribute('href')).toBe('/admin/things/1/registrations');
    } finally {
      // jsdom 에는 원래 없는 메서드라 시험이 끝나면 지운다.
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('더보기를 열면 묶음 제목과 항목이 보이고 팝업은 외부 주소 링크다', () => {
    renderNav();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(within(nav()).getByRole('button', { name: /더보기/ }));

    const menu = screen.getByRole('menu', { name: '더보기' });
    expect(within(menu).getByRole('group', { name: '홍보' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: '운영' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /협찬/ })).toHaveAttribute('href', '/admin/things/1/sponsors');
    expect(within(menu).getByRole('menuitem', { name: /팝업/ })).toHaveAttribute('href', '/admin/content?tab=popups');
    expect(within(menu).getByText('전역 팝업 화면으로 이동해요')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /징계 현황/ })).toHaveAttribute('href', '/admin/things/1/discipline');
  });

  it('현재 경로가 더보기 항목이면 더보기 버튼이 aria-current=true 를 가진다', () => {
    const { rerender } = renderNav();
    expect(within(nav()).getByRole('button', { name: /더보기/ })).not.toHaveAttribute('aria-current');

    rerender(<AdminTabNav {...props} pathname="/admin/things/1/discipline" />);
    expect(within(nav()).getByRole('button', { name: /더보기/ })).toHaveAttribute('aria-current', 'true');
    // 셸 밖으로 나가는 항목은 현재 위치가 될 수 없다.
    rerender(<AdminTabNav {...props} pathname="/admin/things/1/popups" />);
    expect(within(nav()).getByRole('button', { name: /더보기/ })).not.toHaveAttribute('aria-current');
  });

  it('query 는 슬러그 링크에만 붙고 셸 밖으로 나가는 링크는 그대로 둔다', () => {
    renderNav({ query: '?from=%2Fadmin%2Fthings' });
    expect(within(nav()).getByRole('link', { name: '개요' })).toHaveAttribute('href', '/admin/things/1/overview?from=%2Fadmin%2Fthings');

    fireEvent.click(within(nav()).getByRole('button', { name: /더보기/ }));
    expect(screen.getByRole('menuitem', { name: /협찬/ })).toHaveAttribute('href', '/admin/things/1/sponsors?from=%2Fadmin%2Fthings');
    expect(screen.getByRole('menuitem', { name: /팝업/ })).toHaveAttribute('href', '/admin/content?tab=popups');
  });

  it('더보기 항목이 없으면 더보기 버튼을 그리지 않는다', () => {
    renderNav({ more: undefined });
    expect(within(nav()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('폰 폭에서는 같은 더보기가 dialog 시트로 열린다', () => {
    media.setWidth(390);
    renderNav();

    fireEvent.click(within(nav()).getByRole('button', { name: /더보기/ }));

    const sheet = screen.getByRole('dialog', { name: '더보기' });
    expect(within(sheet).getByText('홍보')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /협찬/ })).toHaveAttribute('href', '/admin/things/1/sponsors');
    expect(within(sheet).getByRole('link', { name: /팝업/ })).toHaveAttribute('href', '/admin/content?tab=popups');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
