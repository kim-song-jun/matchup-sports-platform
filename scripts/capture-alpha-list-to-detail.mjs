/**
 * 목록 → 상세 진입 시 캐시 승계(PR #921 B단계) 시각 검증.
 *
 * 직접 URL 진입은 캐시가 없어 스켈레톤이 뜬다. 이 승계 효과는 **목록에서 카드를 눌러야만**
 * 나타나므로, 실제로 클릭해서 들어간다. 상세 API 를 늦춰 승계 구간을 고정한 뒤 찍는다.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = join(process.cwd(), '.screenshots/loading-skeleton');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
const bad = [];
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/v1/')) bad.push(`${r.status()} ${r.url()}`); });

try {
  await page.goto(`${BASE}/team-matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const link = page.locator('a[href*="/team-matches/"]:visible').first();
  const href = await link.getAttribute('href');
  console.log('clicking', href);

  // 상세 API 를 6초 늦춘다 — 승계된 표시값만 보이는 구간을 고정한다.
  // unroute 로 끄면 이미 대기 중인 요청이 두 번 처리돼 터진다 — 플래그로 지연만 해제한다.
  let delayDetail = true;
  await page.route('**/api/v1/team-matches/**', async (route) => {
    if (delayDetail && route.request().url().match(/team-matches\/[0-9a-f-]{36}/)) {
      await new Promise((r) => setTimeout(r, 6000));
    }
    await route.continue();
  });

  await link.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '04-list-to-detail-seeded-mobile.png') });
  console.log('captured 04-list-to-detail-seeded-mobile');

  delayDetail = false;
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(OUT, '05-list-to-detail-loaded-mobile.png') });
  console.log('captured 05-list-to-detail-loaded-mobile');
} finally {
  if (bad.length) console.error('!! failed API responses:', bad);
  await browser.close();
}
