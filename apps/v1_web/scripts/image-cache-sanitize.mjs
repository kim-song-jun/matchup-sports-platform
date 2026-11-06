import { open, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

// Next 16 의 /_next/image 디스크 캐시(.next/cache/images/<cacheKey>/<maxAge>.<expireAt>.<etag>.<upstreamEtag>.<ext>)
// 에서 쓰다 만 항목을 지운다. Next 는 이 파일을 원자적으로 쓰지 않아(rm → mkdir → writeFile), 쓰는 도중
// 프로세스가 죽으면 빈 파일·잘린 파일이 남는다. 크기 0 항목이 하나라도 있으면 Next 의 디스크 LRU 초기화가
// 예외로 끝나 그 프로세스 동안 디스크 캐시 전체가 꺼지고, 잘린 이미지는 원본 etag 가 같아 계속 다시 쓰인다.

async function readEdges(file, size) {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(Math.min(12, size));
    const tail = Buffer.alloc(Math.min(12, size));
    await handle.read(head, 0, head.length, 0);
    await handle.read(tail, 0, tail.length, size - tail.length);
    return { head, tail };
  } finally {
    await handle.close();
  }
}

/** 형식을 아는 것만 구조를 본다. 모르는 형식은 크기만 본다. */
async function isIntact(file, extension, size) {
  if (size === 0) return false;
  if (!['webp', 'png', 'jpeg', 'jpg'].includes(extension)) return true;
  const { head, tail } = await readEdges(file, size);
  if (extension === 'webp') {
    return head.length === 12 && head.toString('ascii', 0, 4) === 'RIFF'
      && head.toString('ascii', 8, 12) === 'WEBP' && head.readUInt32LE(4) + 8 === size;
  }
  if (extension === 'png') {
    return head.length === 12 && head.readUInt32BE(0) === 0x89504e47 && tail.toString('ascii', 4, 8) === 'IEND';
  }
  return head[0] === 0xff && head[1] === 0xd8 && tail[tail.length - 2] === 0xff && tail[tail.length - 1] === 0xd9;
}

async function entryProblem(dir) {
  const info = await stat(dir);
  if (!info.isDirectory()) return 'not a directory';
  const files = await readdir(dir);
  if (files.length !== 1) return `${files.length} files`;
  const parts = files[0].split('.');
  if (parts.length !== 5 || parts.some((part) => part === '')) return `unexpected name ${files[0]}`;
  const file = path.join(dir, files[0]);
  const { size } = await stat(file);
  return (await isIntact(file, parts[4], size)) ? null : `broken ${parts[4]} (${size} bytes)`;
}

/** @returns {Promise<{ checked: number, removed: { key: string, reason: string }[] }>} */
export async function sanitizeImageCache(cacheDir) {
  let keys;
  try {
    keys = await readdir(cacheDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { checked: 0, removed: [] };
    throw err;
  }
  const removed = [];
  for (const key of keys) {
    const dir = path.join(cacheDir, key);
    const reason = await entryProblem(dir);
    if (reason) {
      await rm(dir, { recursive: true, force: true });
      removed.push({ key, reason });
    }
  }
  return { checked: keys.length, removed };
}
