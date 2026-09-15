/**
 * 타이포 토큰 정합 (2026-09-08 alpha 실측 · ultracode 감사).
 *
 * `tm-text-body-lg` 의 line-height 28px 은 우연이 아니라 맞춰 놓은 값이다 —
 * globals.css 주석이 "[P1 4pt snap] 26→28 (4의 배수, ×1.65 — 한국어 +0.1 여유 포함)" 이라
 * 근거를 남기고 있다. 그런데 두 곳이 서로 **다른 방식으로** 그 값을 비껴가고 있었다.
 *
 *   대회 카드 제목        인라인 style lineHeight:1.35  → 17×1.35 = 23px (특이도로 클래스를 이김)
 *   프로모 섹션 제목      line-height 미지정            → 'normal' 상속 ≈ 26px
 *
 * 둘 다 "크기·굵기는 맞췄으니 같아 보이겠지" 로 생긴 어긋남이라, 렌더 테스트로는 안 걸리고
 * 실측해야 보인다. 값 자체를 소스에서 고정한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('tm-text-body-lg line-height 정합', () => {
  it('토큰 자체는 28px 이다 — 이 값이 바뀌면 아래 단언들의 기준도 바뀐다', () => {
    const rule = read('src/app/globals.css').match(/^\.tm-text-body-lg\s*\{([^}]*)\}/m)?.[1];

    expect(rule).toBeDefined();
    expect(stripComments(rule as string)).toMatch(/line-height:\s*28px/);
  });

  it('대회 카드 제목이 인라인 lineHeight 로 토큰을 덮지 않는다', () => {
    const src = stripComments(read('src/components/v1-ui/competition-card.tsx'));

    // 제목 요소 블록만 본다. 같은 파일의 배지(`tm-text-caption`)는 `lineHeight: 1` 을
    // 정당하게 쓰므로 파일 전체를 훑으면 그것까지 잡힌다.
    const at = src.indexOf('className="tm-text-body-lg"');
    expect(at).toBeGreaterThan(-1);
    const titleBlock = src.slice(at, src.indexOf('>', src.indexOf('}}', at)) + 1);

    expect(titleBlock).not.toMatch(/lineHeight/);
    // 있어야 할 것은 그대로 남아 있는지 — 지우다 같이 지우지 않았는지 확인한다.
    expect(titleBlock).toMatch(/wordBreak:\s*'keep-all'/);
  });

  it('프로모 섹션 제목이 line-height 를 명시한다 — normal 상속을 막는다', () => {
    const rule = read('src/app/desktop/tournaments.css')
      .match(/\.tm-tournament-promo-section-title\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    const body = stripComments(rule as string);
    expect(body).toMatch(/font-size:\s*var\(--font-size-body-lg\)/);
    // 크기만 맞추고 line-height 를 빼면 'normal'(≈26px)이 상속돼 형제와 2px 어긋난다.
    expect(body).toMatch(/line-height:\s*28px/);
  });
});
