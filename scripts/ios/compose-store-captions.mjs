#!/usr/bin/env node
// Puts the marketing headline on the first few App Store screenshots.
//
// The store page shows the first two or three images before a reader scrolls, so those carry
// a line of copy; the rest stay as plain screens (decision D4-C). The captioned frames are
// rendered rather than drawn: a browser gives the app's own typeface and colour tokens, so a
// caption looks like it came from the product instead of from a graphics tool.
//
// Input is whatever `capture-store-screenshots.sh` produced. Output goes to `captioned/`
// beside it, at the same pixel size, and is checked for the alpha channel App Store Connect
// refuses — checked rather than stripped, for the reason spelled out in that script.
//
// Usage: node scripts/ios/compose-store-captions.mjs <directory of raw shots>
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');

// Only what the screen behind it actually shows. A claim the reviewer cannot find in the app
// is a 2.3 (accurate metadata) rejection, and it is the cheapest kind to avoid.
const CAPTIONS = {
  '01-home': { lead: '오늘 뛸 경기를', accent: '홈에서 바로', sub: '추천 매치·대회와 내 활동을 한 화면에' },
  '02-matches': { lead: '가까운 매치를', accent: '골라서 신청', sub: '종목·지역·시간으로 좁혀 보기' },
  '03-tournaments': { lead: '대진부터 결과까지', accent: '대회 한곳에서', sub: '조 편성·순위·기록을 경기 중에도' },
};

const WIDTH = 1320;
const HEIGHT = 2868;

const font = readFileSync(path.join(ROOT, 'apps/v1_web/public/fonts/PretendardVariable.woff2'));

// Chromium refuses a cross-origin font on a file:// page, and the screenshots have to be
// inlined for the same reason — so both travel as data URIs.
const page = (shot, caption) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  @font-face {
    font-family: "Pretendard Variable";
    src: url(data:font/woff2;base64,${font.toString('base64')}) format("woff2");
    font-weight: 45 920;
  }
  :root {
    --blue50: #e8f3ff; --blue600: #2272eb;
    --grey50: #f9fafb; --grey600: #6b7684; --grey900: #191f28;
  }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    font-family: "Pretendard Variable", -apple-system, sans-serif;
    /* The wash starts in the brand's own blue tint and settles into the app's page grey, so
       the frame reads as an extension of the screenshot rather than a poster behind it. */
    background: linear-gradient(180deg, var(--blue50) 0%, var(--grey50) 58%);
    display: flex; flex-direction: column; align-items: center;
  }
  .copy { padding: 150px 96px 0; text-align: center; }
  h1 {
    font-size: 96px; font-weight: 700; line-height: 1.24;
    letter-spacing: -0.03em; color: var(--grey900); text-wrap: balance;
  }
  h1 em { font-style: normal; color: var(--blue600); }
  p { margin-top: 32px; font-size: 46px; font-weight: 500; color: var(--grey600); }
  /* The shot runs off the bottom edge: the store crops nothing, and a screen that continues
     past the frame reads as a live app rather than a pasted rectangle. */
  .shot {
    margin-top: 96px; width: 1044px; border-radius: 64px;
    border: 1px solid rgba(25, 31, 40, 0.08);
    box-shadow: 0 48px 96px rgba(25, 31, 40, 0.16);
  }
</style></head><body>
  <div class="copy">
    <h1>${caption.lead}<br><em>${caption.accent}</em></h1>
    <p>${caption.sub}</p>
  </div>
  <img class="shot" src="data:image/png;base64,${shot.toString('base64')}" alt="">
</body></html>`;

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node scripts/ios/compose-store-captions.mjs <directory of raw shots>');
  process.exit(2);
}

const outputDirectory = path.join(directory, 'captioned');
mkdirSync(outputDirectory, { recursive: true });

const shots = readdirSync(directory).filter((name) => name.endsWith('.png')).sort();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

const COLOR_TYPES = { 0: 'grey', 2: 'rgb', 3: 'palette', 4: 'grey+alpha', 6: 'rgba' };
/** The two portrait sizes App Store Connect accepts for a 6.9" display. */
const ACCEPTED_SIZES = new Set(['1290x2796', '1320x2868']);

let captioned = 0;
const rejected = [];
for (const name of shots) {
  const caption = CAPTIONS[path.basename(name, '.png')];
  if (!caption) continue;

  const view = await context.newPage();
  await view.setContent(page(readFileSync(path.join(directory, name)), caption), { waitUntil: 'load' });
  await view.evaluate(() => document.fonts.ready);
  const target = path.join(outputDirectory, name);
  await view.screenshot({ path: target });
  await view.close();

  // Width, height and colour type are all in the PNG's first chunk.
  const header = readFileSync(target).subarray(16, 26);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const colorType = header.readUInt8(9);
  console.log(`${name}  ${width} ${height}  ${COLOR_TYPES[colorType] ?? colorType}`);
  if (colorType === 4 || colorType === 6) rejected.push(`${name} (alpha channel)`);
  if (!ACCEPTED_SIZES.has(`${width}x${height}`)) {
    rejected.push(`${name} (${width}x${height} is not a 6.9" size)`);
  }
  captioned += 1;
}

await browser.close();

if (rejected.length > 0) {
  console.error(`\nApp Store Connect will refuse these:\n  ${rejected.join('\n  ')}`);
  process.exit(1);
}
console.log(`\n${captioned} captioned in ${outputDirectory}`);
