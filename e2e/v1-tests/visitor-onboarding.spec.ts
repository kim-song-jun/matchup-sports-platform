import { expect, test, type Page } from '@playwright/test';
import { logout } from './helpers/auth';

type SignupAccount = {
  readonly nickname: string;
  readonly email: string;
  readonly phone: string;
};

function createSignupAccount(): SignupAccount {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const suffix = unique.slice(-8);
  return {
    nickname: `e2e가입${suffix}`,
    email: `e2e-signup-${unique}@test.teameet.v1`,
    phone: `010${suffix}`,
  };
}

async function acceptRequiredTerms(page: Page): Promise<void> {
  await page.goto('/terms', { waitUntil: 'load' });
  await page.getByRole('button', { name: /필수 약관 전체 동의/ }).click();
  const continueButton = page.getByRole('button', { name: '동의하고 회원가입하기' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/signup$/);
}

async function fillAccountStep(page: Page, account: SignupAccount): Promise<void> {
  await expect(page.getByRole('heading', { name: /가입 정보를 확인해 주세요/ })).toBeVisible();
  await page.getByLabel('닉네임').fill(account.nickname);
  const nicknameCheck = page.getByRole('button', { name: '중복 확인' }).first();
  const nicknameResponse = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().includes('/auth/check-nickname'),
  );
  await nicknameCheck.click();
  expect((await nicknameResponse).ok()).toBe(true);
  await expect(page.getByText('사용 가능한 닉네임이에요.')).toBeVisible();

  await page.getByLabel('이메일').fill(account.email);
  const emailCheck = page.getByRole('button', { name: '중복 확인' }).nth(1);
  const emailResponse = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().includes('/auth/check-email'),
  );
  await emailCheck.click();
  expect((await emailResponse).ok()).toBe(true);
  await expect(page.getByText('사용 가능한 이메일이에요.')).toBeVisible();

  await page.getByPlaceholder('8자 이상').fill('Test1234!pw');
  await page.getByPlaceholder('비밀번호 다시 입력').fill('Test1234!pw');
  const profileButton = page.getByRole('button', { name: '프로필 입력하기' });
  await expect(profileButton).toBeEnabled();
  await profileButton.click();
  await expect(page.getByRole('heading', { name: /프로필을 완성해 주세요/ })).toBeVisible();
}

test.describe('[visitor] 신규 가입 온보딩 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await logout(page);
  });

  test('현재 계정 단계와 두 단계 진행 상태를 렌더한다', async ({ page }) => {
    // Given
    await page.goto('/signup', { waitUntil: 'load' });

    // When
    const progress = page.getByRole('progressbar', { name: '회원가입 진행 단계 1 / 2' });

    // Then
    await expect(page.getByRole('heading', { name: /가입 정보를 확인해 주세요/ })).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByLabel('닉네임')).toBeVisible();
    await expect(page.getByLabel('이메일')).toBeVisible();
    await expect(page.getByPlaceholder('8자 이상')).toBeVisible();
    await expect(page.getByPlaceholder('비밀번호 다시 입력')).toBeVisible();
  });

  test('필수 프로필 누락과 존재하지 않는 달력 날짜를 등록 요청 전에 차단한다', async ({ page }) => {
    // Given
    const account = createSignupAccount();
    const registrationRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/auth/register')) {
        registrationRequests.push(request.url());
      }
    });
    await acceptRequiredTerms(page);
    await fillAccountStep(page, account);
    const submitButton = page.getByRole('button', { name: '가입하고 계속' });

    // When
    await expect(submitButton).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('이름을 입력해 주세요.');
    await page.getByLabel('이름').fill('홍길동');
    await expect(page.getByRole('status')).toHaveText('휴대폰 번호는 숫자 11자리로 입력해 주세요.');
    await page.getByLabel('휴대폰 번호').fill(account.phone);
    await expect(page.getByRole('status')).toHaveText(/생년월일은 올바른 날짜/);
    await page.getByLabel('생년월일').fill('20000230');

    // Then
    await expect(submitButton).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText(/생년월일은 올바른 날짜/);
    await page.getByLabel('생년월일').fill('20000229');
    await expect(page.getByRole('status')).toHaveText('성별을 선택해 주세요.');
    await page.getByRole('radio', { name: '남' }).click();
    await expect(submitButton).toBeEnabled();
    expect(registrationRequests).toEqual([]);
  });

  test('필수 프로필을 실제 API에 등록하고 완료 경로와 저장값을 유지한다', async ({ page }) => {
    // Given
    const account = createSignupAccount();
    const displayName = '신규 가입자';
    const birthDate = '20000229';
    await acceptRequiredTerms(page);
    await fillAccountStep(page, account);
    await page.getByLabel('이름').fill(displayName);
    await page.getByLabel('휴대폰 번호').fill(account.phone);
    await page.getByLabel('생년월일').fill(birthDate);
    await page.getByRole('radio', { name: '여' }).click();

    // When
    const registrationResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/auth/register'),
    );
    await page.getByRole('button', { name: '가입하고 계속' }).click();
    const registrationResponse = await registrationResponsePromise;

    // Then
    expect(registrationResponse.ok()).toBe(true);
    await expect(registrationResponse.json()).resolves.toMatchObject({
      status: 'success',
      data: { session: { userEmail: account.email } },
    });
    await expect(page).toHaveURL(/\/signup\/complete$/);
    await expect(page.getByRole('heading', { name: '회원가입을 완료했어요' })).toBeVisible();

    const persistedProfile = await page.evaluate(async () => {
      const userId = window.localStorage.getItem('teameet.v1.userId');
      const userEmail = window.localStorage.getItem('teameet.v1.userEmail');
      const response = await window.fetch('/api/v1/me/profile', {
        headers: {
          ...(userId ? { 'x-v1-user-id': userId } : {}),
          ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
        },
      });
      return { status: response.status, body: await response.json(), userId, userEmail };
    });

    expect(persistedProfile.status).toBe(200);
    expect(persistedProfile.userId).toEqual(expect.any(String));
    expect(persistedProfile.userEmail).toBe(account.email);
    expect(persistedProfile.body).toMatchObject({
      status: 'success',
      data: {
        email: account.email,
        phone: account.phone,
        onboardingStatus: 'signup_done',
        profile: {
          nickname: account.nickname,
          displayName,
          birthDate,
          gender: 'female',
        },
      },
    });

    await page.getByRole('link', { name: '운동 설정 시작하기' }).click();
    await expect(page).toHaveURL(/\/onboarding\/sport$/);
  });
});
