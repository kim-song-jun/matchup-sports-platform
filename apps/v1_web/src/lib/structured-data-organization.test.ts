/**
 * Organization 엔티티는 루트 레이아웃의 buildSiteIdentityLd 한 곳에서만 선언한다. 다른 곳에서 다시
 * 선언하면 검색엔진이 같은 회사를 둘로 본다 — 새 JSON-LD 는 `{ '@id': organizationId() }` 로 참조해야 한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
