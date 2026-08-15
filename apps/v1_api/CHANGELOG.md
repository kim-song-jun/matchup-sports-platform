# v1_api

## 0.3.2

### Patch Changes

- 4816b36: 토너먼트 시상 순위를 결승전과 3·4위전의 승인 결과에서 계산합니다.

## 0.3.1

### Patch Changes

- 8b2c4c5: Canonicalize operation-gate evidence paths before enforcing the trusted root boundary.
- 03d3701: Restrict operation-gate bundle and linked receipt reads to the canonical evidence root so
  caller-controlled or bundle-controlled paths cannot read arbitrary host files.
- d48c81a: Make the operation-gate evidence root guard explicit before immutable filesystem reads.

## 0.3.0

### Minor Changes

- b4cdbe6: 대회 라인업을 **참가 등록 명단에서만** 짜게 하고, 일정 화면에서 우리 팀 경기를 짚어준다.

  **증상**: 팀장이 대회 일정 화면에 들어와도 ① 어느 경기가 자기 팀 경기인지 알 수 없었고, ② 라인업 진입점은 경기 상세로 한 번 더 들어가야 나왔으며 그마저 경기가 공개된 뒤에만 보였다. 라인업 화면에 도착한 뒤에도 ③ **이미 등록해 둔 참가 선수 명단과 무관하게 이름을 처음부터 다시 타이핑**해야 했다 — 등록하지 않은 사람도 라인업에 들어갈 수 있었고, 등록 명단과 라인업이 서로 다른 진실을 갖게 됐다.

  **수정 — 등록 명단이 유일한 출처(SSOT)**:

  - `GET /tournaments/:id/fixtures/:fixtureId/lineup-roster?sideId=` 추가. 인가는 `resolveActor`(read) 재사용 — 참가팀 매니저·오너는 **자기 팀 사이드만**, 대회 스태프는 양 팀. 소비자용 로스터 API(`TournamentPlayersService.listPlayers`)를 안 쓰는 이유는 그쪽이 `assertTeamMember`라 팀에 속하지 않은 스태프가 항상 403이 되기 때문이다(스태프는 팀 매니저가 없는 자리에서 대신 제출해야 한다). 응답에는 이름과 userId만 담는다 — 생년월일·성별·연락처는 라인업을 짜는 데 필요 없다.
  - 라인업 화면에서 "선수 추가" 입력을 제거하고, 등록 선수 전원을 **한 목록**으로 보여준다. 팀장이 하는 일은 **선발 체크**뿐이고 체크하지 않은 사람은 자동으로 후보가 된다. 목록 순서는 등록 명단 순서로 고정한다 — 선발을 위로 끌어올리면 체크할 때마다 행이 튀어 방금 누른 사람이 눈에서 사라진다.
  - 등록 명단에 없는 채로 저장돼 있던 참가자는 화면에 올리지 않고, **몇 명이 왜 빠졌는지** 배너로 알린다(조용히 사라지면 팀장은 자기가 지운 줄 안다).

  **스키마**: `V1GameParticipant.userId`(nullable) 추가 + 마이그레이션. 저장된 라인업을 등록 명단과 대조할 열쇠다 — 이름 문자열로 이으면 동명이인이 섞여 선발 표시가 엉뚱한 사람에게 붙는다. nullable인 이유는 이 컬럼이 없던 시절의 라인업과, 사용자 계정을 쓰지 않는 team-match 경로가 그대로 살아 있어야 하기 때문이고, 옛 참가자는 이름으로 한 번만 이어 붙인다.

  **수정 — 일정 화면에서 우리 팀 경기 강조**:

  - `GET /tournaments/:id/my-fixtures` 추가. 내가 매니저·오너인 팀의 이 대회 경기와 각 경기의 라인업 상태를 한 번에 준다 — 이게 없으면 화면이 경기마다 `lineup-access`를 따로 불러야 하고 그마저 공개 일정 응답과 짝지을 수 없다. 사이드·라인업 조회는 경기 수와 무관하게 각각 한 번씩만 한다.
  - 화면 위에 "우리 팀" 요약(남은 라인업 수 + 가장 임박한 경기로 가는 CTA), 목록에서는 내 팀 경기 행에 왼쪽 액센트 바·"우리 팀" 배지·라인업 상태 배지·라인업 링크. 상태는 색이 아니라 문구로도 구분한다. 비로그인·비참가 방문자에게는 조회가 401이라 화면이 종전 그대로다.

  **테스트**: 인가 판정(`resolveLineupRosterRegistration`)과 최신 리비전 선택(`latestLineupStateBySideId`)을 DB 없이 검증 가능한 순수 함수로 분리해 고정했다 — 특히 "참가팀 매니저가 상대팀 사이드를 요청하면 거부"는 무너지면 상대팀 선수 실명이 그대로 넘어가는 PII 경계다. 프론트는 등록 명단 기반 수화(동명이인 userId 매칭·옛 데이터 이름 매칭·명단 밖 참가자 제외)와 화면 계약(선수 추가 입력 부재·체크 토글·요약 숫자·명단 조회 실패)을 새로 덮었다.

- 22dfe37: 대회 경기 기록(라인업·득점/카드 이벤트·MVP·일정 카드 득점자 요약)의 참가자 이름을 관전자에게도
  공개한다 — Task 24 동의(consent) 게이팅을 대회 참가자에 한해 제거한다.

  **개인정보 노출 범위가 넓어지는 변경이다.** 지금까지는 참가자가 계정을 연동하고 명시적으로
  동의(GRANTED)해야만 관전자에게 실명이 보였고, 게스트/미연동 참가자와 동의하지 않은 참가자는
  항상 "비공개 선수"로 가려졌다. 이제는 **대회에 선수로 등록해 실제로 뛴 사람이면 동의·연동
  여부와 무관하게 이름이 공개**된다 — "대회 참가는 공개 활동"이라는 전제의 정책 결정이다.

  - **대상 범위**: `PublicTournamentRecordsService`(`GET /tournaments/:id/schedule`,
    `GET /tournaments/:id/matches/:fixtureId`)의 라인업/이벤트/MVP/득점자 요약뿐이다. 대회 밖의
    개인 기록(`GET /users/:id/records`)과 팀 매치 시리즈 기록은 이번 변경과 무관하게 기존 동의
    게이팅을 그대로 유지한다(`public-consent.ts`는 손대지 않았다 — 두 소비자가 계속 그대로
    의존한다).
  - **게스트/미연동 참가자**도 동일하게 공개된다 — 대회 참가자 여부는 이 route가 이름을 붙이는
    `V1GameParticipant`(대회 fixture의 game 참가자, 브라켓 생성 시
    `V1TournamentPlayer.realName`에서 스냅샷됨) 자체로 판별되고, 이 모집단과 "대회 참가자"의
    정의가 정확히 일치한다.
  - **탈퇴한 사용자**: `displayNameSnapshot`은 원래도 `V1User`에 라이브 조인되지 않는 불변
    스냅샷이라(탈퇴해도 갱신되지 않음, `roster-cleanup.ts`의 완료 대회 기록 보존 원칙과 동일),
    이 변경이 탈퇴자 이름 노출 범위를 새로 넓히지 않는다 — 동의만 살아 있으면 예전 정책에서도
    탈퇴 후 이름이 그대로 보였다.
  - PR #389의 스태프 우회, PR #405의 모집 중(open) 팀명 숨김은 영향받지 않는다(별도 정책, 별도
    게이트) — 각각 회귀 테스트로 확인했다.

  **롤백**: `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true` 환경 변수로 이전 동의 게이팅
  동작으로 즉시 되돌릴 수 있다(코드 변경/재배포 없이 프로세스 재시작만으로). 기본값(미설정)은
  새 정책(공개)이다 — 이미 승인된 정책 결정이라 기본으로 켜져 있어야 하기 때문이다. `PUBLIC_LIVE`
  류의 `v1_game_operation_flags`/게이트 번들 체계는 의도적으로 재사용하지 않았다 — enum
  마이그레이션이 필요하고, 그 승인 절차(V24/V26 게이트 번들, 14일 세리머니)가 그 두 플래그
  전용으로 하드코딩돼 있어 이번처럼 이미 승인된 정책을 기본으로 켜 두는 변경에는 과하다.

