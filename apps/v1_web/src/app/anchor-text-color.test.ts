import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **앵커의 글자색 리셋은 캐스케이드 레이어 안에 있어야 한다.**
 *
 * 레이어 밖 규칙은 레이어 안의 **어떤** 규칙보다도 우선한다(명시도와 무관하게).
 * 그래서 `a { color: inherit }` 이 레이어 밖에 있으면 `@layer utilities` 안의
 * Tailwind 색 유틸리티를 **항상** 이기고, 앵커에 적어 둔 색이 전부 죽는다.
 *
 * alpha 실측(2026-09-08, `/admin/tournaments`, CDP `getMatchedStylesForNode`):
 *
 *   적어둔 색                     실제 렌더        자리
 *   text-[var(--blue700)]        rgb(25,31,40)   어드민 사이드바 활성 항목
 *   text-[var(--text-muted)]     rgb(25,31,40)   같은 사이드바 비활성 13개 — 활성과 동색
 *
 * 전수 50곳이 이 상태였다. 소스에는 색이 적혀 있으니 코드를 읽어선 안 보이고,
 * `<button>` 에서는 같은 유틸리티가 잘 먹으니 재현도 안 된다.
 *
 * 이 문서에서 잰 레이어 우선순위: **레이어 밖 > utilities > base.** 그래서
 * `@layer base` 로 옮기면 유틸리티가 이기고, 색을 거는 `tm-*` 클래스(레이어 밖)는
 * 그대로 이긴다 — 어느 쪽도 잃지 않는다.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

/** 주석을 지운다 — 주석 안의 예시 코드가 규칙으로 잡히지 않게. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 중괄호 깊이를 세어 **최상위(레이어·미디어 밖)** 규칙만 고른다.
 * 반환값은 각 최상위 규칙의 `[셀렉터, 본문]`.
 */
function topLevelRules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let start = 0;
  let blockStart = -1;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) blockStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && blockStart >= 0) {
        out.push([css.slice(start, blockStart).trim(), css.slice(blockStart + 1, i)]);
        start = i + 1;
        blockStart = -1;
      }
    }
  }
  return out;
}

/** 셀렉터 목록에 `a` 가 단독 타입 셀렉터로 들어 있는가. */
function selectsBareAnchor(selector: string): boolean {
  return selector.split(',').some((part) => part.trim() === 'a');
}

describe('앵커 글자색 리셋은 레이어 안에 있다', () => {
  it('레이어 밖에서 `a` 에 color 를 거는 규칙이 없다', () => {
    const offenders = topLevelRules(stripComments(CSS))
      .filter(([selector, body]) => selectsBareAnchor(selector) && /(?<![-\w])color\s*:/.test(body))
      .map(([selector]) => selector);

    expect(
      offenders,
      '레이어 밖 `a { color: … }` 은 @layer utilities 의 색 유틸리티를 항상 이겨서 ' +
        '앵커에 적어 둔 색을 전부 죽입니다. @layer base 안으로 옮기세요.',
    ).toEqual([]);
  });

  it('리셋이 실제로 @layer base 안에 있다', () => {
    const base = stripComments(CSS).match(/@layer\s+base\s*\{([\s\S]*?)\n\}/);
    expect(base, '@layer base 블록이 없습니다').not.toBeNull();
    expect(base?.[1]).toMatch(/(?<![-\w])a\s*\{[^}]*color\s*:\s*inherit/);
  });

  it('검사기가 실제로 잡는다 — 레이어 밖 a 규칙을 넣으면 걸린다', () => {
    const violating = 'a {\n  color: inherit;\n}\n@layer base {\n  a { color: inherit; }\n}\n';
    const offenders = topLevelRules(violating).filter(
      ([selector, body]) => selectsBareAnchor(selector) && /(?<![-\w])color\s*:/.test(body),
    );

    expect(offenders).toHaveLength(1);
  });

  it('검사기가 `background-color` 를 color 로 오인하지 않는다', () => {
    const harmless = 'a {\n  background-color: red;\n  --icon-color: blue;\n}\n';
    const offenders = topLevelRules(harmless).filter(
      ([selector, body]) => selectsBareAnchor(selector) && /(?<![-\w])color\s*:/.test(body),
    );

    expect(offenders).toEqual([]);
  });

  it('검사기가 `a` 를 포함한 다른 셀렉터에 오작동하지 않는다', () => {
    const other = '.tm-card a {\n  color: red;\n}\narea {\n  color: red;\n}\n';
    const offenders = topLevelRules(other).filter(
      ([selector, body]) => selectsBareAnchor(selector) && /(?<![-\w])color\s*:/.test(body),
    );

    expect(offenders).toEqual([]);
  });
});
