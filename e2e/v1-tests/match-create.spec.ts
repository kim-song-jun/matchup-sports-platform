import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function envelopeData<T>(body: { data?: T } | T): T {
  return body && typeof body === 'object' && 'data' in body
    ? (body.data as T)
    : (body as T);
}

/**
 * 페르소나: host(호스트민) — 매치 호스트.
 * 회귀 테스트: 매치 생성 위저드에서 non-first 종목을 골라도 step 이동(재마운트) 시 선택이
 * 유지되는지. (과거 critical 버그: selectedSportId가 로컬 useState라 step마다 축구로 리셋 →
 * 사용자가 수영을 골라도 축구로 생성. selectionKey localStorage 영속으로 수정.)
 * commit 93873e97 회귀 방지.
 */
test.describe('[host] 매치 생성 위저드 — 종목 선택 영속', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.host.email);
  });

  test('non-first 종목(수영) 선택이 step 재마운트 후에도 유지된다', async ({ page }) => {
    const sportsReady = page.waitForResponse((response) => response.url().includes('/api/v1/master/sports') && response.status() === 200, { timeout: 45000 });
    const regionsReady = page.waitForResponse((response) => response.url().includes('/api/v1/master/regions') && response.status() === 200, { timeout: 45000 });
    await page.goto('/matches/new/sport', { waitUntil: 'domcontentloaded' });
    await Promise.all([sportsReady, regionsReady]);
    await expect(page.getByRole('heading', { name: /종목/ })).toBeVisible({ timeout: 30000 });

    const swim = page.getByRole('button', { name: /수영/ });
    await expect(swim).toBeVisible();
    await swim.click();
    await expect(swim).toHaveAttribute('aria-pressed', 'true');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /종목/ })).toBeVisible({ timeout: 30000 });
    const swimAfter = page.getByRole('button', { name: /수영/ });
    await expect(swimAfter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /축구/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('live master ID와 업로드 이미지를 사용해 생성하고 edit에서 그대로 수정한다', async ({ page }) => {
    const title = `E2E 매치 계약 ${Date.now()}`;
    const updatedTitle = `${title} 수정`;

    await page.goto('/matches/new/sport', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '어떤 종목인가요?' })).toBeVisible();
    const futsal = page.getByRole('button', { name: /풋살/ });
    await futsal.click();
    await expect(futsal).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '매치 정보' })).toBeVisible();
    await page.getByLabel('제목').fill(title);
    await page.getByLabel('설명').fill('생성·수정 계약을 확인하는 실제 브라우저 시나리오입니다.');
    await page.getByLabel('규칙').fill('정시 도착');

    const uploadResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/uploads') && response.request().method() === 'POST',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'match-contract.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok()).toBeTruthy();
    const uploadResult = envelopeData<{ urls: string[] }>(await uploadResponse.json());
    const uploadedImageUrl = uploadResult.urls[0];
    expect(uploadedImageUrl).toMatch(/^\/uploads\//);
    await expect(page.getByText('match-contract.png')).toBeVisible();
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '장소와 시간' })).toBeVisible();
    const region = page.getByLabel('지역');
    if (!(await region.inputValue())) await region.selectOption({ index: 1 });
    await page.getByRole('textbox', { name: '장소', exact: true }).fill('E2E 계약 체육관');
    await page.getByRole('textbox', { name: '상세 주소', exact: true }).fill('서울 E2E로 130');
    const matchDate = futureDate(7);
    await page.getByLabel('날짜').fill(matchDate);
    await page.getByLabel('시작 시간').fill('18:00');
    await page.getByLabel('종료 시간').fill('20:00');
    await expect(page.getByLabel('날짜')).toHaveValue(matchDate);
    await expect(page.getByLabel('시작 시간')).toHaveValue('18:00');
    await expect(page.getByLabel('종료 시간')).toHaveValue('20:00');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('teameet:v1:match-draft');
          return raw ? (JSON.parse(raw) as { date?: string; startTime?: string; endTime?: string }) : null;
        }),
      )
      .toMatchObject({ date: matchDate, startTime: '18:00', endTime: '20:00' });
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '입력한 내용을 확인해 주세요' })).toBeVisible();
    const createResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/matches') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '매치 만들기', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = createResponse.request().postDataJSON() as Record<string, unknown>;
    expect(createPayload).toMatchObject({
      title,
      imageUrl: uploadedImageUrl,
      manualPlaceName: 'E2E 계약 체육관',
    });
    expect(createPayload.sportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createPayload.regionId).toMatch(/^[0-9a-f-]{36}$/i);

    const created = envelopeData<{ matchId: string }>(await createResponse.json());
    await page.waitForURL(new RegExp(`/matches/${created.matchId}$`));
    await expect(page.locator('.tm-match-detail-title')).toHaveText(title);
    await expect(page.locator('.tm-match-detail-hero')).toHaveAttribute(
      'style',
      new RegExp(uploadedImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );

    await page.goto(`/matches/${created.matchId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '매치 정보' })).toBeVisible();
    await expect(page.getByLabel('제목')).toHaveValue(title);
    await expect(page.locator('.tm-create-image-preview')).toHaveAttribute(
      'style',
      new RegExp(uploadedImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    await page.getByLabel('제목').fill(updatedTitle);

    const updateResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith(`/api/v1/matches/${created.matchId}`) && response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.ok()).toBeTruthy();
    expect(updateResponse.request().postDataJSON()).toMatchObject({
      title: updatedTitle,
      imageUrl: uploadedImageUrl,
      version: expect.any(String),
    });
    await page.waitForURL(new RegExp(`/matches/${created.matchId}$`));
    await expect(page.locator('.tm-match-detail-title')).toHaveText(updatedTitle);
  });
});
