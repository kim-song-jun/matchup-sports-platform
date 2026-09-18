/**
 * alpha 로딩 상태 캡처 — PR #921(로딩 중 목업 제거 + 스켈레톤) 시각 검증용.
 *
 * 스켈레톤은 실제로는 순간적이라 그냥 열면 잡히지 않는다. 상세 API 응답만 골라
 * 지연시켜 로딩 구간을 고정한 뒤 찍는다(라우트 전환 셸은 페이지 진입 직후에 찍는다).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://alpha.teameet.co.kr';
const OUT = join(process.cwd(), '.screenshots/loading-skeleton');
const TEAM_MATCH_ID = process.argv[2];
if (!TEAM_MATCH_ID) throw new Error('usage: node scripts/capture-alpha-loading-states.mjs <teamMatchId>');

const WIDTHS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

const results = [];

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  results.push(name);
  console.log('captured', name);
}

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      userAgent: vp.key === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await context.newPage();

    // 응답 상태를 반드시 확인한다 — alpha 는 과한 캡처에 403 을 걸고, 그러면
    // "빈 화면"을 결함으로 오진한다.
    page.on('response', (res) => {
      if (res.url().endsWith('/team-matches') || res.url().includes(`/team-matches/${TEAM_MATCH_ID}`)) {
        if (res.status() >= 400) console.error('!! HTTP', res.status(), res.url());
      }
    });

    // (1) 목록
    await page.goto(`${BASE}/team-matches`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await shot(page, `01-list-${vp.key}`);

    // (2) 상세 — API 를 늦춰 로딩 구간을 고정한다
    await page.route(`**/api/v1/team-matches/${TEAM_MATCH_ID}*`, async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.continue();
    });
    await page.goto(`${BASE}/team-matches/${TEAM_MATCH_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await shot(page, `02-detail-loading-${vp.key}`);

    // (3) 상세 — 지연 해제 후 실데이터
    await page.unroute(`**/api/v1/team-matches/${TEAM_MATCH_ID}*`);
    await page.goto(`${BASE}/team-matches/${TEAM_MATCH_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, `03-detail-loaded-${vp.key}`);

    await context.close();
  }
} finally {
  await browser.close();
}

console.log('\ntotal', results.length, 'shots ->', OUT);
