import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `<a>`/`<Link>` 에서 **Tailwind 글자색 유틸리티는 죽는다.** 리셋의 `a { color: inherit }` 가
 * 레이어 밖이라 레이어 안의 유틸리티를 이기기 때문이다. alpha 실측(2026-09-08):
 *
 *   <a      class="text-white">                  → rgb(25,31,40)   ❌
 *   <a      class="text-[var(--static-white)]">  → rgb(25,31,40)   ❌  임의값도 진다
 *   <a      style="color: var(--static-white)">  → rgb(255,255,255) ✅  인라인만 이긴다
 *   <button class="text-white">                  → rgb(255,255,255) ✅  a 규칙이 없어서
 *
 * 그래서 **소스는 맞는데 화면만 다르다** — `text-white` 가 적혀 있으니 코드를 읽어선 안 보이고,
 * `<button>` 에서는 잘 되니 재현도 안 된다. 어드민의 파란 CTA 넷이 이렇게 어두운 글씨로
 * 나가고 있었고(4.46:1) 아무도 눈치채지 못했다.
 *
 * **이 검사는 `text-white` 만 본다.** 같은 함정이 `text-[var(--blue700)]` 등 **모든** 색
 * 유틸리티에 걸리고 실제로 어드민 링크 30곳 이상이 의도한 색이 아닌 상속색으로 나가고
 * 있지만, 그건 리셋의 캐스케이드를 바꿔야 하는 **전역 결정**이라 별도 판단이 필요하다.
 * 여기서는 **색을 깐 버튼 위 흰 글씨**라는, 의도가 명확하고 대비에 직결되는 경우만 막는다.
 */
const ROOT = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (name.endsWith('.tsx') && !name.includes('.test.')) {
      out.push(path);
    }
  }
  return out;
}

/** 여는 태그를 깊이 인식으로 읽는다 — `onClick={() => …}` 의 `>` 에서 끊기지 않게. */
function openingAnchorTags(source: string): string[] {
  const found: string[] = [];
  const start = /<(?:Link|a)\b/g;
  let match: RegExpExecArray | null;

  while ((match = start.exec(source)) !== null) {
    let depth = 0;
    let quote = '';
    let index = start.lastIndex;

    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === '\\') {
          index += 1;
          continue;
        }
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      } else if (char === '>' && depth === 0) {
        found.push(source.slice(match.index, index + 1));
        break;
      }
    }
    start.lastIndex = index + 1;
  }

  return found;
}

/** 색을 깐 지면 위에 흰 글씨를 의도한 앵커. */
const WANTS_WHITE = /\btext-white\b/;
const HAS_FILL = /\bbg-(?:blue|red|green|orange|amber|slate|gray|grey)-\d{2,3}\b|\bbg-\[var\(/;

const INLINE_COLOR = /color:\s*['"`]?var\(/;

describe('<a>/<Link> 의 글자색은 인라인으로만 먹는다', () => {
  it('Tailwind 글자색 유틸리티에만 기대는 앵커가 없다', () => {
    const offenders: string[] = [];

    for (const path of sourceFiles(ROOT)) {
      const source = readFileSync(path, 'utf8');
      for (const tag of openingAnchorTags(source)) {
        if (!WANTS_WHITE.test(tag) || !HAS_FILL.test(tag)) continue;
        if (INLINE_COLOR.test(tag)) continue;
        offenders.push(`${path.slice(path.indexOf('src/'))}: ${tag.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }

    expect(
      offenders,
      `<a>/<Link> 에서 Tailwind 글자색 유틸리티는 리셋의 \`a { color: inherit }\` 에 집니다.\n` +
        `style={{ color: 'var(--static-white)' }} 처럼 인라인으로 주세요:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('검사기가 실제로 잡는다 — 위반 모양을 넣으면 걸린다', () => {
    const violating = `<Link href="/x" className="bg-blue-500 text-white">가기</Link>`;
    const [tag] = openingAnchorTags(violating);

    expect(WANTS_WHITE.test(tag) && HAS_FILL.test(tag)).toBe(true);
    expect(INLINE_COLOR.test(tag)).toBe(false);
  });

  it('인라인 color 가 있으면 통과한다', () => {
    const fixed = `<Link href="/x" className="bg-blue-500 text-white" style={{ color: 'var(--static-white)' }}>가기</Link>`;
    const [tag] = openingAnchorTags(fixed);

    expect(INLINE_COLOR.test(tag)).toBe(true);
  });

  it('채움 없는 링크는 대상이 아니다 — 흰 글씨를 의도할 자리가 아니다', () => {
    const plain = `<Link href="/x" className="text-[length:var(--font-size-label)] underline">가기</Link>`;
    const [tag] = openingAnchorTags(plain);

    expect(WANTS_WHITE.test(tag) && HAS_FILL.test(tag)).toBe(false);
  });
});
