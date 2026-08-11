---
"v1_web": patch
---

`main`과 대조해보니 `.tm-match-type-segment`에 붙어 있던 `background: var(--card-surface)
+ border`는 **dev에만 있던 오버라이드**(이전 라운드에서 "세그먼트가 페이지 배경과
인접 단계라 대비가 약하다"며 추가)였고, 이게 활성 탭 pill의 기본 배경(`--surface`)과
완전히 같은 값이 되어 "개인\|팀" 탭 active 상태가 안 보이던 버그의 진짜 원인이었다.
직전 커밋에서는 활성 pill에 새 오버라이드를 덧대는 방식으로 고쳤는데, `main`과 최대한
가깝게 유지해 달라는 요청에 따라 **패치 대신 원인이 된 오버라이드 자체를 제거**해
`main`과 동일한 형태로 되돌렸다 — 코드도 줄고, 버그도 없어지고, dev/main 드리프트도
줄어드는 삼중 이득. `pnpm lint` clean.
