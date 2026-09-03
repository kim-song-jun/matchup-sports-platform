import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from './admin-shell';
import { TAB_CONTAINER_SELECTOR, TAB_LINK_SELECTOR } from '@/components/v1-ui/navigation-tab-selectors';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  // CommandPalette(전역 검색)가 셸에 포함되면서 useRouter도 필요해졌다
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminInquiriesPendingCount: () => ({ data: { count: 0 } }),
  // CommandPalette(전역 검색)가 셸에 포함되면서 필요해졌다
  useV1AdminGlobalSearch: () => ({ data: undefined, isFetching: false }),
}));

describe('AdminShell nav', () => {
  it('renders a reachable sidebar link to the monitoring hub (감시 4화면 통합, 2026-08-25)', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    // Desktop sidebar renders inside `nav[aria-label="주 메뉴"]`; there are two
    // (desktop sidebar + mobile drawer), so assert at least one reachable link exists.
    const links = screen.getAllByRole('link', { name: /^모니터링$/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/monitoring');
    }
  });

  it('renders a reachable sidebar link to the tournament-ops picker page (T6-3)', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    const links = screen.getAllByRole('link', { name: /대회 현장 운영/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin/ops/tournaments');
  });

  it('keeps the retired standalone monitoring links out of the nav (모니터링 허브로 통합)', () => {
    // 에러 로그·웹 푸시 실패·SMS·감사 로그는 /admin/monitoring 탭이 됐다 — 사이드바에
    // 남아 있으면 같은 화면으로 가는 입구가 두 벌이 된다.
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    for (const name of [/에러 로그/, /웹 푸시 실패/, /SMS · 인증 실패/, /감사 로그/]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('keeps the retired 리그 체계 link out of the nav (리그 허브로 흡수, 2026-08-25)', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    expect(screen.queryByRole('link', { name: /리그 체계/ })).toBeNull();
    // 정규 리그 입구는 그대로 산다 — 허브가 두 목록을 다 품는다.
    expect(screen.getAllByRole('link', { name: /정규 리그/ }).length).toBeGreaterThan(0);
  });

  it('keeps the retired settings/content links out of the nav (허브로 흡수, 2026-08-25)', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    for (const name of [/연동 설정/, /후기 정책/, /공지사항/, /^팝업$/, /^약관$/]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
    // 새 입구와, 인박스 성격이라 독립 유지한 문의는 산다.
    expect(screen.getAllByRole('link', { name: /^설정$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^콘텐츠$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /문의/ }).length).toBeGreaterThan(0);
  });

  it('groups nav items under 플랫폼 / 콘텐츠 / 운영 / 설정 headings', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    for (const label of ['플랫폼', '콘텐츠', '운영', '설정']) {
      expect(screen.getAllByRole('group', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('keeps the owner-only 관리자 item out of the nav when canManageAdmins is false', () => {
    render(
      <AdminShell canManageAdmins={false}>
        <div>content</div>
      </AdminShell>,
    );
    expect(screen.queryByRole('link', { name: '관리자' })).toBeNull();
  });

  it('places the owner-only 관리자 item in the 설정 group when canManageAdmins is true', () => {
    render(
      <AdminShell canManageAdmins>
        <div>content</div>
      </AdminShell>,
    );
    const settingsGroups = screen.getAllByRole('group', { name: '설정' });
    expect(settingsGroups.length).toBeGreaterThan(0);
    for (const group of settingsGroups) {
      const link = within(group).getByRole('link', { name: '관리자' });
      expect(link).toHaveAttribute('href', '/admin/admins');
    }
  });

  // 살펴보는 화면과 누르면 사용자에게 즉시 영향이 가는 화면이 같은 무게로 붙어 있었다.
  // 구획을 하나 더 만들면 사이드바 세로가 더 넘치므로, '운영' 안에서 소구획으로 가른다.
  it("'운영' 안에서 모니터링과 제어·발송을 갈라 놓는다", () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    const ops = screen.getAllByRole('group', { name: '운영' })[0];
    expect(within(ops).getByText('모니터링')).toBeInTheDocument();
    expect(within(ops).getByText('제어 · 발송')).toBeInTheDocument();

    // 순서: 읽기 항목이 먼저, 그다음 경계, 그다음 쓰기 항목.
    const texts = Array.from(ops.querySelectorAll('a, p')).map((el) => el.textContent?.trim());
    const boundary = texts.indexOf('제어 · 발송');
    expect(boundary).toBeGreaterThan(-1);
    expect(texts.indexOf('감사 로그')).toBeLessThan(boundary);
    expect(texts.indexOf('웹 푸시 발송')).toBeGreaterThan(boundary);
    expect(texts.indexOf('경기 운영 플래그')).toBeGreaterThan(boundary);
  });

  it('구획 라벨은 그대로 4개다 — 목적지 이름을 바꾸지 않았다', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );
    for (const label of ['플랫폼', '콘텐츠', '운영', '설정']) {
      expect(screen.getAllByRole('group', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('사이드바 내비게이션은 tab 그룹으로 등록돼 있다(MOTION-2 — 어드민 사이드바 이동은 스택 push 가 아니라 병렬 뷰 전환)', () => {
    // 이 테스트가 실제로 잡는 것: navigation-tab-selectors.ts 의 TAB_GROUPS 에서
    // 어드민 그룹이 빠지거나, admin-shell.tsx 에서 그 클래스가 누락되면 use-navigation-intent.ts
    // 의 `anchor.closest(TAB_CONTAINER_SELECTOR)` 가 매칭에 실패해 어드민 사이드바 클릭이
    // 다시 'push' 로 떨어진다(전체 페이지 슬라이드+페이드 회귀). CSS 선택자를 직접
    // `container.querySelector` 에 넣어 실제 DOM 위에서 매칭되는지까지 확인한다 — 클래스
    // 문자열이 우연히 같아 보여도 셀렉터 형태가 어긋나면(예: 자손결합자 대신 자식결합자)
    // 이 테스트가 잡는다.
    const { container } = render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    // nav[aria-label="주 메뉴"] 자체가 TAB_CONTAINER_SELECTOR 에 매칭돼야 한다 — 그래야
    // 그 안의 <a> 클릭이 anchor.closest(TAB_CONTAINER_SELECTOR) 로 잡힌다.
    const navs = container.querySelectorAll(TAB_CONTAINER_SELECTOR);
    expect(navs.length).toBeGreaterThan(0); // 데스크톱 사이드바 + 모바일 드로어, 최소 1개(드로어는 닫힘 상태일 수 있음)
    for (const nav of navs) {
      expect(nav.getAttribute('aria-label')).toBe('주 메뉴');
    }

    // 실제 사이드바 링크(예: 대시보드)가 TAB_LINK_SELECTOR 에도 매칭돼야 스크롤 복원이
    // 'tab' 취급을 받는다(scroll-restoration.tsx — 병렬 뷰 전환이므로 보던 자리로 돌아간다,
    // 지금까지는 매번 0으로 리셋됐다).
    const dashboardLinks = screen.getAllByRole('link', { name: '대시보드' });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    for (const link of dashboardLinks) {
      expect(link.matches(TAB_LINK_SELECTOR)).toBe(true);
      expect(link.closest(TAB_CONTAINER_SELECTOR)).not.toBeNull();
    }
  });
});
