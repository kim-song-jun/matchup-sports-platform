---
"v1_api": minor
"v1_web": minor
---

관리자가 대회를 만들 때/수정할 때 "출전 인원"(경기장에 서는 라인업 상한, GK 포함)을 직접 고를 수 있게 한다. 지금까지는 이 값이 종목별 경기 설정(`V1CompetitionConfigVersion.lineup.maxPlayers`)의 하드코딩된 기본값(축구 11명/풋살 6명)으로 고정돼 있었고, 이를 바꿀 수 있는 관리자 화면이 아예 없었다(PR #306에서 확인된 갭).

**"등록" 인원과 "출전" 인원은 완전히 다른 개념이다 — 섞지 않았다.** `V1Tournament.minPlayers/maxPlayers`(대회에 등록하는 로스터 크기, 성별 쿼터가 묶이는 값)는 건드리지 않았다. 이번 변경 대상은 오직 `V1CompetitionConfigVersion.lineup.maxPlayers`(실제 경기 라인업 상한)뿐이다.

**Prisma 스키마는 바꾸지 않았다.** 새 컬럼 대신 기존 불변 버전 체계를 그대로 재사용한다: 관리자가 n을 고르면 종목의 canonical 설정(`competition-config.presets.ts`)에서 `lineup.maxPlayers`(및 필요하면 `minPlayers`)만 n에 맞춘 content를 구성하고, `content_hash`로 find-or-create — 이미 같은 내용의 버전이 있으면 재사용하고, 없으면 기존 관리자 API(`CompetitionConfigRegistry.createVersion`)로 새 버전만 발행한다. 기존 버전 행은 절대 UPDATE하지 않는다(`v1_block_used_config_mutation` 트리거가 막는 이유와 동일).

- 선택 가능한 값은 종목의 `lineup.formations`가 실제로 지원하는 필드 인원수(+GK 1명)에서 파생한다 — 없는 대형을 지어내지 않는다. 풋살은 5명/6명, 축구는 아직 포메이션 데이터가 없어 canonical 기본값(11명) 하나만 선택지다.
- 대회 **생성** 시: 종목이 경기 설정 카탈로그에 있으면(football/futsal) 관리자가 안 골라도 canonical 기본값으로 자동 설정된다 — 대진(픽스처) 생성 단계의 `COMPETITION_CONFIG_REQUIRED` 차단(설정이 아예 안 잡힌 신규 대회는 픽스처를 만들 수 없던 기존 운영 공백)이 함께 해소된다.
- 대회 **수정** 시: 이미 시작(`in_progress`)했거나 완료(`completed`)된 대회는 출전 인원을 바꿀 수 없다(409 `TOURNAMENT_LINEUP_SIZE_LOCKED`) — 진행 중인 대회의 규칙이 경기 중간에 바뀌는 것을 막는다. 종목과 출전 인원은 한 요청에서 함께 바꿀 수 없다(400). 변경은 기존 `TournamentCompetitionConfig.change()`(CAS + 미완료 픽스처만 리포인트 + 완료된 경기는 소급하지 않음)를 그대로 재사용한다.
- 새 조회 엔드포인트: `GET /admin/competition-configs/lineup-size-options?sportId=`.
- `GET /admin/tournaments/:id` 응답에 `competitionConfigVersionId`/`lineupMaxPlayers`/`lineupMinPlayers`/`lineupSizeOptions`를 추가했다(목록/생성 응답은 조인 비용 때문에 이 필드들을 채우지 않는다).

**함께 고친 실 존재 갭:** `GamesService.saveLineup`(대회 대진의 director/staff 라인업 저장 경로)에는 min/max 인원 검증이 아예 없었다 — `team-match-lineup.service.ts`의 동일 라인업 저장 경로는 이미 `LINEUP_SIZE_INVALID`로 이 값을 강제하고 있었는데 대회 쪽만 빠져 있었다. 이제 같은 코드/메시지로 강제한다. 두 경로가 각자 파서를 중복으로 갖고 있던 것도 `competition-config.parse.ts`의 `parseLineupLimits()` 하나로 합쳤다.
