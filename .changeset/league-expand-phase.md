---
'v1_api': minor
---

일반 리그(팀 매치 시리즈)를 리그(League)로 재명명하는 **확장 단계** — `v1_leagues`/`v1_league_teams` 신규 테이블과 `v1_team_matches.league_id` 컬럼을 추가하고 기존 데이터를 복사한다. 구 테이블·컬럼은 무중단 롤링 배포를 위해 그대로 유지하며, 제거는 별도 수축 릴리스에서 한다.
