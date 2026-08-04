/**
 * 같은 화면을 **데이터 상태별**로 찍는다: 값이 다 있을 때 / 일부만 있을 때 / 하나도 없을 때.
 *
 * 화면을 한 번만 찍으면 그 순간의 데이터 상태 하나만 증명된다. 라인업·경기 기록처럼 값이
 * 핵심인 화면은 "값이 있을 때 제대로 그려지는가" 와 "값이 없을 때 빈 상태를 제대로 내는가",
 * 그리고 그 사이(부분만 채워진 상태)에서 무너지지 않는가가 전부 다른 질문이다.
 *
 * 상태는 DB 를 실제로 그렇게 만들어서 재현한다 — 화면을 속이는 게 아니라 데이터를 만든다.
 * 각 상태는 그 데이터를 볼 권한이 있는 실제 배우로 접속한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB = process.env.STATE_WEB_BASE ?? 'http://localhost:3013';
const OUT = process.env.STATE_OUT_DIR ?? 'scripts/qa/data-states';

/** 각 항목: 같은 화면 · 다른 데이터 상태 · 그 데이터를 볼 수 있는 배우. */
const CASES = JSON.parse(process.env.STATE_CASES ?? '[]');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clearTermsGate(page) {
  const agree = page.getByText('전체 동의', { exact: false }).first();
  if ((await agree.count()) === 0) return false;
  await agree.click();
  const cta = page.getByRole('button', { name: /동의하고 계속|계속|확인|시작|동의/ }).last();
  if ((await cta.count()) > 0) {
    await cta.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1000);
  }
  return true;
}

const records = [];
const browser = await chromium.launch();

try {
  for (const vp of VIEWPORTS) {
    for (const c of CASES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      const apiCalls = [];
      page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('response', (r) => {
        if (r.url().includes('/api/v1/')) apiCalls.push({ status: r.status(), path: r.url().replace(WEB, '') });
      });

      if (c.actor) {
        await page.goto(`${WEB}/matches`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.evaluate((email) => {
          localStorage.removeItem('teameet.v1.userId');
          localStorage.setItem('teameet.v1.userEmail', email);
        }, c.actor);
      }

      const response = await page
        .goto(`${WEB}${c.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
        .catch(() => null);
      await clearTermsGate(page);
      await sleep(2500);

      const dir = `${OUT}/${c.id}`;
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${vp.name}.png`, fullPage: true });

      records.push({
        caseId: c.id,
        screen: c.screen,
        dataState: c.state,
        actor: c.actor ?? 'public',
        viewport: vp.name,
        path: c.path,
        httpStatus: response?.status() ?? 0,
        pageErrors,
        consoleErrors,
        apiNon2xx: apiCalls.filter((a) => a.status >= 400),
        bodyText: (await page.locator('body').innerText().catch(() => ''))
          .replace(/\s+/g, ' ')
          .slice(0, 500),
      });
      const last = records[records.length - 1];
      console.log(
        `${vp.name.padEnd(8)} ${String(last.httpStatus).padEnd(4)} pe=${last.pageErrors.length} ` +
          `api=${last.apiNon2xx.length} ${c.id} [${c.state}] ${c.screen}`,
      );

      await page.close();
      await context.close();
    }
  }
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/state-observations.json`, JSON.stringify({ records }, null, 2), 'utf8');
const problems = records.filter(
  (r) => r.httpStatus !== 200 || r.pageErrors.length > 0 || r.apiNon2xx.length > 0,
);
console.log(`\ncaptured=${records.length} cases=${new Set(records.map((r) => r.caseId)).size} problems=${problems.length}`);
for (const p of problems) {
  console.log(`  ${p.caseId} ${p.viewport} http=${p.httpStatus} pe=${p.pageErrors.length} api=${p.apiNon2xx.map((a) => a.status).join(',')}`);
}
