---
'v1_web': patch
---

데스크톱 목록 페이지 제목을 공유 토큰(`.tm-text-heading`, 24px/700)으로 통일합니다.

`matches`·`team-matches`·`teams` 세 화면이 각자 desktop CSS 에 **26px/800 을 복붙**해 두고
있었습니다(alpha 실측 2026-09-08: 세 파일 각 1건, `px=26 / weight=800 / lh=39`).
8단계 스케일(11/12/13/14/15/17/20/24)에 **26 은 없습니다.**

형제 화면 `tournaments` 는 같은 역할에 공유 셸의 `tm-text-heading` 을 그대로 써서 24/700 을
얻고 있었습니다 — 세 화면만 빠져 있었습니다.

세 desktop CSS 규칙에서 크기·굵기·색·자간을 걷어내고 레이아웃(마진)만 남긴 뒤,
각 `<h1>` 에 `tm-text-heading` 을 답니다.
