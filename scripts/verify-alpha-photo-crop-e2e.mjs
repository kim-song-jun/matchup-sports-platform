#!/usr/bin/env node
/** 프로필 사진 크롭(#967) alpha E2E — 전신 사진을 올려 크롭 모달 → 저장 → 정사각 저장본 확인,
 *  카드가 next/image 로 줄여 받는지·캐시 헤더·갤러리(390/768/1440) 캡처.
 *  자격증명은 환경변수로만(ALPHA_PASSWORD). 대상 계정: player06(E2E 전용). */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PW = process.env.ALPHA_PASSWORD;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/photo-crop-0902';
if (!PW) { console.error('ALPHA_PASSWORD 필요'); process.exit(1); }

async function login(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const cookies = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? ''];
  const token = cookies.map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (!token) throw new Error(`${email} 로그인 실패 ${r.status}`);
  const me = await (await fetch(`${BASE}/api/v1/auth/me`, { headers: { cookie: `teameet_v1_session=${token}` } })).json();
  return { token, userId: me.data.user.id };
}

// 전신 세로 사진(900×1200) — 얼굴이 위 18% 에 작게. 실제 폰 사진의 전형.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc4e8"/><stop offset="1" stop-color="#dfeaf3"/></linearGradient></defs>
<rect width="900" height="1200" fill="url(#g)"/><rect y="744" width="900" height="456" fill="#3f8f4a"/>
<rect x="345" y="271" width="210" height="1200" rx="38" fill="#e8503a"/><rect x="387" y="426" width="126" height="1200" fill="#2b3446"/>
<circle cx="450" cy="215" r="62" fill="#f2c9a0"/><path d="M388 205 a62 62 0 0 1 124 0 v-15 a62 62 0 0 0 -124 0z" fill="#1f1a17"/></svg>`;

await mkdir(OUT, { recursive: true });
const p06 = await login('alpha.e2e.player06@teameet.test');
const browser = await chromium.launch();

// SVG → PNG (업로드용 실제 이미지 파일)
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0">${SVG}</body>`);
  await page.screenshot({ path: `${OUT}/upload-source-900x1200.png`, clip: { x: 0, y: 0, width: 900, height: 1200 } });
  await ctx.close();
}

async function ctxFor(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: p06.token, domain: new URL(BASE).hostname, path: '/' }]);
  return ctx;
}

// ① 프로필 수정에서 업로드 → 크롭 모달 → 확인 → 저장
console.log('① 업로드 → 크롭 → 저장 (390)');
{
  const ctx = await ctxFor(390);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/profile/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#v1-profile-edit-form', { timeout: 20000 });
  await page.setInputFiles('input[type=file]', `${OUT}/upload-source-900x1200.png`);
  const dialog = page.locator('[role=dialog]');
  await dialog.waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/crop-modal-390.png` });
  console.log('  크롭 모달 제목:', await dialog.locator('.tm-photo-crop-head').innerText());
  const [uploadRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/uploads') && r.request().method() === 'POST', { timeout: 30000 }),
    dialog.getByRole('button', { name: '이 사진으로 할게요' }).click(),
  ]);
  const uploadBody = await uploadRes.json();
  const uploadedUrl = uploadBody.data?.urls?.[0];
  console.log('  업로드 응답', uploadRes.status(), uploadedUrl);
  if (typeof uploadedUrl !== 'string' || !uploadedUrl.startsWith('/uploads/')) {
    throw new Error(`업로드 응답에 /uploads URL 이 없다: ${JSON.stringify(uploadBody).slice(0, 300)}`);
  }
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  await page.screenshot({ path: `${OUT}/profile-edit-after-crop-390.png` });
  const [patchRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/me/profile') && r.request().method() === 'PATCH', { timeout: 30000 }),
    page.locator('button[type=submit][form=v1-profile-edit-form]').click(),
  ]);
  const patched = await patchRes.json();
  console.log('  저장 응답', patchRes.status(), patched.data?.profile?.profileImageUrl, 'realName=', patched.data?.profile?.realName, 'birthDate=', patched.data?.profile?.birthDate);
  // 저장본 검사: 정사각 768 인지 + 캐시 헤더. 크기는 브라우저가 디코드한 naturalWidth 로 본다(OS 의존 없음).
  const img = await fetch(`${BASE}${uploadedUrl}`);
  const buf = Buffer.from(await img.arrayBuffer());
  await writeFile(`${OUT}/saved-profile-photo${uploadedUrl.slice(uploadedUrl.lastIndexOf('.'))}`, buf);
  console.log('  저장 파일', img.headers.get('content-type'), buf.length, 'bytes; cache-control:', img.headers.get('cache-control'));
  const dims = await page.evaluate(async (url) => {
    const el = new Image();
    await new Promise((resolve, reject) => { el.onload = resolve; el.onerror = () => reject(new Error('저장본 디코드 실패')); el.src = url; });
    return { width: el.naturalWidth, height: el.naturalHeight };
  }, `${BASE}${uploadedUrl}`);
  console.log('  저장본 크기', `${dims.width}x${dims.height}`);
  if (dims.width !== 768 || dims.height !== 768) throw new Error(`저장본이 768² 가 아니다: ${dims.width}x${dims.height}`);
  await ctx.close();
}

// ② 카드·설정·크롭 모달 갤러리 + next/image 실측
for (const width of [390, 768, 1440]) {
  const ctx = await ctxFor(width);
  const page = await ctx.newPage();
  const uploads = [];
  page.on('response', (r) => { if (r.url().includes('/_next/image') || r.url().includes('/uploads/')) uploads.push({ url: r.url().slice(0, 120), status: r.status(), cc: r.headers()['cache-control'], len: r.headers()['content-length'], type: r.headers()['content-type'] }); });
  await page.goto(`${BASE}/my`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tm-player-card', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const img = document.querySelector('.tm-pcard-render-photo img');
    const wrap = document.querySelector('.tm-pcard-render-photo');
    const cs = img ? getComputedStyle(img) : null;
    return { src: img?.getAttribute('src')?.slice(0, 100), sizes: img?.getAttribute('sizes'), loaded: wrap?.dataset.loaded, opacity: cs?.opacity, objectPosition: cs?.objectPosition, natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null };
  });
  console.log(`[${width}] 카드 사진`, JSON.stringify(m));
  console.log(`[${width}] 이미지 요청`, JSON.stringify(uploads));
  await page.locator('.tm-player-card').first().screenshot({ path: `${OUT}/my-card-${width}.png` });
  await page.screenshot({ path: `${OUT}/my-page-${width}.png`, fullPage: false });

  await page.goto(`${BASE}/my/settings/player-card`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '사진 위치 맞추기' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/settings-player-card-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: '사진 위치 맞추기' }).click();
  await page.locator('[role=dialog]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/settings-recrop-modal-${width}.png` });
  await ctx.close();
}
await browser.close();
