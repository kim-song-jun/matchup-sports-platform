---
"v1_web": patch
---

정규 리그 "최종결과"의 승/득점/득실차 칸과 우승팀 히어로의 전적이 전부 0으로만 나오던 것을 고친다.

- **원인**: `FinalStandingsTable`과 챔피언 히어로(`DesktopChampionHero`/`MobileChampionBanner`)는
  팀별 전적을 `computeTeamRecord(teamName, tournament.fixtures)`로 `tournament.fixtures`를
  직접 스캔해서 계산한다. 정규 리그 거울 행은 `fixtures`가 항상 빈 배열이라(#1189의 순위
  결함과 같은 근본 원인 — 순위·전적 모두 `V1League` 축에서 계산되고 대회 행에는 미러링되지
  않는다) 순위 자체는 뜨게 됐어도(#1189) 승/득점/실점/득실차는 전부 0으로만 표시됐다.
- **수정**: `FinalRankRow`에 선택적 `record` 필드(`{ w, gf, ga, games }`)를 추가하고, 정규
  리그 거울 행의 순위를 만드는 `useLeagueOverallFinalRanking`이 이미 호출하는
  `GET /tournaments/:id/standings/overall` 응답의 승/무/패/득점/실점을 그 자리에 실어
  보낸다. `FinalStandingsTable`과 두 챔피언 히어로 컴포넌트는 `row.record`가 있으면 그것을
  쓰고, 없으면(지식 대회·`format:'league'` 실제 대회) 기존 `computeTeamRecord` 계산으로
  폴백한다 — 이미 정상 동작하던 두 경로는 그대로 유지.
