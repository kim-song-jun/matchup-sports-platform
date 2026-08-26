---
"v1_web": patch
---

간격·라운드·그림자·레이어의 기준을 `apps/v1_web/src/app/tokens.css` 한 곳으로 모았어요. `@theme` 블록에 정의해서 Tailwind 유틸리티(`rounded-field` 등)와 CSS 클래스가 같은 값을 보게 했습니다 — 지금까지는 둘이 서로를 몰라서 토큰을 고쳐도 유틸리티는 따라오지 않았어요.

radius는 숫자 스케일이 아니라 역할 기반으로 정리했습니다(chip 8 / control 12 / field 14 / container 16 / hero 24 / pill / circle). 275건 중 218건은 값이 그대로고, 실제로 값이 움직인 건 54건이에요. 최대 변화폭은 4px입니다. shadow는 이름만 역할 기반으로 통일했고(값 변화 없음), z-index는 지금 쌓이는 순서를 그대로 사다리로 만들되 `9999`만 90으로 내렸어요.

`v1-pattern-check`의 미정의 토큰 검사가 `globals.css` 한 파일만 보던 것을 로컬 `@import`를 따라가도록 고쳤습니다. 그래야 SSOT 파일에 정의된 토큰을 미정의로 오판하지 않아요.
