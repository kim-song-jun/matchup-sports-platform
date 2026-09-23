import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT_DIR = 'scripts/.tmp-backnav-shots';
mkdirSync(OUT_DIR, { recursive: true });

const CASES = [
  {
    name: 'match',
    from: '/my/matches/joined',
    detail: '/matches/9ac6c3c7-b672-441e-9a43-4e3242cbe21f',
    backSelector: 'a.tm-btn-icon.tm-hide-desktop, a.tm-hero-button.tm-hide-desktop',
  },
  {
    name: 'team-match',
    from: '/teams/ad300000-0000-4000-8000-000000000001',
    detail: '/team-matches/fca61840-f448-43f5-ae21-e2355ad6f6e1',
    backSelector: 'a.tm-hero-button:not(.tm-show-desktop)',
  },
  {
    name: 'tournament',
    from: '/home',
    detail: '/tournaments/04b7578c-d42b-4e1e-9e5b-94f49e9594ff',
    backSelector: 'header a, a[aria-label="뒤로가기"]',
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

for (const c of CASES) {
  const url = `https://alpha.teameet.co.kr${c.detail}?from=${encodeURIComponent(c.from)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/before-${c.name}-detail.png` });

  const backLink = page.locator('a[aria-label="뒤로가기"]').first();
  await backLink.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT_DIR}/before-${c.name}-landed.png` });
  console.log(`${c.name}: landed at ${new URL(page.url()).pathname} (expected ${c.from})`);
}

await browser.close();
