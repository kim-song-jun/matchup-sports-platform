// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImageOptimizerCache } from 'next/dist/server/image-optimizer';
import { sanitizeImageCache } from '../../scripts/image-cache-sanitize.mjs';

const webp = await readFile(path.resolve(process.cwd(), 'public/brand/teameet-mark-mask.webp'));
const png = await readFile(path.resolve(process.cwd(), 'public/brand/teameet-mark.png'));

let distDir: string;
let cacheDir: string;

const nextConfig = { images: { minimumCacheTTL: 60 }, experimental: { isrFlushToDisk: true } };

// Next 가 실제로 쓰는 디스크 캐시로 항목을 쓴다 — 이름 규칙을 이 버전의 Next 코드로 맞춘다.
function nextCache() {
  return new ImageOptimizerCache({ distDir, nextConfig } as unknown as ConstructorParameters<typeof ImageOptimizerCache>[0]);
}

// Next 의 디스크 LRU 는 프로세스당 한 번 초기화되는 싱글턴이라, 읽기 판정은 새 프로세스에서 한다.
function nextReads(key: string): boolean {
  const script = `
    const { ImageOptimizerCache } = require(require.resolve('next/dist/server/image-optimizer', { paths: [process.argv[1]] }));
    new ImageOptimizerCache({ distDir: process.argv[2], nextConfig: JSON.parse(process.argv[3]) })
      .get(process.argv[4]).then((entry) => process.stdout.write(entry ? 'hit' : 'miss'));`;
  const out = execFileSync(process.execPath, ['-e', script, process.cwd(), distDir, JSON.stringify(nextConfig), key], { encoding: 'utf8' });
  expect(out).toMatch(/^(hit|miss)$/);
  return out === 'hit';
}

async function putWithNext(key: string, buffer: Buffer, extension: string) {
  await nextCache().set(key, { kind: 'IMAGE', etag: `e${key}`, upstreamEtag: `u${key}`, buffer, extension } as never, {
    cacheControl: { revalidate: 60, expire: undefined },
  } as never);
}

/** Next 가 쓰던 중 죽은 모양: 같은 이름 규칙의 파일을 직접 만든다. */
async function putRaw(key: string, files: Record<string, Buffer>) {
  await mkdir(path.join(cacheDir, key), { recursive: true });
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(cacheDir, key, name), body);
}

beforeEach(async () => {
  distDir = await mkdtemp(path.join(tmpdir(), 'image-cache-sanitize-'));
  cacheDir = path.join(distDir, 'cache', 'images');
  await mkdir(cacheDir, { recursive: true });
});
afterEach(async () => {
  await rm(distDir, { recursive: true, force: true });
});

describe('sanitizeImageCache', () => {
  it('keeps entries written by Next and drops ones left half-written', async () => {
    await putWithNext('goodWebp', webp, 'webp');
    await putWithNext('goodPng', png, 'png');
    await putWithNext('goodSvg', Buffer.from('<svg/>'), 'svg');
    await putRaw('empty', { '60.1.e.u.webp': Buffer.alloc(0) });
    await putRaw('cutWebp', { '60.1.e.u.webp': webp.subarray(0, 4000) });
    await putRaw('cutPng', { '60.1.e.u.png': png.subarray(0, 4000) });
    await putRaw('cutJpeg', { '60.1.e.u.jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
    await putRaw('noFile', {});
    await putRaw('twoFiles', { '60.1.e.u.webp': webp, '60.2.e.u.webp': webp });

    const { checked, removed } = await sanitizeImageCache(cacheDir);

    expect(checked).toBe(9);
    expect(removed.map((r) => r.key).sort()).toEqual(['cutJpeg', 'cutPng', 'cutWebp', 'empty', 'noFile', 'twoFiles']);
    expect((await readdir(cacheDir)).sort()).toEqual(['goodPng', 'goodSvg', 'goodWebp']);
  });

  it('keeps a complete jpeg', async () => {
    await putRaw('jpeg', { '60.1.e.u.jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]) });
    expect((await sanitizeImageCache(cacheDir)).removed).toEqual([]);
  });

  it('turns the disk cache back on after a zero-byte entry had disabled it', async () => {
    await putWithNext('goodWebp', webp, 'webp');
    expect(nextReads('goodWebp')).toBe(true);
    await putRaw('empty', { '60.1.e.u.webp': Buffer.alloc(0) });
    // 크기 0 항목이 하나라도 있으면 Next 의 디스크 LRU 초기화가 실패해 멀쩡한 항목도 읽지 않는다.
    expect(nextReads('goodWebp')).toBe(false);

    await sanitizeImageCache(cacheDir);
    expect(nextReads('goodWebp')).toBe(true);
  });

  it('treats a missing cache directory as empty', async () => {
    expect(await sanitizeImageCache(path.join(distDir, 'nope'))).toEqual({ checked: 0, removed: [] });
  });
});
