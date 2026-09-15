#!/usr/bin/env node
/**
 * 사진 업로드 수정(#726) 실측 -- alpha 프로필 수정 화면에서 2MB 를 훌쩍 넘는 사진을
 * 실제 input 에 넣고, 클라이언트가 자동 축소·WebP 변환해 업로드에 성공하는지 본다.
 *
 * 큰 이미지는 페이지 안에서 캔버스 노이즈로 생성한다(3000x3000 JPEG q1.0 ≈ 수 MB) --
 * 실제 change 이벤트를 그대로 태우므로 선택 핸들러 → 압축 → POST /uploads 전 구간이
 * 실코드 경로다. 자격증명은 환경변수로만(ALPHA_PASSWORD, ALPHA_ACCOUNT).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const { ALPHA_PASSWORD: PW, ALPHA_ACCOUNT: ACC } = process.env;
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards/photo-upload-0825';
if (!PW || !ACC) { console.error('ALPHA_PASSWORD / ALPHA_ACCOUNT 필요'); process.exit(1); }

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: ACC, password: PW }),
});
const token = (res.headers.getSetCookie?.() ?? []).map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1]).find(Boolean);
if (!token) throw new Error(`로그인 실패 ${res.status}`);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/my/profile/edit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type=file]', { timeout: 20000 });

const uploadResponsePromise = page.waitForResponse(
  (r) => r.url().includes('/uploads') && r.request().method() === 'POST',
  { timeout: 45000 },
);

// 페이지 안에서 대용량 JPEG 를 만들어 실제 input change 로 태운다.
const originalBytes = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 3000; canvas.height = 3000;
  const g = canvas.getContext('2d');
  const img = g.createImageData(3000, 3000);
  for (let i = 0; i < img.data.length; i += 1) img.data[i] = Math.floor(Math.random() * 256);
  g.putImageData(img, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 1.0));
  const file = new File([blob], 'huge-photo.jpg', { type: 'image/jpeg' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('input[type=file]');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return blob.size;
});
console.log('원본 크기:', (originalBytes / 1024 / 1024).toFixed(2), 'MB (2MB 초과 =', originalBytes > 2 * 1024 * 1024, ')');

const uploadResponse = await uploadResponsePromise;
const sentBytes = Number(uploadResponse.request().headers()['content-length'] ?? 0);
const body = await uploadResponse.json().catch(() => null);
const url = body?.data?.urls?.[0] ?? body?.urls?.[0] ?? null;
console.log('업로드 상태:', uploadResponse.status());
console.log('전송 크기:', sentBytes ? (sentBytes / 1024 / 1024).toFixed(2) + ' MB' : '(헤더 없음)');
console.log('업로드 URL:', url);
console.log('WebP 변환 여부:', typeof url === 'string' && url.endsWith('.webp'));

await page.waitForTimeout(1200);
const errorText = await page.locator('text=/이미지|사진/').allInnerTexts().catch(() => []);
console.log('화면 관련 문구:', JSON.stringify(errorText.slice(0, 4)));
await page.screenshot({ path: `${OUT}/profile-edit-after-upload.png`, fullPage: false });
console.log('찍음', `${OUT}/profile-edit-after-upload.png`);
await browser.close();

if (uploadResponse.status() !== 200 && uploadResponse.status() !== 201) process.exit(1);
