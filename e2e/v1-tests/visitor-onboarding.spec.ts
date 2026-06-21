import { test, expect } from '@playwright/test';
import { logout } from './helpers/auth';

/**
 * 페르소나: visitor — 신규 가입 E2E (logout 상태).
 * 플로우:
 *   1차 /signup: 닉네임→이메일→비밀번호→'가입하고 계속' → 약관 미동의이므로 /terms 리다이렉트
 *   /terms: '필수 약관 전체 동의' → '동의하고 회원가입하기' → /signup 재진입 (state 리셋)
 *   2차 /signup: 동일 닉네임·이메일·비밀번호 재입력 → '가입하고 계속' →
 *     이번엔 약관 동의됨 → register API 호출 → 성공 → birthdate step
 *   birthdate: '건너뛰기' → /onboarding/sport 도달
 *
 * 가입 플로우는 실제 API 호출 + 고유 닉네임·이메일 필요 → 매 실행마다 랜덤 suffix.
 */

/** 닉네임 step 입력 + 중복확인 + 다음 */
async function fillNicknameStep(page: import('@playwright/test').Page, nickname: string) {
  await expect(page.getByText(/어떤 이름으로/)).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('사용할 닉네임').fill(nickname);
  await page.getByRole('button', { name: '중복 확인' }).click();
  await expect(page.getByText(/사용 가능한 닉네임|사용 가능/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '다음' }).click();
}

/** 이메일 step 입력 + 중복확인 + 다음 */
async function fillEmailStep(page: import('@playwright/test').Page, email: string) {
  await expect(page.getByText(/이메일을/)).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('예: me@email.com').fill(email);
  await page.getByRole('button', { name: '중복 확인' }).click();
  await expect(page.getByText(/사용 가능한 이메일|사용 가능/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '다음' }).click();
}

/** 비밀번호 step 입력 + '가입하고 계속' */
async function fillPasswordStep(page: import('@playwright/test').Page, password: string) {
  await expect(page.getByText(/비밀번호를/)).toBeVisible({ timeout: 10000 });
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill(password);
  await pwInputs.nth(1).fill(password);
  await page.getByRole('button', { name: /가입하고 계속/ }).click();
}

test.describe('[visitor] 신규 가입 온보딩 플로우', () => {
  test('signup 페이지가 렌더되고 닉네임 입력 UI가 존재한다', async ({ page }) => {
    await logout(page);
    await page.goto('/signup');
    const main = page.locator('main, [role="main"]');
    await expect(main.first()).toBeVisible();
    // STEP_COPY.nickname.title: "어떤 이름으로\n활동할까요?"
    await expect(page.getByText(/어떤 이름으로/)).toBeVisible();
    // 닉네임 입력 필드 존재
    await expect(page.getByPlaceholder('사용할 닉네임')).toBeVisible();
    // 중복 확인 버튼 존재
    await expect(page.getByRole('button', { name: '중복 확인' })).toBeVisible();
  });

  test('신규 가입 → 온보딩 sport 도달 E2E', async ({ page }) => {
    await logout(page);

    const rand = Math.random().toString(36).slice(2, 7);
    const nickname = `e2e${rand}`;
    const email = `e2e${rand}@test.teameet.v1`;
    const password = 'Test1234!pw';

    // ── 1차 /signup: 닉네임→이메일→비밀번호 → 약관 미동의 → /terms ──
    await page.goto('/signup');
    await fillNicknameStep(page, nickname);
    await fillEmailStep(page, email);
    await fillPasswordStep(page, password);

    // 약관 미동의이므로 /terms로 리다이렉트
    await expect(page).toHaveURL(/\/terms/, { timeout: 15000 });

    // ── /terms: 필수 약관 전체 동의 → 동의하고 회원가입하기 ──
    const agreeAllBtn = page.locator('.tm-auth-agree-all');
    await expect(agreeAllBtn).toBeVisible({ timeout: 10000 });
    await agreeAllBtn.click();
    const continueBtn = page.getByRole('button', { name: /동의하고 회원가입하기/ });
    await expect(continueBtn).toBeEnabled({ timeout: 5000 });
    await continueBtn.click();

    // ── 2차 /signup: state 리셋됨 → 다시 닉네임부터 (동일 값) ──
    await expect(page).toHaveURL(/\/signup/, { timeout: 15000 });
    // 이번엔 약관 동의됨 → register API 직접 호출 경로
    await fillNicknameStep(page, nickname);
    await fillEmailStep(page, email);
    await fillPasswordStep(page, password);

    // ── birthdate step — register 성공 후 ──
    // "생년월일을 알려주세요" 헤딩으로 엄밀하게 — DOM에 생년월일 텍스트가 2개라 strict mode
    await expect(page.getByRole('heading', { name: /생년월일/ })).toBeVisible({ timeout: 15000 });
    // '건너뛰기' 클릭 → /onboarding/sport
    await page.getByRole('button', { name: /건너뛰기|나중에/ }).click();

    // ── /onboarding/sport 도달 ──
    await expect(page).toHaveURL(/\/onboarding\/sport/, { timeout: 20000 });
    await expect(page.getByRole('main')).toBeVisible();
    // 종목 선택 단계
    await expect(page.getByRole('main')).toContainText(/종목|관심/);
  });
});
