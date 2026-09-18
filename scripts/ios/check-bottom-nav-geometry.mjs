// Does changing the tab bar's padding move anything that was positioned against its height?
//
// .tm-scroll-area and .tm-floating-fab both reserve space with
// calc(--v1-shell-bottom-nav-height + --v1-shell-safe-bottom). If the bar's real height stops
// matching that reservation, content either overlaps the bar or leaves a dead strip above it.
// Android commits 30f779e7e and 87c6b8596 tuned exactly this, so the check runs at the inset
// values Android actually produces as well as at iOS's.
import { chromium } from 'playwright';

const PATCH = '.tm-bottom-nav { padding-bottom: max(16px, var(--v1-shell-safe-bottom)) !important; }';
const INSETS = process.env.INSETS?.split(',') ?? ['0px', '24px', '34px', '48px'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('https://alpha.teameet.co.kr/home', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

async function geometry(inset) {
  await page.evaluate((v) => {
    document.documentElement.style.setProperty('--teameet-native-safe-bottom', v);
    document.documentElement.style.setProperty('--v1-shell-safe-bottom', v);
  }, inset);
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const h = window.innerHeight;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: +r.top.toFixed(1), height: +r.height.toFixed(1), gap: +(h - r.bottom).toFixed(1) };
    };
    const nav = document.querySelector('.tm-bottom-nav');
    return {
      navHeight: box('.tm-bottom-nav')?.height ?? null,
      navPaddingBottom: nav ? getComputedStyle(nav).paddingBottom : null,
      navTop: box('.tm-bottom-nav')?.top ?? null,
      scrollAreaBottomGap: box('.tm-scroll-area')?.gap ?? null,
      fabBottomGap: box('.tm-floating-fab')?.gap ?? null,
      // What a reader actually sees move: the tab label inside the bar.
      labelBottomGap: box('.tm-bottom-nav a, .tm-bottom-nav button')?.gap ?? null,
    };
  });
}

for (const inset of INSETS) {
  const before = await geometry(inset);
  const handle = await page.addStyleTag({ content: PATCH });
  await page.waitForTimeout(250);
  const after = await geometry(inset);
  await handle.evaluate((el) => el.remove());
  await page.waitForTimeout(250);
  const same = (k) => (before[k] === after[k] ? 'same' : `${before[k]} -> ${after[k]}`);
  console.log(`inset ${inset.padStart(5)}  padding ${String(before.navPaddingBottom).padStart(5)} -> ${String(after.navPaddingBottom).padStart(5)}` +
    `  | navHeight ${same('navHeight').padEnd(14)} | navTop ${same('navTop').padEnd(14)}` +
    ` | scrollArea gap ${same('scrollAreaBottomGap').padEnd(10)} | fab gap ${String(same('fabBottomGap')).padEnd(10)}` +
    ` | tab label gap ${same('labelBottomGap')}`);
}
await browser.close();
