import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { personas } from './personas';

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function envelopeData<T>(body: { data?: T } | T): T {
  return body && typeof body === 'object' && 'data' in body ? (body.data as T) : (body as T);
}

/**
 * 페르소나: host(호스트민) — 팀매치 주최자.
 * 플로우:
 *   - 모바일: /team-matches 목록 도달 + FAB 존재 확인
 *   - 데스크톱(1440): /team-matches 목록 + '팀매치 만들기' 헤더 CTA 노출 확인
 *     (반응형 회귀 #1 방지 — 데스크톱에서 `.tm-team-match-desktop-create-btn` 존재)
 */
test.describe('[host] 팀매치 목록 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, personas.host.email);
  });

  test('모바일: /team-matches 목록이 렌더되고 FAB이 존재한다', async ({ page }) => {
    await page.goto('/team-matches');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    // 팀매치 목록 — 종목 칩 또는 summary row 렌더
    await expect(main).toContainText(/팀매치|팀 매치/);
    const fab = page.locator('.tm-floating-fab[href="/team-matches/new/team"]');
    // DOM에는 존재하지만 desktop에서는 CSS로 숨겨짐 — DOM presence만 확인
    await expect(fab).toHaveCount(1);
  });

  test('데스크톱: /team-matches 헤더에 "팀매치 만들기" CTA가 노출된다', async ({ page }, testInfo) => {
    // 이 테스트는 --project=desktop(1440px)으로 실행될 때 의미 있음
    // mobile viewport에서도 DOM에는 존재(CSS 표시만 다름) → DOM 존재 확인
    await page.goto('/team-matches');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    // 데스크톱 헤더 CTA: className="tm-team-match-desktop-create-btn"
    const desktopCta = page.locator('.tm-team-match-desktop-create-btn');
    await expect(desktopCta).toHaveCount(1);
    await expect(desktopCta).toHaveAttribute('href', '/team-matches/new/team');
    // aria-label도 존재
    await expect(desktopCta).toHaveAttribute('aria-label', '팀매치 만들기');
    // 데스크톱(1440) 프로젝트에선 실제로 보여야 한다 — CSS로 숨겨지는 회귀를 toBeVisible로 포착(Copilot).
    // 모바일 프로젝트에선 이 데스크톱 CTA가 반응형 CSS로 숨겨지므로 DOM 존재(toHaveCount)까지만 의미.
    if (testInfo.project.name === 'desktop') {
      await expect(desktopCta).toBeVisible();
    }
  });

  test('권한 있는 실제 팀 ID와 업로드 이미지로 생성하고 같은 엔티티를 수정한다', async ({ page }) => {
    const title = `E2E 팀매치 계약 ${Date.now()}`;
    const updatedTitle = `${title} 수정`;
    const matchDate = futureDate(8);

    await page.goto('/team-matches/new/team', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '어떤 팀의 매치인가요?' })).toBeVisible();
    const creatableTeam = page.locator('main button[aria-pressed]:not([disabled])').first();
    await expect(creatableTeam).toBeVisible();
    await creatableTeam.click();
    await expect(creatableTeam).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '어떤 종목인가요?' })).toBeVisible();
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '매치 정보' })).toBeVisible();
    await page.getByLabel('매치 제목').fill(title);
    await page.getByLabel('설명').fill('팀매치 생성·수정 계약을 검증합니다.');
    const uploadResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/uploads') && response.request().method() === 'POST',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'team-match-contract.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.ok()).toBeTruthy();
    const uploadedImageUrl = envelopeData<{ urls: string[] }>(await uploadResponse.json()).urls[0];
    expect(uploadedImageUrl).toMatch(/^\/uploads\//);
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '경기조건' })).toBeVisible();
    // 경기조건 필드는 이제 선택식 칩(PresetChipSelector/MultiPresetChipSelector)이라
    // getByLabel().fill()이 아니라 칩 클릭으로 값을 고른다. 경기방식은 종목별로 프리셋
    // 목록이 달라(축구 11:11.. / 풋살 6:6..) 어떤 팀이 선택됐는지에 test가 의존하지
    // 않도록 "직접입력" 경로로 값을 넣는다.
    await page.getByRole('group', { name: '실력등급' }).getByRole('button', { name: '중수' }).click();
    const formatField = page.locator('.tm-create-field').filter({ has: page.getByRole('group', { name: '경기방식' }) });
    await formatField.getByRole('button', { name: '직접입력' }).click();
    await formatField.locator('input.tm-create-native-input').fill('5:5 풋살');
    await page.getByRole('group', { name: '경기 스타일' }).getByRole('button', { name: '친선', exact: true }).click();
    await page.getByRole('group', { name: '유니폼 색상' }).getByRole('button', { name: '파랑', exact: true }).click();
    await page.getByLabel('총비용').fill('100000');
    await page.getByLabel('상대팀 부담금').fill('50000');
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '장소와 시간' })).toBeVisible();
    await page.getByLabel('상세 주소').fill('서울 E2E 팀매치 구장');
    await page.getByLabel('날짜').fill(matchDate);
    await page.getByLabel('시작 시간').fill('19:00');
    await page.getByLabel('종료 시간').fill('21:00');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('teameet:v1:team-match-draft:v3');
          return raw ? (JSON.parse(raw) as { date?: string; startTime?: string; endTime?: string }) : null;
        }),
      )
      .toMatchObject({ date: matchDate, startTime: '19:00', endTime: '21:00' });
    await page.getByRole('button', { name: '다음', exact: true }).click();

    await expect(page.getByRole('heading', { name: '입력한 내용을 확인해 주세요' })).toBeVisible();
    const createResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/team-matches') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '팀매치 만들기', exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = createResponse.request().postDataJSON() as Record<string, unknown>;
    expect(createPayload).toMatchObject({ title, imageUrl: uploadedImageUrl });
    expect(createPayload.hostTeamId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createPayload.sportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createPayload.regionId).toMatch(/^[0-9a-f-]{36}$/i);

    const created = envelopeData<{ teamMatchId: string }>(await createResponse.json());
    await page.waitForURL(new RegExp(`/team-matches/${created.teamMatchId}$`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    await page.goto(`/team-matches/${created.teamMatchId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '매치 정보' })).toBeVisible();
    await expect(page.getByLabel('매치 제목')).toHaveValue(title);
    await expect(page.locator('.tm-create-image-preview')).toHaveAttribute(
      'style',
      new RegExp(uploadedImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    await page.getByLabel('매치 제목').fill(updatedTitle);
    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/team-matches/${created.teamMatchId}`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.ok()).toBeTruthy();
    expect(updateResponse.request().postDataJSON()).toMatchObject({
      title: updatedTitle,
      imageUrl: uploadedImageUrl,
      version: expect.any(String),
    });
    await page.waitForURL(new RegExp(`/team-matches/${created.teamMatchId}$`));
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  });
});
