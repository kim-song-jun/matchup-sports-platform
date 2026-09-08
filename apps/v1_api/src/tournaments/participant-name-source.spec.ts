import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **아직 없는 경로를 막는 테스트.** 개별 호출부 테스트는 이미 있는 코드만 잠근다 —
 * 참가자 이름 규칙(`participantDisplayName`)이 한 곳에만 있었을 때 나머지 세 경로가
 * `realName` 을 그대로 박았고, 셋을 고쳐도 새 경로가 생기면 같은 일이 난다.
 *
 * ## 이 테스트가 잡는 것과, 타입이 잡는 것
 * ```
 * 이 테스트  참가자 이름에 realName 을 직접 쓰는 새 코드
 * 타입       프로필을 select 에서 빠뜨린 조회 (participantDisplayName 의 user 가 required)
 * ```
 * 둘 다 필요하다 — 타입만으로는 "프로필을 싣고도 realName 을 쓰는" 코드를 못 막고,
 * 이 테스트만으로는 "함수를 부르지만 프로필이 안 실린" 조용한 폴백을 못 막는다.
 */
/**
 * `src/` 와 `prisma/` 를 **둘 다** 본다 — 위반 세 곳 중 하나가 `prisma/seed-alpha-showcase-results.ts`
 * 였고, `deploy-alpha.sh` 가 배포마다 그 시드를 돌린다. `src/` 만 훑었으면 그 파일은
 * 이 게이트 밖에 남는다.
 */
const APP_ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = [join(APP_ROOT, 'src'), join(APP_ROOT, 'prisma')];

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectTsFiles(full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.spec.ts')) continue;
    out.push(full);
  }
  return out;
}

/** 주석은 식별자를 그대로 인용한다 — 코드만 본다. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('참가자 이름의 출처', () => {
  it('displayNameSnapshot 에 realName 을 직접 싣는 코드가 없다', () => {
    const offenders: string[] = [];
    for (const file of SCAN_ROOTS.flatMap((root) => collectTsFiles(root))) {
      const code = stripComments(readFileSync(file, 'utf8'));
      // `displayNameSnapshot: <무엇이든>.realName` — 변수 이름은 경로마다 다르다.
      if (/displayNameSnapshot:\s*[A-Za-z_$][\w$]*(?:\?\.|\.)[\w$.?]*realName\b/.test(code)) {
        offenders.push(file.slice(APP_ROOT.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });
});
