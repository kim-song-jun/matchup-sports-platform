import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [url, output] = process.argv.slice(2);
if (!url || new URL(url).origin !== 'https://alpha.teameet.co.kr' || !output) throw new Error('Usage: node script <alpha URL> <output directory>');
await mkdir(output, { recursive: true });
const server = await chromium.launchServer({ channel: 'chrome', headless: false });
console.log(JSON.stringify({ browserPid: server.process().pid, parentPid: process.pid }));
try {
  const browser = await chromium.connect(server.wsEndpoint());
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '순위 · 대진표', exact: true }).click();
    await page.getByRole('region', { name: '결선 대진표', exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole('region', { name: '12강 부전승', exact: true }).first().waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(output, `${width}.png`), fullPage: true });
  }
  await writeFile(path.join(output, 'errors.json'), JSON.stringify(errors, null, 2));
  console.log(JSON.stringify({ viewports: [390, 768, 1440], errors }));
  await browser.close();
} finally {
  await server.close();
}
