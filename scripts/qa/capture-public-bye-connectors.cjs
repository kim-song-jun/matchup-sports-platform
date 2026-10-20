/* Read-only alpha evidence; run before/after deployment with the same tournament. */
const { chromium } = require('@playwright/test');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function main() {
  const [url, output] = process.argv.slice(2);
  if (!url || new URL(url).origin !== 'https://alpha.teameet.co.kr' || !output) {
    throw new Error('Usage: node scripts/qa/capture-public-bye-connectors.cjs <alpha bracket URL> <output directory>');
  }
  await mkdir(output, { recursive: true });
  const server = await chromium.launchServer({ headless: false });
  const browserPid = server.process().pid;
  console.log(execFileSync('ps', ['-o', 'pid,ppid,args', '-p', String(browserPid)], { encoding: 'utf8' }));
  const evidence = { url, persona: 'anonymous', browserPid, parentPid: process.pid, viewports: [] };
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [], pageErrors = [], failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
      await page.getByRole('region', { name: '12강 부전승', exact: true }).first().waitFor();
      const svg = page.getByRole('img', { name: '경기별 진출 연결선', exact: true });
      await svg.waitFor();
      const titles = await svg.locator('path title').allTextContents();
      const screenshot = `${width}.png`;
      await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
      evidence.viewports.push({ width, screenshot, byeCards: await page.getByRole('region', { name: '12강 부전승', exact: true }).count(), byeConnections: titles.filter(title => title.startsWith('부전승 →')), connections: titles });
    }
    Object.assign(evidence, { consoleErrors, pageErrors, failedResponses });
    await context.close();
    await browser.close();
  } finally {
    await server.close();
    evidence.browserClosed = true;
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
