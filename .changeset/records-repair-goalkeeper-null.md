---
'v1_api': patch
---

기록 보정 마이그레이션의 NULL goalkeeper 로 alpha 배포가 막힌 것을 앞으로 고친다.

`20260819090000_v1_records_profile_integration_repair` 의 출전 행 백필이
`appeared.position IN ('GK','GOALKEEPER','GOLEIRO')` 로 `goalkeeper` 를 채우는데,
`position` 이 nullable 이라 NULL 인 참가자에서 `IN` 이 false 가 아닌 **NULL** 을
돌려주고(SQL 3값 논리) NOT NULL 인 `goalkeeper` 컬럼에서 23502 로 죽었다.
그 결과 alpha 배포가 P3018 로 실패하고 이후 모든 배포가 연쇄 차단됐다.

게이트가 기존 마이그레이션 수정을 금지하므로, 같은 복구를 `COALESCE(..., false)` 로
고쳐 다시 수행하는 새 마이그레이션을 추가한다. 앱이 같은 판정에 쓰는
`participant.position === goalkeeperPositionCode` 의 의미(`null` → false)와 일치한다.
