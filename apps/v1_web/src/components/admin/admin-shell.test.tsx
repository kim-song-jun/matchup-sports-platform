import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from './admin-shell';

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
});
