---
'v1_web': patch
---

어드민 대비 실측 하네스를 추가합니다(`scripts/capture-alpha-admin-contrast-gallery.mjs`).

어드민 9화면을 3폭으로 찍고 **같은 방문에서** `getComputedStyle` 로 실제 색을 읽어 대비를
계산합니다. 육안 대조로는 `#f9fafb` 와 `#ffffff` 를 못 가르기 때문에 캡처만으로는 이 스윕의
결과를 검증할 수 없습니다.

계산기가 세 번 틀린 뒤 이 모양이 됐고, 각 함정을 주석으로 박아 뒀습니다 — `lab()`/`oklab()`
문자열 파싱(930건 유령), 반투명 지면 미합성, `background-image` 지면, `a11y-decisions.md`
등재 예외 미반영.
