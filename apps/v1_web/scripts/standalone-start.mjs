// 운영 컨테이너 시작점(Dockerfile.v1-web 가 server.js 옆에 복사한다). 배포 사이에 유지되는 변환 저장소
// (v1_web_image_cache 볼륨)에서 쓰다 만 항목을 지운 뒤 Next standalone 서버를 같은 프로세스로 띄운다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeImageCache } from './image-cache-sanitize.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
try {
  const { checked, removed } = await sanitizeImageCache(path.join(appDir, '.next', 'cache', 'images'));
  console.log(`[image-cache] checked ${checked}, removed ${removed.length}`);
  for (const { key, reason } of removed) console.warn(`[image-cache] removed ${key}: ${reason}`);
} catch (err) {
  // 정리가 실패해도 서버는 띄운다 — 변환 저장소는 없어도 동작하는 캐시다.
  console.error('[image-cache] sanitize failed', err);
}
await import('./server.js');
