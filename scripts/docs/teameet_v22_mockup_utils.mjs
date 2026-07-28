import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
export const OUT = path.join(FLOW, 'pages');
export const EVIDENCE = path.join(FLOW, 'evidence');
export const OMO_EV = path.join(ROOT, '.omo/evidence');

mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(OMO_EV, { recursive: true });

export const variants = [
  { key: 'a', label: 'A 토스 클린', tone: 'clean' },
  { key: 'b', label: 'B 포커스', tone: 'focus' },
  { key: 'c', label: 'C 컴팩트', tone: 'compact' },
  { key: 'd', label: 'D 라운드', tone: 'round' },
];

export const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
export const row = (title, sub = '', options = {}) => {
  const { trail = '>', tone = '' } = options;
  return `<div class="row"><div class="main"><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}</div><span class="trail ${tone}">${trail}</span></div>`;
};
export const section = (title, body, action = '') => `<section class="section"><div class="head"><h2>${title}</h2>${action ? `<span>${action}</span>` : ''}</div><div class="group">${body}</div></section>`;
export const top = (title, action = '') => `<header class="top"><button>뒤로</button><strong>${title}</strong><button>${action}</button></header>`;

export function dim(file) {
  const buf = readFileSync(file);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

const data = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;

function clearOwned(screens, prefixes) {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && prefixes.some((prefix) => name.startsWith(prefix)) && !expected.has(name)) {
      rmSync(path.join(OUT, name));
    }
  }
}

async function renderScreen(browser, screen, variant, css) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title}</title><style>${css}</style></head><body>${screen.render(variant)}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  const file = path.join(OUT, outputName(screen, variant));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

async function renderSheet(browser, screens, contactName) {
  const items = screens.flatMap((screen) => variants.map((variant) => ({
    label: `${screen.id} ${screen.title} · ${variant.label}`,
    src: data(path.join(OUT, outputName(screen, variant))),
  })));
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ko"><style>body{margin:0;background:white;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;background:#fff}</style><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></html>`);
  const file = path.join(EVIDENCE, contactName);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

export async function renderBatch({ screens, prefixes, css, contactName, verificationName, summary }) {
  clearOwned(screens, prefixes);
  const browser = await chromium.launch();
  const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderScreen(browser, screen, variant, css))));
  const sheet = await renderSheet(browser, screens, contactName);
  await browser.close();
  const rows = files.sort().map((file) => `| ${path.relative(ROOT, file)} | ${dim(file)} | ${statSync(file).size} |`).join('\n');
  writeFileSync(path.join(OMO_EV, verificationName), `${summary}\n\n| Artifact | Dimensions | Bytes |\n| --- | ---: | ---: |\n${rows}\n| ${path.relative(ROOT, sheet)} | ${dim(sheet)} | ${statSync(sheet).size} |\n`);
  console.log(`rendered ${files.length} png files`);
  console.log(sheet);
}
