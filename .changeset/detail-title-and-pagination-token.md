---
'v1_web': patch
---

같은 화면에서 어긋나 있던 타이포 2건을 고칩니다.

**① 매치 상세 제목이 한 화면에서 두 무게로 보입니다.** 데스크톱 페이지 헤드의 `h1`
(`.tm-text-heading`, 24/700)과 히어로의 `h2`(`.tm-match-detail-title`)가 **같은
`match.title` 문자열**을 보여주는데, 크기는 같고 굵기만 700 vs 800 이었습니다.
`h2` 를 토큰(`--font-size-heading` / 700)에 맞춥니다 — 히어로 지면 위 흰 글씨는 그대로입니다.

**② 페이지네이션 버튼이 의도한 13px/500 이 아니라 브라우저 기본 16px/400 으로 렌더됩니다.**
원인은 CSS Cascade Layers 입니다 — `globals.css` 는 `@import "tailwindcss"` 만 있고 `@layer`
선언이 없어서, 같은 파일의 `button, input, … { font: inherit }` 리셋이 **레이어 밖**에 있습니다.
스펙상 레이어 밖 스타일은 Tailwind 의 `@layer utilities` 안 유틸리티를 **항상** 이깁니다.
해당 버튼의 크기·굵기만 인라인으로 지정해 국소 해결합니다.

리셋 자체를 `@layer base` 로 옮기는 근본 수정은 **하지 않았습니다** — 저장소의 `tm-btn-*`
버튼들이 정상 렌더되는 것도 그 unlayered 우선순위 덕이라, 전수 영향 조사 없이 옮기면
다른 버튼이 깨집니다.
