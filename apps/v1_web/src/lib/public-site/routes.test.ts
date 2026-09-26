/**
 * sitemap·robots·llms.txt 는 PUBLIC_SITE_ROUTES 하나를 읽는다. 여기서는 그 배열이 실제 페이지 파일과
 * 어긋나지 않는지 본다 — 공개 페이지를 새로 만들고 배열에 빠뜨리면 그 페이지는 조용히 색인 밖에 남는다.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/lib/public-content/guides';
import { PUBLIC_SITE_ALLOW_PATHS, PUBLIC_SITE_ROUTES } from './routes';

const APP_DIR = resolve(process.cwd(), 'src/app');
const PUBLIC_SITE_DIRS = PUBLIC_SITE_ALLOW_PATHS.map((path) => path.replace(/^\/|\/$/g, ''));

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

/** app 디렉터리 경로 → URL. `_` 로 시작하는 폴더는 라우트가 아니고, `[slug]` 는 가이드 목록으로 펼친다. */
function routesOf(file: string): string[] {
  const segments = relative(APP_DIR, file).split(sep).slice(0, -1);
  if (segments.some((segment) => segment.startsWith('_'))) return [];
  const path = `/${segments.join('/')}`;
  return path.includes('[slug]') ? GUIDES.map((guide) => path.replace('[slug]', guide.slug)) : [path];
}

describe('PUBLIC_SITE_ROUTES', () => {
  it('공개 소개·도움말 폴더의 페이지 파일과 한 개도 어긋나지 않는다', () => {
    const fromFiles = PUBLIC_SITE_DIRS.flatMap((dir) => pageFiles(join(APP_DIR, dir))).flatMap(routesOf);
    const registered = PUBLIC_SITE_ROUTES.map((route) => route.path);

    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual([...fromFiles].sort());
  });

  it('모든 경로가 robots Allow 앞부분과 일치한다', () => {
    for (const route of PUBLIC_SITE_ROUTES) {
      expect(
        PUBLIC_SITE_ALLOW_PATHS.some((allow) => route.path === allow || route.path.startsWith(allow.endsWith('/') ? allow : `${allow}/`)),
        `${route.path} 가 robots Allow 밖이다`,
      ).toBe(true);
    }
  });

  it('llms.txt 한 줄 설명은 비어 있지 않고 줄바꿈이 없다', () => {
    for (const route of PUBLIC_SITE_ROUTES) {
      expect(route.summary.trim(), route.path).not.toBe('');
      expect(route.summary, route.path).not.toMatch(/\n/);
    }
  });
});
