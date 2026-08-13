/**
 * 순위·브래킷 화면의 기본 탭 변경(경기 일정 우선) 시각 검증용 캡처.
 * alpha 실배포 화면만 대상으로 한다(로컬 next 서버 사용 금지 — 프로젝트 규칙).
 *
 * 사용: node scripts/capture-bracket-default-tab.mjs <label:before|after> <outDir>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [, , label = 'after', outDir = 'docs/visual-qa/bracket-default-schedule-tab'] = process.argv;

const BASE = 'https://alpha.teameet.co.kr';
const TOURNAMENT_ID = 'aa100000-0000-4000-8000-000000000004'; // (테스트) 현재 경기 중 챔피언십
const URL = `${BASE}/tournaments/${TOURNAMENT_ID}/bracket`;
const WIDTHS = [
  { name: 'mobile-390', width: 390, height: 900 },
  { name: 'tablet-768', width: 768, height: 1000 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const size of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  // networkidle은 쓰지 않는다 — 이 화면은 LIVE 픽스처가 있으면 8초 주기로 폴링해서
  // 네트워크가 조용해지는 순간이 오지 않는다(실측: 60s 타임아웃).
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('[role="tablist"][aria-label="보기 방식"]', { timeout: 30_000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);

  // 렌더된 실제 DOM에서 탭 계약을 읽는다 — 육안 대조가 아니라 computed 값으로 판정.
  const tabState = await page.evaluate(() => {
    const list = document.querySelector('[role="tablist"][aria-label="보기 방식"]');
    const tabs = Array.from(list?.querySelectorAll('[role="tab"]') ?? []);
    return {
      order: tabs.map((t) => t.textContent?.trim()),
      selected: tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.textContent?.trim() ?? null,
      headingsVisible: Array.from(document.querySelectorAll('h2, h3'))
        .map((h) => h.textContent?.trim())
        .filter(Boolean)
        .slice(0, 6),
    };
  });

  const file = `${outDir}/${label}-${size.name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  results.push({ size: size.name, status: response?.status(), file, ...tabState });
  await context.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
