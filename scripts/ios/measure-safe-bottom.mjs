// How many times the page applies the shell's bottom inset.
//
// The shell writes --teameet-native-safe-bottom once. If the rendered gap moves by that
// amount the page consumes it once; if it moves by twice, some surface adds it on top of a
// container that already reserved it. Measured against the deployed web app so no local
// server is involved.
import { chromium } from 'playwright';

const ORIGIN = process.env.MEASURE_ORIGIN ?? 'https://alpha.teameet.co.kr';
const PATH = process.env.MEASURE_PATH ?? '/home';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(ORIGIN + PATH, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

async function measure(inset) {
  await page.evaluate((v) => {
    document.documentElement.style.setProperty('--teameet-native-safe-bottom', v);
    document.documentElement.style.setProperty('--v1-shell-safe-bottom', v);
  }, inset);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const h = window.innerHeight;
    const out = {};
    for (const sel of ['.tm-bottom-nav', '.floating-bottom-nav', '.glass-mobile-nav', '.tm-scroll-area']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[sel] = {
        boxBottomGap: +(h - r.bottom).toFixed(1),
        height: +r.height.toFixed(1),
        paddingBottom: cs.paddingBottom,
        bottom: cs.bottom,
      };
    }
    return out;
  });
}

if (process.env.MEASURE_SHOT) {
  await measure('34px');
  await page.screenshot({ path: process.env.MEASURE_SHOT });
  await browser.close();
  process.exit(0);
}

const zero = await measure('0px');
const thirty = await measure('34px');
console.log(JSON.stringify({ zero, thirty }, null, 2));
for (const sel of Object.keys(thirty)) {
  const a = zero[sel], b = thirty[sel];
  if (!a) continue;
  console.log(
    `${sel}: box bottom gap ${a.boxBottomGap} -> ${b.boxBottomGap} (Δ${(b.boxBottomGap - a.boxBottomGap).toFixed(1)}), ` +
    `height ${a.height} -> ${b.height} (Δ${(b.height - a.height).toFixed(1)}), ` +
    `padding-bottom ${a.paddingBottom} -> ${b.paddingBottom}`);
}
await browser.close();
