---
"v1_api": patch
"v1_web": patch
---

**대회 참가팀 공개 정책을 통일한다 — 모집 중(open)엔 참가팀 명단뿐 아니라 조 편성/대진표/일정 안의 팀명·로고도 같은 조건으로 가린다.**

## 근본 원인

"참가팀 명단"(`participantTeams`)과 "조 편성·대진표·일정 안의 팀명"은 같은 데이터(팀명·로고)를 노출하는데도 서로 다른, 조율되지 않는 게이트를 따랐다.

- `participantTeams`는 `tournament.status === 'open'`(모집 중)이면 무조건 `[]`로 감췄다.
- `groups`/`fixtures` 안의 팀명은 오직 대진표 공개 여부(`bracketPublishedAt`/`bracketPublishScheduledAt`)만 따랐다 — 모집 중이어도 운영자가 대진표를 먼저 공개하면 조 편성 안의 팀명이 그대로 보였다.
- 같은 팀명이 실제로는 **세 번째 경로**로도 샜다: `GET /tournaments/:id/schedule`(경기 일정 탭·독립 일정 페이지)과 `GET /tournaments/:id/matches/:fixtureId`(경기 상세)는 `TournamentsReadService`와 완전히 다른 서비스(`PublicTournamentRecordsService`)인데, 이쪽은 팀명 게이트 자체가 아예 없었다 — 사용자가 지적한 "참가팀 공개는 안 됐는데 조별일정은 어떻게 되어있냐"의 실제 발단이 이 경로다.

## 고친 방법 — 어디까지 감췄는가

`shouldHideParticipantIdentity(status, staffBypass)`(`tournament-detail.presenter.ts`)를 단일 판정 소스로 두고, 대진표 "구조"를 보여줄지(`isBracketPublished`)와는 독립된 게이트로 세 경로 모두에 적용했다.

- **감춘 것**: `teamId`/`teamName`/`teamLogoUrl` (groups.groupTeams, groups.standings, fixtures 홈/원정, 공개 일정 홈/원정, 순위)만 `null`.
- **감추지 않은 것("없는 척하지 않는다")**: `registrationId`(재식별 경로가 없는 안정 키), 조 이름·조 수·팀 수, 경기 일정·장소·라운드·상태, 성적 집계(승점/득실 등), `confirmedCount`/`teamCount`. 관전자는 "언제 무슨 경기가 있는지"는 계속 볼 수 있다.
- `homeTeamName`/`awayTeamName`은 "아직 미배정"(`'TBD'`)과 "배정은 됐지만 비공개"(`null`)를 구분한다 — 프런트가 두 상태를 각각 "미정"/"비공개"로 다르게 안내한다.

## 운영자·스태프 예외

새 권한 로직을 만들지 않고 `TournamentStaffAccessService.assertAccess`(PR #389/issue #377의 선례)를 그대로 재사용했다.

- `TournamentsReadService.get()`, `PublicTournamentRecordsService.getSchedule()`: 대회 전체 조·픽스처를 한 번에 내려주므로 대회 전체 단위(`{ tournamentId }`)로 판정한다. 특정 fixture/field로만 좁게 배정된 `FIELD_OPERATOR`는 이 우회 대상이 아니다 — 새로 발명한 제약이 아니라 기존 정책(`decideTournamentStaffAccess`)이 이미 그렇게 판정하며, `TournamentOperationsBoardController`(운영 보드) 등 같은 성격의 기존 엔드포인트도 동일한 스코프를 쓴다.
- `PublicTournamentRecordsService.getMatch()`: 이미 계산돼 있던 fixture/field 스코프 `isStaffBypass`(issue #377)를 그대로 재사용해 home/away 팀명에도 적용한다.

## 화면

- `/tournaments/:id/bracket`("순위·대진표" 탭)의 "대진표가 아직 공개되지 않았어요" 빈 상태를 재설계했다: 주 문구는 그대로 대진 **구조**의 공개 시점(포맷 기준 — "조별리그가 끝난 후"/"편성 완료되면")을 말하고, 그 아래에 확정 팀 수·모집 마감일·대진표 공개 예약 시각을 정직하게 보여주는 정보 패널을 추가했다. 페이지를 flex column화해 콘텐츠가 짧아도 하단 흐름 네비게이터가 항상 탭바 바로 위에 붙는다 — 알파 400px 실측(마지막 콘텐츠 bottom 961, 탭바 top 1128, 167px 빈 공간)의 원인이었다.
- "경기 일정" 탭(`ScheduleContent`)에 참가팀이 가려졌을 때만 뜨는 안내 배너를 추가했다.
- `TournamentStandingsTable`은 팀명이 가려진 행을 "참가팀 비공개"로 표시하고, 그 행에는 팀 전적 상세로의 링크/펼침을 만들지 않는다(가려진 팀에는 갈 곳이 없다).

## 테스트

`tournaments-read.service.spec.ts`, `public-tournament-records.service.spec.ts`, `public-tournament-records.schedule-scorers.spec.ts`에 관전자(가려짐)·로그인 비스태프(가려짐)·대회 운영진(그대로 보임)·특정 fixture/field 스코프 FIELD_OPERATOR(여전히 가려짐, least-privilege)·모집 마감 후(회귀 없음) 케이스를 추가했다. 프런트는 `tournament-standings-table.test.tsx`/`bracket-page-client.test.tsx`/`tournament-public-qa.test.tsx`(포맷별 빈 상태 문구 회귀 포함)/`schedule-content.test.tsx`로 검증했다.
