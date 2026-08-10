---
"v1_web": patch
---

alpha 라이브 재확인 중 발견: 하단 내비게이션 바(`.tm-bottom-nav`/`.v1-bottom-nav`),
데스크톱 헤더(`.v1-header`), 스티키 서브내비(`.tm-hub-subnav`), muted 패널
(`.v1-muted-panel`)이 CSS 변수 없이 `rgba(255, 255, 255, X)`로 흰 유리(glass)
배경을 하드코딩하고 있어 다크모드에서도 밝게 남아 화면마다 상시 노출되는 크롬만
튀는 문제가 있었다. `--surface`(#1c1e24) 계열 톤으로 다크 오버라이드를 추가했다.

사진/영상 위 오버레이(`.tm-video-strip-play` 등)는 대상에서 제외했다 — 그건
테마와 무관하게 항상 흰색이어야 하는 요소다.
