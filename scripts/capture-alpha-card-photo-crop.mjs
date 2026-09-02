#!/usr/bin/env node
/** 선수 카드 사진 잘림 실측 -- player01(사진 있음) 카드의 렌더 박스·사진 배치·로딩 지표.
 *  자격증명은 환경변수로만(ALPHA_PASSWORD). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/photo-crop-0902';
if (!PW) { console.error('ALPHA_PASSWORD 필요'); process.exit(1); }

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  // getSetCookie 가 없는 Node 런타임(≤18.13)에서는 합쳐진 set-cookie 문자열에서 찾는다.
  const cookies = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? ''];
  const token = cookies.map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new Error(`${email} 로그인 실패 ${r.status}`);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id };
}

const p01 = await login('alpha.e2e.player01@teameet.test');
console.log('player01 userId', p01.userId);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function shot(url, file, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: p01.token, domain: new URL(BASE).hostname, path: '/' }]);
  const page = await ctx.newPage();
  const imgReq = [];
  page.on('response', (res) => { if (res.url().includes('/uploads/')) imgReq.push({ url: res.url(), status: res.status(), cc: res.headers()['cache-control'], len: res.headers()['content-length'] }); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.tm-player-card');
    const render = document.querySelector('.tm-pcard-render');
    const photo = document.querySelector('.tm-pcard-render-photo');
    const face = document.querySelector('.tm-pcard-face');
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cs = photo ? getComputedStyle(photo) : null;
    return {
      tier: card?.dataset.tier, shape: card?.dataset.shape, face: card?.dataset.face,
      faceRect: rect(face), renderRect: rect(render), photoRect: rect(photo),
      bgSize: cs?.backgroundSize, bgPos: cs?.backgroundPosition, bgImage: cs?.backgroundImage?.slice(0, 80),
      maskImage: (cs?.webkitMaskImage ?? cs?.maskImage)?.slice(0, 120),
    };
  });
  console.log(file, JSON.stringify(metrics, null, 1));
  console.log('  uploads 요청', JSON.stringify(imgReq));
  const card = page.locator('.tm-player-card').first();
  await card.screenshot({ path: `${OUT}/${file}` });
  console.log('찍음', `${OUT}/${file}`);
  await ctx.close();
}

await shot(`${BASE}/my`, 'my-p01-390.png', 390);
await shot(`${BASE}/users/${p01.userId}/card`, 'share-p01-390.png', 390);
await shot(`${BASE}/my`, 'my-p01-1440.png', 1440);
await browser.close();
