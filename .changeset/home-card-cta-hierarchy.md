---
'v1_web': patch
---

홈 추천 카드의 CTA 를 secondary(outline) 로 내려 solid 파란 버튼의 위계를 회복합니다.

alpha 실측(2026-09-07) 결과 홈 한 페이지에 `tm-btn-primary` 가 **5개**였습니다 —
`경기 후기 211건 쓰기` / `승인제 신청` / `참가 신청하기` ×3. 추천 매치·추천 대회가 여러 장이라
카드마다 solid 를 두면 primary 가 겹겹이 쌓입니다.

- 카드 CTA(`.tm-featured-cta`)는 `tm-btn-outline` 으로 내립니다.
- solid 는 화면 최상위 행동(알림 받기·인증하기 같은 nudge)에만 남깁니다.

카드 전체가 이미 상세로 가는 링크라 이 버튼은 행동의 반복이기도 합니다(그래서 원래
`aria-hidden="true"` 로 스크린리더에서 제외돼 있습니다).
