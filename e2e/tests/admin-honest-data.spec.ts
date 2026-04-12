import { expect, test, type Page } from '@playwright/test';
import { loginViaApi } from '../fixtures/auth';
import { authStatePath } from '../fixtures/runtime';
import { API_BASE, TEST_PERSONAS } from '../fixtures/test-users';

const ADMIN = TEST_PERSONAS.admin.nickname;

interface AdminUserListItem {
  id: string;
  nickname: string;
}

interface AdminUserDetail {
  id: string;
  nickname: string;
  adminStatus: 'active' | 'suspended';
  suspensionReason: string | null;
  adminAuditLog?: Array<{
    id: string;
    action: 'warn' | 'suspend' | 'reactivate';
    note: string | null;
  }>;
}

async function adminRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  const login = await loginViaApi(ADMIN);
  const response = await fetch(`${API_BASE}/api/v1${pathName}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${login.accessToken}`,
    },
  });

  const payload = await response.json() as { data?: T; message?: string };
  if (!response.ok) {
    throw new Error(`${pathName} failed: ${response.status} ${payload.message ?? 'unknown error'}`);
  }

  return (payload.data ?? payload) as T;
}

async function pickModerationTarget(): Promise<AdminUserListItem> {
  const data = await adminRequest<{ items: AdminUserListItem[] }>('/admin/users');
  const target = data.items.find((user) => user.nickname !== ADMIN);
  if (!target) {
    throw new Error('no non-admin moderation target available');
  }

  return target;
}

async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return adminRequest<AdminUserDetail>(`/admin/users/${userId}`);
}

async function setAdminUserStatus(
  userId: string,
  status: 'active' | 'suspended',
  note: string,
): Promise<void> {
  await adminRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, note }),
  });
}

async function ensureUserActive(userId: string, note: string): Promise<void> {
  const detail = await getAdminUserDetail(userId);
  if (detail.adminStatus === 'suspended') {
    await setAdminUserStatus(userId, 'active', note);
  }
}

async function expectAdminSurface(page: Page, route: string, heading: RegExp | string): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/').replace('/', '\\/')}(?:\\?|$)`));
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

test.describe.serial('Admin honest-data flows', () => {
  test.use({
    storageState: authStatePath('admin'),
  });

  test('payments surface renders live data and honest empty-filter state', async ({ page }) => {
    await expectAdminSurface(page, '/admin/payments', '결제 관리');
    await expect(page.getByText('저장된 실제 결제/환불 내역만 표시합니다')).toBeVisible();

    const main = page.locator('main');
    await expect(main).toContainText(/결제완료|대기|환불|부분 환불|실패|아직 결제 내역이 없어요/);

    const searchInput = page.getByPlaceholder('사용자, 주문번호 또는 매치명 검색');
    await searchInput.fill('task37-no-payment-result');
    await expect(page.getByText('검색 조건에 맞는 결제가 없어요')).toBeVisible();
    await expect(page.getByText('다른 검색어 또는 상태로 다시 찾아보세요')).toBeVisible();
  });

  test('reviews surface renders live data and honest empty-filter state', async ({ page }) => {
    await expectAdminSurface(page, '/admin/reviews', '평가 관리');
    await expect(page.getByText('실제 리뷰와 평점만 표시합니다')).toBeVisible();

    const main = page.locator('main');
    await expect(main).toContainText(/총 평가수|표시할 평가가 없어요|평균 매너점수/);

    const searchInput = page.getByPlaceholder('매치명 또는 평가자/대상 검색');
    await searchInput.fill('task37-no-review-result');
    await expect(page.getByText('표시할 평가가 없어요')).toBeVisible();
    await expect(page.getByText('실제 리뷰가 등록되면 여기에 표시돼요')).toBeVisible();
  });

  test('user moderation flow persists warn, suspend, and reactivate through the admin detail UI', async ({ page }) => {
    const target = await pickModerationTarget();
    const warnNote = `e2e-warn-${Date.now()}`;
    const suspendNote = `e2e-suspend-${Date.now()}`;
    const reactivateNote = `e2e-reactivate-${Date.now()}`;

    await ensureUserActive(target.id, 'e2e-setup-reset-active');

    try {
      await expectAdminSurface(page, `/admin/users/${target.id}`, target.nickname);
      await expect(page.getByText('관리 액션')).toBeVisible();
      await expect(page.getByText('감사 로그')).toBeVisible();

      await page.getByRole('button', { name: '경고 기록' }).click();
      await page.getByLabel('운영 메모').fill(warnNote);
      await page.getByRole('button', { name: '저장' }).click();
      await expect(page.getByText('사용자에게 경고를 기록했어요')).toBeVisible();
      await expect(page.getByText(warnNote)).toBeVisible();

      await page.getByRole('button', { name: '계정 정지' }).click();
      const saveButton = page.getByRole('button', { name: '저장' });
      await expect(page.getByText('계정 정지 사유는 필수입니다.')).toBeVisible();
      await expect(saveButton).toBeDisabled();
      await page.getByLabel('운영 메모').fill(suspendNote);
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(page.getByText('사용자 계정을 정지했어요')).toBeVisible();
      await expect(page.getByText(`정지 사유: ${suspendNote}`)).toBeVisible();
      await expect(page.getByRole('button', { name: '계정 활성화' })).toBeVisible();
      await expect(page.getByText(suspendNote)).toBeVisible();

      await page.getByRole('button', { name: '계정 활성화' }).click();
      await page.getByLabel('운영 메모').fill(reactivateNote);
      await page.getByRole('button', { name: '저장' }).click();

      await expect(page.getByText('사용자 계정을 활성화했어요')).toBeVisible();
      await expect(page.getByRole('button', { name: '계정 정지' })).toBeVisible();
      await expect(page.getByText(reactivateNote)).toBeVisible();
      await expect(page.getByText(`정지 사유: ${suspendNote}`)).toHaveCount(0);

      const detail = await getAdminUserDetail(target.id);
      expect(detail.adminStatus).toBe('active');
      expect(detail.adminAuditLog?.some((entry) => entry.action === 'warn' && entry.note === warnNote)).toBeTruthy();
      expect(detail.adminAuditLog?.some((entry) => entry.action === 'suspend' && entry.note === suspendNote)).toBeTruthy();
      expect(detail.adminAuditLog?.some((entry) => entry.action === 'reactivate' && entry.note === reactivateNote)).toBeTruthy();
    } finally {
      await ensureUserActive(target.id, 'e2e-cleanup-reset-active');
    }
  });
});

test.describe('Admin honest-data access control', () => {
  test.describe('non-admin', () => {
    test.use({
      storageState: authStatePath('sinaro'),
    });

    test('non-admin cannot stay on /admin/payments', async ({ page }) => {
      await page.goto('/admin/payments', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const authWall = page.getByTestId('admin-auth-wall');
      if (await authWall.isVisible().catch(() => false)) {
        await expect(authWall).toContainText('관리자 권한이 필요합니다');
        return;
      }

      await expect(page).not.toHaveURL(/\/admin\/payments/);
    });
  });

  test('unauthenticated user cannot stay on /admin/reviews', async ({ page }) => {
    await page.goto('/admin/reviews', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const authWall = page.getByTestId('admin-auth-wall');
    if (await authWall.isVisible().catch(() => false)) {
      await expect(authWall).toContainText('관리자 권한이 필요합니다');
      return;
    }

    await expect(page).not.toHaveURL(/\/admin\/reviews/);
  });
});