- 61823db: 공개 경기 기록에서 전반/후반을 구간으로 나눠 보여주고, 하프타임·정규시간 종료를 배지로
  구분한다(#433).

  관전자가 경기 진행을 따라갈 수 없던 두 가지를 고친다.

  - **전반/후반이 섞여 시간이 역전돼 보이던 문제** — `PublicMatchEvent.period`는 서버가 이미
    내려주고 있었는데 이벤트 목록이 그걸 무시하고 평평한 리스트로 그려, 전반 10′ 다음에
    후반 5′이 오는 순서가 됐다. 이제 피리어드 단위로 구간을 나눠 렌더한다.
  - **하프타임에도 배지가 그냥 "LIVE"이던 문제** — `clock === null`이 킥오프 전·하프타임·
    정규시간 종료 세 상황에서 모두 null이라 화면이 셋을 구분할 수 없었다. 백엔드에
    `resolvePeriodBreak(periods)` 순수 함수를 두어 `'halftime' | 'regulation_ended' | null`을
    파생하고, `PublicMatchDetail`·`PublicScheduleEntry`에 `periodBreak` 필드로 실어 보낸다.
    판정 우선순위는 LIVE 피리어드가 있으면 `null`(진행 시계가 상태를 이미 말해 준다),
    HALFTIME이 있으면 `halftime`, 전부 ENDED면 `regulation_ended`다.

- 대회가 끝나도 유저 페이지에 개인 기록이 하나도 안 나오던 문제를 고친다.

  **증상**: `GET /users/:id/records`가 **모든 사용자에게 항상 0건**이었다(alpha 실사용자 47명 전원 실측). 같은 대회의 팀 기록(`/teams/:id/records`)과 경기 득점자 이름은 정상이었는데 개인 기록만 전멸이었다.

  **원인**: 이 API는 `v1ParticipantIdentityLinkCurrent`에서 `userId → participantId`를 먼저 찾고 **없으면 즉시 빈 배열을 반환**한다. 그 연결 행을 만드는 유일한 경로는 '선수 본인 요청 → 제3자 승인' 2자 방식 REST 5개인데 `apps/v1_web` 전체에서 호출부가 0건이었고, 라인업이 계정 정보를 함께 저장하지도 않아 자동 연결이 구조적으로 불가능했다. 즉 화면 버그가 아니라 연결을 만들 입구 자체가 없었다.

  **연결**: 라인업 저장(`GamesService.saveLineup`)이 `participants[].userId`를 받으면 같은 트랜잭션에서 신원 연결을 자동 생성한다. 계정은 **참가 등록 명단에 살아 있거나 그 팀에서 활동 중인 선수**여야 하고(아니면 422 `LINEUP_USER_NOT_TEAM_MEMBER`), 한 요청 안에서 중복되면 422 `LINEUP_DUPLICATE_USER`다. 새 액션 `ROSTER_ASSERTED`를 도입한 이유는 DB 트리거 `v1_guard_identity_event`가 `ATTESTED`에 대해 '승인자≠본인'을 강제하기 때문이다 — 선수 겸 매니저가 자기를 라인업에 넣는 흔한 경우가 그 트리거에 막힌다. 로스터 귀속은 승인 절차가 아니라 명단 사실의 기록이므로 별도 액션으로 남겨 감사 추적을 유지한다.

  **동의**: 공개 동의를 참가자별 스냅샷에서 **사용자 단위 1회 동의**(`V1UserRecordConsent`)로 바꾸고 시간 비교(`동의 effectiveAt <= 경기 officialAt`)를 제거했다. 예전 규칙에서는 오늘 동의를 켜도 이미 확정된 과거 대회 기록이 영구히 보이지 않았다. 참가자별 스냅샷은 '이 경기 하나만 숨기기' override로 남는다. 기존에 참가자별 GRANTED를 갖고 있던 사용자는 마이그레이션에서 백필해 노출이 끊기지 않게 했다.

  **개별 숨김 복구**: `revokeParticipantConsent`가 '직전 스냅샷이 GRANTED여야 철회 가능'을 요구해, 라인업으로 자동 연결된(스냅샷을 거친 적 없는) 기록은 당사자가 숨길 방법이 없었다. 현재 링크가 호출자 것이면 스냅샷 없이도 숨길 수 있게 하되 새 스냅샷은 항상 현재 링크 아래에만 쓴다 — 죽은 linkId의 낡은 동의를 남이 뒤집는 일은 그대로 불가능하다. 이미 숨겨진 기록은 409 `CONSENT_ALREADY_REVOKED`.

  **화면**: 마이페이지에 '내 경기 기록 공개' 토글(`GET/PUT /me/record-consent`)을 넣고, 활동 기록으로 가는 동선과 빈 상태 문구("왜 비었고 어떻게 하면 보이는지")를 보강했다.

  **함께 고친 것**: 결과 보정 리비전이 `assists`/`fouls`를 싣지 않아 **보정할 때마다 도움·파울이 0으로 리셋**되던 문제(같은 패턴의 `games.service.ts`는 이미 올바르게 싣고 있었다), 자동 결과행의 `goalkeeper`가 `false`로 하드코딩돼 라인업이 아는 골키퍼 정보가 기록에 남지 않던 문제.

- ab3942c: 배정받은 대회 스태프가 자기 운영 화면에 **도달할 경로**를 만든다. 배정/해제 API와 권한 정책은 이미 있었지만 배정받은 사람이 그 화면을 찾아 들어갈 링크가 앱 어디에도 없었고, 특히 필드 담당자(FIELD_OPERATOR)는 배정에 항상 fixture/field 스코프가 붙어 대회 전역 리소스를 읽는 셸 진입 판정에서 **구조적으로** 거부됐다.

  **신설 API `GET /tournament-ops/me/assignments`** (V1AuthGuard): 호출자 본인의 해제·만료되지 않은 배정만 돌려준다. 대상 userId는 인증 주체에서만 오고 남의 배정을 지정할 입력 자체가 없다. FIELD_OPERATOR 배정에는 담당 경기 딥링크에 필요한 식별자(fixtureId·round·시각·경기장·팀명)를 함께 담는다 — 스코프 해석(fixture 스코프 ∩ field 스코프)은 권한 정책의 규칙과 1:1로 대응하며, 그 일치를 유닛 스펙이 `decideTournamentStaffAccess`로 교차 검증한다.

  **실시간 콘솔 핸드셰이크 수정**: 경기 콘솔은 소켓 핸드셰이크에 자기 배정 버전을 제시해야 `game.subscribe`/`game.takeover.request` staleness 게이트를 통과하는데, 그 값을 대회 전역 스태프 목록에서 읽고 있었다 — 필드 담당자는 그 목록이 항상 403이라 0을 제시했고, 배정 버전이 0이 아니면 정작 현장 담당자만 실시간 구독이 막혔다. 이제 본인 스코프 라우트에서 읽는다(모든 역할 동일 경로, platform_ops는 종전대로 배정 행 없음 → 게이트 비적용).

  **진입점**: `/tournament-ops`(내 대회 운영) 화면을 추가하고 마이페이지에 배정이 있을 때만 보이는 카드를 붙였다. 필드 담당자는 대회 셸을 건너뛰고 담당 경기 콘솔로 직행하고, 디렉터·서포트는 종전대로 대회 운영 보드로 간다. 배정이 없으면 진입점 자체가 노출되지 않는다.

  **셸 진입 판정은 그대로 둔다**: 대회 전역 스태프 목록 1회 조회로 역할을 도출하는 기존 판정을 건드리면 "내 행이 없으면 platform_ops"라는 역할 추론이 무너져 일반 스태프에게 어드민 전용 내비가 열린다. 대신 종전에 무조건 "권한 없음"으로 끝나던 **경기 콘솔 딥링크 경로 하나만** 열었다 — 내 배정이 바로 그 대회의 바로 그 경기를 담당할 때만 통과하고, 통과 후에도 화면이 호출하는 모든 API는 서버에서 경기 단위로 다시 인가된다. 이 역할에는 셸 내비 대신 최소 크롬만 준다(누르면 403 나는 링크를 만들지 않는다).

  **배정 UX**: 스태프 배정 모달이 조용히 잠긴 제출 버튼 대신 막힌 이유를 해요체로 알려주고(사용자 ID 미입력/형식 오류/담당 경기장 미선택, 초점도 해당 입력으로 이동), 배정 성공 후에는 배정된 사람이 어디로 들어가면 되는지 화면에 남는 안내로 알려준다. 스코프 거부 문구도 사실에 맞게 고쳤다("아직 지원하지 않는 화면" → "담당 범위 밖의 화면" + 내 대회 운영 링크).

- c821739: 스태프가 자기 담당 대회 운영 화면으로 들어가는 진입점을 추가한다.

  접근 권한 자체는 이미 열려 있었다(`tournament-ops/layout.tsx`는 role-agnostic `RequireAuth`만
  적용하고, 실제 스코프 인가는 `TournamentStaffAccessService`가 라우트별로 담당). 진짜 문제는
  자기 담당 대회를 찾을 수단이 없어 실질적으로 진입이 불가능했다는 것이다.

  - `GET /me/tournament-staff` (v1_api): 로그인 사용자의 **유효한**(만료·해제되지 않은) 스태프
    배정을 대회 단위로 묶어 반환한다. `TournamentOperationsStaffService.myAssignments()` — 자기
    자신의 배정을 보는 self-scoped read라 `TournamentStaffAccessService.assertAccess()`를 거치지
    않는다(`MyMatchesController`/`MyScheduleController`와 동일한 `me` 프리픽스 관례). 진행 중인
    대회를 먼저 보여주도록 정렬하고, 한 대회에 여러 배정(예: 필드 담당자로 두 구장)이 있으면
    대회 하나로 묶어 중복 없이 표현한다.
  - 마이페이지(`/my`)에 "대회 운영" 섹션을 조건부로 추가한다 — 유효한 배정이 하나도 없는
    사용자(대부분)에게는 보이지 않는다. 진입하면 `/my/tournament-staff`에서 담당 대회 목록을
    보고 각 대회의 운영 화면(`/tournament-ops/tournaments/:id/operations`)으로 이동할 수 있다.
    배정이 있었으나 전부 만료/해제된 경우에는 빈 상태 안내를 보여준다.

- 34f00d8: 팀 라인업 재사용 — 이전 라인업 불러오기 · 프리셋 · 등번호 기억 · 미입력 리마인더

  **증상**: 라인업을 짤 때마다 같은 일을 반복했다. 지난 경기와 사실상 같은 명단인데도 선발을 다시 고르고, 등번호를 다시 넣고, 포메이션과 배치를 처음부터 다시 만들었다. 게다가 라인업을 아예 넣지 않은 채 경기 당일을 맞아도 아무도 알려주지 않았다 — 팀장이 스스로 기억하고 들어가 확인하는 수밖에 없었다.

  **이전 라인업 불러오기 (두 화면 모두)**

  - `GET /teams/:teamId/lineup-history` — 우리 팀이 과거에 낸 라인업을 **대회와 팀 매치를 가로질러** 모은다. 대회 첫 경기에서도 직전 팀 매치 라인업을 그대로 쓸 수 있다. `V1GameSide.teamId`로 좁히기 때문에 상대팀 사이드는 결과에 들어올 수조차 없다 — 킥오프 전 상대 전술 비공개 원칙이 쿼리 구조 자체로 지켜진다.
  - 골키퍼는 종목마다 코드가 다르다(축구 `GK`, 풋살 `GOLEIRO`). 서버가 그 경기의 종목 사전을 보고 boolean으로 풀어서 주므로 클라이언트가 사전을 다시 해석하지 않는다.
  - 두 화면에서 불러오기의 **뜻이 다르다**. 대회 경기는 등록 명단이 유일한 출처이므로 명단을 갈아끼우지 않고 "누가 선발이었고 등번호와 자리가 무엇이었는지"만 덧입힌다. 팀 매치는 명단 자체를 팀장이 정하므로 명단을 통째로 채운다.
  - 종목이 다른 라인업을 불러오면 배치를 버리고 명단 구성만 가져온다. 풋살 좌표를 축구 피치에 그대로 옮기면 있지도 않은 자리에 선수가 선다.

  **자격 필터 — 조용히 사라지지 않게**

  - 팀 매치 `GET /team-matches/:id/lineup` 응답에 `eligibleMembers` 추가. 서버는 저장할 때 "현재 팀 소속 + 참석(GOING) 응답" 두 조건을 강제하는데, 화면은 팀원 전체만 알고 있어서 **참석하지 않은 사람을 넣고 저장을 눌러야 비로소 422를 만났다**. 판정 규칙을 프론트에 복제하면 서버와 갈라지므로, 규칙을 소유한 서버가 결과만 내려준다.
  - 불러온 라인업에 지금 넣을 수 없는 사람이 섞여 있으면 가능한 사람만 채우고 **누가 왜 빠졌는지** 배너로 알린다("13명 중 10명을 불러왔어요 · 홍길동·김철수(참석 응답이 없어요)").

  **라인업 프리셋** — `/teams/:teamId/lineup-presets` CRUD. 이름 붙인 템플릿을 팀당 10개까지. 경기 스냅샷과 다른 테이블인 이유는 스냅샷이 "그날 이렇게 뛰었다"는 불변 기록인 반면 프리셋은 팀이 계속 고쳐 쓰고 불러올 때마다 현재 이름·자격으로 다시 해석되기 때문이다. 골키퍼를 종목 코드가 아니라 **의미**(boolean)로 저장해 종목이 다른 화면에서도 알아본다.

  **등번호 기억** — 불러온 값 → 팀 고정 등번호(`V1TeamMembership.jerseyNumber`, 신규) → 그 선수가 직전에 달았던 번호 순으로 채운다. 라인업 화면에서 고친 등번호는 팀 고정값을 덮어쓰지 않는다 — 한 경기의 임시 번호가 팀 기본값을 조용히 바꾸면 나중에 아무도 이유를 모른다. `PATCH /team-memberships/:id/jersey`로만 명시적으로 바꾼다.

  **라인업 미입력 리마인더**

  - `GET /me/lineup-todos` — 내가 팀장·매니저인 팀들의 "아직 라인업을 넣지 않은 다가오는 경기". 상태를 저장하지 않고 볼 때마다 다시 계산하므로 알림을 놓쳤어도, 껐어도 남아 있다. 홈 화면 "라인업을 기다리는 경기" 카드가 이걸 쓴다.
  - 매일 한 번 리마인더 + 킥오프 2시간 전 최종 확인. 둘 다 라인업 화면으로 바로 꽂히는 링크를 달고 팀의 owner·manager 전원에게 간다. **밤 9시부터 아침 9시까지는 보내지 않는다.**
  - "하루 한 번"에 발송 이력 테이블을 쓰지 않는다. `V1Notification.businessKey`(unique)에 한국 날짜를 박아 DB 제약으로 보장한다. 알림은 대회 단위로 묶는다 — 대회는 하루에 여러 경기를 치르는데 경기마다 보내면 소나기가 되고, 그러면 정작 중요한 날에 무시당한다.
  - 예약이 아니라 **주기 스캔**인 이유: 대회 일정은 운영 중에 바뀐다. 미리 예약하면 일정을 바꾸는 모든 경로에서 취소·재생성을 해야 하고 하나만 빠뜨려도 알림이 엉뚱한 시간에 간다. 스캔은 언제나 지금의 일정을 본다. 두 번째 스케줄러를 들이지 않으려고 기존 outbox 워커를 재사용한다.

  **마이그레이션** `20260813200000_v1_team_lineup_reuse` — `v1_team_memberships.jersey_number`(팀 내 부분 유니크), `v1_team_lineup_presets`, `v1_team_lineup_preset_entries`.

- ab3942c: 대회 경기 영상을 **등록**할 수 있게 한다. `V1TournamentFixtureVideo` 모델과 재생 UI(유튜브 iframe·업로드 파일 HTML5 video·외부 링크)는 이미 있었지만 그 표에 쓰는 프로덕션 경로가 하나도 없어서, 시드 스크립트로 넣은 데이터 외에는 영상이 존재할 수 없었다. 유일하게 쓰기 DTO가 달려 있던 자리(`RecordResultDto.videos`)는 무조건 409 `TOURNAMENT_RESULT_DERIVED_ONLY`로 끝나는 죽은 입력이라 같은 변경에서 삭제했다.

  **신설 API** (`apps/v1_api/src/tournaments/videos/`): 대회 전체 목록 조회, 경기별 목록 조회, 링크 등록(`{url,title?}`), 업로드+등록(multipart, mp4/webm/mov 200MB), 삭제. 외부 링크와 업로드 파일을 모두 받되 출처는 URL 모양으로 구분하므로 **스키마 변경·마이그레이션이 없다**.

  **권한**: 새 개념을 만들지 않고 기존 스태프 정책을 그대로 쓴다 — 조회는 `read`, 등록·삭제는 `event_append`. 그래서 대회 디렉터·플랫폼 운영자는 대회 전체, 필드 담당자는 배정된 담당 경기(또는 담당 경기장)에서만 등록할 수 있고, 지원 담당은 조회만 된다. 판정은 컨트롤러 가드가 아니라 서비스에서 하며(필드 단위 배정은 경기의 `fieldId`까지 봐야 판정된다), 존재 확인은 항상 인가 뒤에 해서 404/403 차이로 경기 존재를 알아낼 수 없게 했다.

  **링크 검증**: `http`/`https`만 허용해 `javascript:`·`data:`·`file:`·프로토콜 상대 주소를 막고, 자격증명이 포함된 주소를 거부하며, 업로드 경로는 `/uploads/` 밖으로 나가는 인코딩된 우회까지 차단한다.

  **공개 영상 업로드 경로 축소(보안)**: 로그인만 하면 누구나 호출할 수 있던 `POST /uploads/videos`를 제거했다. 그 파일을 소비하는 제품 표면은 대회 경기 영상 하나뿐인데 그쪽은 스태프 전용이라, 남아 있던 부분은 사실상 "아무도 참조하지 않는 공개 영상 호스트"(사용자당 하루 500MB·보관 2GB)였다. 업로드는 스태프 인가가 걸린 등록 경로 안으로 들어왔다.

  **업로드 파일 수명 관리**: 업로드와 등록을 한 요청으로 묶어 "업로드는 됐는데 등록이 실패해 남는 200MB 파일"을 없앴고, 인가 실패 시 multer 임시 파일을 지운다. 영상 행을 지우면 같은 파일을 참조하는 행이 하나도 없을 때 물리 파일과 업로드 원장(`V1UploadAsset`, 업로더 보관 쿼터의 근거)까지 함께 회수한다.

  **운영 화면**: 대회 운영 셸에 "경기 영상" 화면을 추가했다(내비 포함 — 링크 없는 고아 라우트를 만들지 않는다). 링크/파일 두 방식, 허용 형식·용량 사전 안내, 삭제 확인 모달(업로드 파일이면 파일도 지워진다고 알림), 지원 담당에게는 등록·삭제 버튼을 감추고 이유를 적는다.

- bb4b20f: 팀 운영진(manager)이 대회 실무를 팀장(owner)과 동일하게 처리할 수 있게 한다.

  **증상**: 팀 운영진이 대회 관련 기능을 팀장 대신 처리할 수 없다는 요청. 대회 도메인의 팀 권한 게이트를 전수 조사한 결과, 신청·명단·라인업 등 **대부분은 이미 `role: { in: ['owner','manager'] }`로 운영진을 포함**하고 있었고 실제로 막혀 있던 곳은 두 군데였다.

  **원인 1 — 선수 신원연결 승인**: `GamesService.assertAttestorAuthority`만 멤버십을 `role: 'owner'` 단독으로 조회하고 있었다. 같은 서비스의 `resolveActor`·라인업 권한 판정은 전부 owner/manager를 동등하게 취급하는데 이 한 곳만 예외로 남아, 운영진은 자기 팀 선수의 신원 연결을 승인·거부할 수 없었다.

  **원인 2 — 대회 후기**: 권한 기준이 팀 역할이 아니라 **"대회 신청 버튼을 누른 사람"**(`registration.appliedByUserId === me`)이었다. 팀장이 신청했으면 운영진은 후기를 쓰지도, 우리 팀이 이미 썼는지 조회하지도 못했다. `submitReview`·`listMyPendingReviews`·`getMyReview`·`isParticipant` 네 곳이 모두 같은 기준을 쓰고 있었다.

  **수정**:

  - `assertAttestorAuthority`를 owner+manager로 확장. `sideTeamId` 스코프(상대 팀 승인 불가)와 자가승인 금지(`IDENTITY_LINK_SELF_ATTESTATION_FORBIDDEN`)는 그대로 유지 — 넓힌 것은 "누가"이지 "어느 팀을"이 아니다.
  - 후기 권한을 **"참가 확정 팀의 active owner/manager"**로 전환. 팀 조회에는 대회 도메인의 다른 게이트(`tournament-registrations.service.ts`, `tournament-players.service.ts`)와 동일하게 `status: 'active', deletedAt: null`을 적용해 해체된 팀의 운영진이 새어 들어오지 않게 했다.
  - 후기를 팀에 귀속시키기 위해 `V1TournamentReview.teamId`를 추가하고 **팀당 대회 1건** unique를 건다. 기존 `(tournamentId, authorUserId)` unique도 유지되므로 "한 사람 1건 + 한 팀 1건"이 함께 보장된다.
  - 여러 팀의 운영진을 겸임하고 그 팀들이 모두 같은 대회에 참가 확정된 경우에만 팀 선택이 필요하다. 서버가 `400 TEAM_SELECTION_REQUIRED` + `details.teams`로 후보를 돌려주고, 프론트가 이미 입력한 별점·내용·사진을 유지한 채 `role="radiogroup"` 팀 선택 UI를 띄워 재제출한다. 자격 팀이 하나면 자동 선택돼 기존 UX 그대로다.

  **함께 고친 조용한 버그**: 팀 후보 목록을 예외 바디의 top-level `teams`로 실었더니 `AllExceptionsFilter`가 `code`/`message`/`details`만 전달하고 그 필드를 버려, 프론트가 이 상태에서 영영 복구할 수 없었다. 다른 도메인의 구조화 에러(`PROFILE_COMPLETION_REQUIRED`)와 같게 `details` 안으로 옮겼다.

  **마이그레이션**(`20260813070000_v1_tournament_review_team_scope`): `team_id` 추가 → 백필 → unique → FK 순이며 전 구문 idempotent(빈 DB 재생 포함). 백필은 `registration.status='confirmed'` + `team.name = review.team_name` 스냅샷으로 후보를 좁혀 **review당 후보가 정확히 1건일 때만** 채우고, 모호하면 `NULL`로 보존한다(삭제 없음). 첫 작성본은 `(tournament_id, applied_by_user_id)`로만 조인해 여러 팀을 겸임한 신청자의 리뷰가 팀 수만큼 fan-out 되고 `UPDATE ... FROM`이 그중 아무 행이나 고르는(Postgres 문서상 unspecified) 결함이 있었다 — 적대적 리뷰에서 잡아 고쳤다. partial index 대신 평범한 composite unique를 쓴 것은 Postgres NULL-distinct 시맨틱상 NULL끼리 충돌하지 않고, Prisma DSL이 `WHERE` 절을 표현하지 못해 partial index를 쓰면 드리프트 게이트가 영구히 깨지기 때문이다.

  **하지 않은 것**: 대회 일정 화면의 라인업 진입 동선은 이 브랜치에서도 만들었다가 버렸다 — 작업 중 dev에 `useV1MyTournamentFixtures` 기반의 "우리 팀 경기 + 라인업 상태" 요약이 머지됐고, 그쪽이 이미 owner+manager를 포함하는 데다 더 낫다. 중복 구현을 남기지 않고 dev 것을 채택했다.

- ab3942c: 대회 경기에서 **개인 간(사용자↔사용자) 후기**를 열었다. 지금까지 개인 대상 후기는 개인 매치(`match`)에서만 가능했고, 대회(`tournament_fixture`)·팀 매치(`team_match`)는 서버가 `targetType=user`를 400으로 명시 거부했다.

  **대상 명단은 상대팀 대회 로스터(`V1TournamentPlayer`, `removedAt=null`) 기준.** 대회 경기 라인업(`V1GameParticipant`)에는 `userId` 컬럼이 없어 "그 경기에 누가 뛰었는지"를 사용자 단위로 알 수 없기 때문에, 대회 등록 로스터를 근거로 삼는다. 명단을 **상대팀 등록에서만** 뽑으므로 같은 팀 동료는 구조적으로 대상에서 빠진다(팀 내부 담합 방지). 작성 주체는 팀 후기와 같은 정책 — 참가팀 `active` 멤버 전원. 실명(`realName`)은 응답에 싣지 않고 닉네임만 노출한다.

  **팀 매치로는 넓히지 않았다.** 팀 매치는 신청·승인이 팀 단위라 참가 선수 명단을 담는 모델이 없어 "그 경기의 상대 선수"를 특정할 근거가 없다.

  **중복 방지 스코프는 대회 단위.** 기존 개인 후기 제약 `(reviewer_user_id, target_user_id, source_type, source_id)`의 `source_id`는 픽스처라서, 같은 상대를 예선·8강·결승에서 세 번 평가할 수 있었다. 팀 후기가 쓰던 `source_group_id`(=대회) 스코프를 개인 대상에도 똑같이 적용하는 unique 인덱스를 추가한다(`match` 후기는 `source_group_id`가 NULL이라 영향 없음).

  **평판은 소스별로 분리한다.** `V1UserReputationSummary`에 `tournament_trust_state` / `tournament_manner_score` / `tournament_review_count` / `tournament_source_label`을 추가하고, 대회 개인 후기는 이 컬럼에만 쌓는다. 한 대회에 나가면 상대팀 로스터 전원에게 며칠 만에 수십 건을 받을 수 있어, 개인 매치 평점과 같은 컬럼에 합산하면 그동안 쌓아온 점수가 대회 한 번에 통째로 덮인다(`V1TeamTrustScore`의 `team_match` ↔ `tournament_fixture` 컬럼 분리와 같은 선례). 집계 단위도 팀 후기와 같은 "대회 × 평가한 팀 1표"다 — 상대팀 15명이 한 사람에게 몰아쓰는 것은 15개의 독립된 의견이 아니라 한 팀의 의견이기 때문이다.

  **상호 공개(reveal) 짝 맞추기 단위도 대회로 접었다.** 대회 후기는 중복 방지 스코프가 대회 단위라 내가 예선에서 평가하고 상대가 결승에서 평가하면 두 행의 `source_id`가 다르다 — 픽스처 기준으로 맞추면 짝이 영영 성립하지 않아 상호 공개 경로가 죽고 72시간 폴백만 남았다. 팀 대상 대회 후기에도 같은 함정이 있었고 함께 고쳤다.

- 61a3e97: 출전 기록을 "라인업에 이름이 올랐다"가 아니라 "실제로 그라운드에 나갔다"로 좁힌다.

  **증상**: 대회 경기가 끝나면 `deriveTournamentRevision`이 라인업에 등록된 참가자 **전원**을 `started: true`로 못박아 `v1_game_result_participants`에 적었다. 그 테이블의 row 하나가 곧 "이 선수는 이 경기를 뛰었다"는 뜻이고, `PublicUserRecordsService`의 `summary.appearances`(프로필의 "출전 N경기")는 이 row를 그대로 센다 — 그래서 **한 번도 투입되지 않고 벤치를 지킨 선수가 선발 출전 1경기를 얻었다**. 팀 매치도 같은 결함이 있었다: 결과 입력 화면이 선발+벤치 전원(`roster`)을 `actualParticipants`로 전송했다.

  **판정 기준**: 선발(`V1GameParticipant.started`)이거나, 취소되지 않은 `SUBSTITUTION`으로 투입됐거나(신설 `deriveAppearedParticipantIds`), 스탯 이벤트의 주체인 참가자만 결과에 기록한다. 교체로 빠진 선발은 그대로 출전으로 남는다 — 나갔다고 뛴 사실이 사라지지 않으므로 "지금 피치 위에 누가 있나"를 답하는 `deriveOnPitchParticipantIds`와는 다른 fold다. 스탯 union은 안전장치다: 이벤트 append는 득점자가 피치 위에 있는지 검사하지 않아, 교체 입력을 빠뜨린 채 골만 기록된 운영 실수에서 그 골이 조용히 사라지지 않게 한다. `started`도 하드코딩 `true` 대신 라인업의 실제 값을 쓴다.

  **팀 매치**: 라이브 이벤트 스트림이 없어 교체 여부를 판정할 근거가 없으므로, 결과 입력 화면에 "출전 선수" 단계를 추가해 벤치 선수의 교체 출전을 체크로 받는다. 체크하지 않은 선수는 결과에서 빠지고, 득점자·카드·MVP 후보에서도 제외된다(체크를 해제하면 이미 붙어 있던 득점·카드·MVP도 함께 걷힌다).

  **기존 데이터**: 대회 경기는 백필 마이그레이션(`20260813200000_v1_appearance_gate_backfill`)이 같은 규칙을 소급 적용한다. 팀 매치 과거 결과는 교체 여부를 판정할 근거가 DB에 없어 손대지 않는다 — 지우면 실제로 뛴 교체 선수의 기록까지 사라지는 추측이 되기 때문이고, 새 체크가 붙은 이후 제출분부터 정확해진다.

- 4f69d52: 개인 공개 기록에서 파울 누적치를 노출하지 않는다 — 카드(경고/퇴장)는 그대로 공개한다.

  **판단**: 카드는 경기의 서사로서 공개할 값이지만, 일반 파울 개수는 선수 개인 프로필에
  "파울 N개"라는 낙인으로 남을 뿐 관전자에게 주는 정보가 없다. DB에는 계속 쌓되 공개
  표면에서만 뺀다.

  **감사 결과**: 공개 표면을 전수 확인했더니 파울이 새는 경로는 `GET /users/:id/records` 의
  `summary.fouls` **한 곳뿐**이었다. 팀 공개 기록(`PublicTeamRecordsService`)에는 참조가 0건이고,
  대회 공개 기록은 이벤트를 `GOAL` 만 집계하며 경기 상세 타임라인도 `GOAL`·`CARD` 만
  통과시킨다(`public-tournament-records.service.ts` 의 `scoringTypes`) — 그쪽은 관전자 폴링
  비용 때문에 이미 의도적으로 파울을 읽지 않고 있었다. 개인 기록만 그 정책에서 빠져 있었고,
  심지어 **UI 는 이 값을 화면에 그리지도 않아 응답 JSON 에만 실려 나가던 상태**였다.

  **수정**:

  - `summary.fouls` 제거. 그로 인해 미사용이 되는 `EligibleResultRow.fouls`, Prisma
    `select { fouls: true }`, `fouls: row.fouls` 매핑까지 함께 삭제했다(dead code 미잔류).
  - 웹 `PublicUserRecordsSummary` 에서 `fouls` 제거.
  - 통합 테스트를 뒤집었다 — 기존 테스트가 `summary.fouls === 3` 을 계약으로 못박고 있어서,
    **"DB 에는 `fouls=3` 이 그대로 남아 있는데 공개 응답에는 실리지 않는다"** 를 검증하도록
    바꿨다(저장은 유지되고 노출만 사라졌음을 한 테스트가 동시에 증명한다).

  **유지**: DB `V1GameResultParticipant.fouls`, `FOUL` 이벤트, 개인 기록의 `경고 N · 퇴장 N`,
  경기 상세 타임라인의 `CARD`, 운영 콘솔의 팀 파울 카운터(`TeamFoulCounterBar`), 결과 검수
  입력 폼, `game-invariants.ts` 의 `fouls ↔ FOUL` 이벤트 정합성 검증 — 전부 그대로다. 심판과
  운영은 계속 파울을 보고 기록하며, 사라지는 것은 선수 개인의 공개 프로필에 붙던 꼬리표뿐이다.

  **트레이드오프**: 공개 응답 계약이 바뀐다. 현재 `summary.fouls` 를 읽는 소비자는 웹 타입
  정의뿐이라 영향이 없지만, 외부에서 이 필드를 읽던 곳이 있다면 깨진다.

- fb28109: 모바일에서 제보된 대회 라인업 화면 잘림 2건과, 스태프 배정이 사실상 불가능하던 문제를 고쳤다.

  **대회 라인업이 하단 탭바에 가리던 문제** — 하단 고정 CTA(`.tm-fixed-cta`)를 쓰는 화면은
  하단 탭바를 띄우지 않는 것이 이 저장소의 관례인데(team-match 라인업·대회 상세·참가 신청·
  매치 생성 모두 `bottomNav={false}`), 대회 경기 라인업만 빠져 있었다. CTA는 `bottom: 0`이고
  탭바는 74px 높이로 같은 자리를 차지해 저장·제출 버튼과 "배치 설정" 바텀시트 하단이 가렸다.

  **제출 버튼 라벨 오버플로** — 막힌 사유 전체("저장하지 않은 변경사항이 있어요 — 먼저 저장해
  주세요")가 버튼 라벨이었는데, 이 버튼은 저장 버튼과 `1fr 1fr`로 폭을 나눠 가져 390px에서
  한 칸이 약 170px이다. 사유를 버튼 위 안내 줄로 옮기고 `aria-describedby`로 버튼과 묶었다.

  **스태프 배정 사용자 검색** — 배정 폼이 사용자 UUID 직접 입력이었고 안내는 "어드민 > 사용자
  관리에서 ID를 복사해 오라"였다. 어드민이 아닌 대회 디렉터는 그 화면에 들어갈 수 없어 배정할
  방법이 없었다. `GET /tournament-ops/tournaments/:tournamentId/staff/user-search`를 추가해
  닉네임으로 찾아 고르게 했다. 검색이 사용자 명부 열람이 되지 않도록 인가를 grant와 같은 두
  역할(`platform_ops`/`tournament_director`)로 좁히고, 검색어 2글자 하한·결과 10건 상한
  (페이지네이션 없음)·60초 30회 rate limit을 뒀다. 노출은 닉네임·표시명과 마스킹된 이메일뿐이며
  실명은 검색 조건에서도 응답에서도 제외한다. 이메일은 정확히 일치할 때만 매칭한다.

  배정 모달은 폼이 화면보다 길어지면(키보드가 올라온 상태) 하단 버튼이 화면 밖으로 밀리던
  것도 함께 고쳤다 — 높이를 뷰포트로 묶고 본문만 스크롤시켜 머리말과 버튼 줄은 항상 보인다.

- 62e6994: 양 팀 모두에 소속된 사람이 경기 후기를 아예 못 쓰던 것을 두 방향 모두 쓸 수 있게 바꾼다.

  **증상**: 팀 매치·대회 경기에서 홈·원정 양쪽의 active 멤버인 사용자는 후기 소스를 열면
  `AMBIGUOUS_REVIEWER_TEAM`(409)으로 막혔다. 작성 대기 목록에서도 그 경기가 통째로 빠져
  있어(`resolveReviewerTeamId` 가 후보 2건이면 null 을 반환) 후기가 밀려 있다는 사실조차
  보이지 않았다. alpha 실측: A·B 양 팀 소속 계정에서 A vs B 경기 3건이 전부 409 였고,
  같은 경기가 A팀만 소속인 팀장 계정에는 정상으로 보였다.

  **판단**: "어느 팀 입장으로 쓰는지 서버가 임의로 정할 수 없다"는 원래 판단은 맞다.
  그런데 애초에 정할 필요가 없었다 — 2팀 경기에서는 **평가 대상이 곧 작성자 팀을 결정한다**
  (B팀을 평가하면 나는 A팀 입장, B팀 로스터의 선수를 평가해도 마찬가지). 그래서 클라이언트가
  `reviewerTeamId` 같은 값을 새로 보낼 필요 없이, 양쪽 맥락을 모두 돌려주기만 하면 된다.

  **변경**:

  - `resolveReviewerTeam`(단일 반환 + 409) → `resolveReviewerTeams`(홈→원정 순 배열). 참가팀
    소속이 하나도 없으면 `NOT_TEAM_MEMBER`(403)는 그대로다.
  - 작성 대기 목록의 `resolveReviewerTeamId` → `resolveReviewerTeamIds`. 겸직이면 한 경기가
    두 방향 2건으로 나온다.
  - 대회 경기는 맥락 자체가 팀별로 갈리므로(`reviewContext` → `reviewContexts`) 상대팀 1건 +
    상대 로스터 N명이 방향마다 따로 생긴다. 제출 시에는 대상이 어느 맥락에 속하는지로
    작성자 팀이 정해진다.
  - 응답의 각 `target` 에 `reviewerTeam` 을 실어 어느 팀 입장인지 알 수 있게 했다. 겸직이라
    단일 값으로 좁힐 수 없을 때 최상위 `reviewerTeam` 은 `null` 이 되므로, 소비자는
    `targets[].reviewerTeam` 을 기준으로 삼아야 한다. 화면에서는 겸직일 때만 대상 카드에
    "OO 대표로 작성" 라벨이 붙는다(그 외에는 헤더가 이미 같은 정보를 보여줘 중복이라 생략).

  **트레이드오프**: 겸직자는 한 경기에서 A팀 대표로 B팀을, B팀 대표로 A팀을 평가할 수 있게
  된다. 팀 신뢰점수는 상호 후기가 모두 제출돼야 공개되는 reveal 게이트를 거치는데, 양쪽을
  혼자 다 쓰면 그 게이트가 자력으로 열린다. 겸직 자체가 드문 상태이고, 막는 쪽(현행)은
  정상 사용자가 후기를 아예 못 쓰는 대가를 치르므로 여는 쪽을 택했다.

  **유지**: 중복 판정은 그대로 사람 기준이다(같은 팀의 다른 멤버가 쓴 후기를 "내 후기"로
  잠그지 않는다). 참가팀 소속만 쓸 수 있다는 게이트도 그대로다.

- 2a9ca34: 경기 이벤트에 도움(assist) 기록과 파울(FOUL) 이벤트 타입을 추가한다: GOAL 이벤트에 같은 팀·다른 선수를 도움으로 지정할 수 있고(자기 자신·상대팀 지정은 422 ASSIST_INVALID로 거부), FOUL은 더 이상 CORRECTION 이벤트로 위장되지 않는 정식 이벤트 타입이다. 경기 결과 집계와 공개 개인 기록(`GET /users/:id/records`) 요약에 도움/파울 합계가 함께 노출된다.
- c6c4d58: 경기 운영 콘솔의 실측 실패 사고(6건 기록 시도 중 2건 "이벤트를 기록하지 못했어요" 실패, 원인 불명)를 후속 조치한다.

  - 실시간 게이트웨이(`RealtimeGateway`)의 모든 이벤트 커맨드 거부 경로가 이제 PinoLogger로 남는다(코드/게임/해시된 행위자 — 원문 userId 없이). 지금까지는 실패가 클라이언트 배너에만 보이고 서버 어디에도 흔적을 남기지 않았다.
  - 서버가 던질 수 있었는데 콘솔이 매핑하지 않았던 9개 에러 코드(`TERMINAL_GAME_IMMUTABLE`, `EVENT_INVALID`, `PARTICIPANT_SIDE_MISMATCH`, `SCORER_REQUIRED`, `COMMAND_IDEMPOTENCY_KEY_MISMATCH`, `IDEMPOTENCY_PAYLOAD_CONFLICT`, `INVALID_ACTOR_SCOPE`, `COMMAND_CONCURRENCY_CONFLICT`, `INTERNAL_ERROR`)에 전용 안내 문구를 추가하고, 재시도로 풀리지 않는 코드에서는 "전송 상태" 패널의 "다시 시도" 버튼을 숨긴다.
  - 전송 큐의 재시도가 서버의 기존 리베이스 경로(`game.event.retry`)로 나가도록 고쳤다 — 이전에는 재시도가 원래의 낡은 `expectedVersion`으로 `game.event.append`를 다시 보내 항상 같은 이유로 다시 실패했다.
  - 경기 운영 콘솔의 기록 흐름을 "선수 먼저 → 액션"에서 "액션(골/카드/파울) 먼저 → 대상 선수"로 뒤집는다. 기록 시각은 액션을 탭한 순간에 고정되고(선수를 고르는 동안 밀리지 않는다), 대상 선택 화면은 양 팀 라인업을 그대로 보여줘 팀 혼동을 막는다. 파울은 선수 지정 없이 팀 단위로도 기록할 수 있다.
  - 진행 중 경기의 경과 시간을 헤더에 크게 표시하고(초 단위, 서버-기기 시각차 보정), 기록된 이벤트 목록의 시각 표시를 분 단위(`10'`)에서 초 단위(`10:06`)로 바꿔 같은 분에 기록된 이벤트를 구분할 수 있게 한다. 재개/일시중지/종료 명령의 처리 소요 시간을 ms 단위로 헤더에 표시한다.

- c6e7e5e: Implement live tournament-fixture game operations for Task 20: an exclusive, expiring takeover-token grant (`GameTakeoverService`, 90s TTL, one holder per game, renew/reacquire) enforced on every exclusive game command/event/lineup-submit mutation instead of the prior any-non-empty-string stub; realtime `game.takeover.request`/`game.takeover.renew` socket handlers; a 30-second server-clock-drift check (`422 CLOCK_DRIFT`) on game commands and event appends; tournament required-scorer-policy enforcement at event-append time (`422 SCORER_REQUIRED`); a period-regression ("late event") guard (`422 EVENT_LATE`); an explicit `409 EVENT_ALREADY_REVERSED` guard on double-reversal attempts; and the `POST /api/v1/games/:gameId/result-recovery/derive-and-submit` route for recovering a pre-existing ended-without-revision tournament game (restricted to tournament_director/platform_ops).
- 730063c: 대회 생성/수정 화면에서 관리자가 "교체 방식"(제한/무제한 롤링)과 "교체 횟수"를 종목별 실제 지원값 기준으로 고를 수 있다. 스키마 변경 없이 기존 `V1CompetitionConfigVersion` 버전 체계를 재사용해 find-or-create로 pin하며(출전 인원 설정과 동일한 패턴), 출전 인원 설정과 함께 바꿔도 서로의 값을 canonical로 되돌리지 않는다. 진행 중/완료된 대회의 변경 정책은 출전 인원과 동일하게 차단한다.
- 65a7fd0: 매치·팀매치 생성 위저드에 최근 사용한 장소 제안을 추가하고, 리그 대진 일괄생성 폼(관리자)의
  동일한 칩 UI와 하나의 컴포넌트로 합쳤다.

  - **장소 제안(#3 1단계)**: 새 Venue 테이블 없이, 장소 입력창에 포커스를 주면 내(개인 매치)·내 팀
    (팀매치, 호스트 팀 기준)이 과거에 실제로 입력했던 장소를 최근순으로 최대 5개 칩으로 보여주고
    탭 한 번으로 채운다. 신규 API `GET /matches/me/recent-venues`, `GET /teams/:teamId/recent-venues`
    (팀 관리자만 조회 가능).
  - **칩 컴포넌트 통합**: 위저드의 `RecentVenueChips`(`components/v1-ui/create-form-fields.tsx`)를
    관리자 리그 대진 일괄생성 폼(`team-match-series-fixtures-client.tsx`)도 그대로 쓰도록 했다.
    관리자 쪽은 그동안 raw Tailwind로 직접 그려서 선택 상태(`aria-pressed`)는 있었지만
    `tm-chip` 디자인 토큰을 안 썼고, 위저드 쪽은 토큰은 쓰지만 어떤 칩을 선택했는지 표시가 없었다 —
    이제 두 화면 모두 `tm-chip`/`tm-chip-active` 토큰과 `aria-pressed` + 시각적 강조(테두리·채움색,
    색상 단독 아님)를 동일하게 갖는다.

  리그 개설(`/admin/team-match-series/new`)의 팀 선택 UX(종목 선행 요구 완화, 서버 검색,
  `disabled`/`disabledReason`)는 이미 `v1-series-team-venue-picking` changeset으로 별도 출하됐다 —
  이 changeset에는 포함하지 않는다.

- 31c4111: Drive the `V1GamePeriod` lifecycle from game commands so recorded events carry a real period and clock instead of always freezing at `period = <last period>, clockMs ≈ 0`.

  Nothing ever updated `V1GamePeriod` — the whole API only ever ran `createMany` and `findFirst` on it, so `state` stayed `SCHEDULED` and `startedAt` stayed null forever. The live console then failed to find a LIVE period, fell back to the highest-numbered one, and (because `startedAt` was null) anchored the clock to `Date.now()`, producing `clockMs ≈ 0` for every captured event.

  `start` now opens period 1 (`LIVE` + `startedAt`) inside the same transaction that flips the game state; a new `next-period` command closes the current period and opens the next one (`409 NO_NEXT_PERIOD` past the last); `end` closes whichever period is still live. Event appends now reject a period that has not started or has already ended (`409 PERIOD_NOT_STARTED` / `409 PERIOD_ALREADY_ENDED`). The console drops its `Date.now()` fallback entirely — with no anchor it blocks player taps and says so — and gains explicit 전반 시작 / 전반 종료 / 후반 시작 / 경기 종료 controls.

  Includes a one-time backfill migration (`20260807000000_v1_period_live_backfill`) for games that were already `LIVE` or `PAUSED` when this ships, since the new guard would otherwise lock them out of recording permanently. It opens the game's already-recorded `MAX(event.period)` — not a hardcoded period 1 — because pre-deploy events were all written at the last period number, and opening period 1 would collide with the pre-existing `EVENT_LATE` guard and leave the very games it rescues still unrecordable. Idempotent by construction and a no-op on a fresh database.

- 6aab976: Replace auto-spread formation placement with slot-based lineup placement in both the team-match and tournament-fixture pitch editors.

  Selecting a formation used to immediately scatter every starter across computed coordinates (`applyFormation`/`computeFormationPositions`), with no notion of which named position ("픽소", "피보", ...) each spot was. Selecting a formation now only reveals the formation's empty, labeled slots; tapping an empty slot opens a picker to fill it with a waiting player (`placeInSlot`/`unplaceFromSlot`), and `matchSlotsToEntries` matches by `positionCode` so a dragged token still counts its slot as filled.

  Formation and position data has a single source of truth: the server's `lineupConfig` (positions + formations from `V1CompetitionConfigVersion.lineup`, T1-5), now attached to both the `GET /team-matches/:id/lineup` and `GET /games/:gameId` responses. The frontend no longer hardcodes any formation/position catalog (`FUTSAL_FORMATION_PRESETS`-style tables are gone) — `formation-slots.ts` only transforms whatever the server sends, and a headcount with no matching preset shows guidance text instead of hiding the section. If the selected formation stops matching the current headcount (e.g. a starter is removed), the editor now clears back to free placement instead of leaving a stale formation code in the save payload.

  Also fixes a real bug: `toParticipantInput` (team-match save payload) was dropping `entry.position` before sending it to the server, so a player's placed position silently vanished on save even though the DTO supports it.

- 39f2b78: 라이브 운영 콘솔에서 선수 교체를 기록할 수 있게 한다. 기존 액션 우선 흐름(액션 탭 → 시각 고정 → 대상 선택)을 그대로 따라 `교체` 액션 버튼을 추가하고, 나갈 선수(피치 위) → 들어올 선수(같은 팀 후보) 2단계로 커밋한다. "지금 피치 위" 는 저장된 컬럼이 아니라 `V1GameParticipant.started`와 확정 `SUBSTITUTION` 이벤트 로그를 `sequence` 순으로 접어 만든 파생값이다 — 정정(되돌리기)도 이 하나의 계산으로 자동 반영된다. 서버는 나가는/들어오는 두 참가자가 같은 팀 소속인지, 나가는 선수가 실제로 피치 위에 있는지, 들어오는 선수가 아직 피치 밖인지, `lineup.substitutions === 'limited'` 종목이면 팀별 `maxSubstitutions`를 넘지 않는지를 새 검증 경로(`GamesService#assertSubstitution`, 순수 로직은 `games/core/substitution.ts`)에서 강제하고, 위반 시 한국어 메시지가 붙은 전용 에러 코드(`SUBSTITUTION_INVALID`/`PARTICIPANT_SIDE_MISMATCH`/`SUBSTITUTION_OUT_NOT_ON_PITCH`/`SUBSTITUTION_IN_ALREADY_ON_PITCH`/`SUBSTITUTION_LIMIT_REACHED`)로 거부한다. 교체가 확정되면 들어온 선수는 나간 선수의 마지막 피치 좌표/포지션을 그대로 물려받는다.

  `lineup.substitutions === 'rolling'`인 종목(풋살 등, 종목명이 아니라 config 값으로 판단)에는 "빠른 교체 모드"를 추가로 노출한다. "나갈 선수 지정"과 "들어올 선수 탭"을 서로 다른 의미의 두 조작으로 분리해, 아무것도 지정하지 않은 상태에서 후보를 잘못 눌러도 이벤트가 기록되지 않게 하고, 확정 즉시 지정을 자동 해제해 다음 실수 탭이 이어서 교체를 만들지 않게 했다. 확정 직후에는 되돌리기 액션이 달린 토스트를 띄우고, 기록된 이벤트 목록에도 되돌리지 않은 교체마다 되돌리기 버튼을 상시 노출한다 — 둘 다 기존 정정(`GamesService.reverseEvent`) 경로를 그대로 재사용한다(새 되돌리기 API 없음).

- c19ffd3: 간소 운영 플래그 게이트(경기 운영 플래그를 게이트 번들 증적 없이 켜는 admin 우회 경로)의 on/off 스위치를 환경변수에서 DB 설정으로 옮긴다.

  **왜:** 오너 결정 두 가지가 근거다. (1) "굳이 다 환경변수로 하지 말고 DB 값으로 admin에서 설정값으로 넣자" — 지금까지는 alpha 배포 설정에만 켜져 있는 전용 opt-in 환경변수 하나가 유일한 스위치라 alpha에서만 쓸 수 있었다. 이제 `v1_game_operation_gate_settings` singleton 행(`simplified_gate_enabled`, `version`으로 CAS)으로 옮겨, `platform_ops` 관리자가 **프로덕션을 포함한 모든 환경**에서 이 스위치 자체를 켜고 끌 수 있다. 새 `PATCH /tournament-ops/operation-flags/simplified-gate`가 그 CAS+감사 로그 경로다. (2) "game write 같은 경우도 모두 진행할 수 있게끔 해줘. 전부 다 말이지?" — 지금까지 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 두 키만 쓸 수 있던 간소 경로가 이제 `GAME_READ`/`GAME_WRITE`를 포함한 4개 키 전부를 다룬다.

  **무엇이 그대로인가 (안전장치는 하나도 완화되지 않았다):** 간소 경로가 없애는 것은 게이트 번들(R1/R2, 14일 서명 증적) 서류 절차뿐이다. `platform_ops` 권한, `expectedVersion` CAS, 한 번에 한 칸만 전이하는 `assertSingleTransition`(되돌리기는 여전히 `tupleTransition` 필요), READ compare → WRITE new → READ new → PUBLIC_LIVE/DIRECTOR_OFFICIALIZE 순서를 강제하는 `assertFrozenForwardOrder`, 필수 `reason`/`Idempotency-Key`, `V1OperationAudit`/outbox 기록은 전부 그대로 남는다.

  **되돌릴 수 없는 부분:** `GAME_WRITE=new`로 전이해 새 권위로 첫 쓰기가 일어나는 순간 `v1_game_cutover_epochs.first_new_write_at` 래치가 걸리고, 그 이후로는 이 간소 경로로도 되돌릴 수 없다 — 되돌리려면 여전히 정식 `tupleTransition` 경로를 거쳐야 한다. 스위치 자체의 기본값도 `false`다: 갓 프로비저닝된 환경(프로덕션 포함)이 실수로 간소 경로를 열어두는 사고를 막기 위해서다.

  **API 변경:**

  - `PATCH /tournament-ops/operation-flags/simplified-gate` (신규) — `{ expectedVersion, enabled, reason }`, 스위치 자체를 CAS로 켜고 끈다.
  - `GET /tournament-ops/operation-flags/simplified-gate/status` — 응답에 `version`/`updatedByUserId`/`updatedAt`이 추가됐다(CAS·감사 정보 노출).
  - `PATCH /tournament-ops/operation-flags/:key/simplified-toggle` — `value`가 `legacy`/`compare`/`new`도 허용하도록 넓어졌다(4개 키 전부 지원).

- d5d1fd6: outbox 미등록 이벤트 타입과 팀 전적 프로젝션 공백을 고친다.

  핸들러가 없는 이벤트 타입은 6회 재시도 후 POISONED 로 쌓여 운영자가 진짜 장애와 구분할 수 없게 된다(alpha 실측 13건). 읽는 곳이 없는 타입은 발행 자체를 없애고(감사 로그는 유지), 감사 목적으로 남겨야 하는 타입은 핸들러를 등록한다.

  백필된 경기는 `v1_team_record_facts` 를 만들지 않아 팀 전적 화면이 "0경기"로 뜨는데 순위표는 "1승 3점"이라 서로 모순이었다. 멱등 백필로 소급 생성하고, 앞으로 백필로 들어오는 경기도 같은 공백이 생기지 않게 `createImportedGame` 이 팩트를 함께 쓴다.

  `score` JSON 의 두 형태(평평/중첩) 파싱 누락을 세 곳에서 더 고친다 — 팩트 프로젝션 파서, 그리고 운영 콘솔 결과 정정 화면(백필 경기가 `undefined:undefined` 로 표시됐다). 프런트 표시 경로는 `lib/game-result-score` 하나로 모았다.

- 096d160: 경기 운영 콘솔의 경과 시간 표시가 경기 일시정지 중에도 계속 흘렀다(실측 확인, PR #299 후속). 원인은 데이터 공백이었다 — `V1GamePeriod`가 시작/종료 시각만 저장하고 일시정지 구간을 전혀 추적하지 않아, 화면과 실제 기록되는 `clockMs`가 둘 다 "멈춘 시간을 뺄 근거"가 없었다.

  - `V1GamePeriod`에 `pausedTotalMs`(완료된 모든 일시정지 구간의 누적 ms)와 `pausedAt`(지금 열려 있는 일시정지 구간의 시작 시각, 아니면 null)을 추가한다. `pause` 명령이 `pausedAt`을 열고, `resume`(그리고 일시정지 중 `end`를 눌러도)이 `now - pausedAt`을 `pausedTotalMs`에 **더하고**(덮어쓰지 않고) `pausedAt`을 닫는다 — 한 피리어드 안에서 여러 번 정지/재개해도 전부 누적된다.
  - 경과 시간 계산을 `elapsedMatchMs()`(`apps/v1_web/src/lib/game-operations-clock.ts`) 한 곳으로 통일해, 콘솔 화면의 실시간 표시와 `freezeCapture()`가 기록하는 `clockMs`가 항상 같은 값을 쓰도록 한다 — 두 곳에 따로 계산을 두면 반드시 어긋난다.
  - 일시정지 중에는 경과 시간 옆에 아이콘+텍스트 배지("일시 중지")를 함께 보여준다(색상만으로 표현하지 않는다) — 멈춘 숫자만 보면 고장으로 오인할 수 있다.
  - alpha에 이미 기록된 4건의 이벤트(`clockMs` 645886~655603ms)는 소급 보정하지 않는다 — 이 기능이 생기기 전에는 일시정지 구간 자체가 어디에도 기록되지 않아, 지금 와서 "얼마나 멈춰 있었는지"를 계산할 근거 데이터가 없다. 없는 데이터를 추정해 이미 확정된 경기 기록을 바꾸는 것은 보정이 아니라 창작이므로, 과거 값은 그대로 둔다.
  - 스키마 변경은 추가 전용(Int 컬럼 기본값 0, nullable DateTime)이라 별도 백필이 필요 없다.

- e44eff8: 공개 경기 상세(`GET /tournaments/:tournamentId/matches/:fixtureId`)의 골/카드 이벤트에 `participantName`(참가자 표시명)과 `jerseyNumber`(등번호)를 추가했다. 지금까지는 이벤트가 `participantId`만 내려줘서, 프론트가 득점자 이름을 그리려면 같은 응답의 `lineup`을 역참조해야 했는데 `lineup`은 라인업 공개 시각(킥오프 60분 전) 이전에는 `null`이라 그 전에는 이름을 그릴 방법이 없었다. 라인업 비공개 게이트는 "경기 전 선발 명단 노출"을 막는 규칙이고 골/카드는 경기 중에만 발생하므로 득점자 이름 노출은 이 게이트와 무관하게 항상 적용한다 — 대신 기존 동의(consent) 게이트는 `participantId`와 정확히 동일하게 적용해, 동의하지 않았거나 자격이 없는 참가자는 `participantName`/`jerseyNumber`도 함께 `null`로 내려간다.
- c08226c: R3 롤아웃 — 레거시 대회 결과 리더 3곳을 새 시스템(`V1Game.currentOfficialRevision`)으로 교체하고, 결과 확정 시 조별 순위를 자동 재계산한다.

  레거시 `V1TournamentFixtureResult` 는 쓰기가 전부 퇴역(409)했는데 admin 대진표와 공개 대회 상세는 여전히 그 테이블만 읽고 있었다 — 아무도 쓰지 않는 컬럼을 읽으니 스태프가 결과를 확정해도 그 화면들의 점수가 영원히 안 바뀌었다.

  교체 대상: `tournament-bracket.service.ts`(팀변경/삭제 가드, 순위 계산 입력, 대진표 응답), `tournament-detail.presenter.ts`(공개 상세 `fixtures[].result`), `tournament-fixture-review-mappers.ts`(리뷰 게이트·타임스탬프).

  조별 순위는 `GAME_RESULT_OFFICIAL` outbox 처리와 같은 트랜잭션에서 자동 재계산된다. 브래킷 진출 배정과 동일한 지점·동일한 실패 규칙을 따른다. 수동 재계산 라우트는 운영자 복구 수단으로 남긴다.

  레거시 테이블·조인은 그대로 남겨 롤백 여지를 둔다(문서 §4의 4~6단계는 이번 범위 밖).

- 48a65e9: 기록 입력 UX 개편: 골/카드/파울을 탭 즉시 확정하고(어시스트는 나중에 토스트나 기록 목록에서 사후 부착), 팀별 누적 파울(5개 이상 시 경고)을 실시간으로 보여준다. 결과 검토 화면에는 어시스트 미기입 건수를 확정을 막지 않는 안내로 표시한다. 팀매치도 호스트팀 오너/매니저가 경기 시작/일시중지/재개/피리어드 전환을 할 수 있게 열었다(종료는 여전히 결과 제출로만 가능) — 상대팀 매니저의 직접 API 호출을 통한 조작은 403으로 차단된다. `GET /games/:gameId/operations-lineup`로 라이브 기록 콘솔이 양쪽 사이드 라인업을 읽을 수 있다(경기 시작 전에는 여전히 자기 사이드만).
- 55e7e1f: League fixture generation can now be filled in bulk with a weekday, kickoff
  time, and default venue instead of every fixture landing at midnight with
  "장소 미정" (place TBD) and needing a manual edit.

  `POST /admin/team-match-series/:seriesId/fixtures` accepts an optional
  `schedule: { dayOfWeek, time }` (KST weekday 0–6 and `HH:mm`) and an optional
  `placeName`. When supplied, every generated fixture starts at the first
  occurrence of that weekday/time on or after the league's start date and
  repeats weekly, and all fixtures get the given venue. Omitting both keeps the
  exact previous behavior (start date's own timestamp, "장소 미정") — existing
  callers are unaffected.

  The admin league fixtures screen
  (`/admin/team-match-series/:seriesId`) adds 요일/시각/기본 장소 inputs next
  to the existing 주차 수 field when generating a league's fixtures for the
  first time. The per-row 일시/구장 inputs in the fixture table are unchanged,
  so any week that needs a different time or venue can still be corrected
  individually after bulk generation.

- 55e7e1f: Creating a league no longer requires picking a sport before searching for
  teams, and the bulk fixture-generation form now suggests venues the
  participating teams have actually used before.

  **Team picking (`/admin/team-match-series/new`)**: the team search box is
  always active, regardless of whether a sport is selected yet. Search results
  show each team's sport alongside its region so teams from different sports
  stay distinguishable. Picking the first team auto-fills and locks the sport
  select to that team's sport ("자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요");
  clearing every picked team unlocks it again. Once a sport is set, teams from
  a different sport still show up in search (never hidden) but appear greyed
  out with an inline reason ("이 리그는 O 종목이라 X 팀은 선택할 수 없어요") and can't
  be clicked in — consistent with not silently hiding why an action is blocked.

  `EntityPicker` gained two small, backward-compatible additions to support
  this: per-item `disabled`/`disabledReason`, and a `showResultsWithoutQuery`
  flag so server-search mode can also show default candidates on focus before
  any text is typed (local mode already did this).

  **Venue suggestions (`/admin/team-match-series/:seriesId`, bulk generation
  form)**: `GET /admin/team-match-series/:seriesId` now returns `recentVenues`
  — up to 5 distinct place names the participating teams have actually played
  at before (from any team match, any series), most recent first. The admin
  screen renders them as tap-to-fill chips next to the "기본 장소" input. The
  field is omitted once a league already has fixtures (the form isn't shown
  then) and is absent from the public series detail endpoint.

- 59941b7: 관리자가 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 운영 플래그를 켜고 끌 수 있는 화면을 추가한다 — `/admin/ops/operation-flags`.

  `PATCH /tournament-ops/operation-flags/:key`의 정식 경로는 프로덕션에서 그대로 유지된다: 여전히 `docs/api/domains/game-migration.md`의 게이트 번들(R1/R2, 24시간 간격 서명 7회 x 2)이 필요하다. 이번에 추가한 건 별도의 `PATCH /tournament-ops/operation-flags/:key/simplified-toggle` 경로로, 그 게이트 번들 증거만 생략한다 — 그 외 admin 권한 수준(ops/owner, `getMutationAdmin`), CAS(`expectedVersion`), `off<->on`만 허용하는 전이 검증, **frozen cutover order**(off→on은 여전히 `GAME_WRITE=new && GAME_READ=new`가 선행돼야 한다 — alpha는 현재 둘 다 `legacy`라 오늘은 이 경로로도 `PUBLIC_LIVE`를 켤 수 없다), 필수 `reason`, `Idempotency-Key`, `V1OperationAudit`/outbox 기록은 동일하게 유지한다. (이 PR 시점엔 `GAME_WRITE`/`GAME_READ`는 이 경로로 열 수 없었다 — 이후 `.changeset/v1-operation-gate-db-setting.md`에서 4개 키 전부로 확장됐다.)

  이 간소 경로가 동작하는지 여부는 이제 환경변수가 아니라 DB 설정값(`v1_game_operation_gate_settings` singleton 행)으로 관리한다 — 자세한 내용과 되돌릴 수 없는 부분은 `.changeset/v1-operation-gate-db-setting.md` 참고.

- 2e01ff9: 팀매치 실시간 기록: 홈팀(host team)의 오너/매니저가 팀매치 경기의 실시간 이벤트(골 등)를 기록하고 취소할 수 있게 열었다. 원정팀(opponent team) 매니저는 여전히 기록할 수 없다(결과 승인/이의제기 화면에서만 관여). 실제 기록된 이벤트와 어긋나는 점수를 제출하면 422 오류로 거부된다.
- 9679002: 팀매치(V1TeamMatch)와 팀일정(V1TeamSchedule)을 생명주기 전체에서 연동한다 — "매치가 곧 팀일정"이라는 전제로, 매치를 만들면 호스트 팀 캘린더에 가확정(상대팀 모집 중) 스케줄이 즉시 생기고, 신청이 승인되면 상대팀에도 확정 스케줄이 생긴다. 매치를 취소하면 연결된 스케줄이(삭제되지 않고) CANCELLED로, 결과가 제출되면 COMPLETED로 함께 전이되며, recruiting 단계의 매치 수정은 호스트 스케줄의 제목·시간과 동기화된다. `V1TeamSchedule`에 `@@unique([teamId, teamMatchId])`를 추가해 시스템이 같은 팀·같은 매치에 스케줄을 중복 생성하는 것을 DB 레벨에서도 막는다. 스케줄 조회 응답에는 파생 필드 `matchConfirmed`가 추가된다(MATCH 타입일 때만 유효 — 상대팀 확정 여부를 매 조회 시점 TeamMatch에서 계산). 스케줄을 직접 만드는 공개 API(`POST .../schedules`)는 `type: MATCH`를 더 이상 받지 않는다(`SCHEDULE_MATCH_TYPE_SYSTEM_ONLY`) — MATCH 스케줄은 이제 팀매치 생명주기에서만 시스템이 만든다. `teamMatchId` 필드도 그 DTO에서 함께 제거했다(도달 불가능해진 입력 경로 정리).
- e8ac29b: Add team-match leagues (시리즈): admins can open a round-robin league across
  teams and generate a full fixture list in one call, and anyone can see the
  league's standings and top scorers/assist-makers once official results start
  coming in.

  `POST /admin/team-match-series` opens a league for a sport/region with a set
  of teams (at least two distinct active teams, enforced as a 422
  `SERIES_TEAM_INVALID` domain rule rather than DTO validation, so it works the
  same whether the team list was too short or just deduped down to one).
  `POST /admin/team-match-series/:seriesId/fixtures` generates every fixture at
  once via a deterministic round-robin schedule with balanced home/away
  assignment, creating each one through the same game-aggregate path a regular
  team match uses (so results, lineups, and result review all work
  identically) — calling it twice on the same league is rejected with 409
  `SERIES_FIXTURES_EXIST` rather than silently duplicating fixtures.
  `PATCH .../fixtures/:teamMatchId` lets admins adjust a single fixture's time
  or venue; mismatching the fixture to the wrong league in the URL is rejected
  as 404 rather than silently reaching across leagues.

  `GET /team-match-series/:seriesId(/standings|/player-records)` is public
  (same pattern as existing public team-record endpoints). Standings only
  count officially-confirmed results — fixtures without an official result yet
  show up separately as "pending" rather than being scored as 0-0 — and ties
  break by points, then goal difference, then goals for, then head-to-head.
  Player goal/assist totals respect the same public-consent eligibility rule
  as career records elsewhere.

  League fixtures also get a shorter, dedicated result-review escalation: 12
  hours of no response (instead of the usual 24h reminder / 48h escalation)
  notifies both teams and every platform admin, and those escalations now also
  show up in the admin's global escalation queue (previously that queue only
  ever surfaced tournament-fixture escalations).

- 78f2f0b: 팀매치 경기조건(경기방식/경기 스타일/유니폼 색상)을 자유 입력 텍스트 이어붙이기에서 선택식 구조화 필드로 바꾼다. 생성·수정 위저드에서 이제 프리셋 칩으로 고르고(필요하면 "직접입력"으로 자유 텍스트도 함께 받는다), 실력등급은 이미 구조화돼 있던 4단계 폐쇄형 보기(입문/초보/중수/고수)로만 선택한다. 서버는 `V1TeamMatch`에 `matchFormat`/`matchStyle`/`uniformColor` 3개 컬럼을 새로 두고, 목록·상세의 표시용 `rulesText`는 이 구조화 필드에서 파생 계산한다(프론트가 문자열을 다시 파싱하던 지점 제거). 기존 `formatNote` 자유텍스트는 앱 CLI(`team-match-conditions-backfill.cli.ts`)로 이관하며, 구조화 필드가 비어 있는 미마이그레이션 row만 한시적으로 `formatNote`를 표시 폴백으로 읽는다.

  경기 스타일 다중선택은 최대 3개로 제한한다 — 무제한이면 '매너 중시'와 '실력 중심'처럼 서로 상충하는 조합이 그대로 저장되고 목록·상세 배지도 끝없이 늘어난다. 4개째를 고르려 하면 조용히 무시하지 않고 이유를 안내하며(선택 해제 후 다시 고를 수 있음), 이미 한도에 도달한 상태에서는 남은 프리셋 칩도 시각적으로(불투명도) 구분해 보여준다. 서버 DTO(`MutateTeamMatchDto.matchStyle`)도 같은 한도를 강제해 우회 요청을 막는다.

- ca02f06: 라이트/다크/기기 설정 화면 테마 선호도를 추가한다. 기본값은 항상 라이트 — OS의
  prefers-color-scheme을 자동으로 따라가지 않는다. `/my/settings/theme`에서 선택하면
  계정에 저장돼(`V1User.themePreference`, 기본 light) 로그인한 다른 기기에서도 같은
  값을 불러온다.

  프론트엔드는 Tailwind dark variant 전략을 `prefers-color-scheme` 미디어쿼리에서
  `<html>.dark` 클래스 기반으로 전환했다(`@custom-variant dark`). `ThemeProvider`가
  로컬(localStorage) 즉시 적용 + 로그인 시 계정 값 동기화 + FOUC 방지 인라인 스크립트를
  담당한다.

  핵심 사용자 화면(홈/마이페이지/매치/팀/팀매치/대회/공유 컴포넌트)의 다크모드 시인성
  문제 16건도 함께 고쳤다 — Tailwind `gray-*`/하드코딩 hex에 `dark:` variant 누락,
  `var(--blue50)`/`var(--orange50)` 같은 다크 미대응 파스텔 배경 위에서 다크 모드일 때
  텍스트 색이 뒤집혀 대비가 무너지던 조합 등. 관리자 콘솔(`admin/`)은 이번 스코프에서
  제외했다.

- 5299c07: 관리자가 대회를 만들 때/수정할 때 "출전 인원"(경기장에 서는 라인업 상한, GK 포함)을 직접 고를 수 있게 한다. 지금까지는 이 값이 종목별 경기 설정(`V1CompetitionConfigVersion.lineup.maxPlayers`)의 하드코딩된 기본값(축구 11명/풋살 6명)으로 고정돼 있었고, 이를 바꿀 수 있는 관리자 화면이 아예 없었다(PR #306에서 확인된 갭).

  **"등록" 인원과 "출전" 인원은 완전히 다른 개념이다 — 섞지 않았다.** `V1Tournament.minPlayers/maxPlayers`(대회에 등록하는 로스터 크기, 성별 쿼터가 묶이는 값)는 건드리지 않았다. 이번 변경 대상은 오직 `V1CompetitionConfigVersion.lineup.maxPlayers`(실제 경기 라인업 상한)뿐이다.

  **Prisma 스키마는 바꾸지 않았다.** 새 컬럼 대신 기존 불변 버전 체계를 그대로 재사용한다: 관리자가 n을 고르면 종목의 canonical 설정(`competition-config.presets.ts`)에서 `lineup.maxPlayers`(및 필요하면 `minPlayers`)만 n에 맞춘 content를 구성하고, `content_hash`로 find-or-create — 이미 같은 내용의 버전이 있으면 재사용하고, 없으면 기존 관리자 API(`CompetitionConfigRegistry.createVersion`)로 새 버전만 발행한다. 기존 버전 행은 절대 UPDATE하지 않는다(`v1_block_used_config_mutation` 트리거가 막는 이유와 동일).

  - 선택 가능한 값은 종목의 `lineup.formations`가 실제로 지원하는 필드 인원수(+GK 1명)에서 파생한다 — 없는 대형을 지어내지 않는다. 풋살은 5명/6명, 축구는 아직 포메이션 데이터가 없어 canonical 기본값(11명) 하나만 선택지다.
  - 대회 **생성** 시: 종목이 경기 설정 카탈로그에 있으면(football/futsal) 관리자가 안 골라도 canonical 기본값으로 자동 설정된다 — 대진(픽스처) 생성 단계의 `COMPETITION_CONFIG_REQUIRED` 차단(설정이 아예 안 잡힌 신규 대회는 픽스처를 만들 수 없던 기존 운영 공백)이 함께 해소된다.
  - 대회 **수정** 시: 이미 시작(`in_progress`)했거나 완료(`completed`)된 대회는 출전 인원을 바꿀 수 없다(409 `TOURNAMENT_LINEUP_SIZE_LOCKED`) — 진행 중인 대회의 규칙이 경기 중간에 바뀌는 것을 막는다. 종목과 출전 인원은 한 요청에서 함께 바꿀 수 없다(400). 변경은 기존 `TournamentCompetitionConfig.change()`(CAS + 미완료 픽스처만 리포인트 + 완료된 경기는 소급하지 않음)를 그대로 재사용한다.
  - 새 조회 엔드포인트: `GET /admin/competition-configs/lineup-size-options?sportId=`.
  - `GET /admin/tournaments/:id` 응답에 `competitionConfigVersionId`/`lineupMaxPlayers`/`lineupMinPlayers`/`lineupSizeOptions`를 추가했다(목록/생성 응답은 조인 비용 때문에 이 필드들을 채우지 않는다).

  **함께 고친 실 존재 갭:** `GamesService.saveLineup`(대회 대진의 director/staff 라인업 저장 경로)에는 min/max 인원 검증이 아예 없었다 — `team-match-lineup.service.ts`의 동일 라인업 저장 경로는 이미 `LINEUP_SIZE_INVALID`로 이 값을 강제하고 있었는데 대회 쪽만 빠져 있었다. 이제 같은 코드/메시지로 강제한다. 두 경로가 각자 파서를 중복으로 갖고 있던 것도 `competition-config.parse.ts`의 `parseLineupLimits()` 하나로 합쳤다.

- 001c85c: 대회 운영 3트랙 — 백필 경기의 골 이벤트 복원, 승부차기 기록 경로, admin 결과 수정 진입.

  **골 이벤트 복원**: 레거시에서 백필된 경기는 골이 `score` JSON 안에만 있고 `V1GameEvent` 행이 없어 공개 화면 골 목록이 비었다. 멱등 백필(`goal-event-backfill`)로 복원한다. 참가자를 확정할 수 없는 골은 지어내지 않고 격리(quarantine)로 보고한다.

  **승부차기**: 결선 경기의 정규시간 무승부를 승부차기로 판정할 수 있게 한다. 기존 `end` 커맨드의 `payload.penalties` 로 받아 CAS·감사·멱등을 그대로 타고, 브래킷 진출 판정이 승부차기 승자를 따른다. 조별리그에는 입력할 수 없고(`TOURNAMENT_PENALTY_NOT_ALLOWED`), 조별 순위의 승/무/패도 바꾸지 않는다.

  **admin 결과 수정**: admin 화면에서 결과 정정 경로로 갈 수 있게 하고, 권한이 없거나 목록에 없는 경기는 이유를 화면에 밝힌다. 스태프 권한 체크는 우회하지 않는다.

### Patch Changes

- 6ecc08f: 컷오버가 끝난 `GAME_WRITE`/`GAME_READ` 운영 플래그와 그 부속 로직을 제거한다.

  Task 10 game-result 마이그레이션의 read/write 권한 컷오버는 완료·영구 확정됐다(alpha가
  `GAME_WRITE=new`/`GAME_READ=new`로 롤백 없이 안정 서빙 중). 두 플래그와 그것만을 위해
  존재하던 코드를 전부 걷어낸다:

  - `GameOperationFlagKey`가 이제 `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` 둘뿐이다. `tupleTransition()`,
    `withNewWriteAuthority()`, `v1_game_cutover_epochs` 앱 레벨 읽기/쓰기, "frozen forward order"
    교차-플래그 순서 검증(`assertFrozenForwardOrder`)을 전부 제거했다 — 남는 두 플래그는 순서
    의존 없는 독립 boolean 킬스위치다.
  - 운영보드(`TournamentOperationsBoardService.list()`)가 `GAME_READ` 컴패어 모드 분기를 잃고
    `'new'` 전용 경로로 고정됐다 — 응답 형태·해시·watermark는 변경 없음(제거된 분기는 이미 항상
    false였다). 이에 따른 `GAME_READ_AUTHORITY` DI seam과 Task 10 백필/비교 구현
    (`games/migration/game-result-backfill.ts`, `compare-game-result-reads.ts`), 전용 CLI 2개,
    `task10-game-result-cutover` CI 리허설 job도 함께 제거했다.
  - 관리자 "경기 운영 플래그" 화면이 5단계 순차 컷오버 스테퍼에서 운영 토글 2개(실시간 점수
    공개 · 결과 확정 권한)로 단순화됐다. 각 토글을 끌 때 무엇이 바뀌는지(공개 화면 강등 /
    디렉터 확정 거부) 카드에 명시하고, 확인 모달을 거쳐야만 실행된다.
  - `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE`는 계속 CAS·gate-bundle·감사 로그를 통해 동작한다 —
    롤백 수단(실시간 공개 끄기·확정 권한 끄기)은 그대로 유지된다.

  DB 스키마(`V1GameOperationFlagKey` enum, `V1GameCutoverEpoch` 테이블)는 손대지 않았다 — 살아있는
  enum 값을 줄이는 마이그레이션은 위험 대비 이득이 없다고 판단해 보류했다. 자세한 근거는 PR 설명 참고.

- 1e24303: alpha QA 스쿼드 시드 — 팀 10개 × 선수 10명(계정 100개)을 배포마다 결정적으로 보장한다.

  alpha 는 휴대폰 본인인증이 켜져 있고 SMS 발송은 설정돼 있지 않아(`/auth/phone/issue` → `SMS_NOT_CONFIGURED`) API 회원가입이 `PHONE_NOT_VERIFIED` 로 막힌다. 관리자용 계정 생성 엔드포인트도, 관리자가 팀원을 강제로 넣는 경로도 없다(가입은 신청→승인 / 초대→수락뿐이라 본인 로그인이 필요하다). 그래서 QA 계정·팀을 늘릴 수 있는 경로는 배포 때 도는 이 시드뿐이다.

  비밀번호 평문은 저장소에 넣지 않는다 — 이미 있는 alpha QA 계정의 `passwordHash` 를 복사해, 운영자가 이미 아는 그 비밀번호로 100개 계정이 전부 로그인된다. 기준 계정이 없으면 계정을 만들지 않고 사유를 로그에 남기고 건너뛴다(로그인 안 되는 계정 100개는 쓸모가 없다).

  각 팀은 owner 1 · manager 1 · member 8 로 구성해 역할별 권한 경로(매니저 대회 신청 등)도 같이 검증할 수 있다. 전부 결정적 UUID upsert 라 배포마다 다시 돌아도 중복이 생기지 않고, 사람이 화면에서 만든 팀·계정은 건드리지 않는다.

- b4c2cb2: 운영 콘솔(경기 실시간 기록) 개선 2건.

  **전 액션 확인 모달**: 사용자 결정("실수 방지가 속도보다 중요")에 따라 골·카드·파울·교체(빠른 교체 포함)·시작·일시정지·재개·전반종료·후반시작·경기종료 전부에 확인 모달을 건다(기존엔 시계 이상 감지·경기 종료 두 곳뿐이었다). 되돌리기(`revert-period`)는 그 자체가 교정 행동이라 예외로 남긴다. 확인 문구는 팀·선수·시각을 구체적으로 보여주고, alpha "452′" 시계 이상 경고는 별도 모달로 겹치지 않고 같은 확인 모달 안에 병합한다.

  **대회 knockout 경기 승부차기 입력**: 정규시간(+연장) 종료 후 동점인 대회 knockout 경기에서 "승부차기 시작" 버튼이 뜨고, 킥 단위 성공/실패를 입력해(오조작 시 되돌리기 가능) "승부차기 종료"를 누르면 기존 `end` 커맨드의 `payload.penalties`(이미 배포된 백엔드 계약)로 최종 점수만 실어 보낸다. 킥별 기록은 서버에 남지 않는다(옵션 B — 새 이벤트 타입은 스키마 마이그레이션이 필요해 이번 범위에서 제외). `GET /games/:gameId`에 `isKnockoutFixture` 필드를 추가해(기존 `GamesService.isKnockoutFixture` 판정 재사용, 스키마 변경 없음) 조별리그 무승부에서는 이 버튼이 아예 뜨지 않게 한다.

- ab3942c: 운영 콘솔 경기 종료 흐름을 **후반 종료 → (결선 무승부면 승부차기) → 경기 종료** 3단계로 분리.

  **정규 시간 종료 단계 신설(새 상태값 없이)**: `end-period`가 마지막 피리어드에서 `NO_NEXT_PERIOD` 409로 거부되던 가드를 풀어, 다음 피리어드가 없으면 HALFTIME 승격만 건너뛰고 현재 피리어드만 ENDED로 닫는다. 그 결과 "게임은 LIVE인데 LIVE·HALFTIME 피리어드가 하나도 없는" 조합이 곧 정규 시간 종료를 뜻한다(새 enum 값·새 컬럼·마이그레이션 없음). 스코어 산출·결과 리비전 SUBMITTED·`GAME_RESULT_SUBMITTED` outbox는 전부 `end`에 그대로 남아, 이 중간 단계에서는 결과가 만들어지지 않는다. 콘솔은 마지막 피리어드에서 "경기 종료" 대신 "후반 종료"를 노출하고, 이후 단계에서 "정규 시간 종료" 칩·안내 배너와 함께 경기 종료(또는 승부차기 시작)를 낸다.

  **결선 무승부 종료 차단**: 결선(knockout) 픽스처가 정규 시간 동점인데 승부차기 없이 `end`를 보내면 409 `TOURNAMENT_PENALTY_REQUIRED`로 거부한다. 예전에는 그대로 리비전이 저장되고 비동기 브래킷 프로젝션만 `BRACKET_RESULT_DRAW_UNSUPPORTED`로 재시도하다 outbox 잡이 조용히 POISONED로 남아, 운영자 화면에는 "종료 성공"만 보였다. 콘솔도 같은 조건에서 "경기 종료" 버튼을 비활성화하고 사유를 배너로 알린다.

  **확인 게이트 정확도**: 마지막 피리어드 종료는 되돌릴 수 없으므로(서버 `revert-period`는 되감을 다음 피리어드를 전제한다) 확인 문구에서 그 사실을 명시하고, 성공 후 되돌리기 토스트도 붙이지 않는다(전반 종료에는 그대로 유지). 확인 모달이 떠 있는 동안 다른 이벤트가 커밋돼 `expectedVersion`이 낡던 문제(409 `VERSION_CONFLICT`)는 전송 시점에 최신 버전을 읽도록 고쳤다 — 킥 입력에 수 분이 걸리는 승부차기 종료에서 특히 노출이 컸다.

- 6382eec: alpha 배포마다 재시딩되는 QA 대회 시더가 자기 자신의 고정 대회 ID를 삭제하기 전에, 그 대회의 대진에 연결된 Game 그래프를 먼저 정리하도록 고쳤다. `fixture-game-backfill`을 운영에서 돌린 뒤로 `v1_games_tournament_fixture_id_fkey`(의도적으로 `Restrict`) 위반으로 매 alpha 배포가 실패하던 문제를 해결한다. Game의 결과가 DRAFT에 머물러 있으면 참가자·에스컬레이션·결정까지 함께 정리하고, DRAFT를 벗어나 OFFICIAL까지 확정된 Game이나 append-only인 팀 기록(V1TeamRecordFact)이 이미 붙은 Game은 여전히(그리고 앞으로도) 삭제할 수 없다 — 그 경우 시더는 아무것도 지우지 않고 명확한 에러로 실패한다.
- 19b3cf8: alpha 공개 대회 일정의 조별 순위(standings)가 실제 경기 결과와 모순되던 문제를 고쳤다. `seed-alpha-tournament-qa.ts`가 대회 상태와 팀 배열 인덱스만으로 승점·승무패·득실을 하드코딩해 온 탓에(2:0으로 이긴 팀이 패배로 표시되거나, 존재하지 않는 무승부가 순위에 섞이는 등) 실제 픽스처 스코어와 무관한 값이 매 alpha 배포마다 노출됐다. 이제 시드는 순위 행을 만들지 않는다 — `fixture-game-backfill` 직후 배포 파이프라인에 새로 추가된 `tournament-standings-recalculation.cli.js`가 관리자 "순위 재계산" 라우트와 동일한 `recalculateAndUpsertGroupStandings()` 경로로 실제 픽스처 결과로부터 그룹별 순위를 다시 계산해 채운다. 순위가 아직 계산되지 않은 순간에는 기존에 이미 있던 "순위 집계 전이에요" 빈 상태가 그대로 뜬다(회귀 아님). 경기 규칙(config)이 없거나 유효하지 않은 대회는 격리(quarantine)만 하고 배포를 막지 않는다.
- 9c2637b: 제출된 결과의 어시스트 변경을 새 리비전으로 승계한다 (#376)

  경기가 종료·제출된 뒤 골에 어시스트를 붙이거나 떼면 이벤트에는 반영되지만 이미 제출된(SUBMITTED) 리비전의 참가자 기록은 그대로 남아, 결과 검토 화면에서 "경기 세부 기록"과 "어시스트 미기입" 경고가 서로 어긋났다. 이 상태로 결과를 확정하면 방금 붙인 어시스트가 공식 기록에서 통째로 누락됐다.

  `v1_guard_result_participant_mutation` DB 트리거가 DRAFT 가 아닌 리비전의 참가자 행 쓰기를 전면 차단하기 때문에, 제출된 리비전을 직접 고칠 수는 없다. 대신 `supersedeAndSubmit`/`createResultCorrection`이 이미 쓰는 승계(supersede-then-submit) 방식을 그대로 재사용해 새 `ASSIST_SYNC` 승계 목적을 추가하고, 어시스트가 바뀔 때마다 이벤트에서 다시 집계한 참가자 기록을 담은 새 리비전을 만들어 곧바로 제출(SUBMITTED)한다. 기존 리비전은 그대로 남고, 검토 SLA(리마인더·에스컬레이션)는 마감 시각을 리셋하지 않고 새 리비전으로 이어진다.

  확정된(OFFICIAL) 결과가 있는 경기는 어시스트 커맨드 자체를 거부한다. 이미 새 리비전으로 대체된 제출본을 뒤늦게 확정하려는 시도도 별도로 거부해, 스테일 데이터가 공식 기록이 되는 경로를 막는다.

- 36b3ac8: 현장 기록 담당자(`field_operator`)가 대회 경기를 시작할 권한(`tournament_command`)은 있는데
  그 전제 조건인 라인업을 만들 권한(`lineup_mutate`)이 없어 스태프 혼자서는 대회를 굴릴 수 없던
  모순을 고쳤다(2026-08-11 알파 실측). `tournament-staff-policy.ts`의 `field_operator` 역할에
  `lineup_mutate`를 추가했다 — `platform_ops`·`tournament_director`는 여전히 전체 허용, `team_manager`는
  `read`+`lineup_mutate`, `support_readonly`·`public`은 여전히 `read` 전용으로 그대로 남는다.

  같은 라인업 화면의 접근성 버그도 함께 고쳤다: 골키퍼 지정 버튼의 `aria-label`이 받침 유무를
  무시하고 항상 "을"을 붙여 "김알파을 골키퍼로 지정"·"레드2을 골키퍼로 지정"처럼 어색하게 읽혔다.
  기존 `josa()` 유틸(`apps/v1_web/src/lib/korean.ts`)을 재사용하도록 고쳤고, 이 유틸이 숫자로
  끝나는 이름의 받침을 발음 기준(예: 2→받침없음, 1→받침있음)으로 판정하지 못하던 부분도 함께
  보강했다. 같은 화면의 종목명 조사("이 종목은 ...")도 동적 값에 고정 조사를 붙이던 동일 계열
  버그라 같이 고쳤다.

- 3892437: TBD 경기에 팀을 배정하면 게임 사이드도 함께 옮긴다 — 결선 라인업 잠김 수정

  팀 미정(TBD)으로 만든 결선 경기에 나중에 팀을 배정하면 `V1TournamentFixture.home/awayRegistrationId`만 바뀌고 `V1GameSide.teamId`는 `null`로 남았다. 라인업 접근 판정이 `side.teamId === actor.teamId`로 내 사이드를 찾으므로, 배정된 팀의 매니저조차 자기 사이드를 받지 못해 "이 경기의 라인업을 관리할 권한이 없어요"만 보게 됐다. 대신 넣어주려는 운영진도 "편성된 팀이 없어요"에서 막혔다. 라인업이 제출되지 않으면 경기 시작도 차단되므로 그 경기를 진행할 방법이 아예 없었다.

  8강 결과 확정 후 4강이 자동 배정되는 경로도 픽스처만 갱신하므로 같은 상태를 만든다.

  `updateFixture`가 팀 배정을 바꿀 때 해당 사이드의 `teamId`와 표시 이름을 같은 트랜잭션에서 함께 갱신한다. 결과가 확정된 경기의 팀 변경은 기존 `FIXTURE_HAS_RESULT` 가드가 이미 막고 있어, 사이드 갱신은 결과가 없는 경기에만 일어난다.

- dd9ec86: 라인업 화면이 **아직 아무도 선발을 고르지 않은 상태**를 그대로 보여주고, 초기 라인업 참가자를 등록 명단의 사람과 잇는다. 모바일 **포메이션 진입점**도 함께 드러낸다.

  **증상 1 — 처음 열면 전원이 선발**: 대진이 확정되면 백엔드가 양 팀 등록 명단 전원을 담은 초기 라인업(revision 1, DRAFT)을 만든다. 그 참가자들은 `V1GameParticipant.started` 의 컬럼 기본값 때문에 전원 `started=true` 로 저장되는데, 그건 "이 사람들이 선발로 정해졌다"가 아니라 **아직 아무도 고르지 않았다**는 뜻이다. 화면이 그 값을 곧이곧대로 옮기는 바람에 팀장의 일이 "선발을 고르는 것"이 아니라 "안 뛸 사람을 하나씩 빼는 것"이 됐다(alpha 실측: 12명 등록 → 12명 전원 선발).

  **수정**: 화면이 초기 라인업을 알아보고 전원 후보로 시작한다. 자동 생성분은 `revision === 1 && state === 'DRAFT'` 로 정확히 식별된다 — 저장(`saveLineup`)은 언제나 `previous.revision + 1` 로 새 리비전을 만들기 때문에, 누군가 한 번이라도 고르고 저장했다면 revision 이 2 이상이다. 제출·잠금된 라인업은 revision 1이어도 사람이 확정한 결과이므로 그대로 살린다.

  **함께 막은 것 — 화면과 저장 내용이 어긋나는 제출**: 초기 라인업은 `lineupId` 를 비워 **제출 대상에서 뺀다**. 그러지 않으면 화면에는 후보로 보이는 사람들이 그 리비전 제출과 함께 전원 선발로 확정된다. 이제 저장을 한 번 거쳐야 제출할 수 있고, 제출되는 것은 화면에 보이는 그 명단이다.

  > 처음에는 백엔드에서 `started: false` 를 명시하는 쪽으로 고쳤는데, `started` 는 교체(피치 위 판정)·결과 리비전·공개 기록 등 **여러 소비자가 읽는 컬럼**이라 통합 테스트 2개 스위트가 깨졌다. 화면이 "아직 안 고름"을 해석하는 쪽이 범위가 훨씬 좁고 기존 데이터의 의미도 건드리지 않는다.

  **함께 고친 것 — 끊겨 있던 로스터 연결 (v1_api)**: 초기 라인업 생성 코드는 예전부터 `sourceParticipantId: player.id`(등록 명단 선수 id)를 넘기고 있었지만, **`V1GameParticipant` 에 그런 컬럼이 없어 그 값은 조용히 버려지고 있었다** — 남는 건 이름 문자열뿐이라 어느 참가자가 명단의 누구인지 알 방법이 없었다(동명이인이면 원리적으로 구분 불가). `V1GameParticipant.userId` 에 등록 명단의 `userId` 를 실어 그 연결을 실제로 저장한다.

  **모바일 포메이션 진입점 (v1_web)**: 포메이션 선택 기능은 이미 있었지만(자유 배치 + 프리셋 목록이 든 바텀시트), 모바일에서 그 문이 `배치 설정 · 3-1` **회색 버튼 하나**였다. 화면의 대부분을 피치가 차지하는데 그 피치를 바꾸는 유일한 손잡이가 작은 칩처럼 보여, 포메이션을 고르는 자리라는 게 읽히지 않았다. 시트 내용은 그대로 두고 진입점만 드롭다운형 줄로 승격한다 — **무엇을 고르는 자리인지**(`포메이션` 라벨), **지금 무엇인지**(시트 목록과 같은 문구: `3-1 · 라인 오브 스리 (필드 4명)`), **누를 수 있다는 것**(캐럿)을 셋 다 보이게 했다. 데스크톱은 원래 사이드 패널에 드롭다운이 항상 보이므로 변화 없다.

  제출 완료처럼 **편집이 닫힌 상태에서도 이 버튼이 활성**이던 것도 고쳤다(alpha 실측) — 눌러서 바꿔도 저장할 수단이 없어 헛수고가 된다.

- fa9fb89: 경기 기록이 0건이어도 조 편성 팀을 순위표에 표시한다 (#374)

  조별 경기 기록이 한 건도 없으면 순위표 자체가 렌더되지 않아, 참가자가 자기 팀이 어느 조에 편성됐는지 확인할 수 없었다.

  순위 행이 아직 없는 조별 조는 편성된 팀을 전 지표 0인 기준선 행으로 내려준다. 첫 결과가 들어오면 그 조에 실제 순위 행이 생겨 기준선은 자동으로 사라진다. 전 지표가 0인 표에서는 메달 색과 진출 강조를 끄고 "아직 경기 기록이 없어요"를 안내해, 편성 순서를 성적 순위로 오해하지 않게 한다.

- 78ce99f: 이슈 #375 — 대회 운영 콘솔에서 "전반 종료"를 누르면 곧장 후반이 시작되고 전반 상태로 되돌릴 수 없던 문제를 고쳤다.

  **커맨드를 종료/시작 둘로 쪼갰다.** 기존 `next-period`는 "현재 피리어드 종료 + 다음 피리어드 시작"을 한 트랜잭션에서 fuse해, 그 사이 상태를 관측하거나 멈출 방법이 없었다. `end-period`(현재 피리어드만 종료)와 `start-period`(다음 피리어드 시작)로 분리했고, 그 사이는 `V1GamePeriodState`에 새로 추가한 `HALFTIME` 값으로 명시적으로 관측 가능하다(운영 보드/실시간 화면이 "지금 하프타임"을 직접 질의할 수 있다 — 암묵적 상태 조합으로 때우지 않았다). Prisma enum 값 추가라 기존 경기 데이터에 대한 백필은 필요 없다(마이그레이션 SQL 주석에 근거를 남겼다).

  **되돌리기(`revert-period`)를 새로 만들었다.** `POST :gameId/events/:eventId/reverse`/`GamesService.reverseEvent`가 참고 패턴이다(가드·`expectedVersion`/`clientCommandId`/`Idempotency-Key`·버전 증가·감사 로그 전부 동일). 되돌릴 대상(다음 피리어드에 이벤트가 하나도 기록되지 않은 동안의 가장 최근 전환)은 서버가 유일하게 특정하므로 클라이언트가 id를 지정할 필요가 없다. **다음 피리어드에 이벤트가 하나라도 기록된 뒤에는 거부한다**(409 `PERIOD_REVERT_HAS_EVENTS`) — 골/카드가 이미 그 피리어드로 기록된 채 되돌리면 기록의 소속이 뒤틀리기 때문이다.

  **배포 안전: 구 `next-period`는 당분간 그대로 계속 받는다.** 백엔드/프런트 커맨드 enum 변경은 한 PR에 함께 실었지만 배포 자체가 원자적이지 않다 — 배포 순간 이미 열려 있던 운영자 브라우저 탭(구 프런트 번들)이 진행 중인 경기를 조작하던 중이면 새로고침 전까지 `next-period`를 계속 보낸다. 이 값을 즉시 제거하면 그 요청이 400으로 실패해 하필 피리어드 전환 중이던 라이브 경기 운영이 끊긴다. 그래서 `GameCommandName.next_period`는 `@deprecated`로 표시하고 동작은 전혀 바꾸지 않은 채(기존 `game-period-lifecycle.integration-spec.ts`/`live-game-commands.integration-spec.ts`가 그대로 통과) 당분간 함께 받는다 — 새 프런트 번들은 이 값을 아예 보내지 않는다. 제거 조건은 커맨드 enum 코드에 문서로 남겼다.

  **프런트 — 라벨과 확인 다이얼로그 정책을 실제 동작에 맞췄다.** "전반 종료" 버튼은 이제 정말로 전반만 종료한다(후반을 곧장 시작하지 않는다). 하프타임 상태에서는 '후반 시작'/'되돌리기' 버튼과 전용 안내 배너·헤더 칩이 나타난다(기존 "경기를 시작해 주세요." 배너가 하프타임에도 잘못 겹치던 것을 분리). `handleRunCommand`의 "전반종료는 되돌릴 수 있으니 확인 없이 실행한다"는 주석은 되돌리기 자체가 없던 시절의 잘못된 전제였는데, 이제 실제로 되돌릴 수 있는 명령이 됐으니 주석과 정책(확인 생략) 모두 사실과 맞아떨어진다 — 되돌리기 UX는 기존 골/교체 되돌리기의 토스트 패턴을 그대로 따른다.

  **그 외 정합성 보강.** 하프타임 도중에는 `pause`를 막는다(멈출 LIVE 피리어드가 없다 — 게임은 LIVE인데 어떤 피리어드도 LIVE가 아닌 조합을 방치하지 않는다). 하프타임 도중 이벤트 기록도 여전히 거부된다(`PERIOD_NOT_STARTED`). "경기 종료"는 하프타임 도중에도 다음 피리어드를 영원히 HALFTIME으로 남기지 않고 함께 ENDED로 닫는다.

- 76c2734: 골에 어시스트를 붙일 때 오류·중복 표시·검토 기록 불일치가 나던 문제를 고쳤다 (#376)

  `operate-console.tsx`의 `attachAssist`가 원본 GOAL 이벤트를 `reverseEvent`(REST)로 되돌린 뒤 어시스트가 채워진 새 GOAL을 `submitEvent`(오프라인 큐)로 재제출하는 "reverse-then-resubmit" 2단계 흐름이었다. 같은 `ops` 클로저에서 두 호출이 순서대로 실행되다 보니 `submitEvent`가 참조하는 `expectedVersion`이 `reverseEvent`의 버전 증가를 반영하지 못한 구버전으로 박제돼 구조적으로 `VERSION_CONFLICT`가 났다(운이 나쁠 때가 아니라 매번). 또 `reverseEvent`는 원본 행을 지우지 않고 CORRECTION 행만 추가하므로 목록엔 원본·정정·신규 GOAL 세 행이 그대로 남았고, 대회 경기 종료 시 공식 결과를 만드는 `deriveTournamentRevision`의 골/카드/파울/어시스트 집계 루프는 되돌려진 이벤트를 걸러내지 않아(같은 파일의 `scoreFromEvents`/`resultInvariantInput`은 이미 걸러냄) 원본과 재제출된 GOAL이 둘 다 득점자의 골 수에 더해져 총점과 개인 골 합계가 어긋났다.

  되돌리기·정정행·재제출 패턴 자체를 없애고 원자적 전용 커맨드로 교체했다. 백엔드에 `POST /games/:gameId/events/:eventId/assist`(`GamesService.assignGoalAssist`)를 새로 추가해 원본 GOAL의 `assistParticipantId`를 in-place로 채우거나(null이면 해제) 한 번의 버전 증가로 원자적으로 갱신한다 — `reverseEvent`와 동일한 가드(대상이 GOAL이 아니면 거부, 이미 되돌려진 이벤트면 거부, 어시스트 참가자가 득점 팀 소속이 아니거나 득점자 본인이면 거부)와 감사 로그·Idempotency-Key 처리를 그대로 따른다. `deriveTournamentRevision`도 `scoreFromEvents`와 같은 `reversesEventId` 기반 필터를 추가해 되돌려진 이벤트가 골/카드/파울/어시스트 집계에서 빠지도록 고쳤다. 프론트는 `use-v1-game-operations-console.ts`에 `assignAssist`(온라인 전용 REST, 큐 미사용 — `reverseEvent`와 동일한 이유)를 추가하고 `attachAssist`를 이 한 번의 호출로 단순화했다 — 버전 레이스가 원인 단계에서 사라지고, 새 이벤트를 만들지 않으므로 목록엔 한 행만 남는다.

- 32b40e3: **공개 경기 기록 화면(`/tournaments/:id/matches/:fixtureId`)에서 골·반칙 이벤트 선수명이 담당 스태프에게도 "비공개 선수"로 표시되던 문제를 고쳤다.**

  ## 근본 원인

  `PublicTournamentRecordsService.getMatch`는 요청자 신원(actor)을 전혀 받지 않는 순수 공개 조회였다. `buildLineup`/`buildEvents`/`buildMvp`는 참가자의 공개 동의(consent) 상태만 보고 `eligible ? displayNameSnapshot : null`을 계산했는데, 이 동의 게이트는 익명 방문자와 방금 그 골을 기록한 대회 운영진에게 **완전히 동일하게** 적용됐다 — 스태프 우회가 구조적으로 없었다. 운영자 전용 화면(라인업 저장/제출, 결과 검토 등)은 이 문제가 없었지만, 공개 "경기 기록" 화면은 로그인한 스태프도 그대로 방문할 수 있는 라우트였다.

  ## 고친 방법

  - `getMatch`가 이제 `@CurrentUser()`(`OptionalV1AuthGuard`, 여전히 익명 허용)로 요청자를 받는다.
  - 익명 요청(`user === undefined`)은 스태프 권한 검사를 아예 건너뛰고 기존과 동일하게 동의 기반으로 처리한다 — 익명/미권한 사용자 경로는 그대로 유지, 오류(403)로 바뀌지 않는다.
  - 로그인한 사용자가 있으면, 라인업 컨트롤러가 이미 쓰는 `TournamentStaffAccessService.assertAccess({ action: 'read', resource: { tournamentId, fixtureId, fieldId } })`를 그대로 재사용해 **이 경기(fixture)/이 필드 단위로 좁혀서** 검사한다 — 대회 전체 스태프 여부가 아니다. 다른 필드·다른 경기 담당 스태프는 여전히 "비공개 선수"를 본다.
  - 인가된 경우에만 `buildLineup`/`buildEvents`/`buildMvp`의 동의 게이트를 우회(`isStaffBypass`)한다. 라인업 스냅샷에 없는 참가자는 우회가 켜져 있어도 이름을 지어내지 않는다(`participant?.displayNameSnapshot ?? null`은 그대로 적용).
  - 프론트(`presentParticipantName`/`WITHHELD_IDENTITY_LABEL`)는 이미 `displayName`이 오면 실명을, `null`이면 라벨을 그대로 렌더링하고 있어 별도 변경이 필요 없었다 — 백엔드가 실명을 내려주면 자동으로 연결된다.
  - `getSchedule`(대회 일정 카드의 득점자 요약)은 이 변경 범위 밖이다 — 여전히 모든 호출자에게 동의 게이트를 적용한다.

  ## 테스트

  `public-tournament-records.service.spec.ts`에 권한 스코프 전용 스펙을 추가했다: 익명 요청(회귀), 대회 스태프 배정이 전혀 없는 로그인 사용자, 다른 필드 담당 FIELD_OPERATOR, 다른 경기(fixture) 담당 FIELD_OPERATOR — 이상 네 가지는 모두 여전히 "비공개 선수"이고, 이 경기가 배정된 필드의 FIELD_OPERATOR와 TOURNAMENT_DIRECTOR만 실명을 본다. `TournamentStaffAccessService`는 mock이 아니라 실제 구현(+최소 fake Prisma)을 써서 `decideTournamentStaffAccess` 정책 자체가 아니라 `getMatch`가 그 정책에 올바른 resource를 넘기는지를 검증한다. 라인업 스냅샷에 없는 참가자에 대한 "이름을 지어내지 않는다" 케이스도 별도로 커버했다.

- e0ba8a2: 대회 경기(tournament fixture) 라인업을 한 번 제출(SUBMITTED)하면 다시는 고칠 수 없던
  결함(#378)을 고쳤다.

  **증상**: `lineup-client.tsx`의 `editable`이 `lineupState === null || 'DRAFT'`로만
  계산돼 SUBMITTED 이후 영구히 false가 됐고, 저장/제출 버튼이 든 고정 CTA 바 전체가
  `{editable ? (...) : null}`로 렌더링에서 통째로 빠졌다. 재편집으로 돌아갈 진입점이 파일
  전체 어디에도 없어, 오타 하나를 고치려 해도 다시 제출할 방법이 없었다.

  **프론트**: 경기가 아직 시작 전(`gameQuery.data.state === 'SCHEDULED'`)이면 SUBMITTED
  카드 아래 CTA 바에 "다시 편집하기" 단독 버튼을 새로 노출한다. 실수로 바로 편집에
  들어가지 않도록 순수 로컬 플래그(`reopened`)로 게이팅해 명시적으로 눌러야만 편집 UI가
  열리고, 열리는 즉시 "저장하면 제출했던 라인업이 새 내용으로 바뀐다"는 안내를 보여준다.
  다시 제출하면 재편집 세션은 자동으로 닫힌다. 경기가 시작되면 이 진입점은 물론 기존
  편집 UI 전체가 함께 사라진다(`editable`이 `gameStarted`를 최우선으로 검사하도록 정리).

  **백엔드**: 대응하는 서버 가드가 전혀 없어 화면만 고치면 API를 직접 호출해 경기 중에도
  라인업을 덮어쓸 수 있는 구멍이 남았다. `GamesService.saveLineup`의 TOURNAMENT_FIXTURE
  경로에 `game.state !== SCHEDULED`면 거부하는 가드를 추가했다 — 팀 매치 쪽
  (`team-match-lineup.service.ts`)의 동일 성격 마감 가드와 같은 코드
  (`LINEUP_DEADLINE_PASSED`)를 재사용했다. LIVE/PAUSED/ENDED뿐 아니라 CANCELLED도
  막는다 — 취소된 경기는 준비할 다음 킥오프 자체가 없어 저장할 이유가 없다.

- bcccaf2: 무효 처리한 경기 결과를 다시 입력할 수 있게 한다 (#380)

  결과를 무효 처리하면 정정 이력만 남고 새 결과를 넣을 방법이 없어 경기가 결과 미확정으로 영구 고착됐다. 무효 처리는 "경기의 끝"이 아니라 "지금 유효한 공식 결과가 없음"인데, 리비전 승계 규칙이 무효 상태를 시작점으로 허용하지 않았다.

  `VOID_REENTRY` 승계 목적을 추가해 권한자가 무효 리비전을 기반으로 새 초안을 만들고 다시 검토·확정할 수 있다. 기존 공식·무효 리비전과 감사 이력은 그대로 보존되고, 공개 결과는 현재 유효한 공식 결과만 반영한다.

- 439dfb6: 되돌린 골이 "득점자 미기재" 경고에 잘못 남는 문제를 고친다 (#392).

  `GamesService.deriveTournamentRevision` 이 대회 경기의 결과 리비전을 만들 때 계산하는
  `missingScorer`(운영 보드 "득점자 미기재" 경고)는 `events.some(...)` 으로 이벤트 전체를
  훑으면서 `reversesEventId` 필터가 아예 없었다 — 같은 함수 안의 형제 계산(`scoreFromEvents`,
  `resultInvariantInput`)과 참가자별 골/카드/파울/어시스트 집계(`aggregateGameParticipantStats`,
  #376 에서 이미 이 필터를 붙였다)는 모두 되돌린 이벤트를 제외하는데 `missingScorer` 만 빠져
  있었다. 득점자 없이 기록한 골을 나중에 되돌려도(오심 취소 등) 경고가 영원히 남아 있었다.

  `missingScorer` 계산을 `aggregateGameParticipantStats` 안으로 옮겨 그 함수가 이미 만드는
  `reversedIds` 를 그대로 재사용하도록 고쳤다 — 같은 파일에 세 번째 되돌림-판정 방식을 새로
  만들지 않는다. `deriveTournamentRevision` 은 이제 `v1GameResultRevision.create` 호출 전에
  `aggregateGameParticipantStats` 를 먼저 실행해 그 결과의 `missingScorer` 를 그대로 쓴다.

  `deriveTournamentRevision` 전체를 다시 훑어 이벤트를 순회하는 다른 지점(`scoreFromEvents`,
  `eventsHash` 해시 계산)도 확인했다 — `eventsHash` 는 감사용으로 전체 이벤트 스트림을 그대로
  해시하는 게 의도된 동작이라 되돌림 필터가 필요 없고, 나머지는 이미 올바르게 필터링돼 있었다.

- 93113ce: 경기 클럭(`clockMs`)에 상한 검증이 없어, 운영자가 경기 종료를 누르지 않고 몇 시간 뒤 이벤트를 기록하면 그 값이 그대로 굳어 공개 화면에 `452′`처럼 말도 안 되는 시각이 노출되던 문제(알파 실측)를 고쳤다. 서버에서 하드 거부(422)하지는 않는다 — 현장에서 늦게라도 기록하려는 시도를 막는 게 잘못된 시각이 남는 것보다 나쁘고, 이미 기록된 이벤트를 소급 거부할 수도 없기 때문이다. 대신 (1) 운영 콘솔은 캡처한 시각이 그 피리어드의 설정된 길이(`durationMinutes`)의 2배를 넘으면 제출 직전 운영자에게 확인을 요구하고(`isClockSuspicious`), (2) 공개 일정/상세 화면(`schedule-content.tsx`/`match-detail-content.tsx`)은 이미 기록된 값이 90분(알려진 프리셋 최댓값의 2배)을 넘으면 숫자는 그대로 둔 채 경고 표식만 덧붙인다(`isClockAbnormal`).
- 2920d9e: 대회 운영 콘솔(`/tournament-ops/.../operate`)에서 골을 기록해도 상단 스코어가 실시간으로 갱신되지
  않던 버그를 고쳤다.

  **근본 원인**: `RealtimeGateway.acknowledgeGameEvent`가 자기 자신에게 쏘는
  `game.event.committed` 브로드캐스트에 서버가 실제로 저장한 이벤트 행이 아니라 클라이언트가 보낸
  원본 요청 payload를 그대로 실어 보냈다. 그 payload에는 서버가 나중에 채우는 `id`/
  `reversesEventId`가 없어 `undefined`로 들어왔고, 콘솔의 `scoreBySideId`가 "되돌려진 이벤트" 집합을
  `reversesEventId !== null`로만 걸러 그 `undefined`가 집합에 섞여 들어갔다 — 그러면 `id`도
  `undefined`인 방금 그 이벤트 자신이 "이미 되돌려짐"으로 오판되어 점수 집계에서 조용히 빠졌다(새로고침
  전까지). 같은 패턴이 피치 위 선수 파생(`on-pitch-state.ts`)에도 있어 함께 방어적으로 고쳤다. 골
  취소(reverseEvent)는 애초에 실시간 브로드캐스트 경로 자체가 없어 되돌려도 점수가 즉시 반영되지
  않았다.

  **수정**:

  - `GamesService.appendEvent`/`retryEvent`가 실제 저장된 이벤트 행을 돌려주고, 게이트웨이는 이제
    그 값을 방송한다.
  - `scoreBySideId`/`on-pitch-state.ts`가 `reversesEventId`/`id`의 `undefined`도 `null`과 동일하게
    취급하도록 방어적으로 강화했다.
  - 골 취소(`reverseEvent`) 성공 시 서버 이력 전체를 강제로 재동기화해 새로고침 없이도 스코어가 즉시
    되돌아간다.
  - 결과 확정("결과를 확정할까요?") 확인 모달이 react-query 캐시(전역 `staleTime: 30s`)에 의존하지
    않고 확정 직전 강제로 최신 점수를 다시 불러오도록 고쳤다 — 되돌릴 수 없는 확정 액션이 stale한
    숫자를 보여주던 문제.

- 2c523a3: 승계된 결과 리비전에 유령 에스컬레이션이 생기는 레이스를 막고, 이미 생긴 유령을 자가치유로 닫는다.

  PR #394가 추가한 `ASSIST_SYNC`(제출된 결과에 어시스트를 붙이면 새 리비전으로 승계)는 선행
  리비전의 `state`를 의도적으로 `SUBMITTED` 그대로 남긴다 — 어떤 `V1GameResultRevisionState` 값도
  "리뷰어 결정 없이 자동 승계됨"을 정확히 표현하지 못해서다. 그런데
  `GameResultSubmittedEscalationService`의 아웃박스 핸들러 3개(`handler`/`reminderHandler`/
  `escalationHandler`)는 오직 `state === 'SUBMITTED' && submittedAt !== null`로만 게이트했다 —
  승계 여부는 보지 않았다. 동기화가 워커가 선행 리비전의 최초 제출 이벤트를 처리하기 전에
  실행되면, 워커가 이미 승계된 선행 id로 PENDING 에스컬레이션을 새로 만들고 아무도 그것을
  닫지 않는 유령이 생겼다(저자 스스로 "Known residual gap"으로 남긴 갭).

  - `GameResultSubmittedEscalationService`에 `isRevisionSuperseded`(다른 리비전의
    `supersedesId`가 이 리비전을 가리키는지 판별 — `TournamentResultReviewService
.officializeResultRevision`의 STANDARD-flow stale 가드와 동일한 판별을 재사용)를 추가했다.
  - 핸들러 3개 모두 이 체크를 통과하면 조용히 종료(성공 처리)하고 새 에스컬레이션·알림을 만들지
    않는다 — 실패로 처리해 재시도 루프에 빠지지 않는다.
  - `createQueue`/`scheduleDueDeliveries`(에스컬레이션·아웃박스 INSERT가 실제로 일어나는 지점)
    에도 같은 체크를 넣어, 승계된 리비전에 매달린 PENDING 행을 발견 즉시 CLOSED로 자가치유한다
    — 핸들러 레벨 체크와 중복이지만, 향후 다른 호출 경로가 생겨도 팬텀을 다시 만들 수 없도록 하는
    의도적인 이중 방어다.
  - 자가치유 SQL(2개의 UPDATE 문)은 `GamesService.closeAssistSyncPredecessorSla` /
    `TournamentResultReviewService.closeReviewSla`와 같은 문장을 세 번째로 복제했다 —
    두 기존 구현이 이미 서로 다른 소유 레인이라는 동일한 이유로 서로 복제돼 있고,
    `GameResultEscalationTerminalService.close`는 이 워커 레벨 자가치유가 조립할 이유가 없는
    훨씬 무거운 `OfficialRevisionRow` 타입에 묶여 있어 재사용이 오히려 더 큰 결합을 만든다.

  승계되지 않은 정상 SUBMITTED 리비전의 리마인더·에스컬레이션 생성/알림은 그대로 동작한다.

- 69fdd22: 공개 경기 기록의 이벤트를 **입력(append) 순서가 아니라 경기 시각순**으로 정렬한다.

  **증상**: 경기 상세 타임라인에서 이벤트가 뒤죽박죽 나왔다. 알파 실측(2026-08-13)에서 카드 4건(10:49·10:52·10:55·10:57)이 먼저 나오고, 그보다 이른 10:45 골이 맨 뒤에 붙었다. 알파의 7경기 중 2경기에서 순서 역전이 관측됐다 — 나머지 5경기는 입력 순서가 우연히 시간 순서와 같아서 드러나지 않았을 뿐이다.

  **원인**: `public-tournament-records.service.ts`의 **두 조회**가 `orderBy: { sequence: 'asc' }`를 썼다. 이 `sequence`는 `games.service.ts`의 `appendEvent`가 `game.lastSequence + 1`로 채번하는 값, 즉 **서버가 이벤트를 받은 순서**다. 경기 중 실시간으로 찍힌 이벤트는 두 순서가 대체로 일치하지만, 결과 검토 단계에서 골을 뒤늦게 추가하거나 취소 후 재기록하면(알파 실측: `CORRECTION` 2건 뒤 같은 값으로 `GOAL` 2건 재기록) 어긋난다. 기록 시점과 경기 시각은 애초에 다른 축인데 전자로 정렬하고 있었다.

  **수정**: 두 조회 모두 `[{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }]`로 바꾼다. `period`를 `clockMs`보다 먼저 보는 이유는 후반에 클록이 리셋돼 후반 2분이 전반 40분보다 작은 값이기 때문이다. `sequence`는 같은 시각 이벤트의 안정 정렬용 tiebreak로만 남는다.

  일정 화면의 득점자 요약(`loadScorers`)을 함께 고친 것은 그 쿼리 주석이 "`buildEvents`와 같은 순서로 맞춘다"고 명시하고 있어서다 — 한쪽만 고치면 예전에 취소된 골이 요약에만 남던 것과 같은 종류의 규칙 분기가 재발한다.

  **범위 밖(의도적으로 건드리지 않은 것)**: `clockMs` 값 자체. 알파에 452:46(7시간 32분)짜리 골이 있지만 이는 오기입이 아니라 피리어드를 닫지 않은 채 9시간 뒤 실제로 입력된 기록이다(`occurred_at` 확인). `game-invariants.ts`가 상한을 두지 않는 것은 의도된 결정이며(거부하면 기록 자체가 불가능해진다), 이상값은 공개 화면의 경고 표식(`isClockAbnormal`)이 담당한다. 이번 변경은 **정렬만** 다룬다.

  **회귀 테스트**: 가짜 Prisma가 넘겨받은 `orderBy`를 실제로 적용하도록 만들어(기존 fake들은 정렬을 무시해 이 회귀를 잡을 수 없었다) 4개 케이스를 덮었다 — 알파 실측 형태 재현, 전/후반 클록 리셋, 득점자 요약 단건·복수건. 정렬을 `sequence`로 되돌리면 4건 중 3건이 실패함을 확인했다(나머지 1건은 골이 하나뿐이라 정렬과 무관).

- 308858e: **대회 참가팀 공개 정책을 통일한다 — 모집 중(open)엔 참가팀 명단뿐 아니라 조 편성/대진표/일정 안의 팀명·로고도 같은 조건으로 가린다.**

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

- 1870aea: 진행 중 대회의 완료 경기 리뷰 진입을 사용자별 pending 상태로 제한하고, 팀장·운영진은 상대팀과 상대 선수를, 일반 팀원은 상대 선수만 평가하도록 권한 계약을 정리했습니다.

  대회 상세의 리뷰 가능 경기에는 정규 점수와 승부차기 PK 점수를 함께 표시합니다.

- d07159b: 대회 스태프(감독·현장 담당·조회 전용)가 경기 시작 전 라인업을 제출하지 못하던 문제를 고쳤다. `submitLineup`(`POST /games/:id/lineups/:lineupId/submit`)은 대회 픽스처 스태프에게 항상 인계 토큰(`takeoverToken`)을 요구했지만, 라인업 화면(`lineup-client.tsx`)은 토큰을 발급받거나 전송하는 경로가 없어 `TAKEOVER_TOKEN_EXPIRED`로 구조적으로 막혀 있었다. 이제 경기가 아직 시작되지 않았으면(`game.state === SCHEDULED`) 스태프도 토큰 없이 라인업을 제출할 수 있다. 경기가 라이브로 전환된 이후(LIVE/PAUSED/ENDED/CANCELLED)에는 기존대로 인계 토큰을 요구해, 두 운영자가 라이브 중 라인업을 놓고 충돌하는 것은 그대로 막는다. 팀 매니저/오너는 이전부터 항상 면제였고 변경 없음. `event_append`/`event_reverse`/`game_start` 등 다른 라이브 커맨드의 토큰 요구는 이번 변경과 무관하며 그대로 유지된다.
- 9501a02: 팀 상세 페이지의 "주요 멤버" 미리보기(최대 8명)에 총원 안내와 프로필 진입점을 추가한다.

  - 총원이 미리보기 인원보다 많을 때만 "+ n명 더보기" CTA가 뜨고, 기존 `/teams/{teamId}/members`
    전체 목록으로 이동한다. 멤버 목록이 비공개인 팀에서는 미리보기와 함께 CTA도 노출되지 않는다.
  - 미리보기의 멤버를 누르면 `/users/{userId}` 공개 프로필로 이동한다(전체 멤버 목록 화면이 이미
    쓰던 링크 패턴 재사용).
  - 백엔드 `TeamsService.detail()`의 `membersPreview`가, 조회자 본인의 role 계산을 위해 함께
    내려오던 비활성(탈퇴·추방) 멤버십까지 미리보기에 섞이지 않도록 active 멤버십만 남기고 자른다
    — 탈퇴한 사람이 현재 멤버처럼 보이거나 깨진 프로필 링크로 이어지는 것을 막는다.

- 0de39e4: 대회 홍보 이미지 업로드가 413으로 실패하던 문제를 고치고, 커버 이미지를 홍보 카드의 기본 이미지로 공유하게 했다

  대회 생성에서 카드 홍보 이미지를 올리면 `{"statusCode":413,"code":"INTERNAL_ERROR","message":"File too large"}`로 실패했다. 원본 포스터가 `uploads.controller.ts`의 multer 하드캡(10MB)에서 잘려 `UploadsService`의 정밀 5MB 검증(한국어 400 메시지)에 닿지도 못했고, 프레임워크가 만든 413은 도메인 코드가 없어 `INTERNAL_ERROR` + 영어 메시지로 노출됐다(nginx `client_max_body_size`는 55m이라 무관). 웹 클라이언트에는 크기 검사도 압축도 없어 원본이 그대로 전송됐다.

  `lib/image-compress.ts`를 추가해 전송 전에 브라우저에서 축소·재인코딩한다 -- 긴 변 1920px·WebP q0.85로 시작해 한도 안에 들어올 때까지 품질(0.85→0.7→0.55)과 긴 변(1920→1440→1080)을 단계적으로 낮춘다. 홍보 카드의 실제 렌더 폭은 1200px 남짓이라 원본 해상도가 필요 없다. 1.5MB 이하 원본과 캔버스가 다루지 못하는 형식은 손대지 않고, 재인코딩이 원본보다 커지면 원본을 유지하며, 압축이 불가능하고 원본도 한도를 넘으면 무엇을 해야 하는지 알려주는 한국어 에러를 던진다. `useV1UploadImages`에 걸어 커버·홍보·후원사·캠페인·프로필 업로드가 모두 같은 경로를 탄다. 서버 쪽은 `AllExceptionsFilter`가 코드 없는 413만 `UPLOAD_FILE_TOO_LARGE` + 한국어 메시지로 승격하고, 서비스가 자체 코드를 붙인 413은 그대로 통과시킨다.

  같은 이미지를 세 번 올려야 했던 문제도 함께 고쳤다. `resolveTournamentImage`가 자리별 지정값 → 커버 → 다른 홍보 자리 순으로 폴백해, 이미지 1장만 올려도 홈 히어로·목록 캐러셀·목록 썸네일·OG 이미지가 모두 채워지고 자리마다 다른 이미지를 쓰고 싶으면 그 자리만 지정하면 된다. 폴백을 DB에 복사하지 않고 읽는 시점에 고르므로 커버만 교체해도 비워 둔 자리가 따라오고 "기본 사용"과 "개별 지정"이 계속 구분된다. 관리자 폼은 비어 있는 자리에 기본 이미지를 미리보기로 반영하고 현재 어느 쪽을 쓰는지 안내하며, 개별 지정을 "기본 이미지로" 버튼으로 되돌릴 수 있다.

- 76cd214: 대회 협찬 로고 업로드가 반환하는 `/uploads/...` 경로를 협찬 생성·수정 DTO가 정상적으로 허용하도록 검증 계약을 수정했다.
- 73b223b: `V1GameOperationsWorkerService`의 outbox lease 클레임 쿼리가 간헐적으로 CI를
  실패시키던 근본 원인을 고쳤다. `available_at`/`lease_until`/`updated_at`는
  `TIMESTAMP(3)`(밀리초 정밀도) 컬럼인데, 저장 시 `CURRENT_TIMESTAMP`(마이크로초
  정밀도) 표현식을 반올림(내림이 아님)해 저장하는 Postgres 동작 때문에 저장된
  값이 실제 계산 시점보다 최대 0.5ms **미래**로 밀릴 수 있었다. 방금 삽입/갱신된
  행을 거의 지연 없이 바로 클레임하는 경로(테스트의 `insertJob()` → `claimOne()`
  연쇄, `makeRetryDue()` → `processOne()` 연쇄)에서 그 반올림된 값이 바로 다음
  트랜잭션의 `CURRENT_TIMESTAMP`보다 늦게 보여 `available_at <= CURRENT_TIMESTAMP`
  비교가 허위로 false가 되고, 실제로 존재하는 클레임 가능한 행인데도
  `claimOne()`이 `null`을 반환했다(`test/jobs/v1-game-operations-worker.integration-spec.ts`
  "releases only its own leases..." / "applies every exact retry delay..." flaky
  실패의 원인).

  `claimOne()`/`heartbeat()`/`fail()`/`releaseOwnedLeases()`/`completeWith()`가
  쓰는 모든 타임스탬프 표현식을 `date_trunc('milliseconds', CURRENT_TIMESTAMP)`
  (내림)로 바꿔 저장값이 항상 실제 계산 시점 이하가 되도록 했다 — 이후 어떤
  "미래" 트랜잭션의 `CURRENT_TIMESTAMP`와 비교해도 더 이상 역전되지 않는다.
  운영 중인 워커(`run()`, 250ms 폴링)는 이 레이스 창(최대 0.5ms)보다 500,000배
  넓은 여유가 있어 실제 배포 환경에서 job 유실/중복 처리로 이어진 적은 없는
  잠재적(dormant) 결함이었다 — 테스트가 "삽입 직후 즉시 클레임"하는 근접
  지연 패턴 때문에 노출됐을 뿐이다. 같은 테스트 파일을 55회 반복 실행해 전부
  통과함을 확인했다.

- 609bbe0: 경기 시작(`start`) 커맨드가 라인업 없이도 API를 직접 호출하면 통과되던 구멍을 막았다. `GamesService.executeCommand`의 `start` 분기는 상태 전이(`assertLifecycle`)만 검사하고 어느 사이드에도 제출된 라인업이 있는지 확인하지 않아, 클라이언트 게이트(PR #316)를 우회해 API를 직접 호출하면 여전히 라인업 없이 경기가 LIVE로 시작될 수 있었다. 이제 모든 `V1GameSide`가 SUBMITTED 또는 LOCKED 상태의 라인업을 최소 하나 가지고 있어야 `start`가 허용되며, 그렇지 않으면 `409 LINEUP_NOT_SUBMITTED`(한국어 메시지 포함)로 거부한다.
- 97f3e92: alpha QA 시드가 라이브 운영이 확정한 픽스처 상태·스코어를 재배포 때 덮어쓰지 않게 고쳤다. 픽스처 upsert의 `update` 절에 `status`가 실려 있어, 운영자가 경기를 종료하고 결과를 확정해 `fixture.status = completed`가 된 뒤에도 다음 배포에서 시드 값(`in_progress`)으로 되돌아갔다. 순위 재계산은 `status: 'completed'` 픽스처만 읽으므로 그 경기가 순위 집계에서 통째로 빠졌다 — alpha 실측에서 2:0으로 이긴 팀이 0승 0-0으로 표시됐다. `status`와 결과 스코어를 upsert의 `create`에만 쓰고 `update`에서 제외해, 시드는 픽스처의 초기 상태만 정하고 이후 상태는 운영이 정하도록 했다. 스켈레톤(대진·일정·장소·등록 참조)은 등록이 배포마다 재생성되므로 기존대로 갱신한다.
- 55c7253: 플랫폼 관리자를 휴대폰 본인인증 쓰기 게이트에서 면제한다 — 운영 콘솔이 미인증 계정으로도
  쓸 수 있게.

  ## 무엇이 막고 있었나

  `V1AuthGuard` 의 전역 쓰기 게이트는 `phoneVerifiedAt` 이 비어 있으면 GET 외 모든 쓰기를
  403 `PHONE_VERIFICATION_REQUIRED` 로 막는다. 허용 목록에 `/admin` 은 이미 있었지만
  (**"운영 콘솔. 운영자 계정이 미인증이면 장애 대응 자체가 막힌다"**), 실제 운영 콘솔의 쓰기는
  거기로 가지 않는다:

  ```
  /games/:gameId/commands/:command      경기 시작·일시정지·종료
  /games/:gameId/events                 이벤트 기록 (골·카드·파울)
  /games/:gameId/lineups/:sideId        라인업 제출
  /games/:gameId/result-revisions/...   결과 검토·공식화·무효화
  /games/:gameId/corrections            정정
  ```

  `/tournament-ops/*` 는 대부분 GET(운영 보드·스태프 목록·필드)이라 이미 통과하고 있었다.
  즉 프리픽스를 하나 더 추가하는 것으로는 아무것도 해결되지 않는다.

  ## 왜 경로가 아니라 신분 기준인가

  `/games/*` 를 통째로 허용 목록에 넣으면 **일반 사용자의 신원연동·동의 쓰기까지 열린다**:

  ```
  /games/:gameId/participants/:participantId/identity-link-requests
  /games/:gameId/participants/:participantId/.../attest
  /games/:gameId/participants/:participantId/consents/grant | revoke
  ```

  "내가 그 선수다" 를 주장하는 경로 — 휴대폰 인증이 정확히 막으려는 행위다. 그래서
  "어느 경로냐" 가 아니라 "누구냐" 로 판정한다.

  ## 인가는 그대로다

  이 면제는 **인증(휴대폰) 게이트만** 건너뛴다. 관리자·스태프 전용 라우트는 각자의 권한 계층
  (`TournamentStaffGuard`, `GamesService.resolveActor` 의 role 검사, `AdminGuard`)을 그대로
  통과해야 한다. 관리자 권한 자체가 다른 관리자의 명시적 부여로만 얻어지는, 휴대폰 인증보다
  강한 통제다.

  - `isPhoneVerificationExemptActor()` 추가 — `V1AdminUser.status === 'active'` 일 때만 면제.
    **회수(revoked)·정지(suspended) 관리자는 면제되지 않는다** — 살아 있는 권한 부여가 신뢰의 근거다.
  - `V1AuthGuard` 가 기존 `select` 에 `adminUser: { select: { status: true } }` 를 중첩으로 붙인다.
    `V1AdminUser.userId` 가 `@unique` 라 **추가 쿼리가 생기지 않는다**.
  - 유닛 4케이스 + end-to-end 2케이스. e2e 는 실 DB·실 HTTP 로 미인증 관리자가 쓰기를
    통과하고 회수된 관리자는 여전히 403 인지 확인한다. 가드의 면제 호출을 제거하면 관리자
    케이스만 정확히 실패하는 것을 확인했다(red/green).

- 0233d0d: alpha 배포에 로컬 dangling 이미지 정리를 추가해 EC2 디스크가 배포마다 차오르던 문제를
  고친다.

  alpha 는 ECR 에서 digest 로 이미지를 pull 한다(`alpha-manifest-common.sh` 의
  `images.*.uri` 가 `repository@sha256:...` 형태) — 로컬 저장소에는 태그가 붙지 않고
  이전 릴리스 이미지가 그대로 `<none>` 태그의 dangling 이미지로 남는다. `deploy-prod.sh` 에는
  매 배포 끝에 `docker image prune -f` 가 있었지만 `deploy-alpha.sh` 에는 동일 로직이 없었고,
  실제로 EC2 루트 볼륨이 28G/30G 까지 차서 배포와 (재-pull 에 의존하는) 롤백이 함께
  "no space left on device" 로 실패했다(2026-08).

  - `alpha-release-common.sh` 에 `prune_stale_alpha_images()` 추가, `deploy-alpha.sh` 가
    릴리스 healthy 확인·promote 이후에 논-fatal 로 호출한다(`deploy-prod.sh` 와 동일 정책 —
    정리 실패가 배포를 실패시키지 않는다). 롤백을 깨지 않는 이유: alpha 롤백(자동 트랩 경로
    `restore_active_release`, 수동 `rollback-alpha.sh` 둘 다)은 로컬 이미지 캐시를 전혀
    참조하지 않고 항상 `pull_release_images()` 로 ECR 에서 digest 를 재-pull 한다. dangling
    필터는 태그 유무만 보고 컨테이너 참조 여부는 반영하지 않지만, `docker image prune` 의
    실제 삭제 로직은 컨테이너가 참조 중인(현재 active) 이미지는 건너뛴다 — `-a` 는 쓰지
    않는다.
  - preflight 로그에 디스크 여유(`disk_available_kib`)를 추가하고, 3GiB 미만이면 배포를
    막는다. 이 시점은 이미 릴리스 소스가 전환된 뒤라 ERR 트랩(`restore_active_release`)이
    안전하게 되감으며, 디스크가 위험 수준인 채로 이미지 pull·DB 쓰기까지 진행하다 더 나쁜
    지점(복구용 재-pull 도 실패하는 지점)에서 죽는 것보다 여기서 막는 편이 안전하다고
    판단했다.
  - `scripts/qa/test-alpha-image-gc.sh` 추가: 정리 함수의 호출 인자(`-f`, `-a` 아님) ·
    docker 실패 전파 · 실제 사고 시나리오(active/previous/legacy 태그 이미지 각각 생존·삭제
    여부) · `deploy-alpha.sh` 안에서 healthy 확인 뒤에만 호출되는지를 검증한다. CI(`deploy.yml`)
    에 매 push 마다 돌도록 등록.

- ba59e5a: alpha 의 football-v1/futsal-v1 canonical 경기 설정이 Wave B(#276·#277) 프리셋 변경 이후
  DB 에는 옛 내용 그대로 남아, 11개 대회가 여전히 옛 설정을 물고 있었다(futsal 은 `lineup.formations`
  가 없고 `events` 가 아직 `TEAM_FOUL` — T1-5 포메이션·T1-2 파울 기록이 살아나지 않는 원인). 해당
  행은 이미 대회/팀매치/경기가 참조 중이라 `v1_block_used_config_mutation` 트리거가 in-place UPDATE
  를 막는다(트랜잭션+ROLLBACK 으로 실측).

  운영용 CLI `apps/v1_api/src/tournaments/competition-config/competition-config-version-repoint.{ts,cli.ts}`
  를 추가해, 드리프트가 있는 canonical 설정만 골라 기존 `CompetitionConfigRegistry.createVersion`/
  `TournamentCompetitionConfig.change`(완료 fixture 영향 미리보기+확인 2단계 포함)로 새 버전을 발행하고
  대회·팀매치를 새 버전으로 repoint 한다. dry-run/apply 가 같은 술어를 공유하고, 재실행은 멱등(0 보고)
  하다. `result`/`tieBreak`(채점 기준) 이 바뀐 드리프트는 자동 진행하지 않고 `blocked_scoring_drift`
  로 보고만 하고 아무것도 바꾸지 않는다 — 채점 소급 변경은 사람이 판단할 일이다. `content_hash` 가
  테이블 전역 유니크라 발행하려는 내용이 같은 계열의 예전 버전과 우연히 일치하면 중복 생성 대신 그
  버전을 재사용하고, 무관한 계열과 우연히 일치하면 `blocked_content_hash_collision` 으로 보고만 하고
  멈춘다.

  `competition-config-backfill.ts`의 `seedCompetitionConfigVersions()`도 함께 손봤다: 드리프트된
  canonical 행은 완료된 대회/경기가 계속 참조하도록 설계상 절대 원상복구되지 않으므로, 이 CLI 가
  성공적으로 새 버전을 발행하고 repoint 한 뒤에는 그 사실(더 최신 버전이 canonical 내용과 일치하고,
  활성 참조가 더는 옛 행에 없음)을 인식해 더 이상 `CompetitionConfigSeedDriftError`로 죽지 않는다.

  마이그레이션 파일에는 DML 을 넣지 않았다 — expand-contract 게이트가 이를 거부하므로 Task 9/10/D-21
  과 같은 방식으로 CLI 로 분리했다. 사용자에게 보이는 API 계약 변경은 없다.

- ef5dcee: ECR 이미지 스캔 게이트의 fail-open 과 일시 오류 취약성을 고친다 — alpha·prod 양쪽.

  `check-alpha-image-scans.sh` 와 `check-prod-image-scans.sh` 는 저장소 이름과 로그 라벨 3줄만
  다른 완전한 복사본이었고, 그 중복 때문에 아래 두 결함이 **양쪽에 똑같이** 있었다.

  **1) 스캔 결과를 못 읽으면 게이트가 조용히 통과했다 (fail-open).**

  `findings` 가 비면 `critical=""` 이 되고, bash 산술은 빈 값을 0 으로 취급하므로
  `(( critical == 0 ))` 이 참이 된다. 보안 게이트가 "확인 못 했음" 을 "문제 없음" 으로 보고한
  것이다. 실제 배포 로그에 흔적이 남아 있다:

  ```
  [alpha-scan] teameet-alpha-v1-api critical= high=
  ```

  **2) 일시적 AWS CLI 내부 오류가 배포를 죽였다.**

  ```
  aws: [ERROR]: 'NoneType' object does not support item assignment
  ```

  스캔 결과가 아니라 CLI 자체의 크래시인데 재시도가 없어 게이트가 그대로 실패했다.
  2026-08-08~09 alpha 에서만 3회 발생, 매번 사람이 재실행해야 했다.

  ## 변경

  - `scripts/release/image-scan-common.sh` 신설 — 두 스크립트가 source 한다. 중복이 결함을
    두 곳에 존재하게 한 원인이므로 같은 변경에서 제거했다.
  - **스캔 상태가 명시적으로 `COMPLETE` 일 때만** 카운트를 해석한다. 그 외(빈 응답, 조회 실패,
    `IN_PROGRESS`)는 전부 fail-closed. 취약점 0건인 정상 스캔은 `{}`/`null` 이 정상이므로
    0 으로 해석한다 — **"카운트가 비었다" 와 "스캔을 못 읽었다" 를 상태로 구분**하는 것이 핵심이다.
  - 카운트가 정수가 아니면 막는다. 빈 값이 산술에서 0 으로 새던 경로를 명시적으로 차단.
  - 일시 오류(CLI 내부 크래시·throttling·타임아웃·5xx)만 재시도한다. 권한 오류처럼 재시도로
    해결되지 않는 것은 즉시 올린다.

  ## 검증

  `scripts/qa/test-image-scan-gate.sh` 신설 — 가짜 `aws` 로 6개 시나리오를 재현하고 CI 에 배선했다.

  ```
  수정본  → 6 passed, 0 failed
  원본    → 3 passed, 3 failed
            FAIL findings 를 못 읽으면 막는다 (expected fail, exit 0)   ← fail-open 실증
            FAIL 스캔이 COMPLETE 가 아니면 막는다 (expected fail, exit 0)
            FAIL 일시적 CLI 내부 오류는 재시도로 넘어간다 (expected pass, exit 1)
  ```

  fail-open 은 추론이 아니라 **원본 스크립트가 실제로 exit 0 을 반환하는 것으로 확인**했다.

- 098fd89: expand-contract 마이그레이션 게이트에 **검토된 non-additive statement**를 위한 감사 가능한
  escape hatch 를 추가하고, alpha 배포를 막던 팀일정 unique index 를 등록한다.

  ## 무엇이 막고 있었나

  #296(매치↔팀일정 연동)이 추가한
  `CREATE UNIQUE INDEX "v1_team_schedules_team_match_unique" ON "v1_team_schedules"("team_id", "team_match_id")`
  는 **기존 테이블의 기존 컬럼**에 unique 를 거는 non-additive 변경이라, 배포 pre-step
  "Resolve rollback compatibility base"(`check-expand-contract-migrations.mjs`)가 정당하게 막았다 —
  2026-08-09 alpha 배포가 시드 데드락 해소(#297) 뒤에도 이 게이트에서 계속 실패했다.

  ## 왜 override 인가

  게이트의 additive 규칙은 **statement 가 additive 임을 증명**할 수만 있고, 진짜 non-additive 이지만
  이 코드베이스의 데이터·앱 현실에서 롤백 안전한 경우까지 판정하진 못한다(구조적 한계). 그
  마지막 판단은 사람 몫이고, 이번 변경이 그걸 **감사 가능하게 기록**하는 자리다:

  - `REVIEWED_NON_ADDITIVE` 리스트에 (file, statement, reason) 로 등록된 statement 만, **정확히
    그 한 쌍만** 통과시킨다(정규화된 일치 — 공백 차이 무시). 나머지 non-additive 는 전부 그대로 막힌다.
  - 통과 시 배포 로그에 `reviewed non-additive accepted ... <reason>` 을 남긴다(조용한 우회 아님).

  ## 이 index 가 안전한 근거 (등록 사유)

  - `team_match_id` 가 NULL 인 일반 TRAINING/EVENT 스케줄은 Postgres 가 NULL 을 충돌로 안 봐서
    제약 대상이 아니다 — MATCH 스케줄만 constrained.
  - (team, match) 중복 스케줄은 앱 레벨 idempotency(팀 단위 lock + 트랜잭션 불변식,
    `team-schedules.service.ts`)가 이미 막는다. 이 index 는 저자의 마지막 방어선이지, 옛 writer 가
    위반할 새 형태가 아니다.
  - alpha 실측: `v1_team_schedules` 에 non-NULL `team_match_id` 행 0건, 중복 0건.

  ## 검증

  `--self-test` 에 3케이스 추가: 등록된 statement 통과(공백 무시), 미등록 non-additive 는 여전히
  거부, 같은 statement 라도 다른 file 이면 거부. 실제 range(d6176d50 → dev)를 게이트에 태워
  `accepted → passed` 를 실측 확인(배포 pre-step 재현).

- 86a22f5: alpha 배포를 막고 있던 expand-contract 마이그레이션 게이트 실패를 해소했다. 게이트 파서를
  dollar-quote(`$$...$$`) 인지 방식으로 고쳐 PL/pgSQL 함수 본문이 세미콜론에서 잘못 분할되던 버그를
  잡았고, 함수 재정의·신규 테이블 트리거·(순차 검사로 안전이 증명되는) 기존 테이블 FK·유니크 인덱스에
  대한 좁은 판정 규칙을 추가했다. 남은 진짜 위반(경쟁 설정 백필/시드/`SET NOT NULL`/구버전 앱이 이미
  쓰는 트리거)은 마이그레이션에서 분리해 `apps/v1_api/src/tournaments/competition-config/
competition-config-backfill.{ts,cli.ts}` 앱 CLI로 옮겼다(DML은 게이트가 신뢰하지 않는 설계).
  `v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures.competitionConfigVersionId`는 계약
  단계 마이그레이션이 나올 때까지 nullable이다 — 남은 SET NOT NULL/트리거 부착 계획은
  `docs/ops/task9-competition-config-contract-phase.md` 참조. 사용자에게 보이는 API 계약 변경은
  없다.
- 3fb344d: alpha 대회 공개 일정이 항상 비어 보이던 결함을 고쳤다. Game 도메인이 배포되기 전에 만들어진
  `v1_tournament_fixtures` 행에는 대응하는 `V1Game`이 없어, 공개 일정 API가
  `fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN'`으로 읽어 전부 hidden 처리되고 있었다.
  운영용 백필(`apps/v1_api/src/games/migration/fixture-game-backfill.{ts,cli.ts}`)을 추가해
  `scheduled`/`in_progress` 픽스처에는 `GamesService.createFromSourceInTransaction()`을 그대로
  미러링한 Game(사이드·라인업·참가자·피리어드·공개 정책)을 생성하고, `completed` 픽스처는 Task 10
  백필(`game-result-backfill.ts`)이 만든 Game에 그 백필이 쓰지 않는 피리어드/공개 정책만 보강한다 —
  같은 픽스처에 Game이 두 번 생기지 않고, Task 10과의 실행 순서와도 무관하다. dry-run/apply가 같은
  후보 조회 함수를 공유하며, 재실행 시 아무것도 새로 만들지 않는다(멱등). 마이그레이션 파일에는 DML을
  넣지 않았다 — expand-contract 게이트가 이를 거부하므로 Task 10/D-21과 같은 방식으로 CLI로 분리했다.
  사용자에게 보이는 API 계약 변경은 없다.
- ea5367c: 풋살 팀매치의 라인업 상한(`futsal-v1` 경기 설정의 `lineup.maxPlayers`)을 5에서 6으로 올려, 이미 선택 가능했던 '6:6' 경기방식 프리셋(`team-match-conditions.constants.ts`)으로 만든 매치에서도 6명 선발 라인업을 저장할 수 있게 한다. 지금까지는 6:6으로 매치를 만들어도 라인업 저장이 항상 `LINEUP_SIZE_INVALID`로 거부됐다.

  이 상한은 코드에 새로 하드코딩한 것이 아니다 — `V1CompetitionConfigVersion.lineup.maxPlayers`가 이미 검증(`team-match-lineup.service.ts`/`games.service.ts`)의 유일한 출처였고, 이번 변경은 그 값 자체(그리고 이미 존재하던 `FUTSAL_FORMATIONS`의 `outfield: 5` 대형 — 2-2-1/1-3-1/3-1-1)만 바꾼 것이다. 관리자가 이후 다른 인원수로 조정하고 싶다면 이미 있는 `POST /admin/competition-configs/:configId/versions`로 새 버전을 발행하면 된다(새로 만든 버전은 스키마 기본값으로 즉시 ACTIVE라 team-match는 자동으로 따라가고, tournament는 `PATCH /admin/tournaments/:id/competition-config`로 특정 버전에 pin할 수 있다) — 다만 이 API를 호출할 관리자 화면은 아직 없다.

  **배포 시 운영 조치 필요(자동 반영 아님):** 이 커밋만으로는 이미 배포된 환경(alpha 등)의 `futsal-v1` ACTIVE 행이 바뀌지 않는다 — `competition-config-backfill.cli.ts`의 `seedCompetitionConfigVersions()`는 DB 행과 코드 상수의 content hash가 다르면 기존 행을 조용히 덮어쓰지 않고 `COMPETITION_CONFIG_SEED_DRIFT`로 하드 실패한다(완료된 경기의 채점 규칙을 소급 변경하지 않기 위한 의도된 가드 — `deploy-alpha.sh`가 이 CLI를 배포 스크립트에 자동으로 넣지 않는 이유이기도 하다. 2026-08-09에 lineup.positions/formations 추가 때 실제로 이 드리프트로 alpha가 막혔던 전례가 있다). 이 변경을 alpha/prod에 실제로 반영하려면 배포 후 운영자가 한 번:

  ```
  DATABASE_URL=<target> pnpm --filter v1_api exec ts-node --transpile-only \
    src/tournaments/competition-config/competition-config-version-repoint.cli.ts \
    --actor-email <owner/ops 관리자 이메일>
  ```

  를 돌려 futsal-v1의 canonical 후속 버전을 발행하고 아직 완료되지 않은 team match/tournament를 그 버전으로 리포인트해야 한다(`--dry-run`으로 먼저 확인 가능). 돌리기 전까지는 새로 만드는 팀매치도 여전히 5명 상한을 본다.

- f2b3b79: 게이트 설정 마이그레이션(`20260810120000_v1_operation_gate_setting`)에서 singleton 행 INSERT 를 제거한다.

  expand-contract 가드는 마이그레이션에 추가형 DDL 만 허용하고 DML 은 거부한다 — 롤백했을 때 이전 버전 코드가 그 행을 어떻게 다룰지 보장할 수 없기 때문이다. alpha 배포가 이 가드에서 막혔다.

  이 INSERT 는 애초에 중복이었다. `GameOperationFlagsService.readGateSetting()` 이 매 조회마다 `INSERT ... ON CONFLICT (id) DO NOTHING` 으로 singleton 행을 보장하므로(기존 `ensureDefaults()` 가 플래그 기본행을 다루는 방식과 동일), 마이그레이션이 행을 만들지 않아도 첫 조회 시점에 기본값 `false` 로 생긴다.

  가드를 완화하거나 예외 목록에 넣지 않았다.

- 4100311: 인증 도입 이전에 가입한 레거시 미인증 계정이 자기 계정을 건사할 수 있게 한다. 지금까지 이들은 로그인은 되는데 `V1AuthGuard`의 전역 쓰기 게이트가 GET 외 모든 쓰기를 403으로 막아, 프로필 사진 한 장 바꾸지 못한 채 인증 안내만 반복해서 보게 됐다. 인증을 유도해도 정작 그 사용자는 아무것도 할 수 없는 상태였다.

  허용 목록에 자기 계정 범위 경로(`/me`, `/onboarding`, `/notifications`, `/notification-preferences`, `/uploads`, `/inquiries`, `/search`, `/logs`, `/master`)를 추가했다. 팀·대회·채팅·매치·리뷰처럼 다른 사용자에게 도달하는 쓰기는 그대로 막힌 채로 두며, 허용 목록은 fail-closed 구조를 유지하므로 새 엔드포인트는 여전히 기본이 차단이다.

  프론트에서도 같은 전제를 걷어냈다. 프로필 편집 화면이 "어차피 서버가 403을 준다"는 이유로 저장 요청 자체를 보내지 않고 있어서, 서버만 열어서는 사용자가 여전히 갇힌 상태였다. 번호를 바꾸는 경우의 본인인증 요구는 서버·클라이언트 양쪽 모두 그대로 유지된다 — 증명 없이 번호를 붙일 수 있으면 "프로필에서 번호만 교체"로 인증 자체가 우회되기 때문이다.

  신규 회원가입의 본인인증 필수 요건은 바뀌지 않는다.

  `/inquiries`는 미인증 계정에도 열리는 유일한 "운영자에게 도달하는" 경로라, 전역 기본값(1000/분) 대신 5/분 rate limit을 걸었다.

- 75e50dd: 포메이션을 바꾸면 배치한 선수가 피치에서 사라지던 문제를 고친다.

  슬롯과 선수를 짝짓는 기준이 `positionCode` 완전일치뿐이었다. 그래서 새 프리셋에 그 코드의 자리가 없거나 개수가 줄면(1-2-1의 아라 2명 → 2-2에는 아라 자리가 0개) 그 선수는 매칭에서 탈락했고, 슬롯 모드는 매칭된 선수만 그리므로 화면에서 조용히 증발했다. 더 나쁜 건 탈락한 선수의 좌표가 그대로 남아 저장 페이로드에는 실렸다는 점이다 — 화면에 없는 선수가 옛 좌표로 DB에 저장됐다.

  이제 프리셋을 고르면 배치된 선수를 새 자리로 **재배치**한다. 배정은 전체 이동 거리를 최소로 하는 매칭으로 정한다 — 자리마다 가장 가까운 선수를 차례로 집는 그리디는 앞선 자리가 좋은 선수를 선점해 뒤쪽 선수를 반대편으로 밀어내고, 사용자에게는 그게 "좌표가 튀는" 것으로 보인다. 자리가 모자라 남는 선수는 대기로 내려가며 좌표·포지션을 완전히 지워 유령 좌표가 저장되지 않게 한다. 배치가 실제로 움직이거나 대기로 내려갈 때만 확인 모달로 먼저 묻는다.

  토큰을 드래그할 때 좌표가 튀던 것도 함께 고친다. 잡은 지점과 토큰 중심의 차이를 기록하지 않아 포인터 위치가 곧 토큰 중심이 됐고, 44px 터치 타겟의 가장자리를 잡으면 최대 22px를 순간이동했다.

  포메이션 목록이 골키퍼 지정 여부에 흔들리던 것도 고친다. 기준이 `선발 − 골키퍼로 지정된 선수`라, 골키퍼를 정하는 순간 숫자가 1 줄면서 목록이 갈리고 고르던 포메이션이 사라졌다. 라인업의 골키퍼 자리는 항상 정확히 하나이므로 `선발 총원 − 1`로 센다. 서버는 라인업 응답에 이 경기의 출전 인원(범위)을 함께 내려줘, 화면이 "몇 명이어야 맞는지"를 직접 안내한다.

  저장은 두 화면 모두 명시적 저장으로 통일한다. team-match 라인업의 900ms 자동저장은 피치에서 토큰을 끄는 동안 매 포인터 이벤트가 타이머를 재설정해 "저장이 되는 건지" 알 수 없게 만들었다. 대신 미저장 변경이 있으면 화면이 그렇게 말하고, 저장하지 않은 채 탭을 닫으려 하면 경고한다.

  매치·팀매치 생성 위저드의 임시 저장에는 만료(24시간)를 둔다. 지우는 시점이 "생성 성공" 하나뿐이라 중간에 빠져나오면 값이 무기한 남았고, 며칠 뒤 새 매치를 만들 때 지난번 종목·지역이 기본값인 것처럼 되살아나 의도하지 않은 설정으로 생성될 수 있었다.

- 2b3d245: 갓 배포된 환경에서 대회 운영 보드가 `500 GAME_READ_FLAG_MISSING` 으로 죽던 결함을 고친다.

  `TournamentOperationsBoardService.list()` 는 `GAME_READ` 플래그 행이 없으면 의도적으로
  fail-closed 한다(Task 18 review P1-7 — 행이 지워졌을 때 조용히 legacy 로 떨어져 compare 모드의
  불일치 보호가 사라지는 것을 막기 위함). 그 계약 자체는 옳지만, **배포 경로에서 그 행을 만드는
  곳이 없었다**: `GameOperationFlagsService.ensureDefaults()` 는 private 이고 `platform_ops` 가
  플래그 API 를 호출할 때만 돌며, 마이그레이션은 이 행을 시드하지 않는다(expand-contract 게이트상
  DML 은 additive 가 아니다). 그래서 새로 provisioning 된 환경은 누군가 플래그 API 를 건드리기
  전까지 운영 보드가 500 이었다 — alpha 가 실제로 그 상태였다(`v1_game_operation_flags` **0행**).

  보드의 통합 테스트가 못 잡은 이유도 같다: 모든 케이스가 setup 에서 플래그 행을 직접 upsert 해서,
  "배포만 된 환경" 을 재현하는 케이스가 하나도 없었다.

  - `config/game-operation-flags-seed.ts` 신설 — `createMany({ skipDuplicates: true })` 로 4개
    플래그 행 + cutover epoch 을 시드한다. `upsert` 가 아니라 `createMany` 인 것이 핵심이다:
    update 경로가 아예 없으므로 "운영자가 바꾼 값을 되돌리지 않는다" 가 빈 `update: {}` 절에 기댄
    약속이 아니라 **구조적 성질**이 된다. 배포마다 실행되기 때문에 이 성질이 중요하다.
  - `config/game-operation-flags-seed.cli.ts` 신설 — 배포 후 실행용 진입점
    (`game-result-backfill.cli.ts` / `competition-config-backfill.cli.ts` 와 같은 분리 방식).
  - `deploy/deploy-alpha.sh` 와 `.github/workflows/deploy.yml` 의 마이그레이션 재생 게이트에서
    `prisma migrate deploy` 직후 실행하도록 배선 — CI 와 실제 배포가 같은 DB 상태를 보게 된다.
  - `games/migration/task10-runtime-manifest.cli.ts` 안에 있던 동일 구현(byte-equivalent 사본)을
    제거하고 공유 모듈을 import 하도록 정리.
  - 통합 테스트 2건 추가: (1) 배포만 된 환경에서 보드가 요구하는 행이 전부 생기는지,
    (2) 재실행이 운영자가 바꾼 값(`PUBLIC_LIVE: on`, epoch `writeMode: new`)을 되돌리지 않는지.
    후자는 덮어쓰는 upsert 를 주입해 실제로 실패하는 것을 확인했다.

  ## 추가 — 공개 대회 일정 백필을 alpha 배포 경로에 배선

  `deploy/deploy-alpha.sh` 는 매 배포마다 QA 시드를 돌려 대회 데이터를 리셋한다. 새로 생기는
  QA 픽스처에는 `V1Game` 이 없어 배포 직후 공개 대회 일정이 항상 빈 목록이었다(운영자가 수동으로
  백필 CLI 를 돌려야만 복구됐다). QA 시드 실행 **직후**에 `games/migration/fixture-game-backfill.cli.ts`
  를 추가해, 픽스처에 대응하는 `V1Game` 을 미러링 생성하도록 했다.

  **`competition-config-backfill.cli.ts` 는 의도적으로 배포 경로에 넣지 않았다.** 그 CLI 는
  canonical config 행이 현재 코드의 레지스트리 상수와 content hash 가 다르면
  `COMPETITION_CONFIG_SEED_DRIFT` 로 하드 실패한다. 가드 자체는 옳다 — 이미 대회가 참조 중인
  config 의 내용이 바뀐 채로 진행하면 끝난 경기의 채점 규칙이 조용히 바뀔 수 있다. 그러나 그
  CLI 를 배포 경로에 두면 **드리프트가 존재하는 동안 모든 alpha 배포가 실패한다.**

  이건 가정이 아니라 실측이다. 2026-08-09 시점 alpha 가 정확히 그 상태였다 — #277 이
  `lineup.positions`/`lineup.formations` 를 프리셋에 추가했는데 DB 의 canonical 행은 이전 내용이라
  CLI 가 거부했다:

  ```
  COMPETITION_CONFIG_SEED_DRIFT: football-v1 expected b442845d… but found 60b7ecf9…,
                                 futsal-v1   expected 2d4bf6fb… but found 769fa5d3…
  ```

  게다가 in-place 복구도 불가능하다 — `v1_block_used_config_mutation` 트리거(라이브 정의 확인)가
  `v1_games`/`v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures` 중 하나라도 그 config 를
  참조하면 UPDATE·DELETE 를 거부한다(실측 참조 수: 대회 4 · 픽스처 10 · 게임 4 · 팀매치 1).
  즉 "새 config 버전 발행 후 repoint" 라는 운영 판단이 필요한데, **배포 파이프라인이 그 판단을
  대신 내릴 수는 없다.**

  그래서 config 채우기는 CLI 가 아니라 **QA 시드가 픽스처를 만드는 시점에 직접** 하도록 하고
  (별도 PR), 이 CLI 는 운영자가 필요할 때 수동으로 돌린다. `fixture-game-backfill` 은 config 가
  없는 픽스처를 **격리(quarantine)만 하고 실패하지 않으므로** 배포 경로에 두어도 안전하다.

- 7e9127c: 공개 대회 경기 기록의 라인업에서 같은 팀이 여러 번 저장한 과거 라인업이 최신 저장본과 함께 누적되어 보이던 문제를 수정한다. 홈·원정 각 팀에서 revision이 가장 높은 라인업만 선택하고, 해당 lineupId에 속한 참가자만 공개한다. 과거 라인업 참가자를 참조하는 골·카드 등 경기 이벤트 기록은 기존대로 유지한다.
- 6f878e3: 공개 경로가 결과 리비전의 두 가지 `score` JSON 형태를 모두 읽게 한다.

  `v1_game_result_revisions.score` 에는 서로 호환되지 않는 두 형태가 공존한다 — 실시간 결과 확정 경로는 평평한 `{home, away}` 를, 레거시 결과 백필은 `{regulation: {home, away}, penalty, goals, incomplete, provenance}` 를 같은 컬럼에 쓴다. 리더가 평평한 형태만 인식해, 백필로 넘어온 완료 경기가 전부 `scoreStatus: 'unavailable'` 로 보였다(알파 실측 21경기).

  저장된 값을 마이그레이션으로 통일하는 대신 리더가 양쪽을 받아주게 했다 — 이미 두 형태가 공존하는 이력 데이터라 이쪽이 안전하다. 통일은 별도 과제로 남긴다. `regulation` 이 명시적으로 null 인 경우(스코어 미기록)는 점수를 지어내지 않는다.

- 9c72c43: ECR 스캔 게이트가 **취약점 0건인 정상 스캔을 차단하던 것**을 고친다. 직전 변경(#289)이
  fail-open 을 닫으면서 같이 막아 버린 케이스로, alpha 배포가 실제로 멈췄다.

  ## 무엇이 잘못됐나

  #289 는 `critical` 이 빈 문자열이면 게이트를 막도록 했다. 그런데 AWS CLI 는 `--query` 결과가
  없을 때 **빈 출력**을 준다 — 즉 취약점이 하나도 없는 깨끗한 스캔의 정상적인 모양이다.
  배포 로그에서 그대로 관측됐다:

  ```
  [alpha-scan] teameet-alpha-v1-api: unparsable severity counts (critical='' high='')
    — refusing to pass the gate
  ```

  이 메시지가 찍혔다는 것은 **상태 검사를 이미 통과했다**는 뜻이다(아니면 status 메시지가
  찍혔을 것). 즉 스캔은 성공적으로 읽혔고 결과가 0건이었다.

  ## 게이트를 지키는 것은 emptiness 가 아니다

  원래의 fail-open 은 "빈 값" 때문이 아니라 **호출이 실패했는데 exit code 를 보지 않은 것**
  때문이었다. CLI 가 크래시해도(exit 1) 빈 문자열이 bash 산술에서 0 으로 취급돼 통과했다.
  그 구멍은 `scan_aws_retry` 가 non-zero 를 반환하며 이미 막는다. 따라서 판정 기준은:

  - describe 호출이 **실패** → 차단 (exit-status 검사)
  - 스캔 상태가 **COMPLETE 아님** → 차단 (status 검사)
  - 위 둘을 통과했는데 findings 가 비어 있음 → **취약점 0건** → 통과

  ## 계약 테스트

  `scripts/qa/test-image-scan-gate.sh` 에 케이스를 나눠 넣었다. 수정 전 코드로 돌리면
  `COMPLETE + 빈 findings` 만 정확히 실패하고(= 라이브 차단 재현), fail-open 방어
  (`findings 조회가 계속 실패하면 막는다`)는 양쪽 모두 통과한다 — 보호를 되돌리지 않았음을
  같은 스위트가 증명한다.

- 5829d7e: 일정 카드 득점자 요약에서 취소된 골이 그대로 남던 것을 고친다.

  `loadScorers` 가 쿼리 `where` 에 `type: 'GOAL'` 을 걸어 CORRECTION 행을 아예 읽지 않았다. 취소는 GOAL 행이 아니라 CORRECTION 행이 `reversesEventId` 로 가리키므로, 취소 판정용 집합이 항상 비어 되돌려진 골이 요약에 남았다. 알파 실측: 골 2개인 경기에서 GOAL 4행 중 2행이 취소됐는데 요약에 4개가 전부 노출됐다.

  같은 파일의 `buildEvents` 는 전체를 읽고 나중에 타입을 거르는데 여기만 규칙이 갈라져 있었다 — 순서를 맞춘다.

  테스트 fake 도 함께 고쳤다. 예전 fake 는 `where` 를 무시하고 이벤트 배열을 통째로 돌려줘서 이런 쿼리 필터 버그를 원리상 잡을 수 없었다.

- c2c0564: alpha QA 시드가 대회·픽스처에 `competitionConfigVersionId` 를 직접 세팅하도록 고친다 —
  배포마다 공개 대회 일정이 비어버리던 결함.

  끊어졌던 사슬:

  ```
  QA 시드가 매 배포마다 대회 리셋 → 새 픽스처에 competitionConfigVersionId 없음
  → fixture-game 백필이 그 픽스처를 CONFIG_MISSING 으로 격리
  → V1Game 이 안 생김 → 공개 대회 일정이 빈 목록
  ```

  예전에는 `competition-config-backfill` CLI 가 나중에 그 값을 채워줬다. 그러나 그 CLI 는
  canonical config 행이 코드 상수와 다르면 `COMPETITION_CONFIG_SEED_DRIFT` 로 **하드 실패**한다.
  2026-08-09 alpha 가 정확히 그 상태였다 — #277 이 `lineup.positions`/`lineup.formations` 를
  프리셋에 추가했는데 DB 의 canonical 행은 이전 내용이라 CLI 가 거부했고, 그 결과 공개 일정이
  0건이었다(실측).

  값을 아는 쪽(시드)이 픽스처를 만들 때 바로 넣으면 그 의존 자체가 사라진다. 드리프트 해소
  (새 config 버전 발행 후 repoint)는 여전히 운영자의 판단으로 남지만, **더 이상 공개 일정을
  막지 않는다.**

  - `createScenario`/`createCompetitionData` 가 canonical 풋살 config id 를 인자로 받아
    대회 1곳 + 픽스처 2곳(조별·결선)에 세팅한다.
  - `main()` 이 시작 시 canonical 행의 존재와 `ACTIVE` 여부를 확인하고, 없거나 retired 면
    무엇을 해야 하는지 밝히며 **명시적으로 실패**한다(조용히 null 로 진행하지 않는다).
  - 통합 테스트 2건 + 기존 유닛 스펙 보강: 픽스처마다 config 가 박히는지, 그리고 **그래서
    fixture-game 백필이 하나도 격리하지 않고 실제로 `V1Game` 을 만드는지**. 두 번째가 핵심 —
    첫 번째만 있으면 "필드가 채워졌다" 만 보고 공개 일정이 실제로 채워지는지는 못 본다.
    `completed` 픽스처는 Task 10(`game-result-backfill`) 소유라 기대치에서 제외한다.

- 3b44b09: alpha 배포를 `MODULE_NOT_FOUND` 로 죽이던 시드의 cross-boundary import 를 제거한다.

  `prisma/seed-alpha-tournament-qa.ts` 는 alpha 배포 중 **API 프로덕션 이미지 안에서**
  `ts-node prisma/seed-alpha-tournament-qa.ts` 로 실행된다. 그 이미지에는 `src/` 가 들어있지
  않다 — `deploy/Dockerfile.v1-api` 는 `dist/`·`prisma/`·`node_modules`·`package.json`·
  `tsconfig.json` 만 COPY 한다. 그런데 직전 변경이 `../src/tournaments/competition-config/
competition-config-backfill` 에서 상수를 import 했고, 배포가 이렇게 죽었다:

  ```
  Error: Cannot find module '../src/tournaments/competition-config/competition-config-backfill'
  Require stack: /app/apps/v1_api/prisma/seed-alpha-tournament-qa.ts
  ```

  **CI 는 이 결함을 구조적으로 못 잡는다** — `src/` 가 존재하는 레포에서 돌기 때문이다.
  워커 entrypoint 가 `dist/jobs/…`(존재하지 않는 경로)를 가리킨 채 몇 달간 크래시 루프였던 것과
  같은 계열이다: **이미지가 코드의 가정을 담지 않는데 아무 게이트도 그걸 보지 않는다.**

  - 런타임 import 를 제거하고 canonical 풋살 config id 를 시드 안에 상수로 둔다.
  - 그 복제본이 레지스트리 상수(`FUTSAL_COMPETITION_CONFIG_ID`)와 어긋나지 않는지 유닛 스펙이
    단언한다 — 그 스펙은 이미지 밖에서 돌아 양쪽을 모두 import 할 수 있다.
  - **이 결함 계열 자체를 막는 가드 추가**: 이미지 안에서 실행되는 prisma 스크립트가
    `../src/` 를 import 하지 않는지 소스 텍스트로 검사한다. 배포를 죽인 그 import 를 되살려
    가드가 실제로 실패하는 것을 확인했다.

- 1d60c8a: alpha QA 시드 리셋이 **append-only `v1_operation_audits`가 못박은 대회를 통째 실패 대신
  건너뛰도록** 고친다 — 2026-08-09부터 모든 alpha 배포를 막던 데드락 해소.

  ## 무엇이 막고 있었나

  alpha 배포는 매번 6개 고정 ID 대회를 삭제-후-재생성한다. 게임 운영이 이 대회들의 경기를
  처리하며 `GamesService.writeAudit()`가 `v1_operation_audits`에 tournament·fixture 를 참조하는
  행을 쌓는데, 이 테이블은 트리거 `v1_operation_audits_append_only`로 **DELETE·UPDATE가 둘 다
  금지**된 append-only 로그다. 그 audit가 tournament 를 Restrict FK 로 못박아 `v1Tournament.deleteMany`
  가 실패하고, 배포가 통째로 중단됐다(candidate failed → 이전 릴리스 복원).

  ## 어떻게 고쳤나

  `resetAlphaTournamentScenarios`를 대회별 `SAVEPOINT`로 감쌌다. 삭제를 실제로 시도하고,
  Restrict FK 위반(Postgres 23503 → **Prisma P2003**)이면 그 대회분만 `ROLLBACK TO SAVEPOINT`로
  되돌려 건너뛰고 나머지는 계속 재생성한다. **append-only 트리거는 절대 끄지 않는다** — audit 를
  지우거나 수정하는 시도 자체가 없다.

  기존 정책도 그대로다: `teardownGamesForTournaments`의 두 가드(OFFICIAL 결과·append-only
  `V1TeamRecordFact`)는 일반 `Error`를 던지므로 P2003 캐치에 안 걸려 전체 트랜잭션을 그대로
  중단시킨다(PR #281이 확립한 "확정된 결과는 사람이 처리" 정책 불변).

  건너뛴 대회는 재생성하지 않는다(고정 ID라 재생성 시 충돌). `createScenario`를 안 부르므로 그
  대회의 leaf 엔티티(공지·시상·후기·스폰서)도 이전 배포 상태 그대로 보존된다. `skipped` 목록은
  배포 stdout JSON에 항상 실려 조용한 방치를 막는다.

  ## 검증

  - **P2003 매핑을 alpha 실데이터로 실측 확정**: 배포된 Prisma로 못박힌 대회(aa...004) 삭제를
    시도해 `code === 'P2003'`, 0행 변경(safe)을 직접 확인.
  - 통합 테스트 3건 추가: ① append-only audit가 못박은 대회를 skip(throw 아님)하고 P2003 경로가
    실제로 돌았음을 assert, ② 한 대회 skip + 다른 대회 reset을 같은 트랜잭션에서, savepoint
    롤백 후 트랜잭션이 계속 사용 가능함을 확인, ③ 기존 7개 계약 케이스(특히 OFFICIAL 결과는
    여전히 전체 실패)는 그대로 유지.

  ## 후속 (별도 PR)

  이건 "막히면 스킵"이지 근본 해소가 아니다. 계속 운영 중인 QA 대회는 매 배포마다 스킵돼 새
  QA 콘텐츠를 못 받는다. tournament/fixture 를 delete 대신 upsert 로 전환하는 구조적 해소는
  별도 PR(fixture 자연키 마이그레이션 동반)로 진행한다.

- c8cf8c1: alpha QA 대회 시드를 **삭제-후-재생성에서 멱등 upsert 로 전환**한다(Part 2 — append-only 데드락 근본 해소).

  #297 은 append-only `v1_operation_audits`(또는 픽스처의 `V1Game` Restrict FK)가 못박은 대회를 대회별
  SAVEPOINT 로 건너뛰는 우회였다 — 그 대회(예: `aa…004`)는 매 배포 stale 로 남았다. Part 2 는 우회가 아니라
  구조를 바꾼다:

  - **대회·그룹·픽스처는 절대 삭제하지 않고 upsert** 한다 — 대회는 고정 id 로, 그룹은 자연키
    `(tournamentId, name)`, 픽스처는 자연키 `(tournamentId, round, fixtureNumber, legNumber)`(#304 에서 추가한
    unique). 픽스처 결과는 `fixtureId(@unique)` 로 upsert(V1TournamentFixtureGoal 이 Cascade 로 참조하므로).
  - **V1Game 은 만들지도 지우지도 않는다**(fixture-game-backfill 같은 ops 소유). 픽스처를 안 지우니
    `v1_games_tournament_fixture_id_fkey`(Restrict)·operation_audit 참조가 걸릴 일이 없다.
  - **leaf 행만 tournament scope 로 삭제-재생성**한다(등록·명단·순위·영상·시상·후기·스폰서·공지·캠페인).
    이들은 어떤 append-only 트리거·Restrict FK 의 대상도 아니라(schema 실측) 항상 안전하다.

  결과: `teardownGamesForTournaments`·`resetAlphaTournamentScenarios`·`AlphaTournamentResetSummary`·
  SAVEPOINT/skip 로직이 통째로 제거됐고, 매 배포에서 **전 시나리오가 예외 없이** 재시드된다.

  통합 테스트(`seed-alpha-tournament-qa-upsert.integration-spec.ts`)가 실 Postgres 로 ① 2회 재시드 멱등성
  (중복 0) ② 대회+픽스처를 못박은 append-only operation_audit 를 뚫고 재시드 성공 + audit·대회 row 생존
  (같은 createdAt = update, not recreate) ③ 픽스처에 붙은 V1Game 생존 + 픽스처 id 안정 을 검증한다.

- 6f78091: 리그(team-match-series) 공개 개인 기록 `GET /team-match-series/:seriesId/player-records`에
  어시스트 순위를 되살린다. 이 필드는 어시스트 기록(T1, `V1GameResultParticipant.assists`)이
  아직 스키마에 없던 시점에 별도 트랙(T4)에서 임시로 빠졌던 것으로, 두 트랙이 `dev`에 합쳐진
  지금은 득점 집계와 동일한 방식(공개 동의 여부 확인 후 사용자별 합산 → 내림차순 정렬 → 상위
  30명)으로 어시스트도 함께 집계해 응답에 포함한다. 프론트엔드 `V1SeriesPlayerRecordsResponse.assists`도
  optional에서 필수로 되돌리고, `records?.assists ?? []` 같은 방어 코드를 제거했다.
- e691f60: 순위표를 공용 컴포넌트 하나로 합친다.

  같은 `/bracket` 화면의 두 탭이 같은 순위 데이터를 서로 다른 컬럼으로 보여줬다 — 순위·대진표 탭은 `승점 + 득실`, 경기 일정 탭은 `승/무/패 + 승점`. 탭만 바꿔도 같은 팀 성적이 다르게 읽혔다.

  컬럼은 `# · 팀 · 승점 · 득실` 넷으로 통일한다. 승/무/패는 이미 승점에 반영된 값이라 다시 풀어 적으면 중복이고, 축구식 대회에서 승점 다음 동률 판정 기준은 골득실이다. 폭에 따라 컬럼을 접지 않는다 — 탭마다 컬럼이 달라지는 문제를 폭 축에서 재현하게 된다.

  작업 중 발견: 공개 순위표 API 가 `teamLogoUrl` 을 아예 안 내려줘, 통합 후 경기 일정 탭에서만 팀 로고가 identicon 으로 떨어졌다. 자매 엔드포인트(`/teams/:id/records`)는 이미 같은 패턴을 쓰고 있어 순위표 쿼리만 빠져 있었다 — 서버 select 와 응답에 추가했다.

- 2c65851: 팀 프로필 로고가 저장되어 있을 때 대회 조별 순위와 결선 대진표, 공개 팀 경기 기록,
  팀매치 시리즈 순위표까지 동일한 실제 로고를 표시합니다. 공개 API 응답에 필요한 nullable
  로고 필드를 추가하고, 로고가 없거나 이미지 로딩이 실패한 경우에만 기존 생성형 팀 아이콘을
  사용합니다.
- 39ada55: 팀매칭 검색이 **팀 이름과 지역명으로도 매칭**되게 한다 — 검색창이 약속한 범위와 실제 쿼리가
  어긋나 있었다.

  검색창 placeholder 는 "지역, 팀 이름, 경기조건 검색"이라고 적혀 있는데 서버 쿼리는
  `title` / `description` / `placeName` 만 훑고 있었다. alpha 실측:

  | 검색어     | 대상    | 수정 전 |
  | ---------- | ------- | ------- |
  | `ㄷㅅㄴㅅ` | 제목    | 1건     |
  | `Testttt`  | 팀 이름 | **0건** |
  | `동구`     | 지역    | **0건** |

  실제로 존재하는 경기를 팀 이름으로 찾으면 "없다"는 결과를 받는다. 약속한 세 축 중 둘이
  동작하지 않았다.

  `OR` 에 `hostTeam.name` 과 `region.name` 을 추가했다. 둘 다 이미 있는 관계라 조인이
  새로 생기지 않는다.

  통합 테스트(`team-match-search-scope.e2e-spec.ts`)는 쿼리 구조를 되읊지 않는다 — 실 DB 에
  팀·지역·경기를 심고 **검색 결과에 그 경기가 들어오는지**만 확인한다. 장소명은 검색어와
  겹치지 않는 값으로 두어 `placeName` 덕에 통과하는 착시를 막았고, 무관한 검색어가 이 경기를
  가져오지 않는 대조군도 함께 둔다.

- 03ec33f: 팀 대상 후기를 참가팀 멤버 전원이 쓸 수 있게 연다.

  지금까지는 참가팀의 owner/manager만 상대팀 후기를 쓸 수 있었다. 경기에 뛴 사람은 팀 전체인데 평가는 팀장 한 명의 인상으로 결정됐고, 팀장이 안 쓰면 그 경기는 통째로 평가 공백이 됐다. 대회 경기(`tournament_fixture`)와 일반 팀 매치(`team_match`) 양쪽에서 역할 제한을 없애고 active 멤버십만 확인한다. 대상은 여전히 상대팀 하나이며 개인 대상으로 넓히지 않는다.

  중복 방지 키의 주체를 팀에서 사람으로 옮긴다. 기존 팀 기준 unique 제약 2개를 같은 마이그레이션에서 드롭하지 않으면 권한만 열리고 두 번째 멤버는 unique 위반으로 막혀, 실제로는 여전히 팀당 1명만 쓸 수 있는 상태가 된다. 한 사람이 서로 다른 두 팀 소속으로 같은 상대를 평가한 행이 있으면 사전 검사가 `RAISE EXCEPTION`으로 마이그레이션을 실패시킨다 — 어느 후기를 남길지는 사람이 정해야 하므로 자동으로 지우지 않는다.

  신뢰도는 "팀 평균 1표"로 환산한다. 팀별 평균을 먼저 낸 뒤 그 평균들의 평균을 쓰고, 후기 건수도 작성자 수가 아니라 평가에 참여한 팀 수다. 원시 평균을 그대로 두면 인원 많은 팀의 목소리가 그만큼 커지고, 한 팀이 몰표로 상대 신뢰도를 흔들 수 있다. 집계 경로는 DB에 쓰는 둘뿐 아니라 화면이 보는 값을 live 재계산하는 배치까지 셋이며, 셋을 모두 같은 규칙으로 맞췄다 — 배치를 빠뜨리면 상대 팀원 3명이 한 경기에서 쓰는 것만으로 인증팀 등급에 닿는다.

  pending 목록의 판정도 사람 기준으로 바꿨다. 그대로 두면 팀장이 쓴 순간 나머지 팀원 전원에게 완료로 표시된다.

- 2902e42: 대회 그룹·픽스처에 자연키 unique 를 추가한다 — QA 시드를 삭제-재생성 대신 upsert 로 전환하기
  위한 전제(append-only audit 데드락의 구조적 해소 Part 2).

  - `v1_tournament_groups(tournament_id, name)` unique
  - `v1_tournament_fixtures(tournament_id, round, fixture_number, leg_number)` unique
    (기존 `(tournament_id, id)` 는 랜덤 id 기반이라 upsert 키로 못 씀)

  두 unique 는 기존 컬럼에 걸리는 non-additive 라 expand-contract 게이트가 막는다 — alpha·prod
  실측 중복 0건(prod 픽스처는 0행)을 근거로 게이트 allowlist 에 사유와 함께 등록했다. 이 제약은
  같은 대회에 중복 그룹/픽스처가 생기는 것을 DB 레벨에서 막는 방어이기도 하다.

  **후속(별도 PR)**: 이 자연키를 써서 `createScenario` 의 tournament/fixture/group 을 delete→upsert
  로 전환하고 `resetAlphaTournamentScenarios`(Part 1 skip 로직)를 제거하면, append-only audit 가
  대회를 못박아도 삭제하지 않으므로 매 배포 skip 이 사라진다.

- 3761998: **[CRITICAL] alpha 라이브 실패(옐로카드/파울 기록이 원인 불명의 `VALIDATION_ERROR`로 거부) 근본 원인을 고쳤다.** `medianOffsetMs()`(클록 오프셋 추정)가 소수(`.5`)를 반환할 수 있었다 — 서버 처리 시간이 홀수 ms거나, 표본이 짝수 개라 중앙값을 평균 내는 경우다. 그 소수가 `serverAlignedNowMs` → `elapsedMatchMs` → `freezeCapture()`의 `clockMs`까지 그대로 전파됐고, 서버 `RealtimeGateway`의 `parseGameEvent`는 `clockMs`가 `Number.isSafeInteger`이길 요구해 거부했다(간헐적 — 네트워크 지연의 홀짝에 좌우됐다). 큐에 이미 저장된 소수 `clockMs`는 재시도해도 그대로 재전송되어 매번 같은 이유로 다시 실패했다 — 오너가 지적한 "다시 시도"가 무의미했던 이유다.

  - `medianOffsetMs()`가 반환 직전 정수로 반올림한다 — 이 함수의 반환값이 `clockOffsetMs`로 앱 전체에 나가는 유일한 지점이라, 여기 하나로 경계를 몰았다(`freezeCapture`/`ElapsedMatchClock` 양쪽이 각자 반올림하면 표시값과 저장값이 갈라진다).
  - 이 픽스 이전에 이미 큐에 저장된 소수 `clockMs` 항목도 구제한다: `retryFailedEvent`가 재시도 시점에 정수로 보정하고(이벤트가 실제로 벌어진 시각 `occurredAt`은 절대 바꾸지 않는다, 1ms 미만 반올림만), 서버가 `payloadHash`를 event 내용으로 재계산해 대조하므로(`GamesService.retryEvent`) 그에 맞춰 해시도 함께 다시 계산한다. `VALIDATION_ERROR`를 재시도 불가능 코드로 분류하지 않는다 — 이 보정 덕에 재시도가 실제로 복구 경로이기 때문이다.
  - 소켓 게이트웨이(`RealtimeGateway`)가 `VALIDATION_ERROR`를 던질 때 "어느 필드가 왜"(`missingKeys`/`unknownKeys`/`invalidFields`, 필드 이름만 — 값은 절대 포함 안 함) 로그·클라이언트 응답에 남긴다 — 이번처럼 원인 불명 상태로 오래 방치되지 않도록 `game.event.append`/`game.event.retry`/`game.time.ping` 세 경로에 추가했다.
  - `VALIDATION_ERROR`가 `gameOperationsErrorMessage`에 매핑돼 있지 않아 default 문구("이벤트를 기록하지 못했어요")로 뭉개지던 것도 고유 문구로 고쳤다.

  **함께 고친 별도 결함(같은 파일, 같은 조사 과정에서 발견):** 이벤트 전송이 소켓 `ack` 콜백을 못 받으면(연결이 응답 없이 끊기는 경우 등) `'sending'` 상태에서 영원히 고착됐다 — 새로고침 전까지 재시도 버튼도 없이 "전송 중"만 보여, 골을 기록했는지조차 알 수 없는 상태가 됐다. `SEND_ACK_TIMEOUT_MS`(10초) 안에 ack가 없으면 자동으로 `'failed'`로 전환해 기존 재시도 경로에 합류시킨다 — 늦게 도착하는 ack도 여전히 유효하게 처리된다.

- e4c2812: 경기장에서 한 손으로 급박하게 조작한다는 실사용 맥락을 기준으로 대회 운영 콘솔(`tournament-ops` 경기 운영 화면)의 UX 감사 결과를 반영했다. (이벤트 전송 'sending' 고착 + alpha `VALIDATION_ERROR` 근본 원인은 별도 changeset — `v1-tournament-ops-clock-integer-fix` — 으로 분리했다.)

  **라인업 없이 경기를 시작할 수 있던 막다른 길을 막았다(클라이언트).** `operate-console.tsx`는 양 사이드 모두 SUBMITTED/LOCKED 라인업이 있어야 "경기 시작" 버튼을 활성화하고, 없으면 버튼을 숨기지 않고 비활성 + 사유 배너 + 라인업 화면 링크를 항상 함께 보여준다. 이미 라인업 없이 LIVE가 된 기존 경기도 `LineupGrid`의 빈 상태에 같은 링크가 생겨 그 자리에서 복구할 수 있다. (서버 측 `games.service.ts`의 `executeCommand` `start` 분기 검증은 별도 PR로 이어간다 — 기존 라이프사이클 통합테스트 다수가 라인업 미제출 상태로 경기를 시작시키고 있어, 이번 alpha 긴급 배포를 지연시키지 않도록 영향 범위 조율을 다음으로 미뤘다.)

  **"경기 종료"에 확인 단계를 추가하고 위험 버튼을 분리했다.** 되돌릴 수 없는 동작인데 확인 없이 즉시 실행됐다 — 기존 `useConfirm`/`ConfirmModal`을 재사용해 확인 다이얼로그를 붙이고, 헤더 명령 버튼 그룹에서 구분선으로 시각적·물리적으로 떼어냈다.

  **운영 권한 요청 중(`requesting`/`none`) 배너를 추가했다.** 콘솔을 열 때마다 거치는 구간인데 명령 버튼·라인업 그리드가 전부 비활성인 이유가 화면에 없었다.

  **모바일(390px)에서 원정팀 명단에 탭으로 바로 닿게 했다.** `LineupGrid`가 두 사이드를 세로로 쌓아, 원정팀을 보려면 홈팀 전체를 스크롤해야 했다 — sm(640px) 미만에서만 팀 전환 탭을 보여주고, 좌우 분리 + 팀명 헤더로 만들던 "어느 팀 선수인지 헷갈리지 않는다"는 기존 보장은 그대로 유지했다.

  **헤더에 실시간 점수를 추가했다.** 경과시간과 같은 위계(`text-2xl font-bold`)로, 확정된 GOAL 이벤트에서 파생하되 되돌려진(reversed) 이벤트는 제외한다(`games.service.ts`의 `scoreFromEvents`와 같은 정의).

  (alpha `VALIDATION_ERROR`의 근본 원인 수정 + 게이트웨이 필드 수준 진단은 별도 changeset — `v1-tournament-ops-clock-integer-fix` — 에 있다.)

  **사실 확인(수정 없음):** `text-2xs` 유틸리티는 Tailwind v4 기본 테마(`--text-xs`까지만 정의)에도, `globals.css`에도(`@theme`/`--text-2xs` 없음, 주석 언급뿐) 정의돼 있지 않다 — 무효한 클래스로 CSS가 생성되지 않아 캡션이 의도보다 크게 렌더된다. `tournament-ops/operate/*` 8개 파일(24곳) + `components/game-operations/team-foul-counter-bar.tsx`(2곳)가 영향받는다. `globals.css`는 다른 작업과 개행 혼재 위험이 있어 직접 고치지 않았다 — 토큰 정의를 소유한 쪽에서 처리해야 한다.

- 4e56bdc: **대회 상세에서 진행 중인 경기의 실시간 스코어가 전혀 보이지 않던 문제를 고쳤다.** 알파에서 실제로 확인된 사고: 운영 콘솔에는 "알파 그린 FC 2:0, 기록된 이벤트 5건"이 정상 표시됐지만, 같은 시각 관전자용 대회 화면(`/tournaments/[id]`)에는 진행 중인 그 경기의 점수가 아예 노출되지 않았다.

  근본 원인: 대회 경기(`TOURNAMENT_FIXTURE`) 게임은 `GamesService.deriveTournamentRevision`이 게임이 `ENDED`로 전환되는 그 순간에만 결과 리비전을 만든다. 공개 API(`GET /tournaments/:id/schedule`, `GET /tournaments/:id/matches/:fixtureId`)는 그 리비전(`currentOfficialRevision`)만 읽고 있었기 때문에, 경기가 실제로 진행 중인 동안에는 계속 `score: null`(`- : -`)로 내려갔다 — 운영 콘솔은 자기가 기록한 이벤트 목록을 직접 읽어 점수를 계산하므로 이 결함의 영향을 받지 않아 증상이 한쪽에서만 보였다.

  - (`v1_api`) `PublicTournamentRecordsService`가 공식 리비전이 아직 없고 경기가 진행 중(`LIVE`/`PAUSED`)이면 `V1GameEvent`의 GOAL 이벤트를 직접 집계해 실시간 스코어를 계산한다(`tallyLiveScore`, `public-live-score.ts`). 공개 시각화 등급(`hidden`/`status_only`/`live`/`official_only`)은 그대로 유지 — `live` 등급에서만 노출되고 `official_only`/`status_only`는 기존과 동일하게 공식 확정 전 숫자 스코어를 보여주지 않는다. 목록 조회는 페이지당 한 번의 배치 쿼리로 처리해(진행 중인 경기당 N+1 아님) 부하가 관전자 수가 아니라 동시 진행 경기 수에만 비례한다.
  - (`v1_api`) 새 `clock` 필드(`{ periodNumber, elapsedMs, isPaused }`)로 현재 피리어드와 일시정지 반영 경과 시간을 함께 내려준다(`resolveLiveClock`, `public-clock.ts`) — 운영 콘솔의 일시정지 누적 로직(`V1GamePeriod.pausedTotalMs`/`pausedAt`)과 동일한 계산을 공개 읽기 경로에도 적용했다.
  - (`v1_web`) 대회 일정 목록과 경기 상세 화면에 LIVE 배지(피리어드 · 경과 시간, 일시정지 시 별도 표시)를 추가했다.
  - (`v1_web`) 진행 중인 경기가 화면에 있을 때만 8초 간격으로 폴링한다(`usePublicTournamentSchedule`/`usePublicMatch`) — 운영 콘솔의 인증된 실시간 소켓 채널을 그대로 재사용하지 않고, 수백 명일 수 있는 익명 관전자에게 맞는 낮은 비용의 갱신 방식을 별도로 선택했다(근거는 `docs/api/domains/public-records.md` "Lane 1 addition" 참고).

- 58611e2: 대회 개인·팀 리뷰가 받은 사람의 리뷰 화면에서 누락되던 문제를 고쳤다. 신규 대회 리뷰는 작성자 사용자·소속팀·정확한 제출 시각을 제거한 익명 별점과 태그로 표시하며, 양쪽이 모두 리뷰를 제출했거나 한쪽 제출 후 72시간이 지난 경우에만 공개한다. 기존 `sportId = null` 리뷰는 이전 리뷰 섹션에 그대로 유지하고, 개인매치·팀매치 신규 리뷰의 종목별 집계 전용 정책은 변경하지 않는다.
- f9ab305: alpha 게임 오퍼레이션 워커가 도입 이래 한 번도 기동하지 못하던 결함을 고친다.

  `docker-compose.alpha.yml` 의 워커 서비스는 전용 이미지를 빌드하지 않고 API 이미지를
  그대로 재사용한다(`alpha-release-common.sh` 의 `assert_running_release_digests` 가
  `running_worker_image == ALPHA_API_IMAGE` 를 단언한다). 그런데 `command` 는 실제로는
  어떤 CI/배포 경로에서도 빌드되지 않는 `deploy/v1-game-operations-worker.Dockerfile`
  (`--rootDir src` 로 컴파일해 `dist/jobs/...` 를 만든다)의 CMD 를 그대로 복사한 값이었다.
  API 이미지는 저장소 `tsconfig.json`(`include` 에 `prisma`·`test` 포함 → 공통 루트가
  `apps/v1_api/`)으로 컴파일돼 `dist/src/...` 레이아웃을 가지므로, 워커는
  `MODULE_NOT_FOUND` 로 무한 재시작 상태였다.

  - `command` 를 `dist/src/jobs/v1-game-operations-worker.main.js` 로 정정 (API 본체의
    `CMD ["node", "dist/src/main.js"]` 와 같은 규칙)
  - 한 번도 빌드되지 않는 `build:` 블록과 `deploy/v1-game-operations-worker.Dockerfile`
    제거 — 잘못된 경로를 다시 복사해 오게 만드는 원인이었다
  - `wait_for_alpha_worker_healthy` 게이트 추가: `assert_running_release_digests` 는
    `.Config.Image` 만 읽어 재시작 루프를 정상으로 통과시켰고, 그래서 워커가 죽은 채로
    배포가 계속 "성공" 으로 보고됐다. 크래시 루프 컨테이너는 healthcheck 를 통과할 수
    없으므로 health 상태를 직접 확인한다. rollback/restore 경로에는 걸지 않는다 —
    워커가 깨진 구버전으로 되돌리는 것 자체를 막으면 장애 대응 경로가 사라진다.

## 0.2.2

### Patch Changes

- 360c727: Allow the canonical dev-to-main promotion PR to pass the release gate only after both fixed apps advance together, both changelogs are updated, pending Changesets are fully consumed, and the diff proves consumed release notes. Normalize workflow line endings so the production security guard enforces the same contract on Windows and CI.

## 0.2.1

### Patch Changes

- 8a350ee: Move every GitHub Action off the deprecated Node 20 runtime. Each of the four jobs in the production pipeline was emitting a "Node.js 20 is deprecated … being forced to run on Node.js 24" warning, which is harmless while the runners keep providing the shim and becomes a hard failure the day they stop. The pins now sit on the lowest major of each action that ships a `node24` runtime — `actions/checkout@v5`, `actions/setup-node@v5`, `pnpm/action-setup@v5`, `aws-actions/configure-aws-credentials@v6`, and `docker/build-push-action@v7` — rather than the newest release, so the change carries no behavior beyond the runtime bump. `configure-aws-credentials` needed v6 specifically: v5 is still Node 20.

  Actions already on `node24` (`amazon-ecr-login@v2`, `setup-buildx-action@v4.2.0`, `changesets/action@v1.8.0`) are untouched, and each file keeps its existing pin style — SHA-pinned entries got new SHAs verified by reading `action.yml` at that exact commit, and tag-pinned entries stayed tags.

  The two actions that CI cannot exercise on a pull request — `configure-aws-credentials` and `build-push-action`, which only run in `build-images` and the deploy jobs — are also used by `deploy-alpha.yml`, so merging to `dev` puts them through a real alpha deploy before they ever run against production.

- 21a7c14: Name the failing script in the Compose resolver's error message. `resolve_compose_binary()` lives in a file both `deploy-prod.sh` and `rollback-prod.sh` source, but its failure line was hardcoded to `[prod-deploy]`, so a rollback that could not find a working Compose form reported itself as a deploy failure. That is exactly the case an operator most needs to read correctly — the run that prompted this helper failed on both paths at once, and the log gave no way to tell them apart. The prefix now expands to the calling script's own name, which resolves to `[deploy-prod.sh]` or `[rollback-prod.sh]` respectively.
- a572a45: Stop the production image guard from breaking alpha deploys. `docker-compose.prod.yml` is loaded by alpha as a base file, and Compose interpolates every file before merging overrides — so a `${V1_API_IMAGE:?...}` guard in the shared base fires even though the alpha overlay replaces that value, which took alpha's deploy down with "error while interpolating services.v1_uploads_init.image". The guard now lives in `load_prod_release_manifest()`, where it only runs on the production path and additionally validates that the value is a real ECR digest URI rather than merely non-empty. A guardrail check keeps the shared base free of `:?` on those variables so this cannot recur.
- 090ba47: Unblock production deploys. The release-tag pruner filtered `:latest` out with `grep -v`, which exits 1 when nothing is left to print, and the remote deploy script runs under `set -euo pipefail` — so the perfectly normal state of having no stale tags aborted the whole deploy. Worse, it could not recover on its own: the build never ran, so SHA tags were never created, so every subsequent production deploy died at the same line. Replaced with an awk filter that returns 0 on no match, moved the function into `deploy/prod-release-common.sh` so it can actually be called by a test, and wired that test into the Gates job that runs on every push.
- 55b2062: Finish the SSH removal that the SSM transition missed. `resolve-prod-rollback-base.sh` still shelled out through the `ssh ec2` alias, but the workflow step that created that alias was deleted in the same transition — so the first production deploy died immediately with "ssh: Could not resolve hostname ec2" before it built anything. The script now reads release state over SSM like its alpha counterpart, and a guardrail walks every `scripts/release/*.sh` the workflow references so a leftover ssh/scp/rsync call can never again pass CI and only surface during a real deploy.
- 7d222a7: Harden the SSH-remnant guard that was supposed to prevent the failed production deploy. The pattern only matched a bare `ssh ec2`, so `ssh -o StrictHostKeyChecking=yes ec2` or `ssh -F config ec2` would have sailed through CI and died at deploy time exactly like the bug the guard was added for; it also stripped only whole-line comments, so explaining the transition next to a line of code (`cmd  # used to be ssh ec2`) falsely blocked deploys. Detection now allows options with attached or separate arguments, strips trailing comments, and is exercised by a test table wired into Gates so a future weakening of the pattern fails CI instead of surfacing during a release.
- b23b638: Expose complete personal-match and team-match editing, separate host edit and
  applicant-management actions, persist team-match application deadlines, and keep
  uploaded cover images consistent across edit payloads, lists, and details.
- 6ce18c1: Prove the backups restore, and notice when one stops arriving. A backup nobody has restored from is a guess — dumps fail at restore time for reasons a file listing never shows: a missing role, an absent extension, an ordering dependency. `verify-prod-backup-restore.sh` restores the latest dump into a throwaway Postgres container, never the live one, reports table, row, foreign key and index counts, and removes the container and its volume on the way out. `psql` runs with `ON_ERROR_STOP=1`, because the default keeps going after an error and would report a half-restored database as a success. The first run came back with 72 tables, 10,716 rows, 120 foreign keys and 278 indexes, no SQL errors.

  Running it needs S3 read, which the instance role deliberately does not have — it holds `PutObject` only, so a compromised host can neither read nor delete the backups. Read is granted as a temporary inline policy for the rehearsal and revoked afterwards, which keeps that property intact.

  The backup script now publishes a CloudWatch heartbeat, and only on success. The alarm treats missing data as breaching, so it fires whether the script failed, the timer never ran, or the instance was down. Publishing a zero on failure would have stayed silent in exactly the case that matters most — when the script never executes at all.

  `docs/ops/rds-migration-design.md` records the plan to move the database off the instance, written against measured state rather than assumption: 24MB across 72 tables, a default VPC with no private subnets, an unencrypted root volume, and a deploy that recreates the Postgres container on every run.

- 7be7a75: Resolve the Compose invocation at runtime instead of hardcoding the v2 plugin form. The production deploy and rollback scripts both called `docker compose`, but the production instance has no Compose CLI plugin at all — `cli-plugins` holds only `docker-buildx`, and Compose lives at `/usr/local/bin/docker-compose` as a standalone binary. Docker therefore never recognised `compose` as a subcommand, parsed `--project-name` as a global docker flag, and the first real production deploy died with `unknown flag: --project-name`. The legacy restore path shared the same array and failed the same way, which is why the run ended on `CRITICAL: legacy runtime restore failed`; nothing had actually been torn down, because the command never got past argument parsing.

  The alpha instance does have the plugin, so no amount of alpha verification could have surfaced this — the difference between the two hosts is the defect. `deploy/setup-ec2.sh` already branched on exactly this, so the decision moves into `resolve_compose_binary()` in `deploy/prod-release-common.sh` where both scripts share it. It probes in the same form the scripts actually run (`sudo` included, since plugins can be installed per-user) and fails loudly before any container is touched when neither form works.

  The deploy security guard now rejects a hardcoded Compose form in either script and requires both to go through the resolver. The first version of that check used a single-line regex that could not match the multi-line `compose=( … )` array and silently passed; it reads the array as a block instead.

- 1269ddc: Stop the cutover's ERR trap from running inside subshells, where it corrupted the value it was meant to protect.

  `set -E` makes an ERR trap inherited by command substitutions, process substitutions, and subshells. The cutover script sets `trap rollback ERR` early so that even preflight failures get logged and alerted, which meant any failing `$(...)` ran the full rollback inside that subshell — and the rollback's own log output became the substitution's value.

  Measured on 2026-08-03 by instrumenting the installed script: with `resolve_compose_binary` stubbed to fail, `compose_binary` did not end up empty as designed. It contained one element, and that element was `[cutover] 실패했지만 사용자 영향 구간 이전입니다 — 되돌릴 것이 없습니다 (exit 1)` — the rollback's message. The `[[ ${#compose_binary[@]} -gt 0 ]]` guard therefore passed on exactly the failure it was written for, and the script continued into the deploy path with a compose array holding a Korean log line instead of `docker compose`. The same mechanism also meant a preflight failure published its metric and SNS alert twice, once from the subshell and once from the main shell.

  `rollback()` now returns immediately when `BASHPID` differs from `$$`. A rollback in a subshell cannot do its job anyway — its `exit` ends only the subshell — so the inherited invocation just propagates the exit code and lets the main shell handle it. The compose resolution additionally moved into an `if` condition, which is exempt from errexit, so the trap has no opportunity to fire there at all; that line is where a failure costs us the means of rolling back, so it gets both.

  Verified end to end against the installed script: with the failing stub it now exits 1 with `compose 실행 파일을 찾지 못했습니다` and classifies itself as pre-impact, and an unmodified rehearsal still completes with 72 tables matched.

  Found while checking a Copilot review comment that claimed `cmd || fail` does not reach the ERR trap. That claim is wrong — an isolated test on the same bash 5.2 shows a genuinely empty array does trigger the trap and exit 99 — but the line it pointed at was broken for a different and worse reason.

- ba19fcc: Give production a backup. Until now it had none — a survey on 2026-08-02 found zero EBS snapshots, no `crontab` installed at all, and no backup directory, which meant losing the instance or its volume would have lost the data with it. The database is small enough (24MB for v1, 43MB for the legacy stack) that a full nightly dump costs almost nothing.

  `deploy/backup-prod-db.sh` dumps each database, gzips it, and uploads to a versioned, encrypted S3 bucket under `pg/<label>/<date>/`, authenticating through the instance role so no credentials sit on disk. It refuses to upload a dump smaller than 1KB and fails instead: an empty backup that uploads cleanly is only discovered when someone tries to restore from it. The systemd units run it daily at 02:30 KST — systemd rather than cron because this host has no `crontab` binary — and `Persistent=true` makes a missed window run at next boot rather than silently skipping a day.

  That pairs with a DLM policy taking daily EBS snapshots at 03:00 KST with 7-day retention. The dump runs half an hour earlier on purpose, so each snapshot contains that night's dump. The two cover different failures: snapshots restore a whole volume but cannot roll back a single table and cannot follow the data to RDS, while dumps do both and cannot restore nginx config or certificates.

  `docs/ops/prod-backup.md` documents the restore procedure for both paths and records what is still missing — for example, the first scheduled systemd timer run (02:30 KST) may not have been observed yet depending on when the change was deployed.

- 087eb8d: Make the production database host configurable so the database can move off the instance. `DATABASE_URL` pointed at the `v1_postgres` container by name, which is fine while the database lives beside the app and impossible to change once it doesn't. The host is now `${V1_DB_HOST:-v1_postgres}`, so an unset variable resolves exactly as before — that default matters because `docker-compose.prod.yml` is also the base alpha loads, and a required-variable guard in this file has broken alpha once already.

  The application's password is a separate variable from the container's. `V1_DB_PASSWORD` feeds `POSTGRES_PASSWORD` on the local `v1_postgres` service as well as the connection string, so pointing it at an RDS password would leave the already-initialised local container on its old credentials while the app tried the new ones — an authentication failure that looks like a database outage. `V1_DB_APP_PASSWORD` overrides only what the app connects with and falls back to the existing chain when unset. This is not hypothetical: the same collision was created and caught earlier the same day, when the RDS master password was written to the parameter path the deploy syncs into `.env`.

  `deploy-prod.sh` skips starting the local Postgres and waiting on its readiness when `V1_DB_HOST` points elsewhere — waiting for a container the app will not talk to proves nothing. The service and its volume stay defined either way, because the rollback window needs the old data intact.

  Verified with real `docker compose config`: unset variables reproduce today's connection string byte for byte, including under the alpha overlay; setting the two new variables moves the app to RDS while `POSTGRES_PASSWORD` on the local container stays unchanged.

- a1a4fc1: Bring the production deploy path up to parity with alpha: images are now built and pushed as immutable ECR digests from the GitHub Actions runner instead of `docker build` on the EC2 host, `:latest` tags are gone, and the source tree is versioned per release-sha with an atomic symlink swap (mirroring alpha's candidate→promote state machine). The `environment: production` approval gate still separates the build (runner-only, no service impact) from activation (symlink swap + migration + container replacement). A new `Rollback Prod` workflow lets an operator revert to the previous release at any time without a rebuild, using a compare-and-swap guard on the currently active commit SHA; database migrations are never rolled back, matching alpha's expand-contract policy. `restart-containers.sh` and its ad-hoc `prune_stale_release_tags` docker-tag cleanup are removed — both were solving a local-image-tag-accumulation problem that no longer exists once EC2 only pulls digest-pinned images.
- 4299eba: Read `V1_DB_HOST` from the runtime `.env` in `deploy-prod.sh`, and add a CI guard for the whole class of mistake.

  Removing `source` from the deploy script meant every value the shell needs now has to be read explicitly through `env_value()`. `V1_DB_HOST` was not, so the shell variable was always unset and `${V1_DB_HOST:-v1_postgres}` always resolved to the default — the branch that skips starting the local Postgres when the database lives on RDS could never run. Reproduced on 2026-08-03: with `.env` containing an RDS endpoint, the logic still selected the local path. Found by a Copilot review on the promotion PR, not by us.

  That defect only shows up after the cutover, which is exactly when nobody would be looking: the app would correctly reach RDS through Compose's `--env-file` while the deploy kept starting and waiting on an unused container, on a 2GB instance whose memory pressure was one of the reasons for moving to RDS in the first place. Once the `v1_postgres` service is eventually removed from the compose file, the same line breaks the deploy outright.

  This is the third guard in this deploy path that reported success on the situation it existed to catch — after the file-wide credentials grep and the compose preflight that swallowed its own exit status. Three is enough to stop fixing them one at a time, so `findUnreadRuntimeEnvVariables()` now fails CI when `deploy-prod.sh` references a `V1_*` variable it never reads (the manifest-provided image URIs excepted). It was verified against its own negative control before being committed: the pre-fix file is rejected with the exact message, the fixed file passes, and the accompanying tests cover detection, the env_value case, manifest variables, comment false-positives, and the real script.

- 39d9c03: Fix two guards that reported success on the failures they existed to catch.

  `assert_compose_variables_resolve` piped `compose config` stderr straight into a grep for "variable is not set" and swallowed the exit status with `|| true`. Any failure that does not produce that phrase — a YAML syntax error, an unsatisfied `${VAR:?}`, a missing compose file — left the grep empty and the function returned success. Measured: a file with broken indentation and a file with an unmet required variable both passed exactly like a valid one. A guard added to stop deploys with blank secrets was letting a completely unparseable configuration through. It now checks the exit status first and only then looks for the warning.

  The uploads backup discarded stderr and treated every `docker cp` failure as "no existing uploads directory". A full disk, a permission error, or a dead container all produced the same reassuring message, after which the `[[ -d ... ]]` restore check found nothing and skipped silently — losing user uploads without a word. Failures are now classified: only "no such file" counts as absent, and anything else aborts the deploy before the container is replaced.

  Both were reported by a GPT Pro review and reproduced before being accepted. Two other findings from the same review were rejected after checking: the migration-rollback hazard is already prevented by `check-expand-contract-migrations.mjs`, which runs in `build-images` and rejects any non-additive statement (verified against its own negative controls), and the temp-file permission concern does not apply because `mktemp` creates `600 root` on the instance regardless of umask (measured).

- 2fc0bde: Give the production `deploy` job the runner prerequisites it needs to run at all. The SSH → SSM transition removed the "Setup SSH" step and took `actions/checkout` with it, and the AWS credentials step was only ever added to `build-images` — so the first approved production deploy started on a runner with neither the repository nor any credentials and died immediately on `sync-prod-runtime-env.sh: No such file or directory` (exit 127), before touching the instance. The job now checks out the repo, assumes the prod deploy role through OIDC, and requests `id-token: write` at the job level.

  The guard that was supposed to catch this looked for `id-token: write` and `role-to-assume` anywhere in the workflow file, so `build-images` having them made the whole file look compliant — the same file-wide-grep weakness that previously let an `ssh ec2` remnant reach production. `check-production-deploy-security.mjs` now splits the workflow into jobs and checks each one on its own terms: a job that runs a repo script needs its own checkout, and a job that calls the `aws` CLI needs its own credentials step plus an OIDC token (inherited workflow-level `permissions` count, which is how `deploy-alpha.yml` satisfies it). The accompanying test fixes the contract in both directions — it fails against the pre-fix workflow and does not fire on jobs that legitimately need nothing.

- 2681ed9: Move the production deploy off SSH and onto SSM. The runner now uploads the release tarball and manifest to a versioned S3 bucket, then drives the EC2 host with `aws ssm send-command` using short-lived OIDC credentials — `deploy.yml` and `rollback-prod.yml` contain zero SSH references, and the long-lived `EC2_SSH_KEY` is no longer part of the production path. Runtime secrets travel through Parameter Store as SecureStrings because SSM command parameters are recorded in CloudTrail, so nothing sensitive appears in a command string. The deploy security guardrails were rewritten from SSH-era invariants (pinned known_hosts, secrets streamed over stdin, rsync excludes) to their SSM equivalents (pinned instance id, OIDC-only credentials, Parameter Store delivery, `--expected-bucket-owner` on every artifact fetch), and the health checks now compare the public `X-Teameet-Commit` header against the deployed SHA so an old container answering cannot pass for a successful deploy.
- 55711c0: Stop executing the runtime `.env` as shell code. `deploy-prod.sh` loaded secrets with `set -a; source "${ENV_FILE}"`, which does not read a file — it runs it. Values arriving from Parameter Store are written as bare `KEY=VALUE`, so anything a secret happens to contain is interpreted: measured on 2026-08-03, `pa$$word` became the shell's PID, `profile_nickname account_email` lost everything after the space and tried to run the rest as a command, and both `$(cmd)` and `a;cmd` executed. None of the values currently stored contain shell metacharacters, so nothing is broken today — but `KAKAO_SCOPE` legitimately holds a space-separated scope list, and a single password rotation is enough to corrupt a credential silently or run whatever an operator pasted.

  Quoting the values on the way out looked like the smaller fix and does not work: the same file is read by Compose via `--env-file`, and Compose cannot parse the shell escape for an embedded single quote — it rejects the entire file with `unexpected character "\" in variable name`. That trades a latent corruption for a deployment that fails outright the first time a secret contains an apostrophe. Both behaviours were confirmed against real `bash` and real `docker compose` rather than reasoned about.

  So the file stays in Compose's native unquoted form and the shell stops sourcing it. Compose reads the secrets directly through `--env-file` and never needed them in the shell environment; the only values this script actually uses are `V1_DB_USER` and `V1_DB_NAME` for the `pg_isready` probe, now read with a `sed` extraction that performs no interpretation.

- c4aff72: Stop the production deploy when a Compose variable would resolve to an empty string. Compose substitutes a blank for any variable it cannot find and only emits a warning, so a runtime `.env` that is missing keys still deploys. That is what happened on 2026-08-02: `DB_PASSWORD` and `JWT_SECRET` were absent from the synced runtime env, and the run died on `P1000: Authentication failed against database server`. The database error was the lucky outcome — the same two blanks feed `JWT_SECRET: ${V1_JWT_SECRET:-${JWT_SECRET}}` and `V1_SESSION_SECRET`, so without it the API would have gone live with an empty JWT signing key and an empty session secret.

  `assert_compose_variables_resolve()` asks Compose itself via `config` and aborts on any "variable is not set" warning, rather than reimplementing the substitution rules and drifting from them. Deploy checks right after the compose array is built; rollback checks after the manifest loads, since that is what exports `V1_API_IMAGE` / `V1_WEB_IMAGE`. Both abort before a single container is touched — a rollback that restores service with blank secrets is no better than a failed deploy.

- d87fefd: Add the unattended container-Postgres → RDS cutover, scheduled for 04:07 KST on 2026-08-04.

  `deploy/cutover-to-rds.sh` runs the whole window: preflight, maintenance page, app stop, final dump, restore into RDS, per-table row comparison, `.env` switch, restart, health verification, maintenance off. Every failure after the maintenance page opens rolls back automatically — the container Postgres is never stopped and its volume is never touched, so rolling back is only restoring the `.env` snapshot and restarting the apps.

  A `--rehearse` mode does the dump, restore into a throwaway `teameet_v1_rehearsal` database, and the row comparison without touching `.env`, compose, the apps, or the maintenance page. It was run three times against production on 2026-08-03; the first two failures are the reason this changeset exists.

  The first rehearsal failed on `elasticloadbalancing:DescribeLoadBalancers`. Every maintenance-window command so far had been issued from an operator's laptop, so nobody had noticed that the instance role holds no ELB permissions at all — an unattended run has to open its own maintenance window. Added as inline policy `TeameetProdMaintenanceWindow`, with `ModifyRule` scoped to the single default-rule ARN and nothing else; S3 was deliberately left alone by writing cutover artifacts under the existing `pg/*` grant instead of widening it.

  The second failure was worse. `V1_API_IMAGE`/`V1_WEB_IMAGE` do not live in `.env` — `load_prod_release_manifest` exports them, and `/etc/sudoers` has `env_reset` so the compose array also needs `--preserve-env`. Without both, `compose up` resolves the image names to empty strings. The cutover would have stopped the apps at 4am and then been unable to start them again, and the rollback path uses the same compose array, so it would have failed identically: a full outage with nobody watching. Neither defect was visible by reading the script.

  `ExecStopPost` runs `deploy/cutover-guard.sh` whichever way the service ends. The ERR trap only fires while the shell is alive, so a `TimeoutStartSec` kill or an OOM would otherwise leave the maintenance page up until morning. The guard turns it off, restores the app if it is unhealthy, and publishes to SNS.

  Also fixes `deploy/backup-prod-db.sh`, which had been exiting 1 every night since the legacy stack was stopped: `docker inspect` succeeds on a stopped container, so the failure surfaced at `docker exec`, and the non-zero exit meant the success heartbeat was never published even though the v1 dump had uploaded fine. Backups were working and the monitoring said otherwise. A stopped database cannot drift, so it is now skipped explicitly; a dump that fails while the container is running still fails the run.

- 67bd81d: Wire the two root runtime secrets through the workflow so GitHub can be their single source. `DB_PASSWORD` and `JWT_SECRET` are the only variables the production compose file references without a default, and they were the ones missing from the synced runtime env on 2026-08-02 — the deploy died on a database authentication failure, which happened to mask the worse outcome, since the same two feed `${V1_JWT_SECRET:-${JWT_SECRET}}` and `V1_SESSION_SECRET`. They currently live only in Parameter Store, so rotating them means touching two places and losing them there leaves nothing to restore from.

  Declaring them in the `Sync runtime env` step is safe before the repository secrets exist: the sync script skips empty values rather than writing them, so the existing Parameter Store entries survive untouched. Registering the two secrets is what flips GitHub into being the source of truth — until then nothing changes.

  The deploy security guard now also fails when the compose file gains a default-less variable that no `SECRET_*` entry feeds, catching at review time what `deploy-prod.sh`'s runtime preflight only catches once a deploy is already running. It reads variables inside nested defaults, since that inner reference is what actually resolves to a blank, and exempts `V1_API_IMAGE` / `V1_WEB_IMAGE`, which the release manifest supplies and validates as ECR digests.

- c619092: Fix the RDS cutover script's maintenance-window handling.

  Triggered the production container-Postgres-to-RDS cutover for real on 2026-08-04 and hit three distinct bugs across four attempts, none of which static review had caught:

  1. `aws elbv2 modify-rule` cannot target a listener's default rule (`OperationNotPermitted`). Switched to `modify-listener --default-actions` for both `maintenance_on`/`maintenance_off`, and updated the instance role's IAM policy to scope `ModifyListener` to the listener ARN instead of `ModifyRule` on the rule ARN.
  2. `modify-listener` returns success well before the change actually propagates across the ALB fleet — measured up to ~37 seconds in this account/region. A single immediate curl check couldn't tell a slow-but-successful toggle from an actual failure, which meant a fully successful migration could be rolled back purely because the final public-URL check ran too soon. Replaced every single-shot check with a shared `wait_for_public_status()` helper that polls for up to 90 seconds.
  3. When the app containers are recreated with `docker compose up -d --no-deps`, they get new internal IPs, but nginx isn't restarted and keeps routing to the old (now-gone) IP, producing a real "Host is unreachable" 502 until nginx is reloaded. Added an `nginx -s reload` right after every app-container recreation, on both the rollback path and the success path.

  No application behavior changes; this only affects the operator-run cutover script and its guard.

- d1e27e0: Restore deployed tournament migration files to their immutable SQL history so Alpha releases can validate newly appended migrations safely.
- 7d51da2: Let admins pick a team member instead of typing a user id.

  The admin roster form shipped asking for a "사용자 ID" — a UUID the operator had no way to obtain from any screen. Verified against alpha on 2026-08-04: the form renders and works, but nothing in the console shows a user's id, so in practice it could not be used. The feature was reachable only by someone who could query the database.

  `GET /admin/registrations/:registrationId/eligible-players` returns the team's active members with eligibility already decided by the same checks `addPlayer` applies — already on the roster, incomplete profile, unverified phone. Ineligible members stay in the list with the reason attached rather than being filtered out: removing them turns "why is this person missing?" into a question the operator has to answer somewhere other than the screen they are looking at.

  Computing eligibility server-side keeps one source of truth. Deciding it in the browser would drift from the service checks and produce a form that offers a member the API then rejects.

  Whitespace-only real names normalize to `null`, so incomplete profiles stay visibly ineligible instead of producing a blank selectable label.

  Reviewing that claim against `insertPlayerIntoRoster` turned up conditions the list did not carry, so the same defect existed inside the fix: a full roster, a cancelled registration, a finished tournament, and a deleted one all left every member selectable. The roster-full case is the shape of the 2026-08-03 incident itself — a ghost roster entry held the last slot and the screen showed nothing wrong until the operator clicked. Each now reads as a reason on the option.

  The audit that followed closed integrity gaps in the paths this list feeds, all of which predate it:

  - Rosters of `completed` and `cancelled` tournaments were still mutable by both teams and admins. Awards, reviews and records point at those rosters, which is why withdrawal cleanup already skips finished tournaments — the add and remove paths simply never carried the same guard.
  - A team could undo an admin's eligibility ruling and silently erase the review note, with no audit entry. Teams still declare 선출 여부 as before; once an admin has ruled, the ruling holds. Removing and re-adding a player went around the same protection and now preserves it too.
  - Male- and female-only tournaments never checked gender at all — only mixed did, and only for presence.
  - Two concurrent admin removals could both succeed and write two audit entries, because the active check ran before the lock.
  - Adding a player did not lock the membership row, so a team departure committing in between could leave a withdrawn member active on the roster — the exact state the cleanup helper exists to prevent.
  - Changing eligibility did not refresh the roster cache, so the badge kept the old value. The awards tab called the consumer roster endpoint, which 403s for an admin who is not a member of the team and rendered as "no players".

- 9259a94: Preserve match creation drafts across route transitions, support exact-path popup targeting, enrich admin detail data, and add tournament sponsor logo management.
- 3098bf2: Clear tournament rosters when a user leaves a team, and let admins edit a roster at all.

  A member requested withdrawal, the owner removed them from the team, and they stayed on the tournament roster holding one of twelve slots. The team could then only add one more player instead of two, and nothing on screen explained why. Verified in production on 2026-08-03: the account was `withdrawal_pending`, the membership was `removed`, and the roster entry was still active.

  All three ways out of a team ignored the roster — `withdrawalRequest`, `removeMembership` (the path this incident took), and `leaveTeam`. Prisma's `onDelete` cannot cover this: every "delete" in the domain is a status-column update, so no cascade ever fires. The cleanup is now explicit and shared by all three, and withdrawal additionally releases team memberships as `left`.

  The cleanup update rechecks `removedAt` so a concurrent removal is not overwritten, and audit counts report only rows actually changed.

  Completed tournaments are deliberately excluded. Awards, reviews and standings reference the roster, so removing a name from a finished tournament would rewrite history to fix a capacity problem that only exists for upcoming ones.

  Admin deactivation (`changeUserStatus`, `deleteUser`) now refuses a user who still holds team ownership, the same rule self-withdrawal already enforced. Without it an admin could deactivate an owner and leave the team `active` with `ownerUserId` pointing at a dead account — self-withdrawal blocked that, the admin path did not.

  The reason the incident produced no error is that the admin console had no way to change a roster: it could list, export, and set eligibility, but there was no add or remove route, so the request never reached the server (24h of logs for that registration: zero POSTs, zero 4xx). Those routes and the matching UI now exist. Admins may override the roster lock and the submission deadline — both already have dedicated admin endpoints for exactly that — but not the capacity, membership, profile or duplicate checks, which are data integrity rather than permission.

  The regression test runs against a real database. Asserting on a mocked Prisma client would keep passing if the `where` clause regressed, which is the failure mode that let this reach production.

## 0.2.0

### Minor Changes

- 144724c: Send verification emails as a designed HTML message instead of plain text, and deliver the SES settings to the alpha deploy. The one-time code now arrives in a branded card with the code set large and spaced, wrapped in table layout with fully inline styles so it survives Outlook and the clients that strip `<style>`; a plain-text part is always sent alongside it for clients that block HTML, and no images or links are used — images are blocked by default in many clients, and teaching users to click links in verification mail is exactly the habit phishing relies on. Copy varies by purpose so a password-reset code no longer reads as an address-verification code. The alpha workflow now forwards `SES_REGION` and `EMAIL_FROM` to the deploy script, which is what actually makes the repository variables take effect: Compose resolves interpolation from the shell environment ahead of `--env-file`, so this configures the container without touching the host env file.
- 7cb1395: Require phone verification for every write. Unverified accounts can still browse, but any create/join/submit request is rejected with 403 `PHONE_VERIFICATION_REQUIRED` (verification, signup, logout, withdrawal and the admin console stay open), a global modal explains the block and links to verification, the home banner can no longer be dismissed, and the profile page and account settings both expose the verification entry point and status.
- 57f4290: 대회 문의를 일반 문의와 동일한 로그인 회원 전용 접수로 통일한다. 비회원은 현재 대회 복귀 경로를 유지한 채 로그인 화면으로 이동하며, 대회 상세 하단에는 팀밋 인스타그램과 이메일 연락처를 고정 안내한다. 신규 게스트 문의 입력 계약은 제거하되 기존 게스트 문의 데이터의 관리자 조회 호환성은 유지한다.
- 101078c: Let tournament administrators manage parking guidance shown below the venue on the public tournament detail page, and refresh the participant application guide copy.

### Patch Changes

- d958233: Keep alpha deployment target verification fail-closed while documenting the required live IAM policy convergence.
- fa56780: Add docker/setup-buildx-action before the alpha image build steps so the buildx builder uses the docker-container driver, which is required for the GHA cache backend (cache-to: type=gha). The default docker driver rejects cache export with "Cache export is not supported for the docker driver."
- 193912a: Run the one-time certbot config migration rsync (old ALPHA_LIVE_DIR layout to the new persistent ALPHA_RUNTIME_CONFIG_DIR) with sudo. The deploy script runs as ec2-user, but certbot's archive/live directories are root-owned by design, so the copy failed with rsync Permission denied on the first real run of the immutable-release migration path.
- 018a52c: Disable buildx provenance/SBOM attestation on the alpha image builds. Since switching to the docker-container buildx driver, build-push-action pushed images as an OCI image index wrapping a provenance attestation manifest, which ECR's basic scanner never registers a scan for (confirmed via a temporary diagnostic step: describe-images showed no imageScanStatus field at all, and the manifest media type was application/vnd.oci.image.index.v1+json). This is a documented BuildKit v0.11+/ECR interaction; provenance: false + sbom: false restores a plain single-manifest push that ECR can scan.
- cf8fb2b: Fix the alpha deploy health contract's stale assumption that /v1/home returns 404. apps/v1_web/next.config.ts redirects() has intentionally 308-redirected the legacy /v1 basePath to root (kept for bookmarks and the Kakao OAuth redirect_uri) for a while now, but the deploy-time contract check was never updated to match, so today's first real candidate deploy failed health verification even though the app was actually healthy.
- 2ac9025: Fix restore_legacy_runtime's post-rollback header verification, which used a grep pattern with a literal backslash-r that the instance's GNU grep does not treat as carriage return (warns "stray \ before r" and never matches). Rewritten to use the same awk-based header extraction already used correctly elsewhere in this file, so a legitimate rollback no longer logs a false CRITICAL failure.
- 7af78a3: Retry ECR scan-findings lookup until the scan is registered before calling `aws ecr wait image-scan-complete`, which treats ScanNotFoundException as terminal instead of retrying. Fixes alpha deploys failing right after a fresh image push.
- 404571d: Prune stale immutable release source directories after each successful alpha deploy. prepare_alpha_release_source() writes a full source-tree checkout under ALPHA_SOURCE_RELEASES_DIR for every deploy attempt (successful or failed), and nothing ever removed old ones, so disk usage grew without bound. Only the currently active and previous release directories are ever read again (by restore_active_release and rollback-alpha.sh), so everything else is now pruned right after state.json is promoted. Best-effort: a prune failure logs a warning but never fails an otherwise-healthy deploy.
- 9479b51: Stop the alpha immutable-source drift guard from rejecting an unchanged source tree because of directory timestamps it wrote itself, which made same-commit redeploys fail and flaked the release-state CI gate.
- 653e41b: Build alpha images once on GitHub, deploy exact ECR digests through a versioned release manifest, and preserve atomic active/previous rollback state.
- dee533b: Put the Teameet mark in the verification email header. The header was a text-only wordmark; it now leads with the real brand icon already served in production, sized and given explicit dimensions so clients reserve the right space. The wordmark stays next to it and the image carries alt text, so a client that blocks images by default still shows an intact header rather than a broken box — the same reason a data URI or inline SVG was not used, since Gmail strips both.
- f27466f: Expose the deployed release version and commit SHA on production responses via `X-Teameet-Release` / `X-Teameet-Commit`, matching what alpha already does, so an incident responder can tell which build is live without shelling into the host.
- 30558b4: Restore original SQL for 5 already-deployed tournament migrations that a checkpoint commit had retroactively rewritten with IF NOT EXISTS guards, unblocking the alpha rollback-compatibility gate.
- 002c98a: Wire scripts/qa/test-alpha-release-state.sh into the Gates CI job. This suite existed but was never run in CI, matching the same "untested contract" pattern behind several bugs found and fixed today in the alpha immutable-release pipeline (certbot migration permission, health contract assertion, source-directory pruning).

## 0.1.0

### Minor Changes

- f153ad1: Add password reset by email, the follow-up that account recovery by phone left open once SES was wired up. The "비밀번호 재설정" tab now lets you choose between 휴대폰 and 이메일; picking 이메일 sends a six-digit code to the address you signed up with and, once you enter it, lets you set a new password. The existing email verification endpoints sit behind the auth guard and could not be used while logged out, so recovery gets its own public OTP under `/auth/recovery/email/*`, storing challenges in a new `v1_email_verification_challenges` table because the logged-in verification token requires a user id.

  The proof this flow issues cannot be swapped with the phone one. Both are signed with the same secret, so the email payload carries an `email:` channel label ahead of the purpose, and the signing/expiry/comparison logic both channels share now lives in one place rather than being copied per channel. The email endpoint also never lets the caller pick the purpose — the server pins it to password reset.

  An email address can be tried by anyone, so the request step gives the same answer either way: a challenge is created whether or not the address belongs to an account, and only a registered address actually receives mail. Nobody can guess a code that was never sent, so a wrong guess and an unregistered address fail identically, and the screen says "가입된 이메일이면 인증번호를 보내드려요" rather than confirming anything. Kakao-only accounts still get their mail and are told to log in with Kakao — but only after they have proven they own the mailbox, since saying so up front would leak that the account exists.

- 3069cd0: Add account recovery by phone: find the email you signed up with, and reset your password. `/auth/password-reset` was a placeholder that only explained the situation — there was no recovery API at all — so the "비밀번호 찾기" link on the email login screen now leads to a working `/auth/find-account` with both flows behind one phone verification. Recovery reuses the existing public OTP endpoints rather than adding a second SMS path, and the phone-ownership proof token now carries a purpose so a token minted while signing up cannot be replayed to reset an existing account's password; signup tokens keep their exact old payload shape so signups already in flight survive the deploy. Only a masked email is ever returned, and accounts that signed up through Kakao are told to log in with Kakao instead of being offered a password they never had. Email-based recovery is not part of this — the app still has no email delivery — so it will follow once SES is wired up.
- dab9206: Add an admin error log viewer. Server and client errors were only written to the process log, so investigating one meant opening a shell on the box and reading container output that disappears on restart. Errors now persist with their traceback, request, response, and the server release they happened on, and the admin screen lists them with a detail modal that copies any section — or the whole thing — as markdown ready to paste into an issue. Repeat occurrences fold into a single row with a count (24 hours for 401/403, one hour otherwise) so a flood of the same error never buries the rest. Values under sensitive keys are redacted before anything is written, including secrets that arrive inside a URL query string rather than a field.
- 8f99124: Add an admin manual Web Push send tool — target a single user by ID or broadcast to every current push subscriber (with a required confirmation modal), reusing the existing notification/realtime/web-push pipeline and audit logging.
- 4c18467: Extend page numbers to the rest of the admin lists. The endpoints for members, matches, teams, team matches, notices, popups, inquiries, admins, tournaments, and error logs now accept a page alongside the cursor they already took, and report the total so a list can say where you are in it. Every admin table uses it: pages replace the "더 보기" pile-up, and changing a filter returns you to the first page instead of leaving you stranded past the end of a narrower result set. Totals come from the existing status aggregation rather than a second query, except error logs, which have no status facet and so are counted with the same filter as the list.

  Paging keeps the previous page on screen while the next one loads, so the table no longer blanks out between pages, and the page buttons lock while the request is in flight. The admin list stopped ignoring the page you clicked. Error log rows open their detail from anywhere in the row, not just the 보기 button.

- c72172e: Add admin observability for SMS and verification failures, mirroring the existing Web Push failure log. A new `V1SmsEventLog` records failure events only (no success events): SMS provider send failures for both selectable providers — Solapi (timeout / network / non-2xx) and Gabia (timeout / token issue / HTTP / app-level `code`), each tagged with the provider and its result code — missing SMS configuration, and verification failures (code mismatch, attempt cap, resend cooldown) from both the pre-account phone flow and the signed-in verification flow. Only the last 4 digits of the target are stored, so raw phone numbers never reach the admin surface. Recording is wrapped in try/catch and can never break the authentication flow it observes. Admin gains a "SMS · 인증 실패" log page with per-row acknowledgement (audit-logged) and a new `GET /admin/ops/summary` KPI endpoint, surfaced on the ops dashboard as "최근 5분" failure cards for both Web Push and SMS — which also connects the previously unused `pushFailuresLast5Minutes` counter to a real consumer.
- 558db24: Give the admin tables page numbers and make their rows do something. Rows highlighted on hover but did nothing when clicked, and the only way forward was a "더 보기" button that piled results up without ever saying where you were or how much there was. Audit log rows now open a detail dialog with the untruncated target ID, the full reason, and the before/after state that the list has to cut short, and the list itself pages with a "전체 N건 중 M–K" readout. Admin list endpoints accept a page number alongside the existing cursor, and rows only take on a clickable appearance where a click is actually wired up.
- 3037826: Sync main-only fixes into dev: admin notice popups can now target specific app screens and carry an internal CTA link, the v1 uploads volume ownership is repaired on every deploy via a dedicated init step, the upload static-file rate limit was removed, and the profile edit action copy was clarified.
- 47395a0: Add an idempotent alpha-only tournament lifecycle dataset covering draft, recruiting, roster lock, live play, completed results with videos, reviews and individual awards, and cancellation. Make SSM deployment failures fail closed, provision the required source mirror tool, and poll the public release identity before accepting a deployment.
- f484d29: 이벤트 허브와 대회 캠페인 사용자 플로우, 프로필 신뢰 정보, alpha 사전 QA 환경과 자동 배포 계약을 하나의 Teameet v1 제품 릴리스로 묶습니다.
- e1d122c: Notify the asker when an admin replies to their inquiry (new `inquiry_answered` event, `inquiry` notification target, deep link to `/my/inquiries/:id`), open notifications in a detail sheet instead of navigating straight away, and surface push-subscription failures instead of leaving the toggle silently off.
- a34d2e6: Add a Socket.IO realtime gateway so notifications and chat messages arrive live instead of waiting for the next poll.
- 6b0129f: 휴대폰 본인인증을 옥토모 무료 MO(polling)에서 솔라피(SOLAPI) MT SMS OTP로 전환한다. 서버가 6자리 인증번호를 발송(SmsSender 어댑터)하고 사용자가 입력하는 표준 방식으로, 옥토모 반영 지연으로 인증이 완료되지 않던 문제를 해소한다. 옥토모 클라이언트·폴링·QR/딥링크 코드와 OCTOMO*\* 배선을 완전히 제거하고 SOLAPI*\*(3값)로 교체했다. `V1PhoneVerificationChallenge`를 codeHash 스키마로 재정의(마이그레이션 동반). 휴대폰 인증은 fail-closed로, SOLAPI 시크릿 미설정 시 `V1_VERIFICATION_DEV_ECHO=true`인 개발/CI에서만 dev-echo(devCode 응답)로 동작하고 그 외에는 issue가 503(`SMS_NOT_CONFIGURED`)로 실패해 가입이 막힌다.
- 1714d7f: 옥토모(Octomo) MO 방식 휴대폰 본인인증을 회원가입에 추가한다(alpha 전용). 이메일·카카오 가입을 인증 완료 전까지 hard-block하고, 레거시 미인증 계정에는 홈 상시 인증 유도 배너를 노출한다. 인증 카드는 번호를 노출하지 않고 "문자 보내기(딥링크)/QR" 단일 CTA + 자동 확인(폴링) 방식이며, 옥토모 키가 없는 환경에서는 기능이 비활성화된다.
- 68449b9: Send verification emails as a designed HTML message instead of plain text, and deliver the SES settings to the alpha deploy. The one-time code now arrives in a branded card with the code set large and spaced, wrapped in table layout with fully inline styles so it survives Outlook and the clients that strip `<style>`; a plain-text part is always sent alongside it for clients that block HTML, and no images or links are used — images are blocked by default in many clients, and teaching users to click links in verification mail is exactly the habit phishing relies on. Copy varies by purpose so a password-reset code no longer reads as an address-verification code. The alpha workflow now forwards `SES_REGION` and `EMAIL_FROM` to the deploy script, which is what actually makes the repository variables take effect: Compose resolves interpolation from the shell environment ahead of `--env-file`, so this configures the container without touching the host env file.
- 4dedca6: Require phone verification for every write. Unverified accounts can still browse, but any create/join/submit request is rejected with 403 `PHONE_VERIFICATION_REQUIRED` (verification, signup, logout, withdrawal and the admin console stay open), a global modal explains the block and links to verification, the home banner can no longer be dismissed, and the profile page and account settings both expose the verification entry point and status.
- 6bb97e0: Require phone verification to submit a tournament registration and to add roster players, require re-verification when the profile phone number changes, and fix the verification card's error placement, cooldown tone, and nested-card surface.
- f2f1d72: 대회 운영자가 전용 공지·홍보 팝업을 관리하고, 접수 마감 뒤 대진표를 일괄 공개하며, 경기 결과에 선수별 득점자를 기록할 수 있도록 확장합니다. 사용자 알림은 22개 이벤트에서 일관된 제목과 본문을 제공하고, 참가 신청 화면은 후원사 로고와 고정 CTA를 명확하게 노출합니다. 팀 초대의 항목별 처리 상태와 오류 복구, 매치 종목·날짜 표시도 함께 개선합니다.
- a50cd86: Stop auto-cancelling tournament registrations that have not paid within two hours. The rule had no scheduler, so it only fired when someone happened to read the registration — one production registration submitted on 2026-07-18 was recorded as cancelled nine days later, the moment its team opened the page. Teams now keep their registration until an operator cancels it, and the payment-deadline countdown, the "cancelled after 2 hours" notices and the matching clause in the tournament policy are removed along with it.
- 5a1739f: Send verification emails through AWS SES instead of only logging them. The email channel of the verification dispatcher was a stub that logged the code and returned success, so email verification looked like it worked while nothing was ever delivered. A `SesEmailSender` now mirrors the existing SMS adapter contract — it is enabled only when both `SES_REGION` and `EMAIL_FROM` are set, credentials come from the instance role rather than the app, and a send failure surfaces as `EMAIL_SEND_FAILED` instead of being swallowed. Leaving the settings unset keeps the current log-stub behaviour, so deploying this changes nothing until the environment is configured. This also closes a hole in `devEchoActive`, which only checked the SMS adapter: with email configured but SMS not, the API would have sent a real email and echoed the same one-time code back in the response.
- 51daeed: Add structured JSON request/error logging (nestjs-pino) with a public throttled client-error ingestion endpoint, and an env-gated GA4 analytics scaffold (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is configured).
- 3f95c1c: SMS OTP 발송처를 SMS_PROVIDER 환경변수로 Solapi(기본)와 가비아(Gabia) 중 선택할 수 있게 한다. 가비아용 GabiaSmsSender 어댑터 추가(OAuth client_credentials 토큰 캐시+재발급, HTTP 200 응답 내 code 필드로 성공/실패 판정). 미설정 시 기존과 동일하게 Solapi로 동작(back-compat). 신규 환경변수: SMS_PROVIDER, GABIA_SMS_ID, GABIA_API_KEY, GABIA_SENDER_NUMBER.
- 33f6ebf: Give Kakao signup a way out, and prefill what Kakao already verified. While a Kakao signup is pending, `PendingSocialSignupGate` bounces every route back to the signup step, so browser back and Home silently did nothing — and neither the terms step nor the profile step rendered any back control, leaving the user with no way to abandon signup. Both steps now show a back control (restored on desktop with the same in-card nav the onboarding wizard uses, since the mobile topbar is hidden at ≥1024px) that asks for confirmation and then logs out to the login screen; the server already allowlisted `/auth/logout` for pending signups, so this is the exit it was designed for, and a failed logout is surfaced instead of silently leaving the user stuck. Separately, name/phone/gender from Kakao are now parsed, stored on the existing onboarding draft, and returned by `/auth/me` while signup is pending, so the profile form fills itself in: name and gender are locked as read-only, while the phone stays editable because a Kakao account number can differ from the number the user can actually receive an OTP on. This ships as plumbing — Kakao only sends those fields once the consent items are approved in the Kakao console, and the extra scope is opt-in via `NEXT_PUBLIC_KAKAO_SCOPE` so requesting an unapproved scope cannot break login before then.
- c9f5ec3: 팀 가입 신청 상태 반영·안내 개선

  - 신청/취소 후 refetch 완료까지 버튼 pending을 유지해 상태가 즉시 반영되도록 수정
  - 팀 상세의 배지·CTA가 서로 다른 쿼리를 보던 문제를 eligibility 단일 소스로 통일
  - 승인 대기 안내 카드를 팀 상세에 상시 노출(신청일 + 승인 절차 안내)
  - 정원 마감 시 영어 문구(`Team member capacity has been reached`)가 버튼 라벨로 노출되던 버그 수정
  - 신청 실패 시 서버가 준 구체적 사유를 그대로 노출
  - `GET /me/join-applications` 신설 + `/my/join-applications` 화면 추가(승인 대기 + 처리 결과 확인)

- f02f90f: Add self-service team leave: members can now leave a team themselves (`POST /teams/:teamId/leave`). The last active owner is blocked from leaving until ownership is transferred, and concurrent leave attempts are serialized to prevent a team from ending up with zero owners.
- 2cc1c97: 대진표 공개를 예약할 수 있게 하고, 공개를 되돌릴 수 있게 한다.

  - 예약 공개: `bracketPublishScheduledAt` 추가. 스케줄러 없이 조회 시점에 판정하므로 예약
    시각이 지나는 순간 지연 없이 공개된다. 과거 시각 예약은 400으로 거부한다.
  - 공개 취소: `POST /admin/tournaments/:id/unpublish-bracket` — 즉시 공개분과 예약분을
    모두 되돌린다(idempotent). 기존에는 한 번 공개하면 되돌릴 수 없었다.
  - 운영 안전장치: 조가 하나도 없으면 공개·예약 진입을 막아 빈 대진표 공개를 방지한다.
  - 관리자 화면: 탭 바를 sticky 로 고정해 대진 관리 진입점이 스크롤 밖으로 밀리지 않게 하고,
    팀이 배정됐지만 순위가 아직 없는 조에 "팀이 없어요" 대신 순위 재계산 안내를 보여준다.

- ac12eb3: Absorb the commits that had been merged directly into `main` (bypassing `dev`) — an admin rich-content editor for notice/popup bodies with upload-asset quota tracking, an `AdminListSummary` aggregation contract shared across admin list endpoints, a confirmation-phrase safeguard for member removal, and a session-preservation fix so `RequireAuth`/`SessionEntryGate` only clear the session on a genuine 401 instead of any error — and reconcile them with `dev`'s own realtime-socket-disconnect and account-deletion hardening. Going forward, `main` is retired: all work lands on `dev`, which auto-deploys to alpha.
- 33e06bb: Add anonymized, aggregated review visibility for match/team-match mutual reviews: individual reviews are no longer shown to the reviewed party — only per-sport rating averages and tag frequencies (all-time or a selected month), revealed once both sides have submitted or after 72 hours. Team trust score now only aggregates team_match reviews (tournament fixture reviews are calculated separately). Follow-up: team trust scores on list screens (team list/detail, team-match list/applicants/detail, admin team detail) are now recomputed live from revealed reviews in a single batched query, instead of reading a stale cached value — fixing display lag right after a review reveal.
- d6a0e23: Add VAPID-based Web Push (subscribe/unsubscribe/send, graceful-disable when unconfigured) with an admin failure-log dashboard, wired into the same notification pipeline the realtime gateway uses.

### Patch Changes

- de8a75c: Report the authoritative active-owner count in paginated team member summaries.
- 4c3aea3: Report the total row count on the admin notice and inquiry lists. Both already skipped ahead when given a page, but still returned the old cursor-only page info, and the table only draws page buttons once it knows how many pages there are — so the screen showed page 1 with no way to reach page 2. The count reuses the status aggregation the list already runs, as the other admin lists do.
- 1c009f8: alpha 배포 스크립트에 디스크 정리 단계 추가 — 빌드 직전 사용하지 않는 이미지·빌드 캐시를 전량 정리하고, 배포 성공 후에도 dangling 이미지·24시간 지난 빌드 캐시를 정리해 EC2 호스트 디스크가 반복 배포로 서서히 가득 차 빌드가 `No space left on device`로 실패하는 문제를 예방한다. 실행 중인 컨테이너가 참조하는 이미지는 `docker image prune`이 항상 보호하므로 무중단 배포에 영향 없음.
- 445d986: Add one non-QA "featured" completed tournament scenario to the alpha seed (`팀밋 여름 풋살 챔피언십`) with its own realistic team roster, clean marketing copy, and consistent award/video/review data — so alpha has a screenshot-safe completed tournament alongside the existing `[ALPHA QA]` flow-verification scenarios, which stay untouched.
- c135ebe: alpha 배포가 카카오 OAuth `redirect_uri`로 프로덕션 도메인(`https://teameet.co.kr/v1/callback/kakao`) 값을 그대로 재사용하던 문제를 고친다. `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`는 alpha와 프로덕션이 같은 Kakao 앱을 공유하므로 그대로 두되, `KAKAO_REDIRECT_URI`만 alpha 전용 GitHub Secret(`ALPHA_KAKAO_REDIRECT_URI` = `https://alpha.teameet.co.kr/callback/kakao`)으로 분리한다. 기존에는 카카오 인증 완료 후 alpha가 아닌 프로덕션 도메인으로 리다이렉트되어 OAuth state 검증이 항상 실패했다.

  별도 조치 필요: 이 redirect_uri를 Kakao 개발자 콘솔의 허용된 Redirect URI 목록에 추가 등록해야 실제로 동작한다(코드/CI만으로는 해결 불가).

- 7053be3: alpha QA 픽스처 대회의 노출 문구에서 `[ALPHA QA]` 대괄호 라벨을 제거하고 `(테스트)` 및 순화된 안내 문구로 교체 — 대회 목록·홈 배너 등 스크린샷에 캡처될 수 있는 화면에서 더 이상 어색하게 보이지 않는다. 상태별 QA 검증 데이터라는 성격과 ID는 그대로 유지되어 기존 QA 플로우에는 영향 없음.
- 5301686: Sync VAPID secrets into the alpha runtime env during deploy so Web Push is active on alpha, matching the production deploy path.
- 003da24: Persist alpha tournament campaign hero images with the HTTPS URL required by the public campaign content contract.
- 62887e3: Broadcast admin notifications to every active user instead of only push subscribers, distinguish notification kinds by icon, and make the notification settings copy state-accurate.
- 684e35a: Stop the deploy pipelines from destroying the Docker build cache they were designed to use, and split the production build out of the manual approval gate.

  The Dockerfiles already copy the lockfile before `pnpm install` and mount the pnpm store and Next cache as BuildKit cache mounts, but production built with `--no-cache` while alpha ran `docker builder prune -af` immediately before building — so neither reused anything. Production images are now tagged with the release commit SHA and only promoted to `:latest` after approval, which makes a rollback a re-tag instead of a full rebuild. CI splits into Gates/API/Web so the three run in parallel, and the Next.js `actions/cache` step is gone because it stored 95KB per commit and cached nothing.

- 30ea5d5: Require the linked user account to remain active in the shared admin authorization context used by tournament and integration operations.
- 3442ebe: Complete the alpha tournament QA fixture graph with semifinals, a final, a third-place match, and final-linked highlight videos.
- dc8d72f: 임시 서버 진단 계측(alpha 트러블슈팅용, 확정 후 revert 예정): 인증 401(!identity) 시 세션 쿠키 존재/개수를 로그로 남겨 `/my` 간헐 팅김(로그인/로그아웃 불안정, 시크릿에서도 재현)의 원인(쿠키 유실 vs 서버 검증 실패 vs 중복 쿠키)을 구분한다.
- efc0a01: Turn Changesets' changelog generator back on. `changelog: false` is not compatible with `changesets/action`: the version command succeeds, but the action then reads each bumped package's `CHANGELOG.md` to build the release PR body and dies with `ENOENT` — which is what killed the first release dispatch after the path was repaired. Enabling it also stops throwing away the summaries: until now every consumed changeset's text was discarded, and there was nowhere to read why a version moved.
- 8e5e7e0: Finalize the managed terms copy, signup consent policy, and tournament consent flow.
- fff1ead: 팀 전체조회의 팀장/감독 이름과 마이페이지 상단 이름 표시를 닉네임 우선으로 통일합니다 — 팀 목록 endpoint만 표시이름(실명)이 닉네임보다 먼저 노출되던 예외를 다른 모든 endpoint와 같은 순서로 맞췄습니다. 프로필 저장 직후 마이페이지 등에서 이전 닉네임이 잠깐 남아 보이던 문제도 함께 고칩니다 — 저장 응답으로 프로필 캐시를 즉시 갱신합니다.
- bd5575d: Fix GA4/structured-logging defects found by live alpha verification and a logic-correctness review: CSP was silently blocking GA's gtag.js script on every page (script-src had no googletagmanager.com allowance) — same fix applied to both alpha and prod nginx configs; the AllExceptionsFilter's manually-built `route` field bypassed the pino req serializer's query-string stripping, leaking PII (e.g. emails in `?email=...`) into structured logs; the pino req serializer stripped headers entirely before redact.paths could run, making the redact config a no-op; 5xx error stacks were logged unbounded; raw free-text search queries were sent to GA4 as an event parameter; and the client-error-reporter's dedupe key ignored severity/stack, letting a low-severity report suppress a differently-caused higher-severity one.
- b6d9c94: Point the OTP email logo at its current root path instead of the legacy `/v1/brand/...` URL because email clients may not follow redirects.
- 6b3e35e: 로그아웃(`POST /auth/logout`)이 host-only(도메인 미지정) 세션 쿠키만 지우던 것을, `teameet.co.kr`/`.teameet.co.kr` 도메인으로 발급됐을 수 있는 과거 세션 쿠키까지 함께 지우도록 방어적으로 확장한다. alpha.teameet.co.kr에서 실사용 계정으로 재현한 결과 `POST /auth/logout`이 201을 반환한 직후에도 `GET /auth/me`가 여전히 인증된 사용자 정보를 반환했다 — 세션 TTL(7일) 안에 남아있는, 현재 코드가 발급하지 않는 도메인 속성의 잔존 쿠키가 로그아웃 후에도 유효하게 살아남는 것이 원인으로 추정된다.
- 7bff77e: 옥토모 휴대폰 본인인증 폴링을 안정화한다(alpha). (1) desktop 자동폴링이 사용자가 QR을 스캔·전송하기도 전에 확인 상한(30회≈2분)을 소진해 "시도 초과"로 자멸하던 문제를 상한 180회(2초 폴링으로 5분 TTL 전체 커버)로 수정한다. (2) `OctomoClient`의 `fetch`에 5초 timeout(AbortController)을 추가해, 무료 API인 옥토모가 지연될 때 백엔드 커넥션이 누적돼 upstream이 503으로 죽는 것을 막는다. (3) 폴링 중 옥토모 오류(timeout·rate-limit·5xx)를 "아직 도착 안 함"으로 흡수해 매 폴링이 500이 되거나 행이 걸리지 않게 한다. (4) 폴링 간격을 4초→2초로 줄이고 진입 즉시 1회 확인해 체감 지연을 없앤다(verify throttle 40/60s와 정합). (5) 인증코드를 6자→8자로 강화한다(딥링크 자동삽입이라 입력 부담 없음).
- 59bf1dd: Put the Teameet mark in the verification email header. The header was a text-only wordmark; it now leads with the real brand icon already served in production, given explicit dimensions so clients reserve the right space. The wordmark stays beside it and the image carries alt text, so a client that blocks images by default still shows an intact header rather than a broken box — the same reason a data URI or inline SVG was not used, since Gmail strips both.
- dfc6c4e: Preserve recent production BuildKit dependency caches across sequential API and web image builds while enforcing age, maximum usage, and minimum free-space limits.
- cbd6ce6: Re-subscribe on pushsubscriptionchange so renewed browser subscriptions keep working, reuse an existing tab on notification click, and report real web-push delivery counts so an admin send that reached nobody is no longer shown as success.
- 439fdf9: 프로덕션 호스트의 BuildKit 버전에서 지원되지 않는 캐시 정리 옵션을 제거하고, 호환되는 기간 기반 정리만 사용해 이미지 빌드 전에 배포가 중단되지 않도록 한다.
- 625e71a: 대진표 득점자 이름을 안전하게 검증하고 동시 공개 요청이 하나의 상태 전환과 감사 기록만 생성하도록 수정합니다.
- 2586cd5: Break the self-contradiction that kept the release workflow from ever running. `resolve-changeset-version.mjs` asserted that at least one unreleased changeset exists, and `deploy-alpha.yml` calls it without a guard — so consuming the changesets (which is what releasing does) would have broken every subsequent alpha deploy. The resolver now tolerates an empty changeset directory and labels the build against the next patch, so a freshly released 0.1.0 is followed by `0.1.1-alpha.*` and SemVer ordering still holds. The "behavior changes need a changeset" gate is untouched — that lives in `check-changeset-policy.mjs`. The release PR now targets `dev` instead of `main`, matching the branch policy, and refuses to open when there is nothing to release. CI also runs `scripts/release/versioning.contract.test.mjs` for the first time — the suite existed but was never executed, which is why the contract violation survived.
- b2a487a: 관리자 계정 self-lockout과 동시 owner 권한 제거를 차단하고, 활성 사용자 계정과 운영자 권한의 일관성을 트랜잭션으로 보장합니다.
- 6d9d4de: Harden production deployment with explicit GitHub token permissions, pinned SSH host keys, stdin-only secret transport, and the registered GA_PROD configuration.
- a129217: Fix 18 confirmed cross-PR integration gaps found by a whole-session review of the observability/realtime/web-push work (PR #81-93): chat messages now trigger web push, sockets disconnect on logout (closing a cross-user data-leak path), the realtime gateway no longer risks a process crash on a transient DB error during handshake, web-push send failures are now logged instead of silently swallowed, duplicate push+socket notifications are suppressed when the app is focused, and several smaller consistency/coverage gaps (missing GA event, dead `chat:join` emit, admin nav item, deploy docs, test-quality fixes).
- 71a6c5a: Make the alpha host load preflight compatible with Amazon Linux gawk so a healthy host can proceed to its sequential image build.
- d9a2f0e: 카카오 소셜 회원가입이 프로필 입력 단계에서 403(`SIGNUP_INCOMPLETE`, "Social signup must be completed before accessing this resource")으로 원천 봉쇄되던 문제를 수정한다. 옥토모 카카오 hard-block으로 소셜 프로필 화면에 추가된 authed 휴대폰 인증 카드가 호출하는 `/verification/phone/request`·`/verification/phone/confirm`과 닉네임 중복확인(`/auth/check-nickname`)이 `social_profile_required` 단계 allowlist에서 빠져 있어, 번호 입력 즉시 인증 API가 차단됐다. 소셜 프로필 완성에 필요한 최소 경로만 allowlist에 추가하고(단계 격리 유지: 약관 단계에서는 불허), 회귀 테스트를 더한다.
- 8480a46: Speed up and stabilize alpha delivery by keeping CI focused on the complete v1 verification contract and reusing safe dependency and Docker build caches.
- ab925c8: Fix a managerCount race in team self-leave (use the role read inside the transaction instead of a stale outer read) and de-duplicate the shared match/team-match creation-wizard fields (DraggableFilterSheet, CreateField, GenderRuleSelector) into `components/v1-ui/create-form-fields.tsx`.
- f2f1d72: 대회 팝업 제목과 본문을 저장 전에 정규화하고, 공백만 입력한 콘텐츠는 API 검증 단계에서 거부합니다.
- 759c9b8: 관리자 공지·팝업 실제 화면 미리보기 iframe이 alpha에서 X-Frame-Options: DENY로 차단되던 문제 수정 — /admin-content-preview 전용 same-origin 프레이밍만 허용
- 9604e8a: Fix a Socket.IO handshake regression discovered via live verification on alpha (Next.js's trailing-slash redirect ran before rewrites, 404ing every realtime connection in production) plus 8 confirmed findings from a security/functional adversarial review of PR #95/96/97: an open-redirect bypass in the admin push-send `url` field (backslash trick around the relative-path regex, hardened in both the DTO and `sw-push.js`'s notificationclick handler), the session cookie's `Path` scoped too narrowly to reach `/socket.io` (production cookie-based socket auth always failed), Referer header PII (OAuth code/state) missing from pino redaction, unscrubbed query-string PII in the client error reporter's `context.path`, sockets not force-disconnected when an account is suspended/blocked/deleted, silent swallowing of non-"already deleted" errors when cleaning up expired push subscriptions, a GA `search` event doc/implementation mismatch, and a defensive fix so the socket auth payload re-reads the latest session on every reconnect instead of caching the first one.
- bf4e5b0: Patch axios (ReDoS, prototype pollution, credential/header leaks via redirects and proxy handling), Next.js (middleware/proxy bypass, SSRF via WebSocket upgrade, connection-exhaustion DoS), and ws (memory-exhaustion DoS via socket.io) to their fixed versions.
- 540d775: Patch multer's DoS (deeply nested field names) and incomplete-cleanup-of-aborted-uploads vulnerabilities by upgrading @nestjs/platform-express (and the lockstep-released @nestjs/common, core, websockets, platform-socket.io, testing) to the release that pins the fixed multer version.
- e09e19d: Add per-route rate limiting to review endpoints (`GET /reviews`, `GET /reviews/received`, `GET /reviews/sources/:sourceType/:sourceId`, `POST /reviews`) to bound repeated DB recomputation and mutation load, matching the tighter throttle pattern already used on other expensive-compute endpoints.
- 0dcea25: Hide the participant team list on tournament detail/campaign pages while a tournament is still recruiting (status='open'). Team names/logos are only shown once registration closes (status='closed' or later); the confirmed-team count remains visible throughout so users can still see how many teams have signed up without seeing who.
- 1be96a3: Align the fail-closed alpha tournament QA seed guard with the isolated `teameet_alpha` database used by the deployment environment.
- 5caad2a: alpha 배포 SSM 명령에 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI` GitHub Secret을 `GA_MEASUREMENT_ID`와 동일한 방식으로 전달한다. `deploy-alpha.sh`는 이미 이 변수들을 읽고 있었지만 `deploy-alpha.yml`이 전달하지 않아 alpha 인스턴스의 `deploy/.env`(운영자 관리 대상, 자동 동기화 없음)에 실제 카카오 값이 채워진 적이 없었고, 그 결과 alpha 로그인 화면의 카카오 버튼이 "준비 중"으로 계속 비활성화돼 있었다.
- f2f1d72: 기존 진행 단계 대회의 대진표 공개 상태를 안전하게 보존하고, ALPHA QA 대회의 마감·진행·완료 시나리오에서 대진표가 명시적으로 공개되도록 수정합니다.
- 8ab529e: 회원 탈퇴 플로우의 UI 문구·백엔드 검증 로직·세션 처리를 정리합니다. 실제 상태를 반영하지 않는 고정 배지를 약관 화면과 동일한 접기/펼치기 안내로 바꾸고, 확인 모달 문구를 실제 동작(운영팀 검토 대기)에 맞게 수정했습니다. 진행 중인 매치 참여나 팀 운영 권한이 있으면 탈퇴를 막는 검증 로직을 새로 추가했고, 탈퇴 신청 성공 시 로컬 세션을 지우고 인증 가드도 `withdrawal_pending` 계정을 차단하도록 했습니다. 데스크탑에서 CTA 버튼이 콘텐츠 폭과 어긋나고 화면 하단에 큰 빈 공간이 남던 레이아웃 문제도 함께 고쳤습니다.
