---
'v1_web': patch
'v1_api': patch
---

리그 대진 생성이 요일·시각을 지정하면 400 으로 실패하던 것을 고친다.

Task 164 BE-2 가 서버 DTO 를 `schedule: { dates, time }` 로 바꾸면서(서버는 요일을 모른다)
어드민 화면은 옮기지 않아, 요일을 고르면 옛 `{ dayOfWeek, time }` 이 그대로 나가
`400 VALIDATION_ERROR` 로 **요일·시각 기능이 전면 불능**이었다. 화면 타입도 옛 형태라
tsc 가 통과했고, 화면 테스트도 옛 payload 를 단언하고 있어 CI 가 녹색이었다.

- 화면이 요일을 날짜 목록으로 전개해 보낸다(`lib/league-fixture-dates.ts`).
  기준일은 `max(리그 시작일, 오늘)`, 개수는 서버가 요구하는 매치데이 수(= `weeksCount`),
  첫 날의 시각이 이미 지났으면 한 주 밀어낸다.
- 어드민 리그 상세 응답에 `startsOn` 을 추가한다(additive) — 전개 기준일이 화면에 없었다.
