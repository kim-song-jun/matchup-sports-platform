---
'v1_api': minor
---

롤링 교체 종목에서 교체 기록을 거부한다 (Task 166 BE-3).

정본 §3: 롤링 종목은 교체 기록이 없다. `lineup.substitutions === 'rolling'` 인 경기의 교체
커맨드는 400 `SUBSTITUTION_NOT_TRACKED` 로 거부된다. `'limited'` 종목은 기존 동작·
`maxSubstitutions` 검증 그대로다.

**풋살은 프리셋이 `rolling` 이므로 대회뿐 아니라 풋살 친선 팀매치도 대상이다.** 이미 기록된
SUBSTITUTION 이벤트는 그대로 읽힌다 — 이 가드는 새 기록만 막는다.
