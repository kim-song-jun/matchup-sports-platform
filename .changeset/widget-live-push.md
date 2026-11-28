---
"v1_api": minor
---

경기 상태가 바뀌면(득점·구간 시작/끝·일시정지·종료) 위젯과 아이폰 실시간 카드에 푸시를 보내요. 아이폰 실시간 카드가 받은 푸시 토큰을 등록·삭제하는 `PUT/DELETE /widget/live-activity-token`을 더하고, 위젯 홈의 끝난 경기에 종료 시각(`endedAt`)을 내려요. 득점·종료는 안드로이드 위젯에 데이터 푸시(`widget_refresh`)로, 아이폰 카드에는 APNs `liveactivity`(종료 때는 종료 + 15분 뒤 정리)로 보내요. 환경변수 `V1_WIDGET_PUSH_ENABLED=true` 일 때만 동작해요.
