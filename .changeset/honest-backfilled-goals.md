---
"v1_api": patch
"v1_web": patch
---

골 이벤트 백필의 멱등 단위를 경기에서 골로 바꾸고, 복원된 골이 기록에 없던 전/후반·분을 단정하지 않도록 읽는 경로를 정리합니다.

- 부분 백필이 영구 고착되던 문제 해결: 후보 조건의 `events: { none: { type: GOAL } }` 게이트를 제거하고 `clientEventId` 기준 골 단위 skip으로 대체합니다. 대신 후보 쿼리에 `currentOfficialRevision.createdBySystemActor = 'GAME_BACKFILL'` 조건을 넣어 DB 레벨 한정을 유지합니다.
- 레거시에 분이 없던 골을 격리(`MINUTE_MISSING`)해 영구 누락시키던 동작을 제거하고, `payload.minuteKnown: false`로 "모름"을 데이터에 실어 삽입합니다.
- 공개 대진표·타임라인·일정 카드는 백필이 복원한 골의 `period`(저장상 `1`)와 분 미상 골의 `clockMs`(저장상 `0`)를 `null`로 내려, "전반 0:00 득점" 같은 없던 사실을 표시하지 않습니다. 운영 콘솔의 기록 이벤트 목록도 같은 규칙을 따릅니다.

기존 사용자 화면의 동작 변경이 아니라 표시 정확도 수정이고 스키마·API 계약 변경이 없어 patch입니다. 백필 자체는 자동 실행되지 않는 수동 CLI이며, 이 변경만으로 데이터가 바뀌지는 않습니다.
