// public/brand/teameet-mark.png 의 알파만 옮긴 무손실 WebP(public/brand/teameet-mark-mask.webp)를 만든다.
// 선수 카드 CSS 마스크는 알파만 쓰므로 RGB 는 검정으로 채운다. 원본을 바꾸면 이 스크립트를 다시 돌리고
// src/app/globals.test.ts 의 해시 두 개를 출력값으로 고친다.  실행: node apps/v1_web/scripts/build-brand-mask.mjs
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// sharp 는 v1_web 의 직접 의존성이 아니라 next 가 함께 설치하는 것을 쓴다(이미지 최적화용 optional 의존성).
let sharp;
try {
  sharp = require(require.resolve('sharp', { paths: [path.dirname(require.resolve('next/package.json'))] }));
} catch (err) {
  throw new Error('next 가 설치한 sharp 를 찾지 못했어요 — 저장소 루트에서 pnpm install 을 실행한 뒤 다시 돌려 주세요.', { cause: err });
}

const source = path.join(appDir, 'public/brand/teameet-mark.png');
const target = path.join(appDir, 'public/brand/teameet-mark-mask.webp');
const { width, height } = await sharp(source).metadata();
const alpha = await sharp(source).extractChannel(3).raw().toBuffer();
const mask = await sharp({ create: { width, height, channels: 3, background: '#000' } })
  .joinChannel(alpha, { raw: { width, height, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
const roundTrip = await sharp(mask).extractChannel(3).raw().toBuffer();
if (!roundTrip.equals(alpha)) throw new Error('mask alpha differs from the source alpha');
await writeFile(target, mask);
const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
console.log(JSON.stringify({ width, height, bytes: mask.length, png: await sha(source), webp: await sha(target) }));
