// 포맷 분기 검증 — league(순위만)/knockout(브래킷만)/group_knockout(둘다). 끝에 group_knockout 복원.
import { chromium } from '@playwright/test';
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const TID = 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const api = (m, p, b) =>
  fetch('http://localhost:8121/api/v1' + p, {
    method: m,
    headers: { 'content-type': 'application/json', 'x-v1-user-id': ADMIN.id, 'x-v1-user-email': ADMIN.email },
    body: b ? JSON.stringify(b) : undefined,
  }).then((r) => r.json());

const browser = await chromium.launch();
async function check(fmt) {
  await api('PATCH', '/admin/tournaments/' + TID, { format: fmt });
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(([i]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', 'x'); }, ['0cf89db6-3e53-406c-b896-89ade09add9a']);
  const p = await c.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 70)); });
  await p.goto('http://localhost:3013/tournaments/' + TID, { waitUntil: 'networkidle', timeout: 40000 });
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => document.body.innerText);
  console.log(`${fmt.padEnd(16)} | 순위표(승점): ${t.includes('승점') ? 'O' : '-'} | 브래킷(우승): ${t.includes('우승') ? 'O' : '-'} | 4강: ${t.includes('4강') ? 'O' : '-'} | errs: ${errs.length}`);
  await c.close();
}
await check('league');
await check('knockout');
await check('group_knockout');
await browser.close();
