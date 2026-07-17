import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

type Rect = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
};

type BrowserProblemLedger = {
  readonly badResponses: string[];
  readonly failedRequests: string[];
  readonly consoleProblems: string[];
};

function watchBrowserProblems(page: Page): BrowserProblemLedger {
  const ledger: BrowserProblemLedger = {
    badResponses: [],
    failedRequests: [],
    consoleProblems: [],
  };

  page.on('response', (response) => {
    if (response.status() >= 400) {
      ledger.badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  page.on('requestfailed', (request) => {
    ledger.failedRequests.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'unknown'}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      ledger.consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });

  return ledger;
}

async function measure(locator: Locator): Promise<Rect> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  });
}

test.describe('Teameet shared visual contracts', () => {
  test('browser routes are root-mounted and the legacy /v1 prefix is unavailable', async ({ page }) => {
    const rootResponse = await page.goto('/home');
    expect(rootResponse?.status()).toBe(200);

    const legacyResponse = await page.goto('/v1/home');
    expect(legacyResponse?.status()).toBe(404);
  });

  for (const viewport of VIEWPORTS) {
    test(`/signup required profile stays usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Given: the current email-signup profile step with duplicate checks satisfied.
      const browserProblems = watchBrowserProblems(page);
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        window.sessionStorage.setItem('teameet.v1.signupTermsAccepted', 'true');
      });
      await page.route('**/api/v1/auth/check-nickname**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { available: true }, timestamp: '2026-07-15T00:00:00.000Z' }),
        });
      });
      await page.route('**/api/v1/auth/check-email**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { available: true }, timestamp: '2026-07-15T00:00:00.000Z' }),
        });
      });
      await page.goto('/signup');
      await page.getByLabel('닉네임').fill(`시각검증${viewport.width}`);
      await page.getByRole('button', { name: '중복 확인' }).nth(0).click();
      await page.getByLabel('이메일').fill(`visual-${viewport.width}@example.com`);
      await page.getByRole('button', { name: '중복 확인' }).nth(1).click();
      await page.getByLabel('비밀번호', { exact: true }).fill('Password1!');
      await page.getByLabel('비밀번호 확인').fill('Password1!');
      await page.getByRole('button', { name: '프로필 입력하기' }).click();

      // When: invalid raw input is attempted, then corrected to a complete profile.
      await page.getByRole('radio', { name: '여' }).click();
      await page.getByLabel('이름').fill('김테스트');
      await page.getByLabel('휴대폰 번호').fill('010a12345678');
      await page.getByLabel('생년월일').fill('2000x0229');
      await expect(page.getByRole('button', { name: '가입하고 계속' })).toBeDisabled();
      await page.getByLabel('휴대폰 번호').fill('010-1234-5678');
      await page.getByLabel('생년월일').fill('2000-02-29');
      const submit = page.getByRole('button', { name: '가입하고 계속' });
      await expect(submit).toBeEnabled();

      // Then: the final required field remains fully visible above the CTA with no horizontal overflow.
      const [birthDateRect, ctaRect, widths] = await Promise.all([
        measure(page.getByLabel('생년월일')),
        measure(page.locator('.tm-auth-fixed-cta')),
        page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        })),
      ]);
      expect(birthDateRect.bottom).toBeLessThanOrEqual(ctaRect.top);
      expect(widths.document).toBe(widths.viewport);
      expect(widths.body).toBe(widths.viewport);
      expect(browserProblems).toEqual({ badResponses: [], failedRequests: [], consoleProblems: [] });
    });

    test(`/tournaments promo alignment at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Given: the live tournament list rendered at the requested viewport.
      const browserProblems = watchBrowserProblems(page);
      await page.setViewportSize(viewport);
      await page.goto('/tournaments');
      const routeFrame = page.locator('.tm-tournament-list');
      const promo = page.locator('.tm-tournament-promo-carousel');
      const listGrid = page.locator('.tm-tournament-list-grid');
      await expect(promo).toBeVisible();
      await expect(listGrid).toBeVisible();

      // When: the route frame, promo, and list grid geometry are measured.
      const [routeFrameRect, promoRect, listGridRect] = await Promise.all([
        measure(routeFrame),
        measure(promo),
        measure(listGrid),
      ]);

      // Then: mobile/tablet retain 20px insets; desktop promo aligns to the list grid.
      if (viewport.width < 1024) {
        expect(promoRect.left - routeFrameRect.left).toBeCloseTo(20, 0);
        expect(routeFrameRect.right - promoRect.right).toBeCloseTo(20, 0);
        expect(listGridRect.left - routeFrameRect.left).toBeCloseTo(20, 0);
        expect(routeFrameRect.right - listGridRect.right).toBeCloseTo(20, 0);
      } else {
        expect(promoRect.left).toBeCloseTo(listGridRect.left, 0);
        expect(promoRect.right).toBeCloseTo(listGridRect.right, 0);
      }
      expect(browserProblems).toEqual({ badResponses: [], failedRequests: [], consoleProblems: [] });
    });

    test(`/home shared featured media uses 2:1 at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      // Given: every loaded shared featured-media consumer rendered on the live home route.
      const browserProblems = watchBrowserProblems(page);
      await page.setViewportSize(viewport);
      await page.goto('/home');
      const featuredMedia = page.locator('.tm-featured-card:not([aria-busy="true"]) .tm-featured-media');
      await expect(featuredMedia.first()).toBeVisible({ timeout: 20_000 });
      expect(await featuredMedia.count()).toBeGreaterThan(0);

      // When: each consumer's computed aspect ratio and border-box are measured.
      const measurements = await featuredMedia.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            computedRatio: getComputedStyle(element).aspectRatio,
            renderedRatio: rect.width / rect.height,
          };
        }),
      );

      // Then: every shared consumer has the same 2:1 crop contract.
      for (const measurement of measurements) {
        expect(measurement.computedRatio).toBe('2 / 1');
        expect(measurement.renderedRatio).toBeCloseTo(2, 2);
      }
      expect(browserProblems).toEqual({ badResponses: [], failedRequests: [], consoleProblems: [] });
    });
  }
});
