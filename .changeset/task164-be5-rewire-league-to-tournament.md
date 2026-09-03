---
'v1_api': minor
---

리그를 읽는 코드를 통합 축으로 옮긴다 (Task 164 BE-5 재배선).

`V1League` → `V1Tournament(kind='regular_league')`, `V1LeagueTeam` →
`V1TournamentRegistration(status='confirmed')`. **데이터·스키마는 그대로다** — 마이그레이션도
백필도 없고, 응답 계약(필드·에러 코드)도 불변이다. `v1League`/`v1LeagueTeam` 은 이제
dual-write 쓰기 10곳에만 남고, 그 제거와 테이블 drop 은 별도 PR(사용자 승인 대상)이다.

`V1League.tieBreakJson` 은 통합 축으로 옮기지 않고 상수화했다(`league-tie-break.ts`) — 쓰기
3곳이 전부 같은 값이었고 갱신 경로가 없었다. 동점 처리 순서는 플랫폼 공통이라는 뜻이며 정본
§5 에 적었다.

한 번 돌고 끝난 리그 백필 4종(+CLI·스펙)을 삭제했다.
