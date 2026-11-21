---
"v1_api": patch
---

오늘(KST) 남은 대회 경기가 있는 날에는 운영 배포와 승격 준비가 시작되기 전에 멈추도록 했어요. 공개 대회 API 로 오늘 `scheduled`·`live` 경기를 확인하고, 있으면 `MATCHDAY` 확인 입력이나 오늘 날짜의 `PROD_MATCHDAY_OVERRIDE_DATE` 변수가 있어야 진행해요. 핫픽스는 이 입력으로 통과해요.
