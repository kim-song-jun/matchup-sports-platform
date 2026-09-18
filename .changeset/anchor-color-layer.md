---
'v1_web': patch
---

앵커에 적어 둔 글자색이 화면에 나오도록 `a { color: inherit }` 리셋을 `@layer base` 안으로 옮깁니다.

레이어 밖 규칙은 명시도와 무관하게 레이어 안의 **모든** 규칙을 이깁니다. 그래서 레이어 밖에 있던
`a { color: inherit }` 이 `@layer utilities` 의 Tailwind 색 유틸리티를 항상 이겼고, 앵커 **51곳**에
적어 둔 색이 전부 죽어 상속색으로 렌더됐습니다.

alpha 실측(`/admin/tournaments`, CDP `getMatchedStylesForNode`):

| 자리 | 적어둔 색 | 실제 렌더 |
|---|---|---|
| 어드민 사이드바 활성 항목 | `--blue700` `rgb(27,100,218)` | `rgb(25,31,40)` |
| 같은 사이드바 비활성 13개 | `--text-muted` | `rgb(25,31,40)` — 활성과 **같은 색** |

이 문서의 레이어 우선순위는 **레이어 밖 > utilities > base** 입니다(실측). 그래서 `base` 로 옮기면
색 유틸리티가 이기고, 색을 거는 `tm-*` 클래스(레이어 밖)는 그대로 이깁니다 — 어느 쪽도 잃지 않습니다.

`anchor-text-color.test.ts` 를 이 계약으로 다시 씁니다: 레이어 밖에서 `a` 에 `color` 를 거는 규칙이
없어야 하고, 리셋이 실제로 `@layer base` 안에 있어야 합니다.
