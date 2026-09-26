// apps/v1_web/src/lib/route-chrome/matcher.ts
// 패턴 매칭 순수 로직만 담는다 — docs/design/app-shell-promotion.md §1.4.
// resolveRouteChrome은 이 파일이 아니라 index.ts에 둔다: ROUTE_CHROME_TABLE을 여기서
// import하면 index.ts → matcher.ts → index.ts 순환이 생기기 때문(U02 지시 §4 참조).

import type { RouteParams } from './types';

export function matchPattern(pattern: string, pathname: string): RouteParams | null {
  const patternSegs = pattern.split('/').filter(Boolean);
  const pathSegs = pathname.split('/').filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return null; // 세그먼트 수가 다르면 절대 매치 안 함
  const params: RouteParams = {};
  for (let i = 0; i < patternSegs.length; i += 1) {
    const p = patternSegs[i];
    const s = pathSegs[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

export function literalSegmentCount(pattern: string): number {
  return pattern.split('/').filter((seg) => seg && !seg.startsWith(':')).length;
}
