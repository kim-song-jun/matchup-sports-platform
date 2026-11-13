/**
 * Organization 엔티티는 루트 레이아웃의 buildSiteIdentityLd 한 곳에서만 선언한다. 다른 곳에서 다시
 * 선언하면 검색엔진이 같은 회사를 둘로 본다 — 새 JSON-LD 는 `{ '@id': organizationId() }` 로 참조해야 한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from './app-store-links';
import { buildSiteIdentityLd } from './structured-data';

const SRC_ROOT = path.resolve(__dirname, '..');
const OWNER = path.join(SRC_ROOT, 'lib', 'structured-data.ts');
const ORGANIZATION_TYPE = /['"]@type['"]\s*:\s*['"](?:Sports)?Organization['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('Organization JSON-LD', () => {
  it('structured-data.ts 밖에서 Organization 을 다시 선언하지 않는다', () => {
    const files = sourceFiles(SRC_ROOT);
    expect(files).toContain(OWNER);
    expect(readFileSync(OWNER, 'utf8')).toMatch(ORGANIZATION_TYPE);

    const duplicates = files.filter((file) => file !== OWNER && ORGANIZATION_TYPE.test(readFileSync(file, 'utf8')));
    expect(duplicates.map((file) => path.relative(SRC_ROOT, file))).toEqual([]);
  });
});

type IdentityNode = Record<string, unknown>;

function identityGraph(): IdentityNode[] {
  return buildSiteIdentityLd({ contactEmail: 'help@example.com' })['@graph'] as IdentityNode[];
}

describe('사이트 이름과 공식 채널', () => {
  it('WebSite 도 한글 대체 이름을 갖는다 — Organization 에만 있으면 사이트 이름 신호가 한쪽으로 쏠린다', () => {
    const [organization, website] = identityGraph();

    expect(website['@type']).toBe('WebSite');
    expect(website.alternateName).toEqual(['팀밋']);
    expect(organization.alternateName).toBe('팀밋');
  });

  it('Organization.sameAs 는 인스타그램과 두 앱 스토어 주소를 싣는다', () => {
    const [organization] = identityGraph();

    expect(organization.sameAs).toEqual([
      'https://www.instagram.com/teameet_official/',
      IOS_APP_STORE_URL,
      ANDROID_PLAY_STORE_URL,
    ]);
  });

  it('인스타그램 주소는 official-surfaces.ts 한 곳에서만 적는다', () => {
    const owner = path.join(SRC_ROOT, 'lib', 'official-surfaces.ts');
    const files = sourceFiles(SRC_ROOT);
    const holders = files.filter((file) => /instagram\.com\/teameet_official/.test(readFileSync(file, 'utf8')));

    expect(holders.map((file) => path.relative(SRC_ROOT, file))).toEqual([path.relative(SRC_ROOT, owner)]);
  });
});
