import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

/**
 * 페르소나: admin(운영자) — 운영 대시보드.
 * 플로우: /admin 운영 개요(KPI '활성 회원' 등) + /admin/users 테이블 도달.
 */
test.describe('[admin] 운영 대시보드 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.admin.email);
  });

  test('/admin — 운영 개요 페이지가 렌더되고 KPI 섹션이 존재한다', async ({ page }) => {
    await page.goto('/admin');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // AdminPageHeader: "운영 개요" 또는 "운영 대시보드"
    await expect(main).toContainText(/운영 개요|운영 대시보드/);
    // KPI 카드: '활성 회원', '활성 매치' 등이 DOM에 렌더 (data 로드 성공 시)
    // 로딩 중일 수 있으므로 aria-label 또는 텍스트 존재 확인
    await expect(main).toContainText(/회원|매치|팀/);
  });

  test('/admin/users — 회원 관리 테이블이 도달·렌더된다', async ({ page }) => {
    await page.goto('/admin/users');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // 회원 테이블 또는 헤딩 확인
    await expect(main).toContainText(/회원|닉네임|상태/);
  });

  test('/admin → /admin/users 직접 이동 도달', async ({ page }) => {
    await page.goto('/admin');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(main).toContainText(/운영 개요|운영 대시보드/);

    // admin 사이드바 링크는 데스크톱에서만 visible — 뷰포트 무관하게 직접 이동으로 도달 확인
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('main')).toContainText(/회원|닉네임|상태/);
  });
});
