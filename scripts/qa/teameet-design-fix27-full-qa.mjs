// Headless QA for Teameet Design prototype fix27.
// Renders the prototype, walks every section/artboard, and asserts integrity.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix27';
const OUT_DIR = 'output/playwright';
const ARTIFACT_PATH = path.join(OUT_DIR, 'teameet-design-fix27-full-qa.json');
const SCREENSHOT_TARGETS = [
  { id: 'dev-route-manifest', file: 'teameet-design-fix27-dev-route-manifest.png' },
  { id: 'dev-bottom-nav', file: 'teameet-design-fix27-dev-bottom-nav.png' },
  { id: 'dev-token-alignment', file: 'teameet-design-fix27-dev-token-alignment.png' },
  { id: 'dev-component-extraction', file: 'teameet-design-fix27-dev-component-extraction.png' },
  { id: 'dev-page-priority', file: 'teameet-design-fix27-dev-page-priority.png' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleEvents = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    consoleEvents.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  // Babel + JSX takes a beat after network idle to mount everything.
  await page.waitForFunction(() => document.querySelectorAll('[data-dc-section]').length > 20, { timeout: 60000 });
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-dc-section]'));
    const artboards = Array.from(document.querySelectorAll('[data-dc-slot]'));
    const sectionIds = sections.map((el) => el.getAttribute('data-dc-section'));
    const slotIds = artboards.map((el) => el.getAttribute('data-dc-slot'));
    const dupCount = {};
    for (const id of slotIds) dupCount[id] = (dupCount[id] || 0) + 1;
    const duplicateSlots = Object.entries(dupCount).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));

    const has00k = sectionIds.includes('design-system-foundation');
    const has00l = sectionIds.includes('dev-handoff');
    const has00m = sectionIds.includes('dev-handoff-2');

    const devHandoff1Ids = ['dev-token-map','dev-component-map','dev-page-waves','dev-qa-gates'];
    const devHandoff2Ids = ['dev-route-manifest','dev-bottom-nav','dev-token-alignment','dev-component-extraction','dev-page-priority'];
    const devHandoff1 = artboards.filter((el) => devHandoff1Ids.includes(el.getAttribute('data-dc-slot')));
    const devHandoff2 = artboards.filter((el) => devHandoff2Ids.includes(el.getAttribute('data-dc-slot')));

    const tmButtons = document.querySelectorAll('.tm-btn').length;
    const tmChips = document.querySelectorAll('.tm-chip').length;
    const tmPressables = document.querySelectorAll('.tm-pressable').length;

    // Look for accidentally-rendered legacy/dark slots.
    // Whitelist: '00l' dev-handoff-1 board ids that intentionally render an example.
    const darkSlots = [];
    const allowAdminSidebar = (el) => {
      // Admin sidebar exception — anything inside .tm-admin-sidebar is allowed dark.
      let cur = el;
      while (cur && cur !== document.body) {
        if (cur.classList && cur.classList.contains('tm-admin-sidebar')) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    for (const el of artboards) {
      const cls = el.className || '';
      const style = el.getAttribute('style') || '';
      const looksDark = cls.includes('dark') || /background-color:\s*#0|background:\s*#0|background:\s*rgb\(0,/i.test(style);
      if (looksDark && !allowAdminSidebar(el)) {
        darkSlots.push(el.getAttribute('data-dc-slot'));
      }
    }

    // Suspicious leaf text clipping — height clamp + ellipsis + overflow hidden combinations.
    let suspiciousCount = 0;
    for (const el of document.querySelectorAll('div[style], span[style]')) {
      const style = el.getAttribute('style') || '';
      if (style.includes('overflow') && style.includes('text-overflow') && style.includes('white-space')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 60 && rect.height < 30 && el.textContent && el.textContent.trim().length > 12) {
          suspiciousCount++;
        }
      }
    }

    return {
      sectionCount: sections.length,
      artboardCount: artboards.length,
      has00k,
      has00l,
      has00m,
      devHandoff1Boards: devHandoff1.length,
      devHandoff2Boards: devHandoff2.length,
      tmButtonCount: tmButtons,
      tmChipCount: tmChips,
      tmPressableCount: tmPressables,
      duplicateSlots,
      darkSlots,
      suspiciousCount,
    };
  });

  // Capture screenshots for the new fix27 boards.
  const screenshots = [];
  for (const target of SCREENSHOT_TARGETS) {
    const node = await page.$(`[data-dc-slot="${target.id}"]`).catch(() => null);
    if (!node) continue;
    const dest = path.join(OUT_DIR, target.file);
    await node.screenshot({ path: dest });
    screenshots.push(dest);
  }

  const unexpectedConsole = consoleEvents.filter((e) => {
    if (e.type !== 'error' && e.type !== 'warning') return false;
    if (/babel.*standalone.*development|Browser stand-alone|preset-env.*production/i.test(e.text)) return false;
    if (/in-browser Babel transformer.*precompile/i.test(e.text)) return false;
    return true;
  });

  const pass =
    pageErrors.length === 0 &&
    unexpectedConsole.length === 0 &&
    metrics.duplicateSlots.length === 0 &&
    metrics.darkSlots.length === 0 &&
    metrics.has00l &&
    metrics.has00m &&
    metrics.devHandoff1Boards === 4 &&
    metrics.devHandoff2Boards === 5;

  const artifact = {
    url: URL,
    pass,
    metrics,
    pageErrors,
    unexpectedConsole,
    screenshots,
  };

  await writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify(artifact, null, 2));

  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
