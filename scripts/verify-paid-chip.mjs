import { chromium } from 'playwright';
const BASE = 'https://alpha.teameet.co.kr';
const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
});
const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
const token = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session=')).split(';')[0].split('=').slice(1).join('=');
const list = await fetch(`${BASE}/api/v1/admin/tournaments?limit=5`, { headers: { cookie: `teameet_v1_session=${token}` } }).then((r) => r.json());
const id = list.data.items[0]?.id;
console.log('tournament:', id ? '확보' : '없음');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' }]);
await ctx.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
const page = await ctx.newPage();
await page.goto(`${BASE}/admin/tournaments/${id}/registrations`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const paid = await page.getByRole('button', { name: /결제 완료/ }).count();
console.log(JSON.stringify({ check: 'b2-registrations-paid-chip', count: paid, verdict: paid > 0 ? 'PASS' : 'FAIL' }));
await page.screenshot({ path: '.capture/admin-diet-b234/registrations-1440.png' });
await browser.close();
