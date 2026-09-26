---
'v1_api': minor
---

리그 거부·승강 사유 필수 + 참가비 0원 입금 단계 생략 (Task 164 BE-4, D9).

- `PATCH /admin/registrations/:id/cancel` — **정규 리그 거울**이면 `reason` 필수(400 `LEAGUE_CANCEL_REASON_REQUIRED`). 대회는 선택 그대로.
- `POST /admin/league-series/:id/seasons/:n/promotions/commit` — 계산 결과를 뒤집은 항목에 `overrideNote` 필수(400 `PROMOTION_OVERRIDE_NOTE_REQUIRED`). 계산대로 둔 항목은 필요 없다.
- `POST /tournaments/:id/registrations/:rid/submit` — `entryFee`가 0이면 `awaiting_payment`를 건너뛰고 `payment_checking` + 결제 `paid`로 간다(`confirmPayment`와 같은 상태). 유료는 그대로.
