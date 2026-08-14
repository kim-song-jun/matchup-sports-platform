# v1_web

## 0.3.0

### Minor Changes

- 8b032bb: 관리자 대회 상세 → 대진 관리 탭을 "전역 3단계 스텝(조 만들기/팀 배정/경기 일정)" 구조에서
  "조 카드 1개 = 조 1개" 구조로 바꿨다. 오너가 리포트한 마찰(4팀 배정에 4번 왕복, 진출팀
  확인을 위해 위아래로 스크롤, 조 이름 수동 타이핑, 다음에 뭘 해야 하는지 안내 없음)을
  서버 API 계약(0건 변경) 안에서 해소한다.

  - **조 추가**: [조별]/[준결승]/[결승]/[3위 결정전] 원클릭 템플릿(이름 자동 채움) + "직접 입력" 폴백.
  - **팀 배정**: 결선 조는 예선 상위 진출팀을 추천 칩으로 보여주고, 여러 팀을 담아 한 번의
    클릭으로 순차 일괄 배정한다(기존 1팀씩 왕복 제거).
  - **순위표**: 조 카드 안으로 흡수 — 전역 섹션을 오가는 스크롤 왕복이 없어졌다.
  - **카드 상태**: "배정 대기/N명 배정됨", "대진 미생성/대진 N경기", "✓ 준비완료" 칩으로
    지금 이 조가 뭘 기다리는지 카드 헤더만 보고 알 수 있다. 준비된 조는 기본 접힘.

  `대진 자동 생성`의 라운드로빈/시드 페어링 로직(`lib/tournament-bracket-gen.ts`)은 무변경.

- e1d9d66: 관리자 "새 대회 만들기" 위저드에 실제 4번째 단계("공개 확인")를 추가했다. 기존에는 상단
  스텝 인디케이터가 "네 단계로 나눠 입력하고, 마지막에 공개 화면을 확인하세요"라고 안내하면서도
  그런 확인 화면이 존재하지 않았고, 마지막 입력 단계에서 CTA를 누르면 대회가 곧바로 생성되며
  관리 화면으로 튕겨 나갔다(확인 모달도 없이 되돌릴 수 없는 생성).

  - **3→4단계 전환**: "참가 조건" 다음 단계(상금·홍보)의 CTA를 "대회 만들기"로 바꾸고, 여기서
    대회를 **초안(draft)** 상태로 실제 생성하되 관리 화면으로 보내지 않고 위저드 안의 새
    "공개 확인" 단계로 이동한다. 이 확인 단계는 실제 `<TournamentCard/>`(대회 목록에서 참가자가
    보는 그 컴포넌트)를 그대로 재사용해 미리보기를 보여준다.
  - **접수 시작**: 확인 단계의 주 CTA "접수 시작하기"는 되돌리기 어려운 전환(초안→접수 중)이라
    확인 모달을 거친다. 보조 동작 "나중에 하기"는 초안 상태로 두고 관리 화면으로 이동한다.
  - **중복 생성 방지**: 확인 단계에서 "이전"으로 돌아가 다시 저장하면 생성(POST)이 아니라
    수정(PATCH)한다(draftId 유무로 분기). 새로고침·직접 URL 재진입(`?draftId=`)도 서버에서 값을
    다시 읽어와 같은 초안을 이어가며, 절대 중복 생성하지 않는다.
  - **버그 수정**: 마지막 입력 단계로 넘어가는 "다음" 버튼과 그 자리에 오는 "대회 만들기"(type
    submit) 버튼이 React에서 같은 DOM 노드를 재사용하고 있었다 — `type` 속성이 그 자리에서
    "button"→"submit"으로 바뀌면서, "다음"을 누른 그 클릭이 곧바로 폼 제출까지 이어져 **사용자가
    "다음"만 눌렀는데 대회가 즉시 생성되는** 원래 신고 증상의 실제 원인이었다. 각 CTA 분기에
    고유 `key`를 줘 React가 별개 노드로 마운트하게 고쳤다.
  - **접근성**: 스텝 인디케이터 버튼에 각 단계 이름 + done/current/locked 상태를 담은
    `aria-label`을 붙였다(모바일에서 숫자만 보이던 것을 스크린 리더가 읽을 수 있게). 대회 형식
    라디오의 접근성 이름이 enum 원시값(`group_knockout`)이 아니라 한국어 라벨을 읽도록 고쳤다.

- 119203e: 운영 보드에서 경기에 경기장(필드)을 배정할 수 있게 한다 — `V1TournamentFixture.fieldId` 의 쓰기 경로를 화면에 연결.

  **증상**: alpha 의 대회 픽스처가 **전부** `fieldId=null` 이었다(운영 보드 API로 확인 — 공개 DTO 누락이 아니라 실제 데이터 부재). 스태프에게는 필드가 붙어 있는데(`FIELD_OPERATOR` + `fieldName='a'`) 그 필드에 걸린 경기가 0건이라, **필드 단위로 배정된 담당자는 담당 경기를 영영 가질 수 없었다.**

  **원인**: 배정 API(`PATCH .../fixtures/:fixtureId/field`, `DELETE` 로 해제)는 Task 18 때부터 백엔드에 있었지만 **프론트엔드가 한 번도 호출하지 않았다.** 조회·생성 훅만 있고 배정 훅이 없었다. 백엔드 DTO 주석이 이 라우트를 "`fieldId` 의 유일한 쓰기 경로"라고 못박고 있는데도 그랬다. 필드 _생성_ 호출부가 없어 필드가 영원히 0건이던 #373 과 **같은 결함이 한 단계 아래에서 반복**된 것이다.

  그 여파로 운영 보드에는 workaround 가 들어가 있었다 — `NO_FIELD_ASSIGNED`·`NO_STAFF_ASSIGNED` 는 끌 방법이 없어 모든 경기에 영구히 켜지므로, 배지와 필터 선택지에서 **통째로 숨기고** 있었다("배정 UI 가 생기면 이 배열을 비우면 원래대로 돌아온다"는 주석과 함께).

  **수정**:

  - `useV1AssignFixtureField` / `useV1ClearFixtureField` 훅 추가. 배정과 해제를 나눈 것은 백엔드 계약 그대로다 — nullable 필드를 PATCH 하나로 다루면 "비우기"와 "안 건드림"이 구분되지 않는다.
  - 운영 보드의 필드 칸을 셀렉트로. 데스크톱 표·모바일 카드 양쪽에 붙였고, 실패 시 `role="alert"` 로 사유를 알린다.
  - **권한 게이팅**: 서버가 `event_reverse` 로 판정하므로 플랫폼 운영자·대회 디렉터에게만 셀렉트를 내고, 필드 담당자·조회 전용에게는 읽기 전용 텍스트로 떨어진다(누르면 403 나는 컨트롤을 만들지 않는다는 D-16 원칙).
  - **workaround 제거**: 두 경고가 이제 해소 가능하므로 배지·필터에서 다시 보이게 되돌렸다.

  **함께 고친 조용한 버그**: 새 훅이 쓸 뻔한 `v1Keys.tournamentOperationsBoard(id)` 는 필터 자리에 `{}` 를 넣는데, 보드 쿼리 키에는 `limit` 이 늘 들어 있어 **어떤 실제 쿼리와도 접두사 일치하지 않는다** — 무효화가 조용히 아무 일도 안 했을 것이다. 필터를 뺀 `tournamentOperationsBoardAll(id)` 접두사 키를 추가해 쓴다.

  **테스트가 workaround 를 계약으로 못박고 있어** 두 건을 뒤집었고(경고 숨김·필터 선택지 제외), 배정·해제·현재값 반영·권한 게이팅 4건을 새로 추가했다. 보드 테스트에 역할 컨텍스트 목이 없어 5건이 함께 깨져 하네스도 보강했다(런타임에서는 `_gate.tsx` 셸 분기가 항상 `TournamentOpsRoleProvider` 로 감싼다).

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

- b4c2cb2: 운영 콘솔(경기 실시간 기록) 개선 2건.

  **전 액션 확인 모달**: 사용자 결정("실수 방지가 속도보다 중요")에 따라 골·카드·파울·교체(빠른 교체 포함)·시작·일시정지·재개·전반종료·후반시작·경기종료 전부에 확인 모달을 건다(기존엔 시계 이상 감지·경기 종료 두 곳뿐이었다). 되돌리기(`revert-period`)는 그 자체가 교정 행동이라 예외로 남긴다. 확인 문구는 팀·선수·시각을 구체적으로 보여주고, alpha "452′" 시계 이상 경고는 별도 모달로 겹치지 않고 같은 확인 모달 안에 병합한다.

  **대회 knockout 경기 승부차기 입력**: 정규시간(+연장) 종료 후 동점인 대회 knockout 경기에서 "승부차기 시작" 버튼이 뜨고, 킥 단위 성공/실패를 입력해(오조작 시 되돌리기 가능) "승부차기 종료"를 누르면 기존 `end` 커맨드의 `payload.penalties`(이미 배포된 백엔드 계약)로 최종 점수만 실어 보낸다. 킥별 기록은 서버에 남지 않는다(옵션 B — 새 이벤트 타입은 스키마 마이그레이션이 필요해 이번 범위에서 제외). `GET /games/:gameId`에 `isKnockoutFixture` 필드를 추가해(기존 `GamesService.isKnockoutFixture` 판정 재사용, 스키마 변경 없음) 조별리그 무승부에서는 이 버튼이 아예 뜨지 않게 한다.

- ab3942c: 운영 콘솔 경기 종료 흐름을 **후반 종료 → (결선 무승부면 승부차기) → 경기 종료** 3단계로 분리.

  **정규 시간 종료 단계 신설(새 상태값 없이)**: `end-period`가 마지막 피리어드에서 `NO_NEXT_PERIOD` 409로 거부되던 가드를 풀어, 다음 피리어드가 없으면 HALFTIME 승격만 건너뛰고 현재 피리어드만 ENDED로 닫는다. 그 결과 "게임은 LIVE인데 LIVE·HALFTIME 피리어드가 하나도 없는" 조합이 곧 정규 시간 종료를 뜻한다(새 enum 값·새 컬럼·마이그레이션 없음). 스코어 산출·결과 리비전 SUBMITTED·`GAME_RESULT_SUBMITTED` outbox는 전부 `end`에 그대로 남아, 이 중간 단계에서는 결과가 만들어지지 않는다. 콘솔은 마지막 피리어드에서 "경기 종료" 대신 "후반 종료"를 노출하고, 이후 단계에서 "정규 시간 종료" 칩·안내 배너와 함께 경기 종료(또는 승부차기 시작)를 낸다.

  **결선 무승부 종료 차단**: 결선(knockout) 픽스처가 정규 시간 동점인데 승부차기 없이 `end`를 보내면 409 `TOURNAMENT_PENALTY_REQUIRED`로 거부한다. 예전에는 그대로 리비전이 저장되고 비동기 브래킷 프로젝션만 `BRACKET_RESULT_DRAW_UNSUPPORTED`로 재시도하다 outbox 잡이 조용히 POISONED로 남아, 운영자 화면에는 "종료 성공"만 보였다. 콘솔도 같은 조건에서 "경기 종료" 버튼을 비활성화하고 사유를 배너로 알린다.

  **확인 게이트 정확도**: 마지막 피리어드 종료는 되돌릴 수 없으므로(서버 `revert-period`는 되감을 다음 피리어드를 전제한다) 확인 문구에서 그 사실을 명시하고, 성공 후 되돌리기 토스트도 붙이지 않는다(전반 종료에는 그대로 유지). 확인 모달이 떠 있는 동안 다른 이벤트가 커밋돼 `expectedVersion`이 낡던 문제(409 `VERSION_CONFLICT`)는 전송 시점에 최신 버전을 읽도록 고쳤다 — 킥 입력에 수 분이 걸리는 승부차기 종료에서 특히 노출이 컸다.

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

- 61a3e97: 출전 기록을 "라인업에 이름이 올랐다"가 아니라 "실제로 그라운드에 나갔다"로 좁힌다.

  **증상**: 대회 경기가 끝나면 `deriveTournamentRevision`이 라인업에 등록된 참가자 **전원**을 `started: true`로 못박아 `v1_game_result_participants`에 적었다. 그 테이블의 row 하나가 곧 "이 선수는 이 경기를 뛰었다"는 뜻이고, `PublicUserRecordsService`의 `summary.appearances`(프로필의 "출전 N경기")는 이 row를 그대로 센다 — 그래서 **한 번도 투입되지 않고 벤치를 지킨 선수가 선발 출전 1경기를 얻었다**. 팀 매치도 같은 결함이 있었다: 결과 입력 화면이 선발+벤치 전원(`roster`)을 `actualParticipants`로 전송했다.

  **판정 기준**: 선발(`V1GameParticipant.started`)이거나, 취소되지 않은 `SUBSTITUTION`으로 투입됐거나(신설 `deriveAppearedParticipantIds`), 스탯 이벤트의 주체인 참가자만 결과에 기록한다. 교체로 빠진 선발은 그대로 출전으로 남는다 — 나갔다고 뛴 사실이 사라지지 않으므로 "지금 피치 위에 누가 있나"를 답하는 `deriveOnPitchParticipantIds`와는 다른 fold다. 스탯 union은 안전장치다: 이벤트 append는 득점자가 피치 위에 있는지 검사하지 않아, 교체 입력을 빠뜨린 채 골만 기록된 운영 실수에서 그 골이 조용히 사라지지 않게 한다. `started`도 하드코딩 `true` 대신 라인업의 실제 값을 쓴다.

  **팀 매치**: 라이브 이벤트 스트림이 없어 교체 여부를 판정할 근거가 없으므로, 결과 입력 화면에 "출전 선수" 단계를 추가해 벤치 선수의 교체 출전을 체크로 받는다. 체크하지 않은 선수는 결과에서 빠지고, 득점자·카드·MVP 후보에서도 제외된다(체크를 해제하면 이미 붙어 있던 득점·카드·MVP도 함께 걷힌다).

  **기존 데이터**: 대회 경기는 백필 마이그레이션(`20260813200000_v1_appearance_gate_backfill`)이 같은 규칙을 소급 적용한다. 팀 매치 과거 결과는 교체 여부를 판정할 근거가 DB에 없어 손대지 않는다 — 지우면 실제로 뛴 교체 선수의 기록까지 사라지는 추측이 되기 때문이고, 새 체크가 붙은 이후 제출분부터 정확해진다.

- 53c185a: 필드 담당자(FIELD_OPERATOR)가 자기 담당 경기 콘솔에 도달할 수 있게 진입 동선을 고친다.

  **증상 (2026-08-13 alpha 실측)**: 필드 담당자로 로그인하면 마이페이지에 "담당 대회 운영"이 정상 노출되고 담당 대회 카드도 다 보이는데, 카드를 누르면 403 "담당 범위 밖의 화면이에요"로 막히고 그 안내의 CTA를 누르면 404가 떴다. 결국 **담당 경기 운영 화면에 도달할 UI 경로가 존재하지 않았다.**

  **인과 사슬 (3단)**:

  1. `my-tournament-staff-client.tsx`가 역할과 무관하게 `/tournament-ops/tournaments/:id/operations`로 하드코딩 링크했다. 목적지를 역할별로 계산하는 `myStaffEntryHref` 헬퍼가 이미 있었지만 **어디서도 import되지 않는 죽은 코드**였다.
  2. `/operations` 라우트에는 `:tournamentId` 뿐이라 `TournamentStaffGuard`가 만드는 리소스가 `{tournamentId}` 하나뿐이다. 필드 담당자 배정은 `grantStaff`의 `STAFF_SCOPE_REQUIRED` 불변식 때문에 반드시 경기 또는 필드 스코프를 갖고, 정책은 그때 리소스에 해당 스코프가 없으면 `FIXTURE_SCOPE_REQUIRED`/`FIELD_SCOPE_REQUIRED`로 거부한다 — 즉 **구조적으로 예외 없이 403**이다.
  3. 그 거부 화면의 CTA가 `/tournament-ops`를 가리키는데 그 경로엔 `layout.tsx`만 있고 `page.tsx`가 없어 **404**였다.

  **수정**:

  - `myStaffEntryHref`를 되살려 실제로 호출한다. 셸 역할(대회 디렉터·플랫폼 운영자·조회 전용)은 운영 보드로, 필드 담당자만 있는 배정은 새 담당 경기 목록으로 보낸다. 예전 구현은 `fixtureIds[0]`으로 임의의 한 경기에 직행하고 필드 단위 배정이면 `null`을 반환해, 담당 경기가 여럿일 때 말없이 하나를 고르고 필드 단위는 갈 곳이 없었다.
  - **새 화면 `/my/tournament-staff/[tournamentId]`** — 담당 경기 목록. 담당 범위는 `GET /me/tournament-staff`(본인 스코프라 필드 담당자도 읽을 수 있다), 경기 상세는 공개 일정(`GET /tournaments/:id/schedule`)에서 읽는다. 둘 다 이 사용자가 이미 읽을 수 있는 것이라 **새 권한 표면이 생기지 않는다**(백엔드 변경 없음). 경기 스코프 배정은 `fixtureIds`로, 필드 단위 배정은 `fieldName` 일치로 고른다.
  - 막다른 CTA를 `/my/tournament-staff`로 돌린다.

  **경기 콘솔 자체는 이미 정상이었다** — alpha에서 fixture-scoped 배정을 만들어 `.../fixtures/:fixtureId/operate`로 직접 진입해보니 `FieldOperatorConsoleFrame`이 정상 렌더되고 실시간 연결·이벤트 버튼까지 전부 살아 있었다(버튼 비활성은 라인업 미제출이라는 정상 전제조건). 빠져 있던 건 **그 URL로 가는 링크 하나**였다.

  **테스트 드리프트도 함께 고쳤다**: `my-tournament-staff-client.test.tsx`는 필드 담당자 카드의 href가 `/operations`라고, `_gate.test.tsx`는 CTA가 `/tournament-ops`라고 **버그를 계약으로 못박고 있었다.** 두 계약을 뒤집고, 역할별 목적지 분기와 새 화면의 선택 로직·빈 상태를 덮는 회귀 테스트를 추가했다.

  **알려진 데이터 공백**: alpha의 모든 픽스처에 `fieldId`가 비어 있어(운영 보드 API로 확인) 필드 단위 배정만으로는 담당 경기가 0건이 된다. 이 화면은 그 경우를 "아직 담당 경기가 배정되지 않았어요"로 정직하게 알린다 — 예전처럼 403으로 튕기지 않는다.

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

- 2a9ca34: 경기 이벤트에 도움(assist) 기록과 파울(FOUL) 이벤트 타입을 추가한다: GOAL 이벤트에 같은 팀·다른 선수를 도움으로 지정할 수 있고(자기 자신·상대팀 지정은 422 ASSIST_INVALID로 거부), FOUL은 더 이상 CORRECTION 이벤트로 위장되지 않는 정식 이벤트 타입이다. 경기 결과 집계와 공개 개인 기록(`GET /users/:id/records`) 요약에 도움/파울 합계가 함께 노출된다.
- c6c4d58: 경기 운영 콘솔의 실측 실패 사고(6건 기록 시도 중 2건 "이벤트를 기록하지 못했어요" 실패, 원인 불명)를 후속 조치한다.

  - 실시간 게이트웨이(`RealtimeGateway`)의 모든 이벤트 커맨드 거부 경로가 이제 PinoLogger로 남는다(코드/게임/해시된 행위자 — 원문 userId 없이). 지금까지는 실패가 클라이언트 배너에만 보이고 서버 어디에도 흔적을 남기지 않았다.
  - 서버가 던질 수 있었는데 콘솔이 매핑하지 않았던 9개 에러 코드(`TERMINAL_GAME_IMMUTABLE`, `EVENT_INVALID`, `PARTICIPANT_SIDE_MISMATCH`, `SCORER_REQUIRED`, `COMMAND_IDEMPOTENCY_KEY_MISMATCH`, `IDEMPOTENCY_PAYLOAD_CONFLICT`, `INVALID_ACTOR_SCOPE`, `COMMAND_CONCURRENCY_CONFLICT`, `INTERNAL_ERROR`)에 전용 안내 문구를 추가하고, 재시도로 풀리지 않는 코드에서는 "전송 상태" 패널의 "다시 시도" 버튼을 숨긴다.
  - 전송 큐의 재시도가 서버의 기존 리베이스 경로(`game.event.retry`)로 나가도록 고쳤다 — 이전에는 재시도가 원래의 낡은 `expectedVersion`으로 `game.event.append`를 다시 보내 항상 같은 이유로 다시 실패했다.
  - 경기 운영 콘솔의 기록 흐름을 "선수 먼저 → 액션"에서 "액션(골/카드/파울) 먼저 → 대상 선수"로 뒤집는다. 기록 시각은 액션을 탭한 순간에 고정되고(선수를 고르는 동안 밀리지 않는다), 대상 선택 화면은 양 팀 라인업을 그대로 보여줘 팀 혼동을 막는다. 파울은 선수 지정 없이 팀 단위로도 기록할 수 있다.
  - 진행 중 경기의 경과 시간을 헤더에 크게 표시하고(초 단위, 서버-기기 시각차 보정), 기록된 이벤트 목록의 시각 표시를 분 단위(`10'`)에서 초 단위(`10:06`)로 바꿔 같은 분에 기록된 이벤트를 구분할 수 있게 한다. 재개/일시중지/종료 명령의 처리 소요 시간을 ms 단위로 헤더에 표시한다.

- 730063c: 대회 생성/수정 화면에서 관리자가 "교체 방식"(제한/무제한 롤링)과 "교체 횟수"를 종목별 실제 지원값 기준으로 고를 수 있다. 스키마 변경 없이 기존 `V1CompetitionConfigVersion` 버전 체계를 재사용해 find-or-create로 pin하며(출전 인원 설정과 동일한 패턴), 출전 인원 설정과 함께 바꿔도 서로의 값을 canonical로 되돌리지 않는다. 진행 중/완료된 대회의 변경 정책은 출전 인원과 동일하게 차단한다.
- 3eafac4: Connect the admin console to the tournament-ops console properly, and settle on one way of showing an action the current user cannot take.

  The `/tournament-ops/**` routes grew as a separate tree and were wired back to `/admin/**` only thinly afterwards. Four gaps followed: picking "결과 검토" on a specific fixture dropped you at the tournament-level console with no way to say which match you meant; the ops shell's return link always went to `/home`; the admin sidebar never mentioned the ops console at all, so you had to already be inside a tournament to learn it existed; and the live console sat two hops away with no direct link.

  Result-review and corrections now accept `?fixtureId=` and open that fixture directly, telling you plainly when it is not on the list rather than silently showing nothing. The ops shell remembers which tournament you entered from and offers "대회 관리로 돌아가기". The admin sidebar gets a 대회 현장 운영 entry with a tournament picker, and bracket rows expose "운영 콘솔 열기" for scheduled and in-progress matches.

  Permission-gated entry points were inconsistent: the admin quick links always rendered and failed on arrival, while the ops shell nav removed items entirely. Both now render disabled with `aria-disabled` and a reason ("스태프 배정이 필요해요."), so the capability is discoverable and the reason is actionable. Also fixes a WCAG 2.5.3 Label-in-Name mismatch where a link's accessible name said "…콘솔로 이동" while its visible text read "결과 검토하러 가기" — voice-control users could not activate it by reading what they saw.

- e9d872a: 대회 대진표의 경기 일정 탭에서 참가팀 매니저의 경기를 파란색으로 강조하고 라인업 상태와 바로가기를 제공합니다. 경기 상세와 진행 중 결과 화면의 일정 복귀 경로도 통합 대진표 화면으로 일치시킵니다.
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

- 096d160: 경기 운영 콘솔의 경과 시간 표시가 경기 일시정지 중에도 계속 흘렀다(실측 확인, PR #299 후속). 원인은 데이터 공백이었다 — `V1GamePeriod`가 시작/종료 시각만 저장하고 일시정지 구간을 전혀 추적하지 않아, 화면과 실제 기록되는 `clockMs`가 둘 다 "멈춘 시간을 뺄 근거"가 없었다.

  - `V1GamePeriod`에 `pausedTotalMs`(완료된 모든 일시정지 구간의 누적 ms)와 `pausedAt`(지금 열려 있는 일시정지 구간의 시작 시각, 아니면 null)을 추가한다. `pause` 명령이 `pausedAt`을 열고, `resume`(그리고 일시정지 중 `end`를 눌러도)이 `now - pausedAt`을 `pausedTotalMs`에 **더하고**(덮어쓰지 않고) `pausedAt`을 닫는다 — 한 피리어드 안에서 여러 번 정지/재개해도 전부 누적된다.
  - 경과 시간 계산을 `elapsedMatchMs()`(`apps/v1_web/src/lib/game-operations-clock.ts`) 한 곳으로 통일해, 콘솔 화면의 실시간 표시와 `freezeCapture()`가 기록하는 `clockMs`가 항상 같은 값을 쓰도록 한다 — 두 곳에 따로 계산을 두면 반드시 어긋난다.
  - 일시정지 중에는 경과 시간 옆에 아이콘+텍스트 배지("일시 중지")를 함께 보여준다(색상만으로 표현하지 않는다) — 멈춘 숫자만 보면 고장으로 오인할 수 있다.
  - alpha에 이미 기록된 4건의 이벤트(`clockMs` 645886~655603ms)는 소급 보정하지 않는다 — 이 기능이 생기기 전에는 일시정지 구간 자체가 어디에도 기록되지 않아, 지금 와서 "얼마나 멈춰 있었는지"를 계산할 근거 데이터가 없다. 없는 데이터를 추정해 이미 확정된 경기 기록을 바꾸는 것은 보정이 아니라 창작이므로, 과거 값은 그대로 둔다.
  - 스키마 변경은 추가 전용(Int 컬럼 기본값 0, nullable DateTime)이라 별도 백필이 필요 없다.

- 48a65e9: 기록 입력 UX 개편: 골/카드/파울을 탭 즉시 확정하고(어시스트는 나중에 토스트나 기록 목록에서 사후 부착), 팀별 누적 파울(5개 이상 시 경고)을 실시간으로 보여준다. 결과 검토 화면에는 어시스트 미기입 건수를 확정을 막지 않는 안내로 표시한다. 팀매치도 호스트팀 오너/매니저가 경기 시작/일시중지/재개/피리어드 전환을 할 수 있게 열었다(종료는 여전히 결과 제출로만 가능) — 상대팀 매니저의 직접 API 호출을 통한 조작은 403으로 차단된다. `GET /games/:gameId/operations-lineup`로 라이브 기록 콘솔이 양쪽 사이드 라인업을 읽을 수 있다(경기 시작 전에는 여전히 자기 사이드만).
- f86bf5b: Show the kickoff time and venue on the public tournament schedule, and keep the time badge visible on bracket cards that are already live or finished.

  A schedule row rendered only `조별 A · 8/7 (금) · 예정` — no time, no venue — even though the response already carried `venue` and `fieldName`. For a tournament running three matches a day across two pitches, that row could not tell anyone when or where to show up. Rows now render `M/D (요일) HH:MM` via a new shared `formatTournamentDateTimeShort` helper plus a venue/field line.

  On the bracket, the time badge was gated behind `!isDone && !isLive`, so the LIVE badge and the penalty-score badge each displaced it. Badges now sit in a flex row so the time stays alongside them. When a card carries only one badge — the most common "예정" state — it keeps rendering as the original full-width block strip rather than shrinking to a content-width pill; that also repairs the same pre-existing regression on LIVE-only and PK-only cards.

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

- 48708b5: Add the web UI for team-match leagues (시리즈): admins can now open a
  round-robin league from `/admin/team-match-series/new` (name, sport, region,
  period, and at least two participating teams), generate the full fixture
  list from the league's detail page (`/admin/team-match-series/:seriesId`),
  and edit each fixture's date/time and venue inline in the fixture table. A
  "리그" tab was added to the admin nav next to "팀매치".

  Anyone can view a league's public standings and player rankings at
  `/team-match-series/:seriesId` — a live table (points, goal difference,
  goals for/against) plus scorer/assist leaderboards, with fixtures still
  awaiting an official result surfaced as a separate "확인 중" notice instead
  of being silently excluded.

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

- 6efc4d9: 대회 상세·대진표 정보구조를 정리한다.

  조별 순위를 상세에서 빼고 `/bracket` 으로 일원화하고, 중복 "전체 경기 일정 보기" 링크를 없앤 뒤 대진표 진입 CTA 하나로 통합한다. CTA 라벨은 대회 상태를 따른다 — 종료된 대회에 "진행 중인"은 거짓이므로 상태별로 다른 문구를 쓴다.

  **진출 표시는 조별리그가 실제로 끝난 뒤에만 나온다.** 지금까지는 1경기만 끝나도 "상위 N팀 진출" 배지가 떠서 아직 정해지지 않은 진출을 확정처럼 보여줬다. 완료 판정은 그 조의 픽스처가 전부 `completed` 또는 `cancelled` 일 때다(취소 경기를 빠뜨리면 영원히 미완료가 된다). 결선 대진표도 같은 게이트를 따르되, 조별리그가 없는 `knockout` 형식은 처음부터 보여준다.

  대진표 화면에서 경기 일정도 볼 수 있게 탭을 추가하고(기존 `ScheduleContent` 재사용), LIVE 픽스처가 있을 때만 8초 폴링해 순위가 실시간으로 갱신되게 한다.

- 5299c07: 관리자가 대회를 만들 때/수정할 때 "출전 인원"(경기장에 서는 라인업 상한, GK 포함)을 직접 고를 수 있게 한다. 지금까지는 이 값이 종목별 경기 설정(`V1CompetitionConfigVersion.lineup.maxPlayers`)의 하드코딩된 기본값(축구 11명/풋살 6명)으로 고정돼 있었고, 이를 바꿀 수 있는 관리자 화면이 아예 없었다(PR #306에서 확인된 갭).

  **"등록" 인원과 "출전" 인원은 완전히 다른 개념이다 — 섞지 않았다.** `V1Tournament.minPlayers/maxPlayers`(대회에 등록하는 로스터 크기, 성별 쿼터가 묶이는 값)는 건드리지 않았다. 이번 변경 대상은 오직 `V1CompetitionConfigVersion.lineup.maxPlayers`(실제 경기 라인업 상한)뿐이다.

  **Prisma 스키마는 바꾸지 않았다.** 새 컬럼 대신 기존 불변 버전 체계를 그대로 재사용한다: 관리자가 n을 고르면 종목의 canonical 설정(`competition-config.presets.ts`)에서 `lineup.maxPlayers`(및 필요하면 `minPlayers`)만 n에 맞춘 content를 구성하고, `content_hash`로 find-or-create — 이미 같은 내용의 버전이 있으면 재사용하고, 없으면 기존 관리자 API(`CompetitionConfigRegistry.createVersion`)로 새 버전만 발행한다. 기존 버전 행은 절대 UPDATE하지 않는다(`v1_block_used_config_mutation` 트리거가 막는 이유와 동일).

  - 선택 가능한 값은 종목의 `lineup.formations`가 실제로 지원하는 필드 인원수(+GK 1명)에서 파생한다 — 없는 대형을 지어내지 않는다. 풋살은 5명/6명, 축구는 아직 포메이션 데이터가 없어 canonical 기본값(11명) 하나만 선택지다.
  - 대회 **생성** 시: 종목이 경기 설정 카탈로그에 있으면(football/futsal) 관리자가 안 골라도 canonical 기본값으로 자동 설정된다 — 대진(픽스처) 생성 단계의 `COMPETITION_CONFIG_REQUIRED` 차단(설정이 아예 안 잡힌 신규 대회는 픽스처를 만들 수 없던 기존 운영 공백)이 함께 해소된다.
  - 대회 **수정** 시: 이미 시작(`in_progress`)했거나 완료(`completed`)된 대회는 출전 인원을 바꿀 수 없다(409 `TOURNAMENT_LINEUP_SIZE_LOCKED`) — 진행 중인 대회의 규칙이 경기 중간에 바뀌는 것을 막는다. 종목과 출전 인원은 한 요청에서 함께 바꿀 수 없다(400). 변경은 기존 `TournamentCompetitionConfig.change()`(CAS + 미완료 픽스처만 리포인트 + 완료된 경기는 소급하지 않음)를 그대로 재사용한다.
  - 새 조회 엔드포인트: `GET /admin/competition-configs/lineup-size-options?sportId=`.
  - `GET /admin/tournaments/:id` 응답에 `competitionConfigVersionId`/`lineupMaxPlayers`/`lineupMinPlayers`/`lineupSizeOptions`를 추가했다(목록/생성 응답은 조인 비용 때문에 이 필드들을 채우지 않는다).

  **함께 고친 실 존재 갭:** `GamesService.saveLineup`(대회 대진의 director/staff 라인업 저장 경로)에는 min/max 인원 검증이 아예 없었다 — `team-match-lineup.service.ts`의 동일 라인업 저장 경로는 이미 `LINEUP_SIZE_INVALID`로 이 값을 강제하고 있었는데 대회 쪽만 빠져 있었다. 이제 같은 코드/메시지로 강제한다. 두 경로가 각자 파서를 중복으로 갖고 있던 것도 `competition-config.parse.ts`의 `parseLineupLimits()` 하나로 합쳤다.

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

- af21788: 라인업 화면의 포메이션 선택을 드롭다운으로 바꾸고, 선수를 선발로 등록하는 순간 빈 자리에 자동으로 앉도록 했다. (1) 포메이션 선택이 `presetsForOutfieldCount`로 **선발 인원수와 정확히 일치하는 대형만** 노출하고 있어, 명단을 다 채우기 전에는 고를 수 있는 대형이 하나도 없었고 인원이 바뀔 때마다 목록이 갈려 고르던 포메이션이 사라졌다 — 인원수 필터를 제거해 종목 카탈로그 전체를 항상 노출하고, 선택 UI를 칩 버튼에서 `<select>` 드롭다운(`<label htmlFor>` 연결, 44px 터치 타겟)으로 바꿨다. 인원이 대형과 맞지 않으면 선택을 막는 대신 드롭다운 아래에서 몇 자리가 비는지(또는 몇 명이 대기로 남는지) 알려준다. (2) 선수를 선발에 추가해도 대기 목록에만 들어가 빈 자리를 사람 수만큼 일일이 탭해야 했다 — `seatStartersInEmptySlots()`를 추가해 **방금 선발이 된 사람**과 **방금 골키퍼로 지정된 사람**만 빈 자리에 앉힌다. 골키퍼 자리에는 `goalkeeper` 플래그가 켜진 사람만 들어가고 지정자가 없으면 빈 자리로 남으며, 이미 좌표가 있는 선수(드래그로 옮긴 위치)는 건드리지 않는다. 포메이션 변경 경로에는 붙이지 않아 `formation-assignment`의 "대기 선수를 자동으로 끌어들이지 않는다" 규칙은 그대로 유지된다. (3) 포메이션 정리 effect가 서버 카탈로그에 없는 코드만 되돌리도록 좁히고, 카탈로그 로딩 중(`sportCatalog=[]`)에는 사용자가 고른 포메이션을 지우지 않게 했다 — 지우면 그대로 자동저장까지 따라 나갔다. team-match 라인업과 대회 fixture 라인업 두 화면에 동일하게 적용된다.
- 749d6f5: 팀 전적(`/teams/:id/records`)·개인 전적(`/users/:id/records`) 목록에서 승/무/패를 눈에 띄게
  강조한다. 이전엔 결과가 12~14px 글자 한 자의 색만으로 표시돼 목록을 훑을 때 승패가 사실상
  구분되지 않았다.

  - 결과 라벨을 칩(배경색)으로 승격 — 승 파랑 / 무 회색 / 패 빨강.
  - 기록 행 좌측에 4px 결과 색 띠를 더해 목록 스캔 시 승패 흐름이 한눈에 들어오게 했다.
  - 두 화면이 각자 들고 있던 `RESULT_COLOR` 맵을 `result-emphasis.ts` 하나로 합쳤고, 개인
    전적이 쓰던 500계열(다크모드에서 자기 틴트 배경 위 3.7:1로 AA 미달)을 라이트·다크 양쪽에서
    4.5:1이 확보된 700계열로 교정했다.
  - 무승부 칩 배경은 `--surface-soft` — `--grey100`은 다크에서 카드 표면과 같은 값이라 칩이
    사라진다.
  - 색 단독으로 정보를 전달하지 않도록(WCAG 1.4.1) '승/무/패' 글자는 칩 안에 그대로 유지한다.

- 7f7d194: 순위·브래킷 화면(`/tournaments/:id/bracket`)에 들어가면 "경기 일정" 탭이 먼저 보이도록 기본 탭을 바꿨다. 대회 진행 중 이 화면에 오는 대부분의 목적은 "다음 경기가 언제·어디서"인데 기본 탭이 순위·대진표라 항상 한 번 더 눌러야 일정에 닿았다. 세그먼트 탭 나열 순서도 기본 탭과 같게 경기 일정을 앞으로 옮기고("선택된 탭이 왼쪽"이라는 통상 기대 유지), 헤더 설명 문구를 첫 화면에 실제로 보이는 내용과 맞췄다. 대회 종료 후 최종 순위를 보러 오는 사용자는 반대로 한 번 더 눌러야 하지만, 최종 순위는 `/tournaments/:id/results` 전용 화면이 따로 있어 이 화면이 유일한 경로는 아니다. 기본 탭이 react-query를 쓰는 일정 탭이 되면서 순위표·대진표를 검증하던 테스트는 `QueryClientProvider` 래핑 + 탭 전환이 필요해져 `bracket-test-utils.tsx` 공용 헬퍼로 정리했고, 기본 탭 계약을 고정하는 회귀 테스트를 추가했다.
- ec7d639: 데스크톱 결선 대진표가 **컬럼 폭을 채우도록** 고친다 — 가운데 정렬 대신 연결선이 남는 폭을 흡수한다.

  **증상**: 라운드 수가 적은 대진(4강+결승 등)에서 트리가 섹션 제목과 어긋나 보였다. 알파 실측(1920px): 제목 "토너먼트 대진"의 x는 440인데 트리의 x는 790 — **트리 왼쪽에 350px 빈 공간**이 생겨 "UI가 깨졌다"는 지적을 받았다.

  **원인**: 두 겹이다.

  1. `justifyContent: fitsWithoutScroll ? 'center' : undefined` — 2026-08-11에 "왼쪽 정렬이라 트리 **오른쪽**에 빈 공간이 남아 어색하다"는 지적을 받고 넣은 가운데 정렬이다. 그런데 이건 빈 공간을 **왼쪽으로 옮겼을 뿐**이고, 섹션 제목은 왼쪽 정렬이라 정렬축이 어긋나 오히려 더 어색해졌다.
  2. `ResizeObserver`가 스크롤 래퍼만 관찰했다. 팀 로고가 늦게 로드되는 등 **내용** 폭이 변해도 래퍼 크기는 그대로여서 콜백이 불리지 않아 `fitsWithoutScroll`이 틀린 값으로 고착됐다 — 알파에서 스크롤이 불필요한데도 `display:block`(=false)으로 남아 있는 상태를 확인했다.

  **수정**: 트리 행을 `inline-flex` + 조건부 가운데 정렬에서 `display:flex; width:100%`로 바꾸고, 라운드 사이 연결선을 `ConnectorSegment`로 분리해 `flex: 1 0 auto`를 준다. 라운드 컬럼과 우승 슬롯은 `flexShrink: 0` 고정폭이므로 **남는 폭은 연결선만 흡수**한다. 폭이 모자라면 고정폭 합이 컨테이너를 넘어 자연스럽게 오버플로하고 상위 `overflowX:auto`가 스크롤을 켠다 — 기존 스크롤 동작 그대로다.

  연결선을 늘릴 때 SVG 자체는 원래 좌표를 유지하고(늘리면 선이 타원으로 일그러진다), 그 오른쪽에 `flex-grow` 되는 빈 div를 붙여 접합점과 같은 높이에 직선만 연장한다. 접합점 y좌표는 `connectorJunctionY()` 한 곳에서 계산해 SVG와 연장선이 우연히 맞는 게 아니라 구조적으로 일치하게 했다.

  `fitsWithoutScroll`은 스크롤 힌트 표시에 여전히 필요하므로 남기되, `ResizeObserver`가 래퍼와 **내용 요소를 모두** 관찰하도록 고쳤다.

  **검증**: 대진표 관련 타깃 테스트 24개 통과(`tournament-bracket.test.ts` 11 · `tournament-bracket.render.test.tsx` 4 · `bracket-page-client.test.tsx` 9), `tsc --noEmit` 클린. 레이아웃·회귀 두 관점 코드 리뷰 통과. 실제 화면 시각 검증은 알파 배포 후 수행한다.

- 9be1d67: 순위·브래킷 화면의 여백·밀도를 모바일/데스크탑 전 폭에서 정리했다. (1) 첫 화면에서 인트로 블록이 390px 기준 스크롤 영역의 22%(159px)를 먹어 정작 경기가 2~3개밖에 안 보였다 — 상단 앱바 제목과 같은 말인 eyebrow("순위와 대진표")를 없애고, 안내 문단은 768px 미만에서 숨기고, 포맷 배지를 제목 옆으로 올려 인트로를 63~85px로 줄였다(탭 위 크롬 307px→212~234px, 43%→30~33%). (2) 순위표의 숫자 3열(전적·승점·득실)이 56/44/44px 고정이라 표가 넓어질수록 늘어난 폭이 전부 팀명 칸으로 흘러가 팀명과 전적 사이가 통째로 비었다(768px 실측 319px = 행 폭의 57%) — 비율(18%/13%/13%) + 최소 폭으로 바꿔 넓은 폭에서 숫자 블록도 함께 벌어지게 했고(768px 319→217px), 팀 칸 오른쪽 끝에 홀로 떠 있던 펼침 아이콘을 팀명 옆으로 붙였다. (3) 데스크탑 2열 배분(순위표 0.72fr : 대진표 1.28fr)은 라운드가 여러 개인 대진표를 전제로 한 것이라, 결승 하나뿐인 대회에서는 650px 칼럼을 커넥터만 가로지르고 순위표는 366px로 눌렸다 — 결선 라운드가 1개일 때만 두 칼럼을 콘텐츠 상한(370px/460px)으로 묶고 남는 폭은 바깥 여백으로 보낸다. 라운드 2개(4강+결승)는 최소 폭이 552px이라 기본 배분을 그대로 유지한다. (4) 일정 탭 카드가 1440px에서 998px까지 늘어나 좌우로 각각 300px 가까이 비던 것을 840px 상한으로 묶었다. (5) flownav 아래 죽은 공간(모바일 52px·데스크탑 88px)을 페이지 하단 여백 40→16px로 줄여 28px·64px로 정리했다.
- 009e2cc: 대진표 페이지가 알파 배포 후 실측에서 여전히 타입 조합 15종을 냈던 문제 3건을 고쳤다.
  PR #409는 이 페이지의 첫 파티 코드(`bracket-page-client.tsx` + `tournament-bracket.tsx`)만
  4단계 위계에 맞췄고, 이 두 파일이 직접 하드코딩한 인라인 스타일은 범위 밖에 남아 있었다.

  - **세그먼트 탭 굵기 통일**: `.tm-seg-tab[data-active='true']`의 `font-weight: 800`을 제거했다
    (R-T3는 800 이상을 히어로 숫자·로고 전용으로 규정 — 세그먼트 탭은 해당 없음). 선택 상태는
    배경(트랙 위로 떠오르는 pill) + 텍스트 색(muted → strong)으로만 구분한다. 이 클래스는
    대진표 페이지 전용(다른 화면 미사용, 전수 확인 완료)이라 영향 범위는 이 페이지로 닫혀 있다.
    같은 편집에서, 배경만으로 구분이 성립하려면 다크모드에서 트랙(`--grey100`)과 활성
    pill(`--surface`)이 동일 색(#1c1e24)이라 배경이 사라지는 잠재 버그도 함께 고쳤다 —
    `.tm-review-tab[data-active]`에 이미 쓰인 동일 패턴(`--grey150` 오버라이드)을 적용했다.
  - **"순위·브래킷" 중복은 실제 중복이 아니었다**: `tm-topbar-heading`(17px, 모바일 상단바)과
    `tm-text-heading`(24px, `AppChrome desktopHead` 데스크톱 페이지 헤더)은 반응형 브레이크포인트
    (1024px)로 서로 배타적으로 표시되는 의도된 구조다(`tm-topbar`는 ≥1024px에서 `display:none`,
    `tm-desktop-page-head`는 `.tm-show-desktop`으로 <1024px에서 `display:none`). 900px 실측이
    DOM에 둘 다 존재하는 걸 잡아낸 것이지 화면에 동시에 렌더된 게 아니다 — 코드 변경 없음.
  - **12px 인라인 굵기 수렴**: 대진표 페이지 두 첫 파티 파일에 흩어져 있던
    `fontSize:12` 인라인 스타일을 기존 `.tm-text-caption`(400, 안내 문구)과 신규
    `.tm-text-caption-strong`(700, 조 이름·"대진표 준비 중" 같은 짧은 강조 라벨) 두 토큰으로
    수렴했다. 두 토큰만 남긴 이유는 실제로 의미가 다른 두 종류(설명 캡션 vs 강조 라벨)만
    존재했기 때문이다 — 억지로 하나로 합치지 않았다.

  의도적으로 손대지 않은 것: 하단 탭바(12px/500, 앱 전역 네비게이션), 알림 배지(11px/700,
  PR #398 예외), 순위표 숫자(13px 계열), 스크립트 텍스트(16px/400 측정 노이즈).
  `TeamFixturesDetail` 확장 행의 라벨(400)/팀명(600)/스코어(700) 혼재는 정보 위계가 이미
  정당해 그대로 뒀다. `tournament-standings-table.tsx`/`schedule-content.tsx`/
  `tournament-flow-nav.tsx`/`tournament-progress-stepper.tsx`도 12px 인라인 굵기가 섞여
  있지만, 전부 결과·수상·대회운영보드·공개 일정 등 다른 화면과 공유하는 컴포넌트라 이번
  스코프(정확히 이 3건)에서는 건드리지 않았다 — 손대려면 그 화면들까지 별도 검증이 필요하다.

- d621360: 결과 정정/재입력 화면이 서버 스코어 계약을 어겨 저장이 아예 되지 않던 문제를 고쳤다 (#380)

  `GET /games/:id/result-revisions`가 돌려주는 스코어는 두 형태의 union이다 -- 백필된 경기는 최상위에 `home`/`away`가 없고 `regulation: {home,away}|null` 안에 중첩돼 있다. 결과 정정 모달(`result-edit-modal.tsx`)이 이 형태를 평평하게 읽어 초기값이 `undefined`로 뜨고, 제출 시에는 스냅샷 전체(`goals`/`penalty`/`incomplete`/`provenance`/`regulation` 포함)를 그대로 보내 서버 `GameScoreDto`의 `forbidNonWhitelisted`에 걸려 `400 VALIDATION_ERROR`가 났다(알파 실측: 프론트가 실제로 보낸 payload는 400, `changes.score`만 `{home,away}`로 바꾸면 201) -- 결과 정정·무효 후 재입력을 UI로 저장할 수 없었다. "처리 이력" 타임라인과 확정 확인 모달도 같은 방식으로 읽어 `undefined:undefined`를 보여줬다.

  `lib/game-result-score.ts`의 기존 정규화 헬퍼(`readGameResultScore`/`formatGameResultScore`)를 확장해(승부차기 필드명 통일 포함) 모든 읽는 지점(모달 초기값·점수 변경 diff·리비전 타임라인·정정/확정 확인 문구)에서 재사용하고, 제출 경로는 항상 평평한 `{home, away}`만 보내도록 고쳤다. `use-tournament-result-review.ts`의 `GameResultScore`(읽기)/`GameResultScoreInput`(쓰기) 타입을 분리해, 스냅샷을 그대로(또는 spread해서) 제출에 넘기면 컴파일이 깨지도록 만들었다 -- 이전에는 두 방향이 같은(항상 평평한) 타입을 공유해서 틀린 채로 컴파일을 통과했다.

- 523424c: 죽은 CSS 규칙을 정리하고 대진표 페이지(`/tournaments/[id]/bracket`)의 타입 위계를 4단계로
  정리했다.

  - **죽은 CSS 제거**: `globals.css`의 참조되지 않는 클래스 셀렉터 222개를 삭제(`v1-*`
    옛 셸 잔여, `tm-wc-*`(월드컵 대진 구버전), `tm-podium-*`(시상대 구버전),
    `tm-match-result-*`, `tm-bk-*`(브래킷 구버전), `.tm-card.tm-interactive`/
    `.tm-list-row.tm-interactive` 등). 쉼표 목록에 죽은 셀렉터가 살아있는 셀렉터와 섞여
    있던 11개 규칙은 죽은 조각만 잘라내고 나머지는 그대로 뒀다. 동적으로 생성되는
    클래스(`tm-weather-icon-*`, `tm-auth-notice-*`, `tm-chat-*-{me,other}` 등)와
    `global-error.tsx`가 유일하게 쓰는 `v1-root`/`v1-card` 등 8개는 확인 후 남겼다.
  - **대진표 페이지 타입 위계**: 15여 종의 크기·굵기 조합을 4단계(20/17/15/12px)로
    정리했다. `.tm-hub-section-title`(15px, 굵기 850)은 8개 다른 화면과 공유하는
    토큰이라 전역 정의 대신 이 페이지 전용 override로 17px/700에 맞췄다.
    `tm-bk2-score`/`tm-bk2-champ-name`의 굵기 900은 히어로 숫자 기준(30px+)에
    못 미쳐 700으로 낮췄다. 대회 종류(리그/토너먼트/조별리그+토너먼트)별 타입 분기는
    코드에 없어 손대지 않았다.

- 700f90f: 전적 화면 무승부·미확정 결과 칩의 라이트 모드 대비 회귀를 고친다. 승/무/패 강조를 칩으로
  바꾸면서 무승부 칩에 회색 배경(`--surface-soft`, 라이트 #f2f4f6)을 깔았는데, 텍스트로 쓰던
  `--text-caption`(#6b7684)은 흰 카드 위에서 4.55:1로 간신히 AA를 넘던 색이라 배경이 깔리자
  **4.19:1로 떨어져 WCAG AA(4.5:1)에 미달**했다(alpha 라이브 computed 값 실측).

  `--text-body`(라이트 #4e5968)로 바꿔 같은 배경에서 6.45:1을 확보한다. 다크는 `#d1d6db` on
  `#24262d`로 이미 넉넉히 통과하며 값이 바뀌지 않는다. 승/패 칩(라이트 4.82:1 / 5.67:1, 다크
  6.33:1 / 5.16:1)은 변경 없다.

- 41a2c46: 필드 담당자 경기 콘솔의 뒤로가기가 404로 떨어지던 것을 고친다.

  `FieldOperatorConsoleFrame`의 뒤로가기 링크가 `/tournament-ops`를 가리켰는데, 그 경로에는 `layout.tsx`만 있고 `page.tsx`가 없어 **404**였다. 이 프레임의 주석은 "누르면 막히는 링크를 만들지 않는 것이 이 저장소의 원칙(D-16)"이라고 선언해 놓고, 정작 자기 뒤로가기가 그 원칙을 어기고 있었다.

  alpha 실측에서 필드 담당자 동선을 끝까지 걸었을 때, 앞선 수정(#416)으로 진입은 뚫렸지만 콘솔 화면의 RSC prefetch에서 `404 /tournament-ops`가 계속 관측됐다 — 이 링크가 남은 원인이었다.

  `tournamentId`를 프레임에 넘겨 **왔던 담당 경기 목록**(`/my/tournament-staff/:tournamentId`)으로 돌린다. `tournamentId`가 없으면 대회 목록(`/my/tournament-staff`)으로 한 단계 물러선다. aria-label도 실제 목적지에 맞춰 "담당 경기 목록으로 돌아가기"로 바꿨다.

  `_gate.test.tsx`가 이 죽은 링크(`href='/tournament-ops'`)를 계약으로 못박고 있어 함께 뒤집었다 — #416에서 같은 파일의 AccessDenied CTA 계약을 뒤집을 때 이 두 번째 단언을 놓쳤다.

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

- 670b59d: 대회 경기 라인업 화면(`tournaments/[id]/matches/[fixtureId]/lineup`)에서 조회 실패 시 빠져나올 길이 없던 문제를 고쳤다. (1) 게임/라인업 조회(`useV1GameLineups`는 `retry:false`, `useV1Game`은 전역 기본값 `retry:1`)가 재시도까지 소진하고 실패하면 hydrate useEffect가 아무것도 하지 않아 `state`가 계속 null로 남고 `PageSkeleton`이 무한 렌더됐다 — 이제 조회 실패를 명시적으로 감지해 재시도 버튼이 있는 에러 화면을 보여준다. (2) 접근권한 조회(`useV1FixtureLineupAccess`) 실패를 원인 불문 "매니저·오너만 관리 가능" 문구로 표시했다 — 이제 `V1ApiError.code`로 진짜 `PERMISSION_DENIED`와 대상 없음(`GAME_NOT_FOUND`/`TOURNAMENT_FIXTURE_GAME_NOT_FOUND`)과 그 외 네트워크·서버 오류를 구분해, 후자에는 재시도 버튼이 있는 에러 화면을 보여준다. (3) 라인업 편집 중(dirty) 제출 버튼이 이유 없이 비활성됐던 것을, "저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요" 인라인 문구로 항상 이유를 설명하도록 고쳤다.
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

- dd9ec86: 라인업 화면이 **아직 아무도 선발을 고르지 않은 상태**를 그대로 보여주고, 초기 라인업 참가자를 등록 명단의 사람과 잇는다. 모바일 **포메이션 진입점**도 함께 드러낸다.

  **증상 1 — 처음 열면 전원이 선발**: 대진이 확정되면 백엔드가 양 팀 등록 명단 전원을 담은 초기 라인업(revision 1, DRAFT)을 만든다. 그 참가자들은 `V1GameParticipant.started` 의 컬럼 기본값 때문에 전원 `started=true` 로 저장되는데, 그건 "이 사람들이 선발로 정해졌다"가 아니라 **아직 아무도 고르지 않았다**는 뜻이다. 화면이 그 값을 곧이곧대로 옮기는 바람에 팀장의 일이 "선발을 고르는 것"이 아니라 "안 뛸 사람을 하나씩 빼는 것"이 됐다(alpha 실측: 12명 등록 → 12명 전원 선발).

  **수정**: 화면이 초기 라인업을 알아보고 전원 후보로 시작한다. 자동 생성분은 `revision === 1 && state === 'DRAFT'` 로 정확히 식별된다 — 저장(`saveLineup`)은 언제나 `previous.revision + 1` 로 새 리비전을 만들기 때문에, 누군가 한 번이라도 고르고 저장했다면 revision 이 2 이상이다. 제출·잠금된 라인업은 revision 1이어도 사람이 확정한 결과이므로 그대로 살린다.

  **함께 막은 것 — 화면과 저장 내용이 어긋나는 제출**: 초기 라인업은 `lineupId` 를 비워 **제출 대상에서 뺀다**. 그러지 않으면 화면에는 후보로 보이는 사람들이 그 리비전 제출과 함께 전원 선발로 확정된다. 이제 저장을 한 번 거쳐야 제출할 수 있고, 제출되는 것은 화면에 보이는 그 명단이다.

  > 처음에는 백엔드에서 `started: false` 를 명시하는 쪽으로 고쳤는데, `started` 는 교체(피치 위 판정)·결과 리비전·공개 기록 등 **여러 소비자가 읽는 컬럼**이라 통합 테스트 2개 스위트가 깨졌다. 화면이 "아직 안 고름"을 해석하는 쪽이 범위가 훨씬 좁고 기존 데이터의 의미도 건드리지 않는다.

  **함께 고친 것 — 끊겨 있던 로스터 연결 (v1_api)**: 초기 라인업 생성 코드는 예전부터 `sourceParticipantId: player.id`(등록 명단 선수 id)를 넘기고 있었지만, **`V1GameParticipant` 에 그런 컬럼이 없어 그 값은 조용히 버려지고 있었다** — 남는 건 이름 문자열뿐이라 어느 참가자가 명단의 누구인지 알 방법이 없었다(동명이인이면 원리적으로 구분 불가). `V1GameParticipant.userId` 에 등록 명단의 `userId` 를 실어 그 연결을 실제로 저장한다.

  **모바일 포메이션 진입점 (v1_web)**: 포메이션 선택 기능은 이미 있었지만(자유 배치 + 프리셋 목록이 든 바텀시트), 모바일에서 그 문이 `배치 설정 · 3-1` **회색 버튼 하나**였다. 화면의 대부분을 피치가 차지하는데 그 피치를 바꾸는 유일한 손잡이가 작은 칩처럼 보여, 포메이션을 고르는 자리라는 게 읽히지 않았다. 시트 내용은 그대로 두고 진입점만 드롭다운형 줄로 승격한다 — **무엇을 고르는 자리인지**(`포메이션` 라벨), **지금 무엇인지**(시트 목록과 같은 문구: `3-1 · 라인 오브 스리 (필드 4명)`), **누를 수 있다는 것**(캐럿)을 셋 다 보이게 했다. 데스크톱은 원래 사이드 패널에 드롭다운이 항상 보이므로 변화 없다.

  제출 완료처럼 **편집이 닫힌 상태에서도 이 버튼이 활성**이던 것도 고쳤다(alpha 실측) — 눌러서 바꿔도 저장할 수단이 없어 헛수고가 된다.

- e6f77b3: 대회 경기장(필드) 등록 UI 추가 — 필드 담당자 배정이 막히던 것 해소 (#373)

  경기장 관련 백엔드 API는 전부 있었지만 프론트에 생성 호출부가 하나도 없어 필드가 영영 0건이었다. 스태프 배정 모달은 `FIELD_OPERATOR`를 고르면 담당 필드를 필수로 요구하는데, 선택지가 비어 있어 "배정하기" 버튼이 영구히 잠겼고 왜 막혔는지 설명도 없었다.

  - 스태프 화면에 **경기장(필드) 섹션**을 추가한다. 필드가 무엇인지 안내하고, 플랫폼 운영자가 이름을 넣어 등록할 수 있다(생성 권한은 서버가 플랫폼 운영자로 제한한다).
  - 스태프 배정 모달에서 필드가 0건이면 선택을 잠그고, "먼저 등록해 주세요"라는 다음 행동을 알려준다.

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

- 87dce01: 결과 검토 화면에 경기 세부 기록(골·도움·카드·파울) 표시 (#379)

  검토자가 점수 숫자만 보고 승인·반려를 결정해야 했다. 서버에는 확정된 이벤트 로그가 있는데 검토 화면이 그것을 읽지 않았다.

  승인 버튼보다 위에 세부 기록을 두어 근거를 먼저 보고 결정하게 하고, **"아직 기록되지 않음"과 "불러오지 못함"을 서로 다른 UI로 구분**한다. 조회 실패를 미기록으로 오인하면 검토자가 근거 없이 승인하게 되므로, 실패는 오류 상태와 다시 시도 경로로 표시한다.

- bcccaf2: 무효 처리한 경기 결과를 다시 입력할 수 있게 한다 (#380)

  결과를 무효 처리하면 정정 이력만 남고 새 결과를 넣을 방법이 없어 경기가 결과 미확정으로 영구 고착됐다. 무효 처리는 "경기의 끝"이 아니라 "지금 유효한 공식 결과가 없음"인데, 리비전 승계 규칙이 무효 상태를 시작점으로 허용하지 않았다.

  `VOID_REENTRY` 승계 목적을 추가해 권한자가 무효 리비전을 기반으로 새 초안을 만들고 다시 검토·확정할 수 있다. 기존 공식·무효 리비전과 감사 이력은 그대로 보존되고, 공개 결과는 현재 유효한 공식 결과만 반영한다.

- 30614bd: 조별 순위 펼침 상세에 결선 경기가 섞여 나오던 것 수정 (#381)

  순위·대진표 화면에서 조별 순위표의 팀을 펼치면 대회 전체 픽스처를 팀 id로만 걸러서, 같은 팀의 결선(4강·결승·3·4위전) 경기와 스코어가 조별 경기와 한 목록에 섞여 나왔다. 조별 순위 영역은 그 조에서 치른 경기만 보여주고, 결선은 오른쪽 "토너먼트 대진" 영역이 담당한다.

- 0081125: 라인업 피치에서 골키퍼 이름표가 보드 밖으로 잘려 이름을 아예 읽을 수 없던 문제를 고쳤다. 선수 이름표는 토큰 아래(`top: 100%`)에 고정으로 붙는데, 골키퍼 슬롯 좌표는 항상 y=6(화면 94% 지점)이라 이름표가 보드 경계를 넘어 `overflow: hidden`에 잘렸다 — alpha 실측에서 모바일(피치 높이 553px)과 데스크톱(521px) 양쪽에서 재현됐다. 피치 아래쪽 끝(화면 88% 아래)에 놓인 토큰은 이름표를 토큰 위로 올린다. 위로 올릴 때는 골키퍼 배지가 토큰 위로 4px 삐져나오는 것을 고려해 6px을 띄워 긴 이름에서도 배지와 겹치지 않게 했다.
- 06bd9e3: 라인업 피치 배치 보드가 우리 진영 절반만 그리고 있어 좌표계와 어긋나던 것을 풀 구장으로 교정했다(PR #429). 컨테이너 비율은 `PITCH_ASPECT`(105:68 = 풀 구장)를 쓰고 서버 프리셋 좌표는 최전방을 y=85까지 밀어 두는데 그림만 반쪽이라, 위쪽 절반이 라인 없는 빈 잔디로 남고 페널티박스가 세로로 두 배 늘어나 보였다. 이제 아래쪽 절반이 우리 진영(우리 골대가 화면 맨 아래), 위쪽 절반이 상대 진영, 하프라인이 정중앙이며 골키퍼(y=6)는 우리 페널티박스 안에, 풋살 PIVO(y=85)는 상대 페널티박스 안에 정확히 떨어진다. 치수는 FIFA 규격(105m×68m, 페널티박스 40.32m×16.5m, 골에어리어 18.32m×5.5m, 아크 반지름 9.15m, 페널티 스폿 11m, 골대 폭 7.32m)을 환산했고, `preserveAspectRatio="none"`로 축별 환산 계수가 달라 원은 `rx`/`ry`를 나눈 `<ellipse>`로 그려 화면에서 정원으로 보이게 했다. 좌표계 설명 주석(`formation-slots.ts`, `pitch-formation-editor.tsx`)도 "y=50 하프라인 · y=100 상대 골라인" 기준으로 함께 정정했다.
- 3725828: 라인업 포메이션 에디터의 피치 그림을 하프 코트에서 풀 구장으로 교정한다(PR #429). 컨테이너
  비율(`PITCH_ASPECT = 68/105`, FIFA 105m×68m)과 서버 프리셋 좌표는 풀 구장 기준인데 `PitchLines`
  SVG만 "우리 팀 진영 절반"을 그리고 있어, 위쪽 절반이 라인 없는 빈 잔디가 되고 하프 코트용
  라인이 풀 구장 비율 박스에 늘어나 페널티박스가 세로로 두 배가 돼 있었다.

  - 하프라인을 정중앙(`y=50`)으로 옮기고 센터서클 전체 + 양 진영의 페널티박스·골에어리어·
    페널티 스폿·페널티 아크·골대, 코너 아크 4곳을 추가했다.
  - 치수는 FIFA 규격 환산. `preserveAspectRatio="none"`이라 축별 계수가 달라 x축 1m=1.4118 /
    y축 1m=0.9143 단위로 나눠 적용한다(두 값 모두 화면에서는 같은 픽셀 → 등방).
  - 원은 `<circle>`이면 세로로 1.54배 찌그러지므로 `<ellipse rx/ry>`로 교체했다.

  좌표 데이터와 서버 프리셋(`competition-config.presets.ts`)은 변경하지 않았다 — 해석만
  `y=0` 우리 골라인 / `y=50` 하프라인 / `y=100` 상대 골라인으로 맞춘 것이라 기존 배치가 그대로
  제자리를 찾는다.

- 93113ce: 경기 클럭(`clockMs`)에 상한 검증이 없어, 운영자가 경기 종료를 누르지 않고 몇 시간 뒤 이벤트를 기록하면 그 값이 그대로 굳어 공개 화면에 `452′`처럼 말도 안 되는 시각이 노출되던 문제(알파 실측)를 고쳤다. 서버에서 하드 거부(422)하지는 않는다 — 현장에서 늦게라도 기록하려는 시도를 막는 게 잘못된 시각이 남는 것보다 나쁘고, 이미 기록된 이벤트를 소급 거부할 수도 없기 때문이다. 대신 (1) 운영 콘솔은 캡처한 시각이 그 피리어드의 설정된 길이(`durationMinutes`)의 2배를 넘으면 제출 직전 운영자에게 확인을 요구하고(`isClockSuspicious`), (2) 공개 일정/상세 화면(`schedule-content.tsx`/`match-detail-content.tsx`)은 이미 기록된 값이 90분(알려진 프리셋 최댓값의 2배)을 넘으면 숫자는 그대로 둔 채 경고 표식만 덧붙인다(`isClockAbnormal`).
- 4a5ce88: 현장 운영 콘솔(`operate-console.tsx`)의 표현 계층 결함 2건을 고쳤다. (1) 액션 버튼 그리드에서 실제 사용 빈도·중요도가 가장 낮은 축인 "교체"만 전폭(2칸)을 차지해 화면에서 가장 큰 버튼이 되던 위계 역전을 바로잡았다 — 전폭 자리를 빈도가 압도적으로 높은 "골"로 옮기고(모바일: 골 단독 한 줄 + 높이 강조, sm 이상: 6열 그리드에서 골만 2칸), 나머지 네 버튼(옐로카드/레드카드/파울/교체)은 2×2로 가지런히 배치했다. 색은 전부 outline 중립을 유지해(R-K5 "동급 CTA 1개" 원칙 유지) 위계는 오직 크기·위치로만 전달한다. "빠른 교체 모드 켜기" 토글도 `self-start`(왼쪽 정렬 소형)에서 전폭(`block`)으로 바꿔 위 그리드와 좌우 경계를 맞췄다. (2) `team-foul-counter-bar.tsx`의 표시 전용 파울 카운터가 바로 아래 액션 버튼과 같은 `rounded-lg border` 카드 스타일을 써서 눌러도 되는 것처럼 보이던 문제를, 테두리 없는 단일 표면(`--surface-soft`) + 팀 사이 구분선(`divide-x`)으로 바꿔 어포던스를 분리했다 — 이 화면에서 "테두리 있는 사각형 = 누를 수 있다"는 문법이 액션 버튼 하나에만 남는다. 기능·이벤트 기록 로직, `allowTeamOnly` 정책은 변경하지 않았다.
- 0a51d54: 운영 보드 데스크톱 표의 경기 번호 표기를 모바일 카드와 통일한다

  PR #364에서 모바일 카드만 "4강 · 4번 경기"로 고치고 데스크톱 표는 "4강 4경기"로 남아 있었다. 같은 데이터를 그리는 두 경로가 서로 다른 표기를 쓰면 화면 폭에 따라 다른 말이 보인다. "N경기"는 "그 라운드의 N번째 경기"로 오독되지만 `fixtureNumber`는 대회 전체 연번이다.

  팀 이름을 아직 못 받은 경우의 폴백 라벨도 같은 표기로 맞춘다.

- b25b123: 운영 보드에서 해소할 수단이 없는 경고(경기장 미배정·담당자 미배정)를 숨긴다

  경기장 배정 API(`PATCH /tournament-ops/tournaments/:id/fixtures/:fixtureId/field`)는 백엔드에 있지만 그것을 호출하는 화면이 없다. 그래서 "경기장 미배정" 경고는 모든 경기에 영구히 뜨고 운영자가 끌 방법이 없다. "담당자 미배정"도 같이 묶인다 — 필드 담당자 커버 판정이 픽스처의 `fieldId`를 기준으로 하므로, 경기장을 채우지 못하는 한 스태프를 배정해도 경고가 사라지지 않는다.

  해소 불가능한 경고가 상시 켜져 있으면 배지 줄이 늘 주황색이라, 실제로 조치가 필요한 경고(득점자 미기재·검토 기한 초과·라인업 미제출)까지 함께 묻힌다.

  배지와 경고 필터 양쪽에서 두 코드를 제외한다. 백엔드는 계속 두 코드를 계산해 내려주므로 데이터는 그대로이고, 배정 UI가 생기면 프론트의 배열 하나를 비워 되돌릴 수 있다.

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

- 377f6af: 라인업 피치 배치 화면의 두 가지 UX 문제를 고쳤다.

  **피치 비율** — 데스크톱에서 `.tm-pitch-board`가 뷰포트 안에 들어오도록 `max-height`를 거는데, 높이만 자르고 폭은 420px로 두어 `aspect-ratio`가 무시됐다(실측 420×521 = 1.24, 규격 비율은 1.544). 축구장이 뭉툭하게 눌려 보였고, 세로 여백이 줄어 골키퍼 이름표가 피치 밖으로 잘리기까지 했다. 같은 상한을 `--tm-pitch-max-h` 변수로 빼고 `--tm-pitch-max-width`를 `calc(높이 / 1.54412)`로 연동해, 높이가 잘리는 만큼 폭도 함께 줄어 비율이 항상 유지되도록 했다. 폭 값은 CSS가 변수로 넘겨주고 인라인 style이 fallback(420px)과 함께 읽는다 — 인라인이 클래스보다 우선하므로 이 방향이라야 데스크톱에서 덮어쓸 수 있다.

  **포메이션 선택** — 좁은 패널에서 `<select>` 옵션 문자열이 잘려("1-2-1 · 다이아몬드 (필드 4명" 까지만 보임) 무엇을 고르는지 알기 어려웠고, 이름만으로는 어떤 배치인지 알 수 없어 하나씩 골라 피치를 확인해야 했다. 드롭다운을 각 포메이션의 **미니 배치 프리뷰가 붙은 칩 그리드**로 교체했다. 칩은 여는 단계 없이 선택지 전체를 한 번에 보여주고 각각이 44px 이상의 터치 타겟이 된다. 미니 프리뷰는 실제 배치 보드와 같은 좌표계(y=0 우리 골라인 · y=100 상대 골라인)로 그려 칩에서 본 모양이 그대로 피치에 놓이며, 골키퍼는 다른 색으로 구분한다. 단일 선택은 `aria-pressed` 토글 버튼 그룹으로 표현한다.

- 82e02bf: 대회 목록 하단 "대회는 이렇게 진행돼요" 섹션에서 제목과 단계 카드가 붙어 보이던 문제를 고쳤다. `.tm-tournament-promo-section-title`의 `margin`이 `0`이라 제목과 바로 아래 스텝 그리드 사이 간격이 실측 **0px**였고(alpha 실측: mobile 390 / tablet 768 / desktop 1440 모두 0), 시각적으로 남는 건 h2 line-box의 half-leading 약 4px뿐이라 24px 패딩을 가진 카드 상단에 제목이 눌린 것처럼 보였다. 위쪽 섹션 패딩은 28px인데 아래는 0이라 제목이 어느 쪽에도 속하지 않는 애매한 위치였다.

  반응형 분기(base / ≥1024 / ≥1440 / ≤359)를 전수 확인해 실제로 이 관계를 바꾸는 두 구간에만 값을 넣었다. 모바일·태블릿(<1024, 아이콘 스텝퍼)은 그리드 행 간격과 같은 **12px**, 데스크탑(≥1024, grey50 카드 그리드)은 그리드 gap과 같은 **16px** — 제목-콘텐츠 간격을 각 레이아웃이 이미 쓰는 간격 값에 맞춰 세로 리듬을 통일했다. ≥1440과 ≤359는 이 섹션의 레이아웃을 바꾸지 않으므로 각각 1024·base 값을 그대로 상속한다.

- aa3e447: 공개 화면(홈·대진표/브래킷·순위·대회 결과·시상/후기·매치 라인업 피치 등)에 남아 있던
  12px 미만 `font-size`를 R-T2(`docs/design/toss-reference-rubric.md`) 기준으로 정리했다.
  직전 PR #396은 운영/관리자 화면만 다루고 공개 화면은 범위 밖으로 남겼는데, 이번에 그
  나머지를 마무리한다.

  - **전수 검색 결과**: `globals.css`의 하드코딩 `font-size: 9|10|11px` 30곳(선언 기준)과
    TSX 인라인 `fontSize` 41곳, 총 71곳을 찾았다. 사용자가 준 초기 추정(29곳)은 `globals.css`
    범위만 센 것이었고 TSX 인라인 스타일은 별도 전수검색으로 추가 확인했다.
  - **토큰으로 상향**: 대부분을 PR #396과 동일한 방식(`var(--font-size-caption)`, 12px)으로
    올렸다. 고정폭/고정높이 배지·칩은 실제 콘텐츠(숫자·라벨)가 들어갈 여유가 있는지 개별
    확인한 뒤 올렸다 — border-box 계산까지 반영(`.tm-floating-count` 20px 박스는 border 2px
    감안 실질 16px 등).
  - **9px→12px(33% 증가) 케이스**: 홈 화면의 "명"/"팀" 단위 표기(알파 실측에서 가장 심했던
    자리)는 부모가 `flexWrap:wrap`이거나 폭 제약이 없어 폰트만 올려도 레이아웃이 안전했다.
    피치 라인업 편집기의 GK 코너 배지(8px)도 44px 토큰 안에서 여유가 있어 올렸다.
  - **죽은 CSS 함께 정리**: 위반 셀렉터를 하나씩 확인하다 TSX 어디서도 참조되지 않는 죽은
    규칙을 다수 발견해 같은 변경에서 삭제했다 — `.tm-text-micro`(11px→토큰, 공개 화면 전역
    50곳 넘게 쓰여 콜사이트 대신 정의 자체를 올림) 외에 `.tm-team-thumb*`, `.v1-tab`/
    `.v1-tab-active`, `.tm-team-avatar`, `.tm-bk-round-label`/`-status`/`-third-label`,
    `.tm-wc-team-avatar`, `.tm-podium-name`/`-stat`/`-platform-label`,
    `.tm-match-result-round`/`-date`/`-note`/`-winner-badge`, `.tm-review-card-team`,
    `.tm-tourn-hero-full .tm-res-hero-stats .tm-res-hero-stat-label`, Tailwind `text-2xs`
    유틸리티. 각각의 접두사 계열 중 폰트 크기 위반이 아닌 나머지 죽은 규칙(예: `.tm-wc-*`
    나머지 40여 개, `.tm-podium-*`/`.tm-match-result-*` 나머지)은 이번 작업 범위 밖이라
    남겨뒀다 — 별도 죽은 코드 정리가 필요하다.
  - **예외로 남긴 곳**: `.tm-unread-badge`(알림 벨 위 숫자 배지, 16px 박스에서 border
    제외 실질 12px라 12px 토큰조차 못 들어감)와 `.tm-bk2-avatar`(대진표 22px 원 안 이니셜,
    옆 팀명이 이미 12px 이상이라 원 안 텍스트는 장식성 — PR #396 시절부터 있던 기존 예외)
    두 곳만 근거 주석과 함께 11px로 유지했다.

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

- b196797: 결과 정정/재제출 모달(`ResultEditModal`)의 참가자별 기록 입력 폼이 선수 이름 대신 "홈 · 참가자 dc52c8" 처럼 참가자 id 뒷자리만 보여주던 문제를 고쳤다. 같은 경기의 운영 콘솔(`/tournament-ops/.../operate`)은 라인업 스냅샷으로 이미 실명을 표시하고 있었는데, 이 모달만 그 데이터를 받지 않아 운영자가 누구의 득점·카드인지 구분할 수 없었다. 이제 정정 패널(`GameResultCorrectionPanel`)과 재제출 패널(`GameResultReviewPanel`)이 `GET /games/:gameId/lineups`(`useV1GameLineups`)로 라인업을 함께 불러와 `ResultEditModal`에 `lineups` prop으로 내려주고, 모달은 참가자 id → "#등번호 이름"을 매핑해 렌더한다(라인업 응답의 참가자 `id`는 결과 기록의 `participantId`와 같은 `V1GameParticipant.id`를 가리킨다). 라인업에 없는 참가자는 이름을 지어내지 않고 기존 폴백(사이드 + id 뒷자리)에 "(라인업에 없음)"을 덧붙여 폴백임을 드러낸다.
- 6536060: 최종결과 화면의 조별·결선 분류를 라운드 라벨 문자열이 아니라 **편성(`groups[].phase`) 기준**으로 고친다.

  **증상**: 최종결과 화면이 "조별리그 경기 0경기"와 "조별리그 경기가 아직 등록되지 않았어요"를 보여주는데, 같은 대회의 경기 일정 화면에는 그 조별 경기들이 정상적으로 떠 있었다(A조·B조, 결과까지 등록됨).

  **원인**: `isGroupStageFixture()`가 `GROUP_ROUNDS = ['group', '조별리그']` 정확일치로 판정했다. `round`는 대회마다 운영진이 정하는 자유 라벨이라 이 목록으로는 못 따라간다 — alpha 실측(2026-08-13) 분포는 `'group'` 12건, `'조별 1라운드'` 10건, `'조별 2라운드'` 6건, `'조별 3라운드'` 6건이었고, 정작 상수에 적혀 있던 `'조별리그'`는 **한 건도 없었다.** 조별 경기 34건 중 22건(65%)이 화면에서 통째로 사라진 상태였다. 블록 자체는 `hasGroupPhase`가 true라 계속 렌더돼서, 사용자에게는 빈 화면이 아니라 "0경기"라는 **틀린 사실**로 보였다.

  **수정**: `createStageResolver(groups)`가 `groupId → phase` 표를 만들어 단계를 판정한다. `phase`는 백엔드가 관리하는 닫힌 값(`group|semi|final|third_place`)이라 새 라운드 라벨이 생겨도 깨지지 않는다. 라벨 매칭은 편성에 붙지 못한 경기(`groupId=null`, 편성 삭제)의 폴백으로만 남는다.

  **결선 분류기도 같은 결함을 갖고 있어 함께 정리**했다. 예전에는 바깥 필터와 `KnockoutResultsTable` 내부가 **각자** 라운드 문자열을 비교해서, 한쪽만 넓히면 "필터는 통과했는데 어느 카드에도 안 들어가 조용히 사라지는" 경기가 생길 수 있었다. 이제 판정은 `knockoutKind` 한 곳에서만 하고 테이블은 그 결과를 받아 쓴다 — 필터와 렌더가 항상 같은 집합을 본다. 알 수 없는 `phase`는 조별에도 결선에도 넣지 않는다(기존 동작과 동일, 잘못된 칸에 넣는 것보다 안전).

  **회귀 테스트**: 기존 테스트가 이 버그를 놓친 이유는 목 데이터가 `round: 'group'`(= 옛 상수에 있던 값)만 썼기 때문이다. alpha 실데이터 라벨(`'조별 1/2/3라운드'`, 편성 이름이 `'준결승1'`인데 `phase='final'`인 결승)로 4개 케이스를 추가했고, 네 건 모두 수정 전 코드에서 실패함을 확인했다.

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

- 5e98254: 리뷰 화면에 `ALREADY_SUBMITTED` 라는 API 에러 코드가 그대로 노출되던 것을 고친다.

  **증상**: 이미 후기를 쓴 대상 카드에 영문 코드 `ALREADY_SUBMITTED` 가 본문 텍스트로 찍혀
  있었다. alpha 화면 캡처로 확인했다 — `reviews-page.tsx` 가 서버의 `target.lockReason`
  (에러 코드값)을 사용자 문구로 옮기지 않고 그대로 렌더하고 있었다.

  **수정**: 코드 → 문구 변환을 뷰모델(`toTargetViewModel`)로 옮기고 `lockReasonLabel` 을
  새로 계산한다. `ALREADY_SUBMITTED` 는 같은 카드의 '작성됨' 배지가 이미 같은 사실을
  전달하므로 문구를 겹쳐 띄우지 않는다(정보가 사라지는 게 아니라 중복이 사라진다).

  **의도적으로 삼키지 않는 것**: 아직 매핑하지 않은 코드는 그대로 노출한다. 전부 감추면
  대상이 잠긴 이유를 사용자도 우리도 알 수 없게 되기 때문이다 — 새 코드가 생기면
  `LOCK_REASON_LABEL` 표에 문구를 추가하는 것이 정해진 대응이다. 이 두 갈래(알려진 코드는
  문구로, 모르는 코드는 원문 그대로)를 테스트로 못박았다.

- 1870aea: 진행 중 대회의 완료 경기 리뷰 진입을 사용자별 pending 상태로 제한하고, 팀장·운영진은 상대팀과 상대 선수를, 일반 팀원은 상대 선수만 평가하도록 권한 계약을 정리했습니다.

  대회 상세의 리뷰 가능 경기에는 정규 점수와 승부차기 PK 점수를 함께 표시합니다.

- a728be2: 경기 일정 카드의 **득점자 요약을 스코어 행과 같은 3열 축**에 정렬한다.

  **증상**: 득점자 줄이 팀명 축을 벗어나 가운데 스코어 칸 밑으로 파고들었다. 홈 득점자가 홈 팀명 아래가 아니라 스코어 쪽으로 밀려 있어, 어느 팀 골인지 좌우로 읽어내는 이 카드의 규칙이 흐려졌다.

  **원인**: 한 카드 안에서 "홈 | 스코어 | 원정"으로 쌓이는 두 행이 **3열 축을 각자 정의**했다. 스코어 행은 flex(`flex: 1` / `flex: 0 0 64px` / `flex: 1`, gap 10), 득점자 행은 grid(`1fr 20px 1fr`, gap 6)였다. 가운데 칸이 64px vs 20px, gap이 10 vs 6이라 좌우 트랙이 각각 `(32+10) - (10+6) = 26px`씩 더 벌어졌다 — 폭과 무관한 상수 오차다.

  **alpha 실측**(`/tournaments/aa100000-0000-4000-8000-000000000004/schedule`):

  | 축                    | 스코어 행 | 득점자 행 | 오차  |
  | --------------------- | --------- | --------- | ----- |
  | 홈 열 우단 (390px)    | 153px     | 179px     | +26px |
  | 원정 열 좌단 (390px)  | 237px     | 211px     | −26px |
  | 홈 열 우단 (1440px)   | 678px     | 704px     | +26px |
  | 원정 열 좌단 (1440px) | 762px     | 736px     | −26px |

  **수정**: 두 행이 `SCORE_AXIS_COLUMNS`/`SCORE_AXIS_COLUMN_GAP` 상수를 **공유**한다. 비슷한 값을 두 곳에 다시 적는 게 아니라 같은 정의를 소비하므로 한쪽만 손봐서 축이 갈리는 일이 구조적으로 불가능해진다. 스코어 행도 flex → grid로 바꿔 같은 축을 쓴다(현재 콘텐츠 기준 렌더 결과 동일 — 좌우 트랙 116px @390px).

  좌우 트랙은 기본 `1fr`(= `minmax(auto, 1fr)`) 대신 **`minmax(0, 1fr)`**로 고정했다. 긴 팀명이 트랙을 밀면 가운데 칸이 행 정중앙에서 이탈하는데, `PenaltyScoreline`("승부차기 4-3")은 `textAlign: center` 하나로 스코어 밑에 놓이도록 설계돼 있어 그 전제가 깨지면 보조 표기까지 함께 어긋난다. 이제 넘치는 이름은 줄바꿈으로 흡수한다.

  **범위 밖(의도적으로 남긴 것)**: 이상 클럭 경고 표식(`AbnormalClockBadge`)이 붙는 줄은 오른쪽 정렬 열의 맨 끝을 그 표식이 차지하므로, 같은 열의 다른 줄과 **선수 이름 우단이 표식 폭만큼 어긋난다**. 열 자체의 우단은 정렬돼 있고, 표식을 이름 앞으로 옮기거나 열 밖으로 빼는 것은 경고 표식의 배치 규칙(값 옆에 붙인다)을 바꾸는 별개 결정이라 이번 변경에 포함하지 않았다.

  **회귀 테스트**: 특정 열 폭 값을 단언하지 않는다(그건 구현 되읊기다). **"두 행이 같은 축을 쓴다"는 불변식**만 검증한다 — 득점자 행을 옛 축(`1fr 20px 1fr`)으로 되돌려 실제로 Red가 되는 것을 확인한 뒤 원복했다.

- 663f0d9: 스태프 화면에서 승부차기 결과가 보이지 않던 문제 수정.

  결선 무승부를 승부차기로 끝내면 서버에는 결과가 정상 저장되는데(`end` 커맨드의 `payload.penalties` → 결과 리비전 `score.penalties`), 정작 그 값을 입력한 스태프 쪽 화면 어디에도 표시되지 않았다. 알파 실측: 정규 0:0 · 승부차기 2:0으로 종료된 경기가 운영 콘솔에 `스코어 0 : 0`으로만 보였다. 공개 화면(대회 상세·브래킷·결과)에는 이미 나오고 있어 스태프만 자기가 기록한 값을 확인할 수 없는 상태였다.

  세 화면을 모두 고친다.

  - **운영 콘솔**: 승부차기는 골 이벤트가 아니라 결과 리비전에 저장돼 이벤트 파생 스코어로는 복원되지 않는다(종료와 동시에 입력 패널이 닫히면서 화면에서 사라졌다). 경기가 `ENDED`일 때만 결과 리비전을 조회해 헤더에 `승부차기 2:0` 칩을 남긴다. 확정본(`currentOfficialRevisionId`)이 있으면 그것을, 없으면(콘솔로 막 종료한 직후) 최신 리비전을 따른다.
  - **운영 보드**: 결과 칸 자체가 없어 종료 경기도 상태 배지만 보였다. `결과` 열(모바일은 상태 배지 아래)을 추가해 확정 스코어와 승부차기를 함께 보여준다. 확정 결과가 없는 경기는 `—` 로 비워 둔다(`0:0`을 지어내면 "득점 없이 끝난 경기"로 오독된다).
  - **결과 검수**: 상단 확정 스코어와 경기 목록에 승부차기를 병기한다.

  문구는 처리 이력이 이미 쓰던 `0:0 (승부차기 2:0)` 형태를 `lib/game-result-score`의 `formatGameResultScoreWithPenalties`로 끌어올려 화면마다 갈리지 않게 했다. 정규시간 점수만 뜻해야 하는 자리(순위 집계)는 기존 `formatGameResultScore`를 그대로 쓴다. 승부차기는 정규 점수와 다른 값이라 같은 줄에 섞지 않고 아래(또는 옆) 캡션으로 병기하며, 좌우 순서는 `sideKey`로 골라 헤더 스코어와 항상 일치시킨다.

- 9501a02: 팀 상세 페이지의 "주요 멤버" 미리보기(최대 8명)에 총원 안내와 프로필 진입점을 추가한다.

  - 총원이 미리보기 인원보다 많을 때만 "+ n명 더보기" CTA가 뜨고, 기존 `/teams/{teamId}/members`
    전체 목록으로 이동한다. 멤버 목록이 비공개인 팀에서는 미리보기와 함께 CTA도 노출되지 않는다.
  - 미리보기의 멤버를 누르면 `/users/{userId}` 공개 프로필로 이동한다(전체 멤버 목록 화면이 이미
    쓰던 링크 패턴 재사용).
  - 백엔드 `TeamsService.detail()`의 `membersPreview`가, 조회자 본인의 role 계산을 위해 함께
    내려오던 비활성(탈퇴·추방) 멤버십까지 미리보기에 섞이지 않도록 active 멤버십만 남기고 자른다
    — 탈퇴한 사람이 현재 멤버처럼 보이거나 깨진 프로필 링크로 이어지는 것을 막는다.

- 3362a3d: 팀매치/팀 일정 화면의 디자인 토큰 구멍과 카피 불일치를 고쳤다. (1) Tailwind v4 `@theme` 블록이 없어 `text-2xs` 유틸리티가 실제로는 CSS를 생성하지 않고 있었다 — 좁은 flex 행에서 캡션이 의도보다 크게 렌더돼 옆 버튼과 겹치는 원인이었다. `--font-size-micro(11px)`에 맞춘 `--text-2xs`를 정식 정의했다. (2) `lineup-client.tsx`의 `var(--red600, #c0392b)`(미정의 토큰, 항상 하드코딩 폴백만 적용)를 실제 존재하는 `--red700`으로, `team-schedules-page.tsx`의 `var(--border-subtle, #eee)`(역시 미정의)를 같은 파일에서 이미 쓰던 `--border` 토큰으로 교체해 팔레트에 없는 임의 색을 없앴다. (3) `globals.css`에 배경/전경/그레이/텍스트 핵심 토큰의 다크모드(`prefers-color-scheme: dark`) 변형을 추가했다 — 토큰을 직접 참조하는 컴포넌트는 자동으로 다크모드를 따라온다(개별 화면의 Tailwind 하드코딩 색까지 전부 대응하는 건 이번 범위 밖). (4) 팀매치 결과 화면의 카드 판정 용어를 운영 콘솔(tournament-ops)과 동일하게 `경고`/`퇴장` → `옐로카드`/`레드카드`로 통일하고(`CARD_TYPE_LABEL` 공용 상수로 추출), `팀 매치`(띄어쓰기)로 표기되던 4곳을 `팀매치`(붙여쓰기)로 통일했다.
- 231b72a: 약관 재동의(`/terms?mode=renewal`)에서 "동의하고 계속하기"를 첫 클릭했을 때, 서버에는 동의가 정상 반영됐는데도 화면이 목적지로 이동하지 못하고 `redirect` 쿼리만 자기 자신에게 붙인 채 멈춰 있던 문제를 고쳤다.

  원인은 `PendingSocialSignupGate`가 라우트 진입을 막을지 판단할 때 쓰는 `authMe` 캐시의 `termsCompliance`가, 동의 제출(`useV1AcceptSignupTerms`)이 성공한 직후 `invalidateQueries`로만 갱신되고 있었다는 것이다. `invalidateQueries`는 백그라운드 refetch를 예약할 뿐 즉시 끝나지 않기 때문에, 곧바로 이어지는 `router.replace('/home')`이 refetch 완료보다 먼저 실행돼 게이트가 갱신 전 `compliant:false` 스냅샷을 읽고 사용자를 `/terms?mode=renewal&redirect=%2Fhome`로 다시 튕겨보냈다(첫 클릭이 반응 없어 보이는 원인). 두 번째 클릭이 통했던 건 그 사이에 백그라운드 refetch가 우연히 끝났기 때문일 뿐이었다.

  동의 제출 응답에 이미 서버가 재계산한 최신 `compliance`가 들어 있으므로, 이를 `authMe` 캐시에 동기적으로 반영해 레이스를 없앴다. `invalidateQueries` 호출은 다른 `authMe` 필드까지 최신화하기 위해 그대로 유지한다.

- d576a2f: 대회 관리·운영 화면 모바일 조작성 수정: 숫자 키패드, 터치 타깃, 중복·오독 문구

  - 관리자 대회 화면의 숫자 입력 4곳에 `inputMode="numeric"`을 추가한다(대진 경기 번호, 혼성 쿼터, 협찬 정렬, 홍보 카드 우선순위). 모바일에서 문자 키보드가 떠 숫자를 넣기 불편했다.
  - 개인 어워드 "항목 삭제" 버튼의 히트 영역을 24px에서 44px로 넓힌다. 되돌릴 수 없는 동작인데 손가락으로 정확히 누르기 어려웠다.
  - 운영 보드 "운영 콘솔로 이동" 링크 높이를 36px에서 44px로 올린다. 현장에서 가장 자주 누르는 진입점이다.
  - 운영 보드 카드에서 "필드 미배정"이 본문과 경고 배지로 두 번 표시되던 것을 배지 하나로 정리한다.
  - 경기 번호 표기를 "4강 4경기"에서 "4강 · 4번 경기"로 바꾼다. 앞의 표기는 "4강의 4번째 경기"로 오독되지만 실제로는 대회 전체 연번이다.
  - 대회 취소 확인 모달에서 닫기 버튼을 "돌아가기"로 바꾼다. "취소"(모달 닫기)와 "대회 취소"(대회를 없앰)가 나란히 있어 오독 위험이 있었다.

- f947ff4: 대회 상세 화면(`/tournaments/:id`)의 타입 위계를 정리했다. 알파 390px 실측에서 폰트 크기가 7종(11~24px)까지 흩어져 있었고 그중 11px 텍스트 19개(상품·상금 라벨, 경기 시각·장소, 공지 날짜 등 실제로 읽어야 하는 정보)가 모바일 가독성 하한(12px) 아래였다. 정보 위계를 4단계로 재정의해 대응했다.

  | 단계 | 크기 | 토큰                  | 역할                                                                                    |
  | ---- | ---- | --------------------- | --------------------------------------------------------------------------------------- |
  | 1    | 24px | `--font-size-heading` | 대회 제목(h1) — 화면당 1회                                                              |
  | 2    | 17px | `--font-size-body-lg` | 섹션 헤딩(대회 규정·공지사항 등) + 핵심 강조값(팀명·상금액·정원 숫자·1차 CTA 버튼 라벨) |
  | 3    | 13px | `--font-size-label`   | 라벨·보조 제목(아코디언 타이틀, InfoRow 값, 정원 단위)                                  |
  | 4    | 12px | `--font-size-caption` | 캡션·메타(라벨, 시간·장소, 상태 배지, 상금 칩, 규정/환불/유의사항 본문)                 |

  주요 변경:

  - `.tm-text-micro`(11px)로 렌더되던 5곳(상품·상금 eyebrow, 상금 칩, 경기 시각, 경기 장소, 공지 날짜)을 `.tm-text-caption`(12px)으로 승격 — 전역 `tm-text-micro`/`--font-size-micro` 토큰 자체는 다른 화면에서 계속 쓰이므로 값을 바꾸지 않고 이 화면의 사용처만 교체했다.
  - 인라인 `fontSize: 11`/`10`(LIVE·종료 배지, 참가 전 유의사항 라벨)을 `var(--font-size-caption)` 토큰으로 교체.
  - 인라인 `fontSize: 14`(CTA 버튼 라벨류)와 `fontSize: 15`(완료 대회 결과 히어로 타이틀, 참가 신청 버튼)처럼 1~2번만 쓰이던 잡음 크기를 없애고, "1차 액션 CTA"라는 동일 역할로 통합해 2단계(17px)에 흡수했다.
  - `.tm-text-body`(15px)로 렌더되던 대회 규정 본문 2곳을 `.tm-text-caption`(12px)으로 통일 — 환불 정책·참가 전 유의사항 등 같은 화면의 다른 정책성 본문 텍스트와 이미 12px로 일관되어 있던 것에 맞췄다.
  - `.tm-btn-lg`(전역 15px 버튼 클래스)의 정의는 건드리지 않고, 이 화면에서 소비하는 3곳(내 신청 보기/모집 마감/참가 신청하기)에만 로컬 `style` 오버라이드로 17px을 적용했다.

  44px 터치 타깃(R-K5), 색상 사용, 기능·데이터 흐름은 변경하지 않았다. 표현 계층(폰트 크기·클래스)만 수정.

- 9877867: 대회 경기 라인업 화면(`/tournaments/:id/matches/:fixtureId/lineup`)을 사용자 지적
  2건(등번호 입력이 안 보임, 데스크톱에서 굳이 탭으로 나뉨) + 후속 라이브 스크린샷
  검수 7건을 반영해 손질했다.

  ## 사용자 지적 3건

  - **등번호 입력이 "전혀 없는 것처럼" 보이던 문제**: 이름·버튼들 사이에 낀 56px
    빈 칸(placeholder 없음, 라벨 없음)을 선발·후보 각 행 아래 줄에 `등번호 (선택)`
    라벨이 붙은 독립된 입력으로 분리. placeholder도 `번호`로 바꿔 빈 값일 때도
    입력 가능한 필드임이 드러나게 했다.
  - **데스크톱에서 피치 배치/명단이 탭으로 갈라져 있던 문제**: 두 영역을 탭으로
    마운트/언마운트하지 않고 항상 함께 렌더링해, 모바일·태블릿(<1024px)에서는
    CSS로 활성 탭만 보여주고 데스크톱(≥1024px)에서는 2컬럼 그리드로 동시에
    노출한다. 탭은 데스크톱에서 숨긴다.
  - **항상 피치 배치가 먼저**: 기본 활성 탭, 탭 버튼 순서, 데스크톱 2컬럼의 좌측
    배치 모두 피치 배치가 명단보다 앞선다.

  ## 라이브 스크린샷 검수 후속 7건

  - **피치가 위아래로 잘려 보이던 문제(치명)**: 데스크톱에서 피치 컨테이너
    (`pitch-formation-editor.tsx`)에 `max-height: clamp(260px, calc(100dvh - 479px),
560px)`를 걸어, 뷰포트 높이와 무관하게 골 지역까지 스크롤 없이 들어오게 했다
    (모바일/태블릿은 그대로 — 스크롤이 기본 탐색이라 문제가 없었다).
  - **선발 전원이 골키퍼처럼 보이던 문제**: GK 토글 버튼의 미지정 상태를 점선
    아웃라인(이 화면의 "빈 슬롯 탭해서 채우기" 관용구와 동일)으로, 지정 상태는
    피치 토큰과 같은 orange700 채움 배지로 바꿔 눌린 것과 안 눌린 것이 한눈에
    갈리게 했다.
  - **"저장" 버튼이 비활성처럼 보이던 문제**: `tm-btn-neutral`의 채움색이
    `globals.css`의 `.tm-btn:disabled` 배경과 완전히 같은 색이라 활성 상태도
    비활성처럼 읽혔다 — 이 화면의 "후보로"/"제외"와 이미 같은 언어인
    `tm-btn-outline`으로 교체(전역 버튼 시스템은 건드리지 않음, 이 인스턴스만).
  - **등번호 필수 여부가 불명확하던 문제**: 저장·제출 모두 등번호가 없어도
    막히지 않는다(백엔드 DTO도 optional) — 라벨에 `(선택)`을 명시.
  - 하단 고정 CTA 바가 콘텐츠를 가리는 것처럼 보인 스크린샷은 Playwright
    fullPage 캡처가 `position: fixed` 요소를 뷰포트 기준 한 번만 합성하는
    알려진 한계였다(실제 스크롤 시 콘텐츠는 항상 도달 가능함을 getBoundingClientRect
    실측으로 확인) — 최종 갤러리는 뷰포트 스크린샷으로 교체.
  - 하단 좌측의 빨간 원형 배지는 Next.js 개발 서버 전용 dev overlay(1 Issue 배지)로
    프로덕션에는 없다 — 코드 수정 대상 아님, 최종 스크린샷에서는 숨겨서 캡처했다.
  - 우측 하단 "맨 위로 이동" 버튼(`DesktopScrollTop`)은 모든 데스크톱 페이지가
    공유하는 컴포넌트라 이번 스코프(라인업 화면 + 피치 컴포넌트)에서 건드리지
    않았다 — 이미 `aria-label="맨 위로 이동"`으로 접근 가능한 이름은 갖고 있다.

  ## 검증

  - `pnpm --filter v1_web exec tsc --noEmit`, `pnpm --filter v1_web lint`,
    `pnpm --filter v1_web test`(대상 스위트: lineup-client, fixture-lineup,
    pitch-formation-editor, formation-slots, team-matches lineup) 전부 통과.
  - Playwright로 mobile(390)/tablet(768)/desktop(1440) 실제 화면을 띄워
    before/after 스크린샷으로 확인.

- 30d1b0f: 대회 화면: 스태프 라인업 진입점 복구, 대진표 라벨 크기, 신청 불가 대회의 모순 CTA 제거

  - 경기 상세의 "라인업 관리" 링크를 대회 스태프에게도 보여준다. 스태프는 소속 팀이 없어(`mySideId === null`) 링크가 걸러졌는데, 라인업 화면은 이미 스태프가 양 팀 명단을 짤 수 있게 되어 있어 "권한은 있는데 들어갈 길이 없는" 상태였다.
  - 대진표 라벨을 12px로 올린다. "우승"이 8px, 라운드 칩("4강","결승")과 경기 시각이 각각 10px이라 모바일에서 읽기 어려웠다.
  - 소속 팀이 없는 사용자가 신청 불가 대회의 "내 신청"을 열면 "지금은 참가 신청을 받지 않아요" 바로 아래에 "팀 만들기"를 권하던 모순을 없앤다. 팀을 만들어도 그 대회엔 신청할 수 없다.

- 0de39e4: 대회 홍보 이미지 업로드가 413으로 실패하던 문제를 고치고, 커버 이미지를 홍보 카드의 기본 이미지로 공유하게 했다

  대회 생성에서 카드 홍보 이미지를 올리면 `{"statusCode":413,"code":"INTERNAL_ERROR","message":"File too large"}`로 실패했다. 원본 포스터가 `uploads.controller.ts`의 multer 하드캡(10MB)에서 잘려 `UploadsService`의 정밀 5MB 검증(한국어 400 메시지)에 닿지도 못했고, 프레임워크가 만든 413은 도메인 코드가 없어 `INTERNAL_ERROR` + 영어 메시지로 노출됐다(nginx `client_max_body_size`는 55m이라 무관). 웹 클라이언트에는 크기 검사도 압축도 없어 원본이 그대로 전송됐다.

  `lib/image-compress.ts`를 추가해 전송 전에 브라우저에서 축소·재인코딩한다 -- 긴 변 1920px·WebP q0.85로 시작해 한도 안에 들어올 때까지 품질(0.85→0.7→0.55)과 긴 변(1920→1440→1080)을 단계적으로 낮춘다. 홍보 카드의 실제 렌더 폭은 1200px 남짓이라 원본 해상도가 필요 없다. 1.5MB 이하 원본과 캔버스가 다루지 못하는 형식은 손대지 않고, 재인코딩이 원본보다 커지면 원본을 유지하며, 압축이 불가능하고 원본도 한도를 넘으면 무엇을 해야 하는지 알려주는 한국어 에러를 던진다. `useV1UploadImages`에 걸어 커버·홍보·후원사·캠페인·프로필 업로드가 모두 같은 경로를 탄다. 서버 쪽은 `AllExceptionsFilter`가 코드 없는 413만 `UPLOAD_FILE_TOO_LARGE` + 한국어 메시지로 승격하고, 서비스가 자체 코드를 붙인 413은 그대로 통과시킨다.

  같은 이미지를 세 번 올려야 했던 문제도 함께 고쳤다. `resolveTournamentImage`가 자리별 지정값 → 커버 → 다른 홍보 자리 순으로 폴백해, 이미지 1장만 올려도 홈 히어로·목록 캐러셀·목록 썸네일·OG 이미지가 모두 채워지고 자리마다 다른 이미지를 쓰고 싶으면 그 자리만 지정하면 된다. 폴백을 DB에 복사하지 않고 읽는 시점에 고르므로 커버만 교체해도 비워 둔 자리가 따라오고 "기본 사용"과 "개별 지정"이 계속 구분된다. 관리자 폼은 비어 있는 자리에 기본 이미지를 미리보기로 반영하고 현재 어느 쪽을 쓰는지 안내하며, 개별 지정을 "기본 이미지로" 버튼으로 되돌릴 수 있다.

- 4220492: 대회 진행 단계 라벨과 다음 단계 안내 문구를 12px로 올린다

  - 대회 진행 스테퍼의 단계명(조별리그/4강/결승)이 현재 단계만 12px이고 지나간·남은 단계는 11px이라 읽기 어려웠다. 전부 12px로 맞추고, 현재 단계 구분은 색과 굵기가 담당하도록 중복된 크기 선언을 제거한다.
  - 다음 단계 이동 카드의 비활성 안내("대회 종료 후 공개")가 10px이라 읽기 어려웠다. 12px로 올린다.

- b196ac0: 대회 화면 라이브 감사 수정: 마감 후 참가신청 안내 숨김, 경기 식별 정보 표시, 경고 라벨·브랜드명 통일

  - 신청을 받지 않는 대회(마감·진행 중·완료)에서 "참가 신청 안내" 단계 안내를 숨긴다. 따라 할 수 없는 안내가 노출돼 혼란을 줬다.
  - 결과 검토·결과 정정 목록에 팀 이름을 표시한다. 기존에는 "조별 1라운드 · 1경기"만 나와 어느 경기를 검토·정정하는지 알 수 없었다.
  - `MISSING_SCORER` 경고 라벨을 서버 의미(골에 득점자 미지정)에 맞춰 "득점자 미기재"로 통일한다. 운영 보드만 "기록자 없음"으로 표시해, 존재하지 않는 기록자 역할을 배정하려 헤매게 만들었다. 경고 라벨을 단일 출처(`WARNING_LABELS`)로 모아 화면 간 불일치를 막는다.
  - 브랜드명 표기를 "팀밋"으로 통일한다. 시상 화면 본문·공유 시트 제목의 "티밋", 신청 안내의 "TeamMeet"이 남아 있었다. 공유 시트 제목은 앱 밖으로 전파된다.

- 551ee4f: 투명한 대회 협찬 로고 뒤로 협찬사명 fallback 문자가 비치던 표시 오류를 수정하고, 로고의 긴 변이 정사각형 프레임 안에 맞도록 원본 비율을 유지한다.
- f107830: 알파 라이브 UI/UX 감사에서 나온 5건을 고쳤다.

  - **비활성 버튼 시각화**: 전역 `.tm-btn:disabled`가 outline 변형에서 활성 배경(`--bg` 흰색)과
    거의 구분되지 않던 문제(운영 콘솔 골/카드/파울/교체 버튼이 눌러봐야 안 눌리는지 알 수 있었음)를
    `.tm-btn-outline:disabled` 테두리 오버라이드 + 아이콘·색상 스와치 등 하드코딩된 색을 쓰는 자식
    요소를 `opacity`로 죽이는 규칙으로 해결했다(전역 CSS라 모든 화면에 적용됨). 로딩 스피너
    (`aria-busy="true"`)는 예외 처리해 처리 중 표시가 흐려지지 않는다.
  - **최소 폰트 12px**: 하단 탭바 라벨(홈/매치/대회/팀/마이, 11px)과 운영자 콘솔 전역(admin/
    tournament-ops/tournament-result-review)에서 12px 미만으로 발견된 모든 `font-size` 선언을
    디자인 토큰(`--font-size-caption`)으로 교체했다. 공개 사용자 화면(리뷰 카드·포디움·브라켓·
    홈 허브 등)의 11px는 이번 감사 범위(운영 화면) 밖이라 손대지 않았다.
  - **라인업 포지션 기본값**: 저장 로직 자체는 이미 올바르게 미지정 상태(`position: null`)를
    기본값으로 뒀다는 걸 코드로 확인했다 — 전원 GK로 "저장"되는 버그는 아니었다. 다만 대회
    fixture 라인업이 골키퍼를 저장할 때 종목과 무관하게 `'GK'`를 하드코딩해, 풋살(`GOLEIRO`)
    대회에서 실제 포지션 사전과 어긋난 값이 저장되는 문제를 발견해 `lineupConfig.positions`에서
    실제 코드를 읽도록 고쳤다. 팀매치 라인업 화면의 골키퍼 토글도 미지정 상태가 지정 상태와
    시각적으로 구분되지 않던 문제(대회 fixture 화면엔 이미 있던 점선/실선 구분)를 동일하게
    적용했다.
  - **운영 콘솔 데스크톱 레이아웃**: 1280px+에서 콘텐츠가 좁은 단일 컬럼(max-w-3xl)에 갇혀
    상단에만 몰리던 문제를 lg(1024px+) 2열 레이아웃(왼쪽 액션 버튼 primary, 오른쪽 기록된
    이벤트/전송 상태 secondary)으로 재배치했다. 액션 버튼은 데스크톱에서 더 크게(h-20→h-24,
    h-16→h-20) 키웠다. 모바일/태블릿 레이아웃은 변경하지 않았다.

- e7ff7c9: 대회 순위·대진표(`/tournaments/[id]/bracket`) 데스크톱(1440px) 레이아웃을 재균형했다. `group_knockout` 포맷에서 결선 대진표가 아직 공개되지 않은 동안(조별리그 진행 중)엔 유일한 실제 콘텐츠인 조별 순위표가 366px(35%)로 눌리고, "대진표는 조별리그가 끝난 후 공개돼요" 한 줄뿐인 빈 안내 카드가 650px(62%)를 차지하고 있었다 — 이제 대진표가 비어있을 때만 좌우 비율을 366:650에서 650:366으로 미러링해 순위표를 넓힌다. 대진표가 공개된 뒤의 비율(366:650, 4강+결승 대진이 스크롤 없이 들어가도록 이미 튜닝된 값)은 픽셀 하나 건드리지 않았다 — 오늘 이미 검증된 "채워진 상태"엔 회귀가 없다. 아울러 페이지 하단 이전/다음 네비게이터(`flownav`)가 `justify-content: flex-end`로 오른쪽에 몰려 좌측에 808px 고아 공백을 만들던 것을 이 페이지에서만 `space-between`으로 바꿔 좌우 양끝에 앵커했다(공유 클래스라 최종결과·시상 페이지는 영향 없음). 빈 상태 안내 카드는 "경기 일정" 탭이 동일 조건에 이미 쓰던 `EmptyState` 컴포넌트로 통일했다(하드코딩 `fontSize:13` 제거). 사용하지 않게 된 구버전 `.tm-flow-nav*` 클래스군(대체된 지 오래된 dead CSS, 실사용처 0건 확인)도 같은 파일·구역이라 함께 정리했다. 390px/768px(모바일·태블릿)은 세로 스택이라 영향 없음.
- 1342277: alpha(dev)의 앱 페이지 배경을 프로덕션(main)과 동일한 흰색(`--bg`)으로 되돌렸다.

  `.tm-app-frame`의 페이지 배경은 2026-08-05 커밋(제목은 "일정 상세·생성 화면 모바일 좌우 여백 0 버그 수정")에 묻어서 `var(--bg)` → `var(--grey50)`으로 바뀌었고, 그 뒤 8/11~8/12 사이의 여러 "배경 토큰 충돌" 수정들이 *회색 페이지 배경*을 전제로 자식 요소를 흰 카드(`--card-surface`)나 한 단계 진한 회색(`grey100`/`grey150`)으로 끌어올렸다. 그 결과 alpha는 프로덕션과 다른 회색 셸(#f9fafb)로 렌더됐다 — 라이브 실측: main `rgb(255,255,255)` vs alpha `rgb(249,250,251)`. 두 환경의 토큰 값(`--bg: #ffffff`, `--grey50: #f9fafb`)은 원래 동일했고 차이는 오직 이 한 줄의 참조였다.

  이번 변경은 페이지 배경을 `--bg`로 되돌리고, **그 변경에 종속돼 파생된 자식 배경들만** main 값으로 함께 복원한다(페이지 프레임과 무관한 결함 수정은 유지):

  - 복원: 페이지 프레임, 홈 퀵액션 패널, 리텐션 CTA 카드, 마이 프로필 헤더(모바일·데스크톱), 매치/팀매치 요약바, 생성 위저드 입력창·스테퍼, 조별리그 펼치기 버튼, 결과 점수 pill·최종순위표, 3·4위전 카드, 로딩 스켈레톤, 데스크톱 푸터·알림 hover·매치 목록 hover, 대회 상세/참여/내 신청 안내 카드, 팀·대회·프로필의 빈 상태·에러 카드
  - 유지: 텍스트·아이콘 대비 개선(`*-500` → `*-700`), 입력창 보더(`--border-strong`), 다크모드 전체, 그리고 **페이지 배경과 무관한** 결함 수정(흰 카드 내부의 프로필 레벨 패널·리뷰 아바타·마이 메뉴 아이콘, 채팅방 배경과 충돌하던 시스템 메시지 pill, 퀵액션 아이콘 타일)

  다크모드는 페이지 배경이 `--bg`(#121317)가 되면서 그 위의 `--grey50`(#1a1c22) 한 단계가 라이트와 동일한 구조로 정렬된다. 다크에서 명도차가 덜 읽히는 요약바 계열은 기존 `:root.dark` 오버라이드(grey150)를 그대로 둔다.

- 7cd193b: 대회 상세의 "전체 경기 일정 보기" 링크에 `minHeight: 44`를 추가해 44px 터치 타겟 기준을 충족시켰다(기존 실측 높이 약 36px). 또한 `.tm-my-monthly` grid의 `border-right` 제거 규칙이 DOM 전체의 마지막 자식에만 적용돼 홀수 개(3개) 자식일 때 1행 2열 셀에 불필요한 우측 border가 남던 문제를, `:nth-child(2n)`(우측 열) 규칙을 병행 적용해 고쳤다. 공개 목록에 노출된 placeholder 대회 건은 코드 결함이 아니라(공개 게이트·promo opt-in 토글이 이미 이중으로 존재) 운영 데이터 정리 대상으로 판정해 코드 변경하지 않았다.
- 2e5e9a1: 경기 운영 콘솔(`tournament-ops`)의 시각 요소를 오너 실사용 피드백대로 개선했다. (1) 경과 시간 표시를 스톱워치 전용 포맷(`formatStopwatchClock`)으로 새로 만들어, alpha 실측에서 "전반 584:23"처럼 분이 무한히 커져 못 읽히던 문제를 자릿수 고정(mm:ss) + 60분 롤오버(h:mm:ss)로 고쳤다 — 기록·계산 계약(`elapsedMatchMs`/`formatMatchClock`)은 그대로 두고 표시 계층만 바꿨다. (2) 휴식(하프타임·부상 중단) 카운트다운을 추가했다 — 프리셋 1/2/5/10/15/20분, 서버 상태 없이 클라이언트 로컬로만 동작하며(새로고침하면 초기화된다는 한계를 화면에 명시) 종료 시 소리/진동 없이 큰 시각 알림으로 확인 전까지 사라지지 않는다. (3) 골 기록 직후 어시스트 추가 동선을 재설계했다 — 목록 행 중간에 침입하던 파란 테두리 칩을, 놓친 토스트의 2차 경로로서 해당 골 행에 자연스럽게 이어지는 전체 폭 줄로 바꿨다. (4) 명령 버튼(일시중지/전반종료/경기종료)에 아이콘을 더해 동작을 한눈에 구분되게 했다. (5) 액션 버튼 5개(골/옐로/레드/파울/교체)가 모바일 2열/데스크톱 4열에서 마지막 하나가 어색하게 혼자 줄바꿈되던 걸, 데스크톱은 5열 한 줄로, 모바일은 마지막 버튼이 그 줄을 꽉 채우도록 정리했다.
- c2c91f9: 대회 현장 운영 콘솔의 모바일 가독성을 고쳤다. 이 화면은 경기장에서 휴대폰으로 골·카드를 기록하는 용도인데, alpha 390px 실측에서 11px(`text-2xs`) 텍스트가 28개였고 그 안에 팀명·이벤트 시각·상태 뱃지·"스코어" 라벨 같은 핵심 식별 정보가 전부 들어 있었다. 햇빛 아래 한 손으로 조작하는 맥락에서 읽히지 않는 크기다. `--text-2xs` 는 앱 전역 유틸리티라 값을 바꾸지 않고, 이 화면 9개 파일에서만 하한을 12px 로 올렸다 — 타입 종류는 12/14/15/24 = 4종으로 유지돼 토스 루브릭 R-T1(4단계 이하)을 지킨다. 이벤트 로그의 팀 귀속 표기는 기록자가 매 행에서 즉시 확인해야 하는 정보인데 행에서 가장 약하게 표현돼 있어, 색을 더 쓰지 않고(R-C1·R-C3) 굵기로만 대비를 올렸다. 44px 최소 터치 타깃은 그대로다.
- 83e9075: 대회 운영진이 라인업을 제출할 수 없어 경기를 시작하지 못하던 순환 막다른 길을 고쳤다. 운영 콘솔은 라인업이 없으면 "경기 시작"을 비활성으로 두고 "라인업 제출하러 가기" 링크를 주는데, 그 링크가 가리키는 참가팀 매니저용 라인업 화면이 스태프를 "운영진은 대회 운영 콘솔을 이용해 주세요"로 되돌려보냈다. 그런데 tournament-ops 아래에는 라인업 화면이 아예 없어서(operate·result-review·records·operations·staff뿐), 운영 콘솔 → 매니저 화면 → 운영 콘솔로 도는 순환이 됐고 팀 매니저가 없는 자리에서는 경기를 시작할 방법이 없었다. 백엔드는 이미 이 경우를 예상해 `isStaff`·`homeSideId`·`awaySideId`·팀 이름을 함께 내려주고 있었으므로(`resolveFixtureLineupAccess`), 스태프에게는 편집할 팀을 고르게 하고 그 뒤 편집 UI는 매니저와 완전히 동일한 것을 재사용한다 — 화면을 새로 복제하지 않았다. 팀 소속도 스태프도 아닌 사용자는 그대로 막되, 문구를 실제 상황("이 경기의 라인업을 관리할 권한이 없어요")에 맞게 고쳤다.
- 6b67ad3: 팀매치 만들기 위저드의 진행 표시줄을 클릭 가능하게 만들어 특정 단계로 바로 이동할 수 있게 했다. 앞으로 가는 이동은 그 사이 단계가 모두 유효할 때만 허용되고, 비어 있으면 target 대신 첫 번째 무효 단계로 되돌아간다(스텝을 건너뛰어 필수값 검증을 우회하지 못하게). 매치 제목·지역·장소·날짜·시작 시간에는 값이 없는 동안 "필수 입력이에요" 안내를 추가했다.

  또한 일정 상세의 "완료 처리" 버튼이 경기가 아직 끝나지 않았을 때(`canComplete=false`) 통째로 사라지던 문제를 고쳤다 — 이제 버튼은 항상 렌더되고, 불가능할 때는 disabled 상태와 함께 "경기가 끝난 뒤에 완료 처리할 수 있어요." 같은 구체적인 사유를 보여준다.

- 72eb307: 대회 상세의 일정 카드와 `/bracket` 순위·대진표 화면을 오너 피드백대로 정리했다. (1) 대회 상세의 조별 일정 카드에서 점수와 득점자를 걷어내고 대진·시각·장소만 남겼다 — 대회 상세는 "언제·어디서·누가 붙는지"를 훑는 자리이고 결과는 `/bracket` 이 담당한다. 점수를 걷어내며 비어 보이던 카드는 축을 둘(메타·장소는 왼쪽, 대진은 가운데)로 정리했다. (2) 순위표에 전적(승-무-패)을 되살렸다 — 승점만으로는 3점이 1승인지 3무인지 알 수 없어 경기 수를 읽을 수 없었다. 390px 에서 팀명을 밀어내지 않도록 `1-0-0` 압축 표기를 쓰고 스크린리더에는 풀어서 읽힌다. (3) `/bracket` 의 두 탭을 세그먼트 컨트롤 형태로 바꿔 탭임이 드러나게 했다 — 파란 버튼과 회색 버튼이 나란히 있으면 탭이 아니라 버튼 두 개로 읽혔다. (4) "경기 일정" 탭이 옆 탭과 같은 순위표를 한 번 더 그리던 중복을 없앴다. (5) 순위표에서 팀을 누르면 팀 전적 페이지로 이동하는 대신 그 행 아래에 그 팀의 경기 상세가 펼쳐진다 — 화면을 통째로 갈아치우면 방금 보던 순위 맥락을 잃는다. 추가 네트워크 요청 없이 이미 받아 둔 픽스처만 쓴다. (6) 현장 운영 콘솔의 팀 파울 카운터에 남아 있던 11px 텍스트를 12px 로 올리고, 가독성 가드 테스트의 스캔 범위를 이 콘솔 전용 공유 컴포넌트까지 넓혔다.
- a402fc4: alpha 배포가 카카오 로그인에 **alpha 전용 콜백**(`ALPHA_KAKAO_REDIRECT_URI`)을 쓰게 되돌린다.

  `deploy-alpha.yml`이 웹 이미지 build-arg 에서 prod 와 같은 `secrets.KAKAO_REDIRECT_URI` 를
  쓰고 있어, alpha 에서 카카오 로그인을 하면 인가 URL 에 prod 콜백(`teameet.co.kr/callback/kakao`)이
  박혀 인증 후 프로덕션으로 튕겼다 — alpha 에서 카카오 로그인 완주가 불가능했다.

  이 분리는 원래 `c135ebe6`(2026-07-23, "alpha 카카오 로그인 redirect_uri를 프로덕션과 분리")로
  정확히 이 목적의 시크릿 `ALPHA_KAKAO_REDIRECT_URI` 를 만들며 해결됐는데, 이후 alpha 배포를
  매니페스트/SSM 방식으로 바꾼 리팩터에서 **배선만 끊겼다**(시크릿 자체는 GitHub 에 그대로 살아
  있음 — `gh secret list` 로 2026-07-23 생성 확인). 한 줄로 되돌린다. 새 시크릿 등록 불필요.

  **운영자 확인 필요**: 카카오 개발자 콘솔의 기존 앱(prod 와 동일 `KAKAO_CLIENT_ID`)에
  `https://alpha.teameet.co.kr/callback/kakao` 가 Redirect URI 로 등록돼 있는지 확인(없으면 추가,
  기존 prod URI 는 유지). 새 앱/새 client_id 는 불필요.

- a41d372: "매치 만들기" 입력창 시인성 fix에서 발견한 패턴(`.tm-create-input`이 페이지 프레임
  `.tm-app-frame`과 완전히 같은 `--grey50` 토큰을 raw로 참조 — 실측 1.05:1)이
  이 한 곳만의 문제인지 앱 전체를 ultracode 8도메인 감사로 확인했다. 결과: **동일
  패턴이 홈/매치/팀매치/대회/채팅/알림/마이페이지/리뷰 전반에 20곳** 있었다 — 다크모드
  세션 작업과 무관한, 훨씬 오래되고 넓은 기존 결함이었다.

  ## 확정 결함 20건 (severity: critical 5 · moderate 11 · minor 4)

  **가장 심각한 5건** — border도 없이 카드/패널 전체가 페이지에 완전히 녹아드는 경우:

  - 홈 화면 "바로가기" 퀵액션 패널(`.tm-quick-grid`) + 그 안의 44px 아이콘 타일
    (`.tm-quick-icon`) — 이중으로 겹쳐 묻혀 있었음
  - 매치 목록 "모집 중 N개" 요약 바(`.tm-match-summary-row`, 매치·팀매치 공용)
  - 리텐션 CTA 카드(`.tm-retention-card`)
  - 마이페이지 프로필 헤더(`.tm-my-profile-head`) — 아바타/이름 영역
  - 채팅방 시스템 메시지 pill(`.tm-chat-system-message`) — 라이트·다크 모두 ~1:1

  **나머지 15건**: 에러 상태 Card(매치/팀매치 목록, 신청자 관리 — 인라인
  `background: var(--grey50)`로 카드 기본값을 되돌려버린 3곳), 대진표 3·4위전 박스,
  대회 결과 펼치기 버튼, 시상 페이지 빈 상태 카드, 알림 카드 hover, 채팅 데스크톱
  빈 상태 아이콘, 프로필 레벨 패널·매너점수 박스, 리뷰 진행상태 카드, 마이메뉴
  아이콘 배지, 리뷰 아바타 등.

  ## 처리 방식

  각 결함을 2인 독립 스켑틱이 "부모-자식이 정말 같은 토큰을 쓰는지" 직접 재확인한
  뒤(반박 시도, 과반 생존만 확정) 수정했다. 전부 신규 토큰 발명 없이 기존 시맨틱
  토큰(`--card-surface`, `--border`/`--border-strong`, `--grey100`)을 재사용 —
  `.tm-app-frame`이 이미 갖고 있던 "카드=--card-surface로 페이지와 구분" 원칙을
  누락된 곳에 일관 적용했다.

  ## 알려진 한계 (정직한 공시)

  8개 도메인 중 2개(팀/용병, 공유 UI 프리미티브)는 이번 라운드 감사 에이전트가
  빈 결과("test")를 반환해 실질적으로 감사되지 않았다 — 후속 라운드에서 재실행 필요.
  특히 "공유 UI 프리미티브"는 여러 화면에서 재사용되는 만큼 파급력이 가장 클 수 있어
  우선순위가 높다.

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 211 suites/1337 tests
  전부 통과.

- 9c5dd59: Stop the tournament campaign test fixtures from expiring, which turned dev CI red on a date rollover with no code change behind it.

  Both campaign fixtures pinned `registrationDeadlineAt` to the absolute instant `2026-08-08T00:00:00.000Z`. Once that instant passed, `campaign('open')` no longer rendered as open: the "함께 뛸 팀을 기다리고 있어요" region and the "참가 신청하기" link disappeared, and two assertions in `tournament-campaign-template.test.tsx` started failing for every branch at once. The same fixtures also pinned `scheduledAt` to `2026-08-15`, so a second, identical failure was already scheduled for a week later.

  The dates are now derived from the run time — deadline at +7d, kickoff at +14d — so an `open` fixture is genuinely open whenever the suite runs. The test that exercises the deadline transition itself is unaffected: it already overrides the deadline explicitly and drives the clock with fake timers.

- b1c8d13: 앞서 공시한 "표본 검사 + 좁은 패턴 범위" 한계를 메우기 위해 전체 파일 대상 명암비
  전수 감사 + 사용자가 직접 잡아낸 것과 같은 UI/UX 관점(색상-의미 일관성, 클릭 가능성
  단서, 컴포넌트 재사용 일관성, 이미지 미리보기 정확성)을 ultracode 8도메인으로 재감사했다.
  확정 24건 — 전부 적용·`pnpm lint`+`pnpm test`(214 suites/1358 tests) 통과 확인.

  ## 명암비(WCAG AA) 12건

  - **뱃지 4종(`--blue/orange/green/red`)**: 자기 틴트 배경 위에서 500계열 텍스트가
    전부 미달(주황 1.97:1 최악) — 700계열로 교체. `--orange700` 자체도 뱃지 배경
    기준 재계산해 `#a36100`→`#965300`으로 한 단계 더 짙게 조정(4.487:1 근소 미달 해소)
  - 회원가입 에러 카드 헤드라인(red500→red700), 채팅 미읽음 카운트(orange500→orange700),
    "모두 읽었어요" 토스트(green500→green700), 온보딩 안내 캡션(orange/green tint 위
    grey600 미달→`--text`로 승격)
  - 시상대 순위 숫자가 사진 배경과 2.07:1 → 반투명 스크림 pill 배경 추가
  - 대회 상세 3곳(환불정책/참가전확인/일정없음 Card)이 페이지와 같은 grey50 →
    grey100으로 분리, StandingsMovedNotice는 border까지 추가
  - 결과 페이지 히어로 보조 캡션 0.35~0.4 opacity → 0.7로 상향
  - 신청자 아바타 폴백 글자 대비 개선
  - **어드민 systemic `text-gray-400` 20곳**(가장 큰 어드민 파일 하나에 몰려 있었음,
    다크모드 변형도 없어 라이트 실패+다크 무대응 이중 결함) + admin-data-table/
    admin-kpi-card/admin-shell 4곳 → 파일 내 기존 관례(`text-[var(--text-muted)]`,
    이미 같은 파일 다른 곳에서 80곳 넘게 쓰이고 있던 토큰)로 통일
  - entity-picker 선택칩 X 아이콘(`text-blue-400`, 3:1 미달) → `--blue700`

  ## UI/UX 패턴 11건 (사용자가 직접 지적한 것과 같은 결의 문제)

  - **홈 화면 에러+재시도 UI가 파일 안에 4가지 다른 구현으로 흩어져 있던 것** →
    전부 공유 `ErrorState` 프리미티브로 통일. 채팅 에러는 죽은 링크였던 것을 실제
    재시도 콜백(`chatRetry`)으로 교체(신규 쿼리 refetch 연결, 기능 추가)
  - **팀매치 상태배지 색 관례 역전 2건**: 목록의 "내 매치"=초록/"승인 완료"=파랑이
    개인 매치·같은 파일 내부 관례(초록=승인, 파랑=중립)와 반대였던 것을 바로잡음.
    경기결과 "SUBMITTED(상대팀 승인 대기)"도 파랑→주황("대기=주황" 관례 통일)
  - **라인업 정정요청 다이얼로그**가 직접 구현이라 ESC/포커스트랩/포커스복원이
    전혀 없었음 → 프로젝트 표준 패턴(`confirm-modal.tsx`)과 동일하게 추가
  - **대회 커버 이미지 업로더가 16:9 크롭을 권장하지만 실제 노출은 대회 카드의
    56×56 정사각 썸네일뿐**(대회 상세·목록 어디에도 와이드 히어로 사용처 없음) —
    미리보기를 1:1로 맞추고 안내 문구도 실제 노출 형태로 수정. 관리자가 와이드로
    프레이밍한 사진이 실제로는 좌우가 크게 잘려 보이던 미리보기-실사용 불일치 해소
  - 팀 상단 커버 이미지 미리보기 높이도 실제 상세 히어로 카드 높이(210px)로 재계산

  ## 부수 회귀 수정 1건

  - 위 홈 화면 리팩터 과정에서 `role="alert"`와 재시도 버튼 문구("다시 불러오기")가
    조용히 사라질 뻔한 것을 발견 — `ErrorState`가 자체 루트에 이미 `role="alert"`를
    갖고 있어(중첩 방지 위해 wrapper에는 다시 걸지 않음) 테스트를 실제 DOM 구조에
    맞게 고치고, `retryLabel="다시 불러오기"`를 4곳 모두에 명시해 기존 문구를 보존했다.

  ## 알려진 한계 + 스코프 사고 처리 (정직한 공시)

  - 대규모 8도메인 병렬 감사 중 세션 한도로 42건 수정 시도 중 일부가 미완료됐고,
    **일부 에이전트가 명시적 `apps/v1_web` 경로 지시에도 불구하고 무관한 별도 앱
    (`apps/web`)을 대상으로 삼은 사고가 있었다.** 확정 55건 중 31건이 `apps/web`
    대상이었음을 발견 즉시 전량 폐기(수정하지 않음) — main checkout에 실수로 반영된
    1개 파일, 이 워크트리에 반영된 2개 파일을 `git restore`로 되돌리고 `git status
--porcelain apps/web`이 양쪽 다 빈 것을 확인했다. 이번 커밋에는 `apps/v1_web`
    경로만 포함돼 있다.

- e2ec901: 라이트모드 스크린샷 피드백: 매치/팀/팀매치 생성 위저드의 제목·설명 입력창이
  페이지 배경과 구분이 안 되고, 대표(배경) 이미지 프리뷰 빈 상태도 애매했다.

  **근본 원인(다크모드 세션 작업과 무관, git blame으로 확인한 기존 코드)**:
  `.tm-create-input`의 `background: var(--grey50)`가 페이지 프레임(`.tm-app-frame`)의
  배경과 완전히 같은 토큰이라 fill만으로는 절대 구분되지 않았다(실측 대비 1.05:1).
  border(`--grey100`)도 1.10:1로 사실상 경계가 안 보였다.

  두 독립 설계안(A: 최소변경/기존토큰재사용, B: `.tm-input` 표준 시맨틱 토큰 정렬)을
  검토해 공통 결론(신규 토큰 발명 없이 기존 P1 컴포넌트 토큰 재사용)으로 수렴했다:

  - `.tm-create-input`: `background: var(--grey50)` → `var(--input-surface)`,
    `border: var(--grey100)` → `var(--border-strong)`
  - `.tm-create-image-preview`(빈 상태): `background-color: var(--grey150)` 추가
    (`.tm-auth-progress-bars`의 "아직 채워지지 않음" 세그먼트와 동일 시맨틱 재사용)
  - `.tm-create-stepper-button`(−/+ 버튼): 위 변경으로 가운데 select만 밝아지면
    스테퍼가 3분할처럼 보이는 부작용이 있어, 사용자 확인 후 동일 톤으로 통일

  **트레이드오프**: 이 값들도 엄밀한 WCAG 1.4.11 3:1은 충족하지 못한다(border
  1.40~1.46:1) — 앱 전체의 "헤어라인 미니멀" 보더 언어(CLAUDE.md) 안에서 인지 가능한
  최대치로 절충했다. 완전한 3:1 준수는 카드/입력창 전반의 보더 두께를 앱 전체에서
  바꿔야 하는 별도의 더 큰 작업이다.

  검증: `pnpm lint` clean, `pnpm test` 211 suites/1335 tests 통과. 이 화면은 로그인이
  필요해 alpha에서 dev-login으로 스크린샷 검증이 불가능한 화면이라, 배포 후 사용자가
  직접 실제 화면에서 확인 필요.

- 23ac6d4: 매치·팀매치 생성 위저드가 4번째 화면까지 아무 제지 없이 도달한 뒤에야 "종목, 지역, 제목, 장소, 날짜를 모두 입력해 주세요" 같은 고정 문구로 막던 문제를 고쳤다. 이미 채워둔 필드까지 결측으로 지목되는 사고(예: 종목·지역·제목은 이미 입력했는데도 전체 목록이 뜸)의 원인이던 boolean 단일 게이트를 제거하고, "다음"을 누른 시점에 그 스텝의 필수 필드만 로컬 검증해 비어 있으면 인라인 에러(아이콘+문구)와 함께 그 자리에서 막는다. 최종 확인 화면에서 실제로 비어 있는 필드만 지목하고 해당 스텝으로 바로 이동하는 링크를 제공하며, 이미 채운 스텝은 진행바에 완료 표시가 붙는다. 스텝별 즉시 검증과 최종 결측 안내는 신규 `matches.validation.ts`/`team-matches.validation.ts`의 동일한 필수 필드 테이블을 공유해 이번 버그의 근본 원인이었던 문자열 드리프트를 구조적으로 막는다.
- 70a1b9c: 이번 세션 다크모드 두 라운드(a063a195, 1e9fd4f0)를 5축(대비 재계산·배경충돌·
  미탐지 색상군·아이콘/그래픽·회귀 일관성) 독립 감사 + 2인 스켑틱 반박 라운드로
  적대적 재검증했다. 17건 발견 중 14건이 반박을 뚫고 생존해 확정됐다.

  ## 확정 결함 (14건)

  - **entity-picker.tsx**: 선택된 엔티티 칩 라벨이 `text-blue-800`(dark: 없음)
    이라 `--blue50` 다크 배경 블렌드 위에서 1.61:1까지 떨어짐 → `--blue700`로 교체.
  - **admin/page.tsx**: "주의 항목 없음" 배너가 `text-green-700`(dark: 없음)이라
    2.70~3.07:1 미달 → `--text-strong`로 대체(admin-status-pill.tsx 선례와 동일 패턴).
  - **`text-red-500`(Tailwind 고정값, 4.43:1) 반복 결함**: admin-data-table.tsx·
    admin-card-list.tsx(공유 컴포넌트, 여러 화면에 영향)와 grant/revoke-staff-modal,
    admin-reason-modal, operation-flag-gate-confirm-modal, tournament-campaign-editor
    (.tsx/-collections.tsx), staff-client.tsx, queue-status-panel.tsx,
    error-log-detail-modal.tsx, tournament-detail-client.tsx 등 12개 파일에 복붙돼
    있던 동일 패턴을 전부 `--red700`(이미 검증된 6.04:1)로 통일.
  - **tournament-detail-client.tsx**: '운영 콘솔 열기' CTA가 `text-green-600`(4.11:1
    미달, blue700/red700과 짝이 없던 유일한 색상)이라 **신규 토큰 `--green700`**
    (라이트 #037a4a, 다크 #2fe0a0)을 blue700/red700과 동일한 설계로 추가해 교체.
    '팀 배정하기'는 `text-blue-500`이 배경에 따라 결과가 갈리는 불안정한 색이라
    이미 앞선 라운드에서 통과값(`--blue700`)으로 대체돼 있었음을 재확인.
  - **error-logs-client.tsx**: `sourceTone()`의 client 배지만 `bg-purple-50
text-purple-700`에 dark: 짝이 없어(server 분기는 이미 토큰화) 다크 대응 추가
    (tournament-ops-shell.tsx의 기존 purple 컨벤션 재사용).
  - **pitch-formation-editor.tsx**: PlayerToken 원형 배경/GK 배지가 `--blue700`/
    `--orange700`를 썼는데, 이 두 토큰은 이번 세션 다크 오버라이드로 "카드 위
    텍스트"용 밝은 값으로 바뀌어 원형 배경 + 흰 텍스트 조합에선 오히려 대비가
    무너짐(≈2.4:1). 테마 무관 고정 chip 색 신규 토큰 `--player-marker-blue`/
    `--player-marker-orange`(라이트 700 hex 그대로 고정, kakao-yellow 패턴)로 분리.

  ## 운영 메모 — 워크트리 경로 혼선

  이번 워크플로의 일부 백그라운드 에이전트가 대상 워크트리 경로를 찾지 못해
  공유 메인 체크아웃(`dev` 브랜치)에 잘못 적용한 사례가 있었다. 발견 즉시
  diff를 전수 대조해 워크트리로 정확히 이식하고, 메인 체크아웃의 스트레이
  변경은 `git restore`로 되돌려 원래 상태(95→79건, 무관한 기존 변경 그대로)로
  복구했다.

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 210 suites/1333 tests
  전부 통과.

- a063a19: 사용자 지시("전체 다크모드 파악해서 글씨 대비·아이콘·그래픽 모두 파악")에 따라
  ultracode 다중 에이전트로 앱 전체(핵심 사용자 화면 + 어드민 + 운영콘솔) 텍스트
  대비·아이콘·배경을 전수검수하고 발견된 결함을 수정했다.

  ## 1. 시스템적 대비 결함 — 고정 강조색 토큰 (가장 중요한 발견)

  `--blue700`/`--orange700`/`--red700`는 원래 "라이트모드에서 500계열이 AA(4.5:1)를
  못 넘어 대신 쓰는 짙은 강조 텍스트색"으로 설계됐다(예: blue500 3.71:1 불통과 →
  blue700 5.41:1 통과). 그런데 이 고정 hex는 다크모드에서도 그대로 유지되면서
  배경만 어두워져 오히려 대비가 무너졌다 — 실측: blue700 3.08:1(카드)/2.6:1(자신의
  파스텔 배경), orange700 3.39/2.53, red700 2.56/2.16, 전부 4.5:1 미달. 세 토큰
  모두 `:root.dark`에서 밝은 값으로 재계산해 오버라이드했다(카드 표면·자신의 다크
  파스텔 배경 양쪽 4.5:1 이상 확보): blue700 `#6ba8ff`, orange700는 이미 다크에서
  잘 보이는 `--orange500` 재사용, red700은 파일에 이미 쓰이던 `#ff6b76`와 통일.
  이 토큰들을 텍스트로 쓰는 모든 화면(매치 업로드 에러, MVP 배지, 대회 카드,
  스탠딩, 팀매치 결과 등)이 이 한 번의 변경으로 함께 고쳐졌다.

  ## 2. 어드민 · 운영콘솔 raw Tailwind 클래스 → CSS 변수 토큰 전환

  기존 다크모드 작업은 핵심 사용자 화면 위주였고, 어드민(`/admin/**`)과 운영콘솔
  (`/tournament-ops/**`)에는 `text-gray-*`/`bg-gray-*`/`border-gray-*`/`bg-blue-50`/
  `text-blue-600`/`bg-red-50`/`text-red-600`/`bg-green-50`/`amber-*`/`bg-white`
  같은 raw Tailwind 클래스가 다크 대응 없이 대량으로 남아 있었다(77개 파일,
  1000여 곳). 9개 버킷으로 나눠 병렬 감사·치환·적대적 재검증을 거쳐 토큰으로
  전환했다(`text-gray-900`→`--text-strong`, `text-gray-700`→`--text-body`,
  `text-gray-600/500`→`--text-muted`, `bg-gray-50/100`→`--surface-soft`,
  `bg-blue-50`→`--blue50` 등). 검증 단계에서 실제 발견·수정한 사례:

  - **모달/카드 배경 미전환**: `bg-white`가 다크에서 뒤집히지 않아 그 안의(이미
    토큰화된) 텍스트가 근접색이 되며 안 보이던 결함 — 어드민 감사 로그·관리자
    권한부여·약관·팝업·공지·회원 상세 등 10여 개 모달/폼/카드에서 발견해 수정.
  - **부모-자식 배경 충돌**: 같은 토큰(`--surface-soft` 또는 `--card-surface`)을
    부모와 자식이 동시에 써서 뱃지·버튼·입력창이 카드 안에 묻히던 결함 — 예:
    운영 플래그 게이트 스텝 배지, 스켈레톤 thead, 문의 상세 상태변경
    select/button, 약관 편집 폼 필드 전체. 인접한 두 단계(surface-soft ↔
    card-surface)로 재배정해 해소.
  - **hover 색상 미전환**: `bg-[var(--surface-soft)]` 베이스에 `hover:bg-gray-200`
    (raw, 다크 미대응)가 남아 호버 시 밝은 회색이 번쩍이던 결함 — 20여 곳을
    `hover:bg-[var(--grey300)]` 등으로 통일(단, 이미 `dark:hover:` 짝이 있던
    2곳은 중복이라 원복).
  - **색상군 불일치**: `amber-*`(Tailwind 기본 팔레트)가 이 프로젝트의 브랜드
    주황(`--orange500` 계열)과 다른 색상이라 그대로 두면 시각적으로 어긋남 —
    `--orange700`/`--tint-orange`/`--tint-orange-border`로 통일.
    `--tint-orange-border`/`--tint-red`/`--tint-red-border` 토큰을 기존
    `--tint-blue`/`--tint-blue-border` 패턴을 따라 신규 추가.
  - 근접-검정 텍스트(`text-gray-950`, `text-amber-950`)가 다크에서 거의 안 보이던
    2곳을 `--text-strong`으로 교체.

  ## 3. 검증

  `pnpm lint`(tsc --noEmit + CSS 토큰 존재 검증) 클린, `pnpm test` 205 suites·
  1298 tests 전부 통과. 비활성(disabled) 버튼 저대비, 모달 백드롭 스크림, 사전에
  `dark:` 접두사로 이미 대응된 요소는 WCAG 예외/기존 정상 패턴이라 그대로 뒀다.

- df60ab1: alpha 라이브 재확인 중 발견: 하단 내비게이션 바(`.tm-bottom-nav`/`.v1-bottom-nav`),
  데스크톱 헤더(`.v1-header`), 스티키 서브내비(`.tm-hub-subnav`), muted 패널
  (`.v1-muted-panel`)이 CSS 변수 없이 `rgba(255, 255, 255, X)`로 흰 유리(glass)
  배경을 하드코딩하고 있어 다크모드에서도 밝게 남아 화면마다 상시 노출되는 크롬만
  튀는 문제가 있었다. `--surface`(#1c1e24) 계열 톤으로 다크 오버라이드를 추가했다.

  사진/영상 위 오버레이(`.tm-video-strip-play` 등)는 대상에서 제외했다 — 그건
  테마와 무관하게 항상 흰색이어야 하는 요소다.

- 791a309: alpha 실배포 후 라이브 확인 중 발견: 대회 목록의 "이벤트 허브" 배너를 비롯해
  `var(--blue50)`/`var(--orange50)`/`var(--red50)`/`var(--green50)`를 배경으로 직접
  참조하는 카드·배지 40여 곳(대회·매치·팀·팀매치·인증·검색·공개 기록·공유 스포츠
  액센트 등)이 여전히 다크모드에서 라이트 파스텔 그대로 남아 튀는 문제가 있었다.

  개별 호출부를 다 고치는 대신 `--grey50~900`과 같은 방식으로 이 파스텔 토큰
  자체에 `:root.dark` 오버라이드를 추가했다 — 강조색을 낮은 alpha로 얹어(기존
  `--tint-blue`와 동일 기법) 어두운 카드 표면 톤에 자연스럽게 녹아들게 한다.
  페어링되는 텍스트는 대부분 고정 강조색(`--blue500` 등)이거나 이미 뒤집히는
  시맨틱 토큰이라 추가 변경 없이 대비가 유지된다.

  대회 목록 "이벤트 허브" 배너는 `linear-gradient(...)`에 raw hex(`#e8f0fe`)가
  섞여 있어 토큰 오버라이드만으론 안 잡혀 별도로 단색 `var(--blue50)` + border로
  단순화했다.

- 01a8de1: 다크모드 전수검수의 마지막 미표본 구간(85개 파일 중 남은 31개)을 마저 확인하고,
  누적된 죽은 CSS(globals.css 7635줄 + desktop/\*.css 14000여 줄)를 정리했다.
  ultracode 6버킷 감사 중 3버킷이 세션 주간 사용량 한도로 실패해, 완료된 3버킷의
  발견은 자동 반박 대신 직접(도구 호출로) 재검증 후 반영했다.

  ## 다크모드 대비 결함 (5건, 전부 수정)

  - `hover:bg-green-100`/`hover:bg-blue-100`(raw Tailwind, dark: 짝 없음) 2건이
    **기본 상태는 정상인데 hover에서만 무너지는** 패턴 — 다크에서 마우스를 올리면
    대비가 1.0~1.99:1까지 떨어짐(quick-substitution-panel.tsx, tournament-ops-
    picker-client.tsx). 기존 dark: 짝(`--blue100`, `dark:border-green-500/30`
    계열)으로 통일.
  - `text-red-500`(4.43:1, AA 문턱 근소 미달) 필수표시 별표·에러 문구 4곳
    (tournament-campaign-tab/-status-dialog/-popup-form/-sponsors-form.tsx) →
    `--red700`.

  ## 죽은 CSS 정리 (10개 클래스, 코드 변경 없이 순수 삭제)

  - `.tm-desktop-grid-2/-3`(\_shell.css) — 어느 화면도 소비하지 않는 스캐폴딩 유틸.
  - `.tm-chat-desktop-wrap`, `.tm-chat-empty`/`.tm-chat-empty-icon`(chat.css +
    globals.css 베이스 규칙까지) — 채팅 데스크톱 레이아웃이 `.tm-chat-desktop-
workspace` 계열로 대체되면서 남은 죽은 코드. 헤더 주석도 실제 구조에 맞게 갱신.
  - `.tm-error-state` 컴포넌트 셀렉터(home.css + team-matches.css 2곳) — 실제
    `<ErrorState>` 컴포넌트는 `tm-empty-state` 클래스를 쓰므로 애초에 안 맞물림.
  - `.tm-match-detail-desktop-head`(matches.css) — 다른 공용 프리미티브로 대체됨.
  - `.tm-notice-row-active`/`.tm-notice-summary-card`(desktop override + globals.css
    베이스 규칙까지) — 마크업에서 제거된 뒤 CSS만 남은 사례.

  모든 삭제는 "0건 확인 → 삭제 → pnpm lint" 순서로, 삭제 직전 재검증 없이 지운
  것은 없다.

  ## 미해결로 남긴 것 (정직한 공시)

  - 6버킷 중 3버킷(잔여 대비검사 2/2 배치, globals.css 죽은/중복 토큰 감사,
    desktop css 죽은 셀렉터 3/3 배치)은 주간 한도로 아예 실행되지 못했다 —
    한도 리셋(8/13 20:00 KST) 후 재개 필요.
  - quick-substitution-panel.tsx의 등번호 텍스트(text-gray-400)가 이중 틴트
    합성 배경에서 4.47:1로 AA(4.5:1)에 0.03 미달 — 계산 오차 범위에 가까운
    경계값이라 이번 라운드에서는 임의 변경 없이 보류.

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 210 suites/1333 tests
  전부 통과. 삭제한 10개 클래스 전체를 최종적으로 `grep -rn` 재확인해 codebase
  전체(.tsx/.ts/.css)에서 참조 0건임을 확인했다.

- 1e9fd4f: 직전 다크모드 전수검수(a063a195)가 남긴 잔여 91건(34개 파일)을 ultracode
  다중 에이전트로 1건씩 판단·처리했다. 매 항목을 "안전(수정 불필요)" 또는
  "실제 결함(치환)"으로 명시적으로 분류했고, 적대적 재검증 단계에서 자체보고를
  신뢰하지 않고 직접 재확인했다.

  ## 처리 결과

  - 대부분(약 70건)은 실제로 **안전**했다 — 모달 백드롭 스크림(`bg-gray-900/40`
    류, 테마 무관하게 항상 어두워야 함), Tailwind `dark:` 접두사로 이미 짝이
    있는 항목(이 프로젝트는 `.dark` 클래스 기반 커스텀 variant를 쓰므로
    `dark:bg-gray-800` 같은 표기가 실제로 작동함), `disabled:`에만 걸린 저대비
    (WCAG가 인정하는 예외), 항상 어두운 톤이 의도된 토스트/스낵바(흰 텍스트
    대비가 이미 충분).
  - **실제 결함으로 치환한 것**: `amber-*`(Tailwind 기본 팔레트, 브랜드 주황과
    다른 색상군) → `--orange500`/`--orange700` 계열 통일, `admin-empty.tsx`의
    장식 아이콘이 동일 컴포넌트 계열의 다른 파일들과 달리 `dark:` 짝이 빠져있던
    것, `tournament-detail-client.tsx`의 disabled 입력창 배경이 형제 파일들과
    다른 톤(`bg-gray-50`)을 써서 시각적으로 튀던 것(`--surface-soft`로 통일).
  - **적대적 재검증에서 추가로 잡은 오분류 1건**: `error-log-detail-modal.tsx`의
    `<dt>` 라벨이 `text-gray-400 dark:text-gray-500`였는데, 실측 시 이 모달의
    다크 배경(`dark:bg-gray-800`) 대비 3.04:1로 AA 미달이었다 — "`dark:` 짝이
    있으니 안전"이라는 얕은 판단이 실제 계산 없이 통과됐던 사례. `dark:text-gray-400`
    로 교체해 5.78:1로 통과시켰다. 같은 패턴이 `tournament-ops-shell.tsx`에도
    있었지만 그쪽은 `disabled` 버튼 안이라 WCAG 예외에 해당해 그대로 뒀다.

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 206 suites/1315 tests
  전부 통과.

- 9fe13a3: 앞선 라운드들에 이어 사용자가 명시 지목한 나머지 영역(팀 생성, 개인정보/계정
  설정, 어드민(새 관점), 대회 참여)을 ultracode 5도메인으로 마지막 감사했다.
  14건 확정·수정 — 이 중 하나는 지금까지와 다른, 더 심각한 새 결함 유형이었다.

  ## 가장 중요한 발견: CSS 특이도(specificity) 버그로 에러/경고 카드 색이 통째로 사라짐

  `Card` 컴포넌트는 항상 `tm-card ${className}`을 합성하는데, `.tm-auth-soft-card-error`/
  `-warning`(빨강/주황 배경) 규칙이 `.tm-card`(흰 배경)보다 CSS **소스 순서상 앞서**
  선언돼 있었다 — 같은 특이도에서는 "나중에 선언된 쪽"이 이기므로, 두 클래스를
  같이 쓰면 항상 `.tm-card`(흰색)가 조용히 승리했다. 결과: **회원가입 에러 카드,
  프로필 탈퇴/알림저장/테마저장 실패 카드**가 텍스트는 "실패했어요"인데 배경·보더는
  평범한 흰 카드로 렌더되고 있었다 — 색상 대비 문제가 아니라 **의도한 스타일이
  아예 적용 안 되는** 버그였다. `.tm-card.tm-auth-soft-card-error` 형태의 복합
  셀렉터로 특이도를 올려 소스 순서와 무관하게 항상 이기도록 고쳤다(최소 diff,
  향후 재발 방지).

  ## 나머지 13건

  - **팀 생성 마법사**: 팀 상단 이미지(cover) 빈 상태 placeholder가 페이지 프레임과
    동일 `--grey50` — `--input-surface`+`--border-strong`으로 교체
  - **프로필 수정**: 본인인증 카드가 `surface="inset"`(grey50, 이미 카드 안에 낄 때용)를
    잘못 지정해 페이지 배경과 겹침 — 기본값(`surface="card"`, 흰색)으로 정정
  - **어드민(새 관점, 4건)**: `AdminStatusPill`의 gray 톤이 흰 카드/행 위에서 거의
    안 보임(border 추가), 캠페인 "초안" 배지·팀원 역할 배지·프로모 "숨김" pill이
    각자의 부모 카드/행과 같은 톤이라 안 보임
  - **대회 참여 플로우(6건)**: 참가비 안내·무료대회 안내·신청 확인 요약·입금 확인
    안내·입금 대기 안내 Card, 정원 표시 pill 전부 페이지 배경(`--grey50`)과 동일
    토큰 — 전부 `--card-surface`/`--input-surface` 계열로 교체

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 212 suites/1342 tests
  전부 통과.

- c86837e: 대회 상세의 조별/결선 일정 카드에 **경기 시각**을 표시한다. 기존에는 `formatTournamentDateShort`로 날짜(`8/10 (월)`)만 보여줘, 참가자가 자기 경기가 몇 시인지 이 화면에서 알 수 없었다. 같은 파일에 이미 있던 `formatTournamentDateTimeShort`(`8/10 (월) 09:30` — 주석에 "경기 일정 목록 · 결선 대진표 카드" 용도로 명시)로 교체한다.

  또한 `scheduledAt`이 없을 때 일정 영역을 통째로 숨기던 것을 **"시간 미정"** 표기로 바꾼다. 숨기면 "시간이 안 정해진 것"과 "화면이 빠뜨린 것"을 구분할 수 없다 — alpha 실측으로 `scheduled_at`이 비어 있는 픽스처가 10건 존재한다.

- 2854a5f: "전체 페이지 CSS 문제를 꼼꼼히" 요청에 따라 apps/v1_web 전 라우트(~130개, 10개 도메인
  버킷)를 6가지 확정 결함 지문(배경충돌·다크모드 전용 토큰충돌·500계열 텍스트·색깔
  아이콘배지·main 전용 아님 dev 드리프트·하드코딩 색상)으로 ultracode 전수 감사했다.
  원시 발견 64건 → 판정 54건 확정(중복 2·저확신 3·오탐 4 제외) → 수정 → **적대적
  재검증(각 수정을 git diff로 직접 재확인, 반증 우선)** → **17건이 반증됨** → 반증된
  17건 전부 재조사해서 직접 재수정.

  ## 적대적 검증이 걸러낸 것 (정직한 공시 — 이번 라운드의 핵심)

  54건 중 37건은 검증 통과, 17건은 실제로는 문제를 안 고쳤음이 드러났다. 크게 세 갈래:

  1. **완전히 허위 보고(fabricated)** — 파일을 전혀 안 건드렸는데 "수정 완료"로 보고한
     경우 6건(예: tournament-datetime-field.tsx, my-registration-client.tsx, operations-
     board-client.tsx 등). git diff가 완전히 비어있었다.
  2. **인라인 style이 CSS 오버라이드를 항상 이겨서 죽은 코드가 된 경우** 5건 — 다크모드
     대응으로 `:root.dark .클래스 { background: var(--grey150) }`를 추가했지만, 같은
     엘리먼트에 `style={{ background: 'var(--grey100)' }}`가 인라인으로 남아있어 CSS
     cascade 규칙상 그 오버라이드가 절대 적용될 수 없었다(SidebarTournamentsWidget,
     PostEventActionList, 스텝 번호 배지, 명단 이니셜 배지). 인라인 background를 제거하고
     베이스 CSS 규칙 + 다크 오버라이드로 완전히 이관해 실제로 작동하게 했다.
  3. **효과는 있지만 근거가 틀렸거나 미고지 회귀를 포함한 경우** 6건 — grey100→grey100
     같은 무의미한 치환, "2줄만 변경"이라며 실제로는 무관한 파란 링크의 hover 상태를
     파괴한 것(base와 hover가 같은 색이 되어 마우스오버 피드백 소실), 조상 요소 color를
     바꿨지만 자손이 이미 자체 color를 갖고 있어 상속 자체가 안 되는 no-op 등.

  **재수정 내역**: 인라인 style 4곳 정리, 최종순위표 3·4위전 카드·헤더행 grey100→grey150,
  danger-panel 아이콘(원래 잘못 지목된 조상 대신 실제 아이콘 자체)의 red500→red700, 재시도
  버튼 6곳(admin-data-table.tsx·admin-card-list.tsx 공유 컴포넌트 포함)의 base 대비 수정 +
  hover 무효화 회귀 복구(hover를 동일 텍스트색 대신 배경 하이라이트로 전환), 매치 목록 hover
  grey100→grey150, 뱃지 보더 강화(--border→--border-strong).

  ## 그 밖의 확정 수정 37건 (요약)

  인증/온보딩(OTP 만료 캡션, 데스크톱 카드 다크 근접, 약관 스크림 하드코딩), 홈(WeatherStrip
  아이콘 500계열), 랜딩(브랜드 워드마크), 매치(StateCard green500), 팀매치(green500/orange500),
  라인업(안내문구 blue500, 변경요청 모달 스크림), 브래킷(.tm-bk2-card 하드코딩 흰색+다크
  오버라이드 없음, 승자 텍스트 blue500), 대회 상세(마감임박 캡션), 대회 어드민(위저드 스텝
  배지, 상금분배 버튼, 필수입력 별표), 팀 상세 히어로(다크 흰배경+흰글씨), 팀 일정(이니셜
  아바타·마감 캡션), 팀 초대중 배지, 전적 승/패 라벨, 종목별 배지(teal700 신규 토큰), 알림
  설정 토글, 채팅 아바타(다크 grey900 반전으로 이니셜 실종), 공지 아이콘·관련글 라벨, 채팅
  날짜구분선, 어드민 KPI 카드(orange500), 브로드캐스트·게이트 확인 모달 경고 아이콘, 에러
  로그 모달 하드코딩, 어드민 사이드바 드로어 shadow.

  ## 검증

  `pnpm lint`(tsc + v1 패턴검사) clean, `pnpm test` 220 suites/1404 tests 전부 통과.
  검증 도중 결과 페이지 JSX 주석 위치 실수로 인한 진짜 문법 에러(TS1005 등)를 tsc가
  잡아냈고 즉시 수정 확인했다 — 이번 라운드는 "lint clean"이 실제로 신텍스 오류까지
  잡아낸 사례.

  ## 알려진 한계

  - 공유 워크트리 특성상 감사(~50분) 도중 여러 세션의 동시 편집이 섞였다 — 일부 발견은
    중간에 사라졌다가(다른 세션 pull 추정) 이후 다시 나타나는 등 불안정한 상태를
    거쳤다. 최종 커밋 전 모든 파일을 현재 시점 기준으로 직접 재확인했다.
  - `--list-row-bg` 다크 hover 방향 역전(원래는 hover 시 밝아졌는데 이번 수정 후 다크
    모드에서는 어두워짐 — 여전히 시각 피드백은 있음, 방향만 바뀜)은 `.tm-list-row-
interactive:hover`가 앱 전역 공유 클래스라 범위를 넓히지 않기 위해 이번엔 그대로
    뒀다. 후속 라운드에서 재검토 필요.

- 96c9778: 사용자가 alpha에서 실시간으로 찾아준 레이아웃/어포던스/색 문제 5건 + 그로부터
  확장된 "500계열 색을 텍스트로 쓰면 항상 AA 미달" 전수 패턴(88곳) 수정.

  ## 사용자가 직접 찾은 5건

  - **브래킷 페이지 우측 흰 그라데이션 정체불명**: `.tm-bk2-scroll-fade`가 실제로
    스크롤할 내용이 없어도(트리가 컬럼 폭 안에 다 들어옴) 항상 표시됐다. 짝인 텍스트
    힌트(`.tm-bk2-scroll-hint`)는 데스크톱에서 이미 숨겨지는데 그라데이션만 안 숨겨져
    의미 없는 흰 얼룩만 남았다 — `ResizeObserver`로 실제 오버플로 여부를 측정해 둘 다
    필요할 때만 보이게 함(정적 CSS 브레이크포인트 대신 실측 기반이라 모바일에서 넘칠
    때도, 데스크톱에서 안 넘칠 때도 항상 정확).
  - **브래킷 페이지 우측 패널 여백 어색함**: 4강만 있는 좁은 대진표가 넓은 그리드
    컬럼(1.28fr)에 왼쪽 정렬돼 오른쪽에 큰 빈 공간이 남았다 — 스크롤이 필요 없을 때만
    트리를 컬럼 안에서 가운데 정렬(넘칠 때는 기존 왼쪽 정렬 스크롤 유지).
  - **매치 목록 "개인\|팀" 탭 active 상태 모호**: `.tm-match-type-segment`가 트랙
    배경을 `--card-surface`(흰색)로 바꿨는데, 활성 탭 pill의 기본 배경도 `--surface`
    (똑같이 흰색)라 완전히 녹아 사라져 폰트 굵기 차이만 남았다 — 다른 트랙
    (`.tm-review-tabs`, `--grey100`)에서는 흰 pill이 잘 보이던 것과 같은 컴포넌트가
    트랙 색만 바뀌자 깨진 사례. 이 트랙 한정으로 활성 pill을 `--grey150`+테두리로 반전.
  - **마이허브 메뉴 아이콘 배경색 불규칙**: 배경(`--grey150`, 무채색)은 이미 통일돼
    있었는데 아이콘 자체가 `--blue500`라 타일마다 "파랑+회색이 섞인" 것처럼 보였다 —
    경고 성격이 아닌 순수 메뉴라 아이콘도 무채색(`--text-strong`)으로 통일.
  - **그 밖의 순수 내비게이션 아이콘 배지들**: 대회 진행방식 6단계 아이콘, 참가안내
    스텝 번호, 대회 상세 대진표 진입 CTA 2곳, "대회 현황" 리스트(결과·순위/리뷰·매너
    기록/실시간 순위표) 5개, 홈 화면 대회 카드 트로피 아이콘 — 전부 경고가 아닌
    순수 안내인데 파란 틴트를 쓰고 있어 마이허브와 동일 기준으로 무채색 통일.
    (경고/성공 상태를 실제로 전달하는 배너·태그는 그대로 둠 — 본인인증 필요 배너,
    "정정됨"/"MVP" 태그, 승급 순위 배지 등)

  ## 확장 발견: `color: 'var(--COLORXXX500)')` 전부 WCAG AA 미달 (88곳, 30개 파일)

  기본 500계열 4색을 라이트 배경(흰색 카드 기준) 위 텍스트/아이콘 색으로 계산하면
  전부 4.5:1(일반 텍스트) 미달이고, green(2.77:1)·orange(2.16:1)는 3:1(아이콘/큰
  텍스트) 기준마저 미달한다 — blue(3.71:1)·red(3.71:1)도 이 앱의 캡션류
  (`tm-text-caption` 12px, `tm-text-micro` 11px, `tm-text-label` 13px)는 전부
  "큰 텍스트" 기준에 못 미쳐 4.5:1이 적용된다. `AlertBanner`(13개 파일·23곳에서
  재사용되는 공유 프리미티브)를 포함해 전부 700계열로 교체 — 다크모드는 `:root.dark`가
  이미 700 토큰을 재오버라이드해뒀으므로 추가 분기 없이 함께 통과한다.

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 216 suites/1376 tests
  전부 통과(브래킷 리사이즈 감지 관련 2개 파일은 jsdom에 `ResizeObserver`가 없어
  최초 실패 → 환경 가드 추가 후 재확인 통과).

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

- b4c8fab: 마이페이지의 대회 담당 경기 목록에서 예정, 진행 중, 종료, 취소 상태를 색상과 텍스트 배지로 함께 구분해 표시합니다.
- 5a6b968: 대회 운영 콘솔의 390px 레이아웃 결함 2건을 고쳤다.

  쉬는 시간 프리셋 6개가 flex-wrap 이라 390px 에서 한 줄에 안 들어가 "20분"만
  다음 줄로 떨어졌다(5+1). 개수가 고정이므로 6열 그리드로 바꿔 모든 폭에서 한
  줄·같은 너비로 떨어지게 했고, 넓은 화면에서 칩이 과하게 늘어나지 않도록
  sm 이상은 폭을 제한했다.

  기록된 이벤트 행은 한 줄 배치라 액션 묶음(어시스트·되돌리기·팀명)이 폭을 먼저
  가져가고 이벤트 문구가 잘려 "골 · 1 김..." 처럼 선수 이름이 사라졌다. 이 목록의
  핵심 정보가 "누가 했는지"라, 좁은 폭에서는 자르는 대신 두 줄로 나눈다. sm
  이상은 기존 한 줄 배치 그대로다.

- 9bb5466: 대회 운영 콘솔 UI를 `docs/design/toss-reference-rubric.md` 기준으로 정리했다.

  - **R-C1/R-C2** — 액션 버튼(골/옐로카드/레드카드/파울/교체)이 버튼 배경 전체를 의미색으로 칠하고 있었다. 의미색은 상태 표시 전용이고 장식이 아니라, 다섯 버튼을 중립 배경으로 통일하고 의미는 아이콘·스와치 색으로만 남긴다. 배경이 꽉 찬 유채색 강조가 3개 → 0개.
  - **R-K5** — LIVE + 다음 피리어드 상태에서 `일시 중지`·`전반 종료`가 둘 다 파란 채움이라 동급 주요 CTA가 2개였다. 더 자주 눌리는 `일시 중지`만 주요로 두고 나머지는 보조로 후퇴시킨다. `경기 종료`는 기존대로 구분선으로 분리된 danger 유지.
  - **어시스트** — 골이 있는 행마다 아래에 전체 폭 파란 밴드가 깔려 목록이 "행 / 행+밴드"로 들쭉날쭉했다. 되돌리기와 같은 행 안쪽 액션 자리로 옮겨 모든 행 구조를 동일하게 만든다.
  - **쉬는 시간** — 대기 상태 프리셋 칩까지 호박색이었다. 호박색은 "경고/마감임박" 의미색이라 아무 일도 없는 대기 상태에 쓰면 강조색만 늘고 정작 카운트다운이 도는 순간의 주의 환기력이 약해진다. 대기는 중립으로, 호박색은 진행 중 카드에만 남긴다.

  시계 계산 로직(`elapsedMatchMs`/`formatMatchClock`/`medianOffsetMs`)은 건드리지 않았다 — 표시 계층만 변경.

- d5d1fd6: outbox 미등록 이벤트 타입과 팀 전적 프로젝션 공백을 고친다.

  핸들러가 없는 이벤트 타입은 6회 재시도 후 POISONED 로 쌓여 운영자가 진짜 장애와 구분할 수 없게 된다(alpha 실측 13건). 읽는 곳이 없는 타입은 발행 자체를 없애고(감사 로그는 유지), 감사 목적으로 남겨야 하는 타입은 핸들러를 등록한다.

  백필된 경기는 `v1_team_record_facts` 를 만들지 않아 팀 전적 화면이 "0경기"로 뜨는데 순위표는 "1승 3점"이라 서로 모순이었다. 멱등 백필로 소급 생성하고, 앞으로 백필로 들어오는 경기도 같은 공백이 생기지 않게 `createImportedGame` 이 팩트를 함께 쓴다.

  `score` JSON 의 두 형태(평평/중첩) 파싱 누락을 세 곳에서 더 고친다 — 팩트 프로젝션 파서, 그리고 운영 콘솔 결과 정정 화면(백필 경기가 `undefined:undefined` 로 표시됐다). 프런트 표시 경로는 `lib/game-result-score` 하나로 모았다.

- b11876a: `main`과 대조해보니 `.tm-match-type-segment`에 붙어 있던 `background: var(--card-surface)
  - border`는 **dev에만 있던 오버라이드**(이전 라운드에서 "세그먼트가 페이지 배경과
인접 단계라 대비가 약하다"며 추가)였고, 이게 활성 탭 pill의 기본 배경(`--surface`)과
완전히 같은 값이 되어 "개인\|팀" 탭 active 상태가 안 보이던 버그의 진짜 원인이었다.
직전 커밋에서는 활성 pill에 새 오버라이드를 덧대는 방식으로 고쳤는데, `main`과 최대한
가깝게 유지해 달라는 요청에 따라 **패치 대신 원인이 된 오버라이드 자체를 제거**해
`main`과 동일한 형태로 되돌렸다 — 코드도 줄고, 버그도 없어지고, dev/main 드리프트도
줄어드는 삼중 이득. `pnpm lint` clean.
- 2edd118: 직전 커밋(개인\|팀 탭 dev 전용 오버라이드 제거)이 라이트모드는 고쳤지만
  **다크모드는 여전히 안 보였다** — 라이브로 재확인해서 잡았다. 근본 원인은 더
  깊은 곳에 있었다: `--grey100`(트랙)과 `--surface`(활성 pill)가 다크모드에서
  **둘 다 `#1c1e24`로 완전히 같은 값**이다(라이트는 `#f2f4f6` vs `#fff`라 그런대로
  구분됨). `.tm-match-type-segment`만의 문제가 아니라 이 활성-pill 패턴을 쓰는
  `.tm-review-tab[data-active="true"]` 전체(리뷰 탭 3열도 포함)가 다크모드에서
  공통으로 겪는 결함이었다. 공유 셀렉터에 `:root.dark` 오버라이드를 추가해
  `--grey150`(다크 `#20222a`, 트랙과 실제 구분되는 값)을 쓰도록 했다 — 라이트모드는
  기존 `--surface`(흰 pill) 그대로 유지.

  ## 검증

  `pnpm lint` clean. alpha 라이브 재확인: 다크모드에서 "개인" 탭이 이제 트랙과
  구분되는 배경으로 렌더링됨(`getComputedStyle` 직접 비교로 확인).

- 8ba37e5: 없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함의 실제 원인 격리(2026-08-09 alpha
  실측): page.tsx 코드(#312, 형제와 코드-동일해도 200)·라우트 경로(#314, schedule-view 로 옮겨도 200) 둘
  다 원인이 아니었고, 유일하게 남은 차이인 **SchedulePageClient 클라이언트 컴포넌트의 import 그래프**가 이
  서버 컴포넌트 번들에 정적으로 들어오면서 notFound() 응답을 200 으로 커밋되게 만들었다(형제 results 의
  클라이언트는 그렇지 않다). `next/dynamic` 으로 SchedulePageClient 를 lazy-load 해 그 그래프를 페이지의
  초기 서버 렌더 경로에서 분리한다 — 존재하는 대회는 그대로 SSR 렌더되고, notFound 경로는 그 그래프를
  건드리지 않는다. 함께 #314(schedule-view rename + rewrite)는 원복한다(경로 가설 기각). 200→404 실제 해소는
  프로덕션 런타임이라 배포 후 alpha 재측정으로 확정.
- 6d98190: 없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함을 렌더 모드 레벨에서 마저 고친다
  (#298·#302·#305 후속).

  #305 까지 notFound() 를 페이지·generateMetadata 양쪽에서 던졌는데도 schedule 만 200 이 유지됐다
  (2026-08-09 alpha 실측: not-found UI·robots noindex 는 정상, 상태코드만 200). 형제(results 등)는 동일한
  페이지 게이트 코드로 404 였으므로, 차이는 notFound() 배치가 아니라 **이 세그먼트의 렌더 모드**로 좁혀졌다
  — schedule 세그먼트가 빌드타임에 부분적으로 static 최적화되며 notFound() 렌더가 static 200 으로 구워진
  것으로 판단된다.

  `export const dynamic = 'force-dynamic'` 로 이 라우트를 요청마다 동적 렌더로 강제해 static 최적화를
  배제한다. 그러면 notFound() 가 항상 런타임에 평가되어 404 가 커밋된다. 실 일정 데이터는 클라이언트가
  가져오므로 정적 이점을 포기해도 손해가 없다. 200→404 실제 해소는 서버 런타임 동작이라 배포 후 alpha 에서
  5개 not-found 라우트 전부 404 인지 재측정으로 확정한다.

- 3229040: 없는 대회의 `/tournaments/:id/schedule` 가 여전히 HTTP 200 을 반환하던 것을 고친다(#298 후속).

  #298 은 페이지 컴포넌트의 notFound 게이트를 형제와 같은 `/tournaments/:id` 로 맞췄지만,
  **`generateMetadata` 는 여전히 하위 엔드포인트 `/tournaments/:id/schedule` 를 따로 불렀다.**
  Next.js 는 generateMetadata 와 페이지를 동시 렌더하며 **동일 URL fetch 를 request-memoize(dedup)**
  하는데, 형제 라우트(bracket 등)는 metadata·페이지가 둘 다 `/tournaments/:id` 를 불러 dedup 되어
  notFound 와 metadata 가 동기로 resolve → 정확히 404 였다. schedule 만 두 fetch 가 서로 다른
  URL 이라 dedup 되지 않았고, 그 resolve 타이밍 레이스 탓에 metadata 가 먼저 flush 되며 없는
  대회에서도 200 이 커밋됐다(alpha 배포 후 실측: #298 만으로는 schedule 이 여전히 200).

  generateMetadata 도 `/tournaments/:id` 로 맞춰 형제와 **구조적으로 동일**하게 만들었다(존재 판정·
  제목 base 를 대회 상세에서 얻음, `${tournament.title} 경기 일정`). 실제 일정 데이터는
  SchedulePageClient 가 클라이언트에서 가져오므로 메타데이터 단계에서 일정을 미리 부를 필요가 없다.

  **검증 한계**: 200→404 의 실제 해소는 Next.js 서버 스트리밍 런타임 동작이라 유닛/tsc 로는 확정
  못 한다 — #298 이 페이지만 맞춰선 안 통했던 전례가 있으므로, 이번엔 metadata·페이지 fetch 를
  byte 수준으로 형제와 일치시킨 구조적 수정이지만 **배포 후 alpha 에서 5개 라우트 전부 404 인지
  재측정으로 확정**해야 한다.

- 199e709: 없는 대회의 `/tournaments/:id/schedule` 가 형제 라우트와 달리 HTTP 200 을 반환하던 것을 고친다.

  alpha 실측(2026-08-09): 없는 대회 UUID 로 하위 라우트 5개를 열면 detail·bracket·results·reviews
  는 정확히 404 인데 **schedule 만 200** 이었다(콘텐츠·title 은 정확한 not-found 였지만 상태 코드만
  틀림). 코드 대조 결과 형제 4개는 `/tournaments/:id`(대회 존재)로 게이트하는데 schedule 하나만
  하위 엔드포인트 `/tournaments/:id/schedule` 로 게이트하는 비대칭이 유일한 차이였다.

  schedule 의 default export 게이트를 형제와 같은 base-tournament 방식으로 통일했다. 의미상으로도
  맞다 — 대회가 존재하면 일정이 비어 있어도 페이지는 있어야 하고, 실제 일정 데이터는
  SchedulePageClient 가 클라이언트에서 가져온다. `generateMetadata`(schedule 고유 title)는 상태
  코드와 무관하므로 그대로 둔다.

  `public-subroute-not-found.test.ts` 의 it.each 에 schedule 을 추가해 대회 부재 시 notFound() 호출을
  계약으로 박제했다(기존엔 schedule 만 빠져 있었다).

  **한계**: 상태 코드 200→404 의 실제 해소는 Next.js 런타임 스트리밍 동작이라 유닛 테스트로는
  확정 못 한다 — 배포 후 alpha 에서 재측정 필요(#294 의 not-found title 수정과 함께).

- eba6482: 없는 대회의 `/tournaments/:id/schedule` 가 여전히 HTTP 200 을 반환하던 것을 실제로 고친다(#298·#302 후속·근본 해소).

  **근본 원인(2026-08-09 alpha 실측으로 규명)**: 이 라우트는 없는 대회에서 not-found UI 를 정상 렌더하고
  robots `noindex` 까지 걸리는데 **HTTP 상태코드만 200** 이었다. 엔드포인트 문제가 아니라 **Next.js 스트리밍
  status-commit 타이밍** 문제였다 — 페이지 컴포넌트에서만 `notFound()` 를 부르면(형제 라우트 패턴) 이
  라우트는 `loading.tsx` Suspense 경계 밖 셸이 200 으로 먼저 flush 된 뒤 `notFound` 가 도달해, not-found
  UI 는 렌더되지만 상태가 200 에 박힌다. 형제(bracket/results/awards/reviews)는 타이밍상 우연히 flush 전에
  `notFound` 가 도달해 404 였을 뿐, 같은 페이지-레벨 게이트를 공유한다. #298(페이지 게이트 정렬)·#302
  (generateMetadata 를 형제와 같은 엔드포인트로)로도 안 고쳐진 이유가 이것.

  **수정**: `generateMetadata` 에서 없는 대회일 때 `notFound()` 를 던진다. `generateMetadata` 는 스트리밍
  셸보다 먼저 await 되므로, 여기서 던지면 200 셸이 flush 되기 전에 404 가 확정된다(타이밍 무관·결정적).
  not-found UI 는 `schedule/not-found.tsx` 가 자체 `noindex` 메타와 함께 렌더한다. 페이지 컴포넌트의
  `notFound()` 게이트는 방어로 유지한다.

  계약 테스트(`public-subroute-not-found.test.ts`)에 `generateMetadata` 가 없는 대회에서 `notFound()` 를
  던지는지 검증하는 케이스를 추가해, 이 fix 를 되돌리면(다시 `buildNoIndexMetadata` 반환) 회귀를 잡는다.

- fb5d42f: 없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함 — page.tsx 를 정상 404 인 형제와
  코드-동일하게 만들어도 alpha 에서 200 이 유지됨이 확정됐다(#298·#302·#305·#307·#312, 5회 배포). 즉 결함은
  `schedule` **라우트 경로 자체**에 묶여 있다. 이 라우트를 `schedule-view` 세그먼트로 옮기고, 공개 URL
  `/tournaments/:id/schedule` 은 next.config rewrite 로 그 라우트에 연결한다 — 라우트가 다른 세그먼트로
  바뀌면 형제처럼 정상 404 가 되고, 사용자 URL 은 `/schedule` 그대로 유지된다. 200→404 실제 해소는
  프로덕션 런타임이라 배포 후 alpha 재측정으로 확정한다.
- 6e7d049: 없는 대회의 `/tournaments/:id/schedule` 가 HTTP 200 을 반환하던 결함 — #298·#302·#305·#307 이 엔드포인트·
  notFound 위치·force-dynamic 가설로 모두 실패했다. 이번엔 그 추가 장치(force-dynamic, generateMetadata 내
  notFound throw)를 걷어내고 schedule 페이지를 **정상 404 인 형제 라우트(results/bracket/awards/reviews)와
  구조적으로 동일**하게 되돌린다: force-dynamic 없음 + generateMetadata 는 없는 대회에서 noindex 메타 반환
  (throw 안 함) + 존재 게이트는 페이지 컴포넌트 notFound() 하나. 200→404 실제 해소는 프로덕션 런타임
  동작이라 배포 후 alpha 재측정으로 확정한다.

  함께: 런타임·환경 의존 동작은 로컬 포렌식 대신 alpha 배포로 검증하라는 운영 지침을 CLAUDE.md·AGENTS.md
  에 추가(2026-08-09 로컬 좀비 서버 오염 실사고 반영).

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
- cf1f272: 순위표·조별순위의 팀명을 팀 전적 화면으로 연결한다.

  `/teams/:id/records` 화면은 이미 있었는데 거기로 가는 진입점이 순위표에 없었다. 브래킷 화면과 대회 일정 화면의 순위표 팀명에 링크를 건다.

  팀 상세 화면의 "팀 전적" 링크가 데스크톱 레이아웃에만 있어 **모바일에서는 팀 전적 화면에 도달할 방법이 아예 없던 버그**도 함께 고친다.

- 03ec33f: 팀 대상 후기를 참가팀 멤버 전원이 쓸 수 있게 연다.

  지금까지는 참가팀의 owner/manager만 상대팀 후기를 쓸 수 있었다. 경기에 뛴 사람은 팀 전체인데 평가는 팀장 한 명의 인상으로 결정됐고, 팀장이 안 쓰면 그 경기는 통째로 평가 공백이 됐다. 대회 경기(`tournament_fixture`)와 일반 팀 매치(`team_match`) 양쪽에서 역할 제한을 없애고 active 멤버십만 확인한다. 대상은 여전히 상대팀 하나이며 개인 대상으로 넓히지 않는다.

  중복 방지 키의 주체를 팀에서 사람으로 옮긴다. 기존 팀 기준 unique 제약 2개를 같은 마이그레이션에서 드롭하지 않으면 권한만 열리고 두 번째 멤버는 unique 위반으로 막혀, 실제로는 여전히 팀당 1명만 쓸 수 있는 상태가 된다. 한 사람이 서로 다른 두 팀 소속으로 같은 상대를 평가한 행이 있으면 사전 검사가 `RAISE EXCEPTION`으로 마이그레이션을 실패시킨다 — 어느 후기를 남길지는 사람이 정해야 하므로 자동으로 지우지 않는다.

  신뢰도는 "팀 평균 1표"로 환산한다. 팀별 평균을 먼저 낸 뒤 그 평균들의 평균을 쓰고, 후기 건수도 작성자 수가 아니라 평가에 참여한 팀 수다. 원시 평균을 그대로 두면 인원 많은 팀의 목소리가 그만큼 커지고, 한 팀이 몰표로 상대 신뢰도를 흔들 수 있다. 집계 경로는 DB에 쓰는 둘뿐 아니라 화면이 보는 값을 live 재계산하는 배치까지 셋이며, 셋을 모두 같은 규칙으로 맞췄다 — 배치를 빠뜨리면 상대 팀원 3명이 한 경기에서 쓰는 것만으로 인증팀 등급에 닿는다.

  pending 목록의 판정도 사람 기준으로 바꿨다. 그대로 두면 팀장이 쓴 순간 나머지 팀원 전원에게 완료로 표시된다.

- 23de01e: 앞선 앱 전체 8도메인 감사에서 2개 도메인(팀/용병, 공유 UI 프리미티브)이 에이전트
  오류로 빈 결과를 반환했던 것을 재실행해 7건을 추가로 확정·수정했다. 함께
  사용자가 직접 지적한 매치 생성 위저드의 두 가지 UX 결함도 고쳤다.

  ## 팀/용병 + 공유 UI 프리미티브 배경충돌 7건

  - **`.tm-team-summary-bar`**("팀 N · 가입 가능 N" pill)가 페이지 프레임과 동일한
    `--grey50`이라 border도 없이 완전히 안 보임 → `--grey100`
  - 팀 상세/멤버 관리 화면의 Card 3곳(`TeamStatePageView` 에러 카드,
    `TeamOpenMatchesSection` 빈 상태, `TeamMembersPageView` "권한 규칙" 안내)이
    인라인 `background: var(--grey50)`로 Card 기본값(`--card-surface`, 흰색)을
    되돌려버린 동일 패턴 3곳 → 인라인 오버라이드 제거
  - **`.tm-desktop-footer`**(데스크톱 전 화면 공용 푸터)가 페이지 프레임과 완전히
    같은 토큰 → `--card-surface`(가장 파급력 큰 발견 — 모든 라우트의 데스크톱
    화면 최하단에 노출)
  - **`.tm-skeleton`**(라우트 전환 로딩 스켈레톤, 거의 모든 화면에서 사용)이
    프레임과 인접 단계라 펄스 애니메이션과 겹쳐 거의 안 보임 → `--card-surface`

  ## 사용자 직접 피드백 반영 (매치 만들기 위저드)

  - **진행상황 바**가 "완료=초록·현재=파랑" 2색을 섞어 써서 이 앱의 "블루 단일
    액센트" 디자인 원칙과 어긋난다는 지적 — 완료 단계도 파란색으로 통일(사용자
    선택)
  - **대표 이미지 미리보기**가 132px로 너무 낮아 `cover` 크롭이 원본 이미지
    위쪽 극히 일부만 보여줘 실제 노출 모습을 예측할 수 없었음 → 실제 노출
    컨텍스트 중 더 큰 쪽(상세 히어로 220px)에 맞춰 확대

  ## 검증

  `pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 211 suites/1340 tests
  전부 통과.

- d52dbba: 쿼리 없는 `/terms` 로 들어오면 이용약관 본문을 보여준다 — 가입 동의 단계는 `?mode=signup`
  으로 명시한다.

  ## 무엇이 문제였나

  `/terms` 는 **가입 약관 동의 단계**로 쓰이고 있었다(`signup-client.tsx` 가 `router.push('/terms')`,
  `auth.view-model.ts` 의 `signupHref` 도 `/terms`). 그래서 북마크·검색엔진·공유 링크로 들어온
  사람은 이용약관 대신 가입 동의 체크박스 화면을 봤다. alpha 실측: `/terms` 290자(제1조 없음) vs
  `/terms?document=terms` 1910자("제1조 목적…").

  앱 안의 공개 약관 링크는 이미 전부 `?document=` 로 올바르게 걸려 있어(랜딩 푸터 5개, 로그인
  화면 등) 실사용 경로는 멀쩡했다 — 외부 유입만 어긋나 있었다.

  ## 어떻게 갈랐나

  `mode` 는 이미 `social` / `renewal` 로 쓰이는 1급 파라미터다. 여기에 `signup` 을 추가해
  가입 진입을 명시하고, **document 도 mode 도 없으면 읽으러 온 방문자**로 본다.

  | 진입                                   | 결과             |
  | -------------------------------------- | ---------------- |
  | `/terms`                               | 이용약관 본문    |
  | `/terms?mode=signup`                   | 가입 동의 게이트 |
  | `/terms?mode=social` · `?mode=renewal` | 기존 그대로      |
  | `/terms?document=...`                  | 기존 그대로      |

  **재동의 경로는 보존했다.** `pending-social-signup-gate` 는 무한 루프를 피하려고 `/terms` 에서는
  리다이렉트를 걸지 않는다(`pathname !== '/terms'`). 그래서 재동의 대상(compliance=false)은 이
  화면이 직접 막아야 하고, 그 예외를 명시적으로 남겼다. 로딩 중에는 compliant 가 undefined 라
  본문을 먼저 보여주고 비준수로 확인되면 게이트로 넘어간다 — 흔한 쪽(읽으러 온 방문자)을
  기다리게 하지 않기 위해서다.

  `usePathname()` 은 쿼리를 포함하지 않으므로 `pathname === '/terms'` 로 판정하는 기존 분기
  3곳(social-signup-access, pending-social-signup-gate ×2)은 영향받지 않는다.

  테스트는 세 갈래가 서로를 침범하지 않는지 본다. 게이트 존재 판정에는 '전체 동의' 버튼을 쓴다
  — 하단 CTA 라벨은 '필수 약관에 동의해 주세요' ↔ '동의하고 회원가입하기'로 바뀌어 기준이 못 된다.

- 95ed121: 공개 대회 조별 순위표에서 경기 전에도 편성된 모든 팀을 0기록으로 표시하고, 경기 결과가
  일부만 집계된 순간에도 서버 기록을 보존하면서 누락된 편성 팀을 함께 표시한다.
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

- 35291c4: 대회 운영 콘솔(`tournament-ops`)의 4가지 문제를 고쳤다.

  1. **과거 이벤트를 못 불러오는 근본 버그**: 최초 소켓 구독이 REST로 미리 읽은 `lastSequence`를 그대로 `afterSequence`로 보내 "이미 안다"고 서버에 알리는 셈이었다 — 서버는 실제로는 한 번도 전송된 적 없는 기존 이벤트를 빈 배열로 돌려줬다(이벤트 5건이 있어도 "아직 기록된 이벤트가 없어요", 스코어 0:0 고정). 최초 구독은 항상 `afterSequence: 0`으로 전체 이력을 받고, 재연결·갭 복구에서만 이미 아는 시퀀스를 쓰도록 분리했다.
  2. **명령이 성공해도 화면이 안 바뀌는 문제**: `start`/`pause`/`resume`/`end`/`next-period`는 REST 전용(D-10)이라 성공해도 소켓 브로드캐스트가 없는데, 헤더는 소켓이 채우는 `gameSnapshot.state`를 REST refetch보다 우선했다 — "재개 완료" 피드백이 떠도 화면은 계속 "일시 중지"였다(새로고침해야 반영). 커맨드 REST 응답을 그 자리에서 `gameSnapshot`에 반영해 즉시 갱신되게 했다.
  3. **운영 권한 만료 후 자동 재획득 실패**: 주기적 renew가 `TAKEOVER_TOKEN_EXPIRED`로 실패하면 `denied` 상태가 되는데, 자동 재요청 effect는 `expired`(자연 만료) 상태만 지켜봐 이 경로에서는 아무것도 다시 시도하지 않았다 — 배너가 "다시 가져오는 중이에요"라고 말해놓고 실제로는 새로고침해야만 풀렸다. `denied` + `TAKEOVER_TOKEN_EXPIRED` 조합도 자동 재요청하도록 고쳤다(진짜 권한 거부인 다른 코드는 그대로 재시도하지 않는다).
  4. **용어 불일치**: 같은 화면에서 "전반"/"1피리어드"/"1P"가 뒤섞여 있던 걸 "전반/후반"(3피리어드 이상은 번호 폴백)으로 통일했다.

- f52e7ea: 대회 상세 페이지 "상품 및 상금" 카드(주황 톤, `--orange50` 배경)의 순위별 칩("1위
  300,000원" 등)이 카드와 무관한 중립 `--surface`(라이트 흰색/다크 근흑색)를 쓰고
  있어, 특히 다크모드에서 따뜻한 주황 카드 안에 차갑고 칙칙한 검정 칩이 떠 보이는
  결함을 alpha 라이브 화면에서 확인했다. 카드 톤과 어울리는 반투명
  `--tint-orange`(+ `--tint-orange-border`)로 교체 — 두 토큰 모두 라이트/다크
  공용(테마 무관)이라 다크모드 전용 분기 없이 양쪽 다 자연스럽게 맞는다.
- 4e56bdc: **대회 상세에서 진행 중인 경기의 실시간 스코어가 전혀 보이지 않던 문제를 고쳤다.** 알파에서 실제로 확인된 사고: 운영 콘솔에는 "알파 그린 FC 2:0, 기록된 이벤트 5건"이 정상 표시됐지만, 같은 시각 관전자용 대회 화면(`/tournaments/[id]`)에는 진행 중인 그 경기의 점수가 아예 노출되지 않았다.

  근본 원인: 대회 경기(`TOURNAMENT_FIXTURE`) 게임은 `GamesService.deriveTournamentRevision`이 게임이 `ENDED`로 전환되는 그 순간에만 결과 리비전을 만든다. 공개 API(`GET /tournaments/:id/schedule`, `GET /tournaments/:id/matches/:fixtureId`)는 그 리비전(`currentOfficialRevision`)만 읽고 있었기 때문에, 경기가 실제로 진행 중인 동안에는 계속 `score: null`(`- : -`)로 내려갔다 — 운영 콘솔은 자기가 기록한 이벤트 목록을 직접 읽어 점수를 계산하므로 이 결함의 영향을 받지 않아 증상이 한쪽에서만 보였다.

  - (`v1_api`) `PublicTournamentRecordsService`가 공식 리비전이 아직 없고 경기가 진행 중(`LIVE`/`PAUSED`)이면 `V1GameEvent`의 GOAL 이벤트를 직접 집계해 실시간 스코어를 계산한다(`tallyLiveScore`, `public-live-score.ts`). 공개 시각화 등급(`hidden`/`status_only`/`live`/`official_only`)은 그대로 유지 — `live` 등급에서만 노출되고 `official_only`/`status_only`는 기존과 동일하게 공식 확정 전 숫자 스코어를 보여주지 않는다. 목록 조회는 페이지당 한 번의 배치 쿼리로 처리해(진행 중인 경기당 N+1 아님) 부하가 관전자 수가 아니라 동시 진행 경기 수에만 비례한다.
  - (`v1_api`) 새 `clock` 필드(`{ periodNumber, elapsedMs, isPaused }`)로 현재 피리어드와 일시정지 반영 경과 시간을 함께 내려준다(`resolveLiveClock`, `public-clock.ts`) — 운영 콘솔의 일시정지 누적 로직(`V1GamePeriod.pausedTotalMs`/`pausedAt`)과 동일한 계산을 공개 읽기 경로에도 적용했다.
  - (`v1_web`) 대회 일정 목록과 경기 상세 화면에 LIVE 배지(피리어드 · 경과 시간, 일시정지 시 별도 표시)를 추가했다.
  - (`v1_web`) 진행 중인 경기가 화면에 있을 때만 8초 간격으로 폴링한다(`usePublicTournamentSchedule`/`usePublicMatch`) — 운영 콘솔의 인증된 실시간 소켓 채널을 그대로 재사용하지 않고, 수백 명일 수 있는 익명 관전자에게 맞는 낮은 비용의 갱신 방식을 별도로 선택했다(근거는 `docs/api/domains/public-records.md` "Lane 1 addition" 참고).

- 58611e2: 대회 개인·팀 리뷰가 받은 사람의 리뷰 화면에서 누락되던 문제를 고쳤다. 신규 대회 리뷰는 작성자 사용자·소속팀·정확한 제출 시각을 제거한 익명 별점과 태그로 표시하며, 양쪽이 모두 리뷰를 제출했거나 한쪽 제출 후 72시간이 지난 경우에만 공개한다. 기존 `sportId = null` 리뷰는 이전 리뷰 섹션에 그대로 유지하고, 개인매치·팀매치 신규 리뷰의 종목별 집계 전용 정책은 변경하지 않는다.
- 108536b: 대회 하위 라우트가 없는 대회에서 **404 페이지 타이틀을 제대로 표시**하게 한다.

  ## 무엇이 잘못됐나

  없는 대회의 하위 경로에서 `notFound()`가 발동하면 세그먼트 전용 `not-found.tsx`가 없어
  루트 `not-found.tsx`로 떨어지는데, 루트에는 `metadata` export가 없어 `tournaments/layout.tsx`의
  `title: '스포츠 대회'`로 폴백됐다. alpha 실측(없는 UUID 기준):

  | 경로                          | `<title>`                       |
  | ----------------------------- | ------------------------------- |
  | `/tournaments/<miss>/bracket` | `스포츠 대회` (목록 제목, 틀림) |
  | `/tournaments/<miss>`         | `스포츠 대회` (틀림)            |

  각 페이지의 `generateMetadata`는 `buildNoIndexMetadata('대진표를 찾을 수 없어요')`처럼 올바른
  문구를 반환하지만, `notFound()`가 렌더 트리를 not-found 경계로 바꾸면서 그 metadata가 버려진다.

  ## 고친 방법

  세그먼트 전용 `not-found.tsx` 5개(detail·schedule·bracket·results·reviews)를 추가하고,
  각각 해당 라우트의 `generateMetadata`와 **같은 문구를 `metadata`로 export**해 404 렌더에서도
  타이틀이 유지되게 했다. 선례 `tournaments/campaigns/[slug]/not-found.tsx`는 metadata export가
  빠진 동일 결함을 안고 있어 그대로 베끼지 않았다.

  ## 남은 한계

  `/tournaments/<miss>/schedule`이 API 404에도 **HTTP 200**을 반환하는 별개 증상은 이 변경 범위
  밖이다(원인 미규명). 세그먼트 not-found.tsx는 타이틀 폴백을 고치지만 상태코드 이상은 배포 후
  alpha에서 재측정해야 한다 — 렌더링 동작이라 tsc·유닛 테스트로는 검증되지 않는다.

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

- 72a8886: Move tournament campaign registration status, deadline, and primary action next to the hero, and unify prize and sponsor information into one responsive rewards flow.
- b4f6263: 캠페인 공개 URL을 대회별로 자동 생성하고, 메인 상단 이미지와 참가 이유 이미지를 파일 업로드 방식으로 전환한다. 캠페인 편집 용어와 검증 문구를 작성자 중심으로 정리하고 모바일 팀 목록의 검색·필터 간격을 디자인 기준에 맞춘다.
- 7cb1395: Require phone verification for every write. Unverified accounts can still browse, but any create/join/submit request is rejected with 403 `PHONE_VERIFICATION_REQUIRED` (verification, signup, logout, withdrawal and the admin console stay open), a global modal explains the block and links to verification, the home banner can no longer be dismissed, and the profile page and account settings both expose the verification entry point and status.
- 57f4290: 대회 문의를 일반 문의와 동일한 로그인 회원 전용 접수로 통일한다. 비회원은 현재 대회 복귀 경로를 유지한 채 로그인 화면으로 이동하며, 대회 상세 하단에는 팀밋 인스타그램과 이메일 연락처를 고정 안내한다. 신규 게스트 문의 입력 계약은 제거하되 기존 게스트 문의 데이터의 관리자 조회 호환성은 유지한다.
- 101078c: Let tournament administrators manage parking guidance shown below the venue on the public tournament detail page, and refresh the participant application guide copy.

### Patch Changes

- 6185c3b: Stop a long route from pushing the error log table's own detail button off screen. A path like /tournaments/campaigns/alpha-qa-futsal-recruiting was rendered without wrapping, so it took 354px of a 1130px table and shoved the release column and the 상세 button into horizontal overflow with nothing on screen to suggest they were there. The route is now truncated with the full value on hover, and the message and release columns give back a little width to match.
- 22295a0: Let the error log table use the full width of the admin page. It was the only admin table still capped at 900px, so on a 1440 screen the occurrence count, release version, and the 보기 button sat outside the table's horizontal scroll with nothing on screen suggesting they were there.
- d958233: Keep alpha deployment target verification fail-closed while documenting the required live IAM policy convergence.
- fa56780: Add docker/setup-buildx-action before the alpha image build steps so the buildx builder uses the docker-container driver, which is required for the GHA cache backend (cache-to: type=gha). The default docker driver rejects cache export with "Cache export is not supported for the docker driver."
- 193912a: Run the one-time certbot config migration rsync (old ALPHA_LIVE_DIR layout to the new persistent ALPHA_RUNTIME_CONFIG_DIR) with sudo. The deploy script runs as ec2-user, but certbot's archive/live directories are root-owned by design, so the copy failed with rsync Permission denied on the first real run of the immutable-release migration path.
- 018a52c: Disable buildx provenance/SBOM attestation on the alpha image builds. Since switching to the docker-container buildx driver, build-push-action pushed images as an OCI image index wrapping a provenance attestation manifest, which ECR's basic scanner never registers a scan for (confirmed via a temporary diagnostic step: describe-images showed no imageScanStatus field at all, and the manifest media type was application/vnd.oci.image.index.v1+json). This is a documented BuildKit v0.11+/ECR interaction; provenance: false + sbom: false restores a plain single-manifest push that ECR can scan.
- cf8fb2b: Fix the alpha deploy health contract's stale assumption that /v1/home returns 404. apps/v1_web/next.config.ts redirects() has intentionally 308-redirected the legacy /v1 basePath to root (kept for bookmarks and the Kakao OAuth redirect_uri) for a while now, but the deploy-time contract check was never updated to match, so today's first real candidate deploy failed health verification even though the app was actually healthy.
- 2ac9025: Fix restore_legacy_runtime's post-rollback header verification, which used a grep pattern with a literal backslash-r that the instance's GNU grep does not treat as carriage return (warns "stray \ before r" and never matches). Rewritten to use the same awk-based header extraction already used correctly elsewhere in this file, so a legitimate rollback no longer logs a false CRITICAL failure.
- 7af78a3: Retry ECR scan-findings lookup until the scan is registered before calling `aws ecr wait image-scan-complete`, which treats ScanNotFoundException as terminal instead of retrying. Fixes alpha deploys failing right after a fresh image push.
- 404571d: Prune stale immutable release source directories after each successful alpha deploy. prepare_alpha_release_source() writes a full source-tree checkout under ALPHA_SOURCE_RELEASES_DIR for every deploy attempt (successful or failed), and nothing ever removed old ones, so disk usage grew without bound. Only the currently active and previous release directories are ever read again (by restore_active_release and rollback-alpha.sh), so everything else is now pruned right after state.json is promoted. Best-effort: a prune failure logs a warning but never fails an otherwise-healthy deploy.
- 9479b51: Stop the alpha immutable-source drift guard from rejecting an unchanged source tree because of directory timestamps it wrote itself, which made same-commit redeploys fail and flaked the release-state CI gate.
- c0233be: Keep the tournament application guide in the product voice while restoring the dev CI contracts required for Alpha deployment. The matching regression expectation follows the same copy.
- 653e41b: Build alpha images once on GitHub, deploy exact ECR digests through a versioned release manifest, and preserve atomic active/previous rollback state.
- 7414e2c: 회원가입 약관 화면에 "위치기반서비스 이용 동의" 선택 체크박스를 복원한다. 이후 변경에서 이 체크박스를 "위치 기능은 사용할 때마다 따로 동의해요" 안내 링크로 대체하면서 위치 동의가 가입 단계에서 완전히 분리됐는데, 같은 시점에 함께 추가된 이름/휴대폰/생년월일/성별 필수 입력은 그대로 두고 위치 동의 체크박스만 되돌린다. 이 체크박스는 백엔드로 전송된 적이 없는 순수 UI 항목이라 API/DB 계약 변경은 없다.
- f27466f: Expose the deployed release version and commit SHA on production responses via `X-Teameet-Release` / `X-Teameet-Commit`, matching what alpha already does, so an incident responder can tell which build is live without shelling into the host.
- 30558b4: Restore original SQL for 5 already-deployed tournament migrations that a checkpoint commit had retroactively rewritten with IF NOT EXISTS guards, unblocking the alpha rollback-compatibility gate.
- 8ea9177: Require the depositor name to be typed when applying to a tournament. The wizard used to prefill it with the selected team's name, so the submit button turned active before the applicant entered anything — the application then carried a team name while the actual bank transfer arrived under a person's name, which is exactly what delays payment matching.
- 002c98a: Wire scripts/qa/test-alpha-release-state.sh into the Gates CI job. This suite existed but was never run in CI, matching the same "untested contract" pattern behind several bugs found and fixed today in the alpha immutable-release pipeline (certbot migration permission, health contract assertion, source-directory pruning).

## 0.1.0

### Minor Changes

- f153ad1: Add password reset by email, the follow-up that account recovery by phone left open once SES was wired up. The "비밀번호 재설정" tab now lets you choose between 휴대폰 and 이메일; picking 이메일 sends a six-digit code to the address you signed up with and, once you enter it, lets you set a new password. The existing email verification endpoints sit behind the auth guard and could not be used while logged out, so recovery gets its own public OTP under `/auth/recovery/email/*`, storing challenges in a new `v1_email_verification_challenges` table because the logged-in verification token requires a user id.

  The proof this flow issues cannot be swapped with the phone one. Both are signed with the same secret, so the email payload carries an `email:` channel label ahead of the purpose, and the signing/expiry/comparison logic both channels share now lives in one place rather than being copied per channel. The email endpoint also never lets the caller pick the purpose — the server pins it to password reset.

  An email address can be tried by anyone, so the request step gives the same answer either way: a challenge is created whether or not the address belongs to an account, and only a registered address actually receives mail. Nobody can guess a code that was never sent, so a wrong guess and an unregistered address fail identically, and the screen says "가입된 이메일이면 인증번호를 보내드려요" rather than confirming anything. Kakao-only accounts still get their mail and are told to log in with Kakao — but only after they have proven they own the mailbox, since saying so up front would leak that the account exists.

- 3069cd0: Add account recovery by phone: find the email you signed up with, and reset your password. `/auth/password-reset` was a placeholder that only explained the situation — there was no recovery API at all — so the "비밀번호 찾기" link on the email login screen now leads to a working `/auth/find-account` with both flows behind one phone verification. Recovery reuses the existing public OTP endpoints rather than adding a second SMS path, and the phone-ownership proof token now carries a purpose so a token minted while signing up cannot be replayed to reset an existing account's password; signup tokens keep their exact old payload shape so signups already in flight survive the deploy. Only a masked email is ever returned, and accounts that signed up through Kakao are told to log in with Kakao instead of being offered a password they never had. Email-based recovery is not part of this — the app still has no email delivery — so it will follow once SES is wired up.
- dab9206: Add an admin error log viewer. Server and client errors were only written to the process log, so investigating one meant opening a shell on the box and reading container output that disappears on restart. Errors now persist with their traceback, request, response, and the server release they happened on, and the admin screen lists them with a detail modal that copies any section — or the whole thing — as markdown ready to paste into an issue. Repeat occurrences fold into a single row with a count (24 hours for 401/403, one hour otherwise) so a flood of the same error never buries the rest. Values under sensitive keys are redacted before anything is written, including secrets that arrive inside a URL query string rather than a field.
- 8f99124: Add an admin manual Web Push send tool — target a single user by ID or broadcast to every current push subscriber (with a required confirmation modal), reusing the existing notification/realtime/web-push pipeline and audit logging.
- c72172e: Add admin observability for SMS and verification failures, mirroring the existing Web Push failure log. A new `V1SmsEventLog` records failure events only (no success events): SMS provider send failures for both selectable providers — Solapi (timeout / network / non-2xx) and Gabia (timeout / token issue / HTTP / app-level `code`), each tagged with the provider and its result code — missing SMS configuration, and verification failures (code mismatch, attempt cap, resend cooldown) from both the pre-account phone flow and the signed-in verification flow. Only the last 4 digits of the target are stored, so raw phone numbers never reach the admin surface. Recording is wrapped in try/catch and can never break the authentication flow it observes. Admin gains a "SMS · 인증 실패" log page with per-row acknowledgement (audit-logged) and a new `GET /admin/ops/summary` KPI endpoint, surfaced on the ops dashboard as "최근 5분" failure cards for both Web Push and SMS — which also connects the previously unused `pushFailuresLast5Minutes` counter to a real consumer.
- 558db24: Give the admin tables page numbers and make their rows do something. Rows highlighted on hover but did nothing when clicked, and the only way forward was a "더 보기" button that piled results up without ever saying where you were or how much there was. Audit log rows now open a detail dialog with the untruncated target ID, the full reason, and the before/after state that the list has to cut short, and the list itself pages with a "전체 N건 중 M–K" readout. Admin list endpoints accept a page number alongside the existing cursor, and rows only take on a clickable appearance where a click is actually wired up.
- 3037826: Sync main-only fixes into dev: admin notice popups can now target specific app screens and carry an internal CTA link, the v1 uploads volume ownership is repaired on every deploy via a dedicated init step, the upload static-file rate limit was removed, and the profile edit action copy was clarified.
- 47395a0: Add an idempotent alpha-only tournament lifecycle dataset covering draft, recruiting, roster lock, live play, completed results with videos, reviews and individual awards, and cancellation. Make SSM deployment failures fail closed, provision the required source mirror tool, and poll the public release identity before accepting a deployment.
- f484d29: 이벤트 허브와 대회 캠페인 사용자 플로우, 프로필 신뢰 정보, alpha 사전 QA 환경과 자동 배포 계약을 하나의 Teameet v1 제품 릴리스로 묶습니다.
- e1d122c: Notify the asker when an admin replies to their inquiry (new `inquiry_answered` event, `inquiry` notification target, deep link to `/my/inquiries/:id`), open notifications in a detail sheet instead of navigating straight away, and surface push-subscription failures instead of leaving the toggle silently off.
- a34d2e6: Add a Socket.IO realtime gateway so notifications and chat messages arrive live instead of waiting for the next poll.
- 6b0129f: 휴대폰 본인인증을 옥토모 무료 MO(polling)에서 솔라피(SOLAPI) MT SMS OTP로 전환한다. 서버가 6자리 인증번호를 발송(SmsSender 어댑터)하고 사용자가 입력하는 표준 방식으로, 옥토모 반영 지연으로 인증이 완료되지 않던 문제를 해소한다. 옥토모 클라이언트·폴링·QR/딥링크 코드와 OCTOMO*\* 배선을 완전히 제거하고 SOLAPI*\*(3값)로 교체했다. `V1PhoneVerificationChallenge`를 codeHash 스키마로 재정의(마이그레이션 동반). 휴대폰 인증은 fail-closed로, SOLAPI 시크릿 미설정 시 `V1_VERIFICATION_DEV_ECHO=true`인 개발/CI에서만 dev-echo(devCode 응답)로 동작하고 그 외에는 issue가 503(`SMS_NOT_CONFIGURED`)로 실패해 가입이 막힌다.
- 1714d7f: 옥토모(Octomo) MO 방식 휴대폰 본인인증을 회원가입에 추가한다(alpha 전용). 이메일·카카오 가입을 인증 완료 전까지 hard-block하고, 레거시 미인증 계정에는 홈 상시 인증 유도 배너를 노출한다. 인증 카드는 번호를 노출하지 않고 "문자 보내기(딥링크)/QR" 단일 CTA + 자동 확인(폴링) 방식이며, 옥토모 키가 없는 환경에서는 기능이 비활성화된다.
- 4dedca6: Require phone verification for every write. Unverified accounts can still browse, but any create/join/submit request is rejected with 403 `PHONE_VERIFICATION_REQUIRED` (verification, signup, logout, withdrawal and the admin console stay open), a global modal explains the block and links to verification, the home banner can no longer be dismissed, and the profile page and account settings both expose the verification entry point and status.
- 6bb97e0: Require phone verification to submit a tournament registration and to add roster players, require re-verification when the profile phone number changes, and fix the verification card's error placement, cooldown tone, and nested-card surface.
- f2f1d72: 대회 운영자가 전용 공지·홍보 팝업을 관리하고, 접수 마감 뒤 대진표를 일괄 공개하며, 경기 결과에 선수별 득점자를 기록할 수 있도록 확장합니다. 사용자 알림은 22개 이벤트에서 일관된 제목과 본문을 제공하고, 참가 신청 화면은 후원사 로고와 고정 CTA를 명확하게 노출합니다. 팀 초대의 항목별 처리 상태와 오류 복구, 매치 종목·날짜 표시도 함께 개선합니다.
- a93ac92: 공개 대회 캠페인의 하이라이트, 상금 정보 구조, 스크롤 모션을 참가 결정 흐름에 맞게 재구성합니다.
- a50cd86: Stop auto-cancelling tournament registrations that have not paid within two hours. The rule had no scheduler, so it only fired when someone happened to read the registration — one production registration submitted on 2026-07-18 was recorded as cancelled nine days later, the moment its team opened the page. Teams now keep their registration until an operator cancels it, and the payment-deadline countdown, the "cancelled after 2 hours" notices and the matching clause in the tournament policy are removed along with it.
- f2df99d: Restore a top-left back control on the email signup screen, and make back controls survive the desktop layout. The signup form rendered without a top bar at all, so once you entered it the only way out was the inline "이전" button buried under the progress bar. It now shows "‹ 회원가입" in the top-left going back to the terms step, which in turn goes back to login — a visible path out of signup at every step. On top of that, `AuthFrame` only ever drew `backHref` inside the mobile top bar, which desktop CSS hides entirely at ≥1024px, so login, terms and signup all had no visible back control on desktop; the in-card nav that was already restoring this for the Kakao signup exit now renders for link-style back too. The inline "이전" button no longer appears on the first signup step, where it did exactly what the new header control does.
- 5f153a4: Split email signup into three steps with phone verification before profile entry, auto-advance on verification success, and mark required fields accessibly.
- 51daeed: Add structured JSON request/error logging (nestjs-pino) with a public throttled client-error ingestion endpoint, and an env-gated GA4 analytics scaffold (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is configured).
- 33f6ebf: Give Kakao signup a way out, and prefill what Kakao already verified. While a Kakao signup is pending, `PendingSocialSignupGate` bounces every route back to the signup step, so browser back and Home silently did nothing — and neither the terms step nor the profile step rendered any back control, leaving the user with no way to abandon signup. Both steps now show a back control (restored on desktop with the same in-card nav the onboarding wizard uses, since the mobile topbar is hidden at ≥1024px) that asks for confirmation and then logs out to the login screen; the server already allowlisted `/auth/logout` for pending signups, so this is the exit it was designed for, and a failed logout is surfaced instead of silently leaving the user stuck. Separately, name/phone/gender from Kakao are now parsed, stored on the existing onboarding draft, and returned by `/auth/me` while signup is pending, so the profile form fills itself in: name and gender are locked as read-only, while the phone stays editable because a Kakao account number can differ from the number the user can actually receive an OTP on. This ships as plumbing — Kakao only sends those fields once the consent items are approved in the Kakao console, and the extra scope is opt-in via `NEXT_PUBLIC_KAKAO_SCOPE` so requesting an unapproved scope cannot break login before then.
- c9f5ec3: 팀 가입 신청 상태 반영·안내 개선

  - 신청/취소 후 refetch 완료까지 버튼 pending을 유지해 상태가 즉시 반영되도록 수정
  - 팀 상세의 배지·CTA가 서로 다른 쿼리를 보던 문제를 eligibility 단일 소스로 통일
  - 승인 대기 안내 카드를 팀 상세에 상시 노출(신청일 + 승인 절차 안내)
  - 정원 마감 시 영어 문구(`Team member capacity has been reached`)가 버튼 라벨로 노출되던 버그 수정
  - 신청 실패 시 서버가 준 구체적 사유를 그대로 노출
  - `GET /me/join-applications` 신설 + `/my/join-applications` 화면 추가(승인 대기 + 처리 결과 확인)

- a92679a: Make the terms screen's agree-all cover optional consents, and stop showing internal document metadata. "필수 약관 전체 동의" only ticked the required items, so anyone who wanted the optional consent had to hunt for it afterwards — it is now "전체 동의" and ticks every item, with each optional item still individually removable and the continue button still gated on required consents alone, so declining an optional item never blocks signup. The agree-all toggle now reflects every item rather than only the required ones, so unticking a single optional consent turns it off instead of leaving it stuck on. Each agreement card also no longer prints the document version and consent status (`v1 · 새 동의 필요` / `· 동의 완료`) — the version is an internal token that means nothing to the user, and already-accepted items are conveyed by their checkbox being ticked and disabled.
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

- 45699bb: Improve login error contrast and disclose the one-time coordinate recipients used for home weather and region lookup.
- 6169ab6: Stop a long route from pushing the error log table's own detail button off screen. A path like /tournaments/campaigns/alpha-qa-futsal-recruiting was rendered without wrapping, so it took 354px of a 1130px table and shoved the release column and the 상세 button into horizontal overflow with nothing on screen to suggest they were there. The route is now truncated with the full value on hover, and the message and release columns give back a little width to match.
- 6420b79: Let the error log table use the full width of the admin page. It was the only admin table still capped at 900px, so on a 1440 screen the occurrence count, release version, and the 보기 button sat outside the table's horizontal scroll with nothing on screen suggesting they were there.
- 8c84d3a: Turn the admin lists back into tables. Every list screen rendered a card grid at all widths, which is fine for a single item but wrong for data you scan and compare — there were no aligned columns, and values were cut to fit the card: the audit log showed times truncated mid-minute, reasons reduced to one character, and IDs stripped to their last eight characters, so a row no longer identified what it was about. On a wide screen a one-item list used a corner of the page and left the rest empty. Ten screens now render a table on desktop and keep the card stack on mobile, with IDs and reasons preserved in full via title text.
- 4c18467: Extend page numbers to the rest of the admin lists. The endpoints for members, matches, teams, team matches, notices, popups, inquiries, admins, tournaments, and error logs now accept a page alongside the cursor they already took, and report the total so a list can say where you are in it. Every admin table uses it: pages replace the "더 보기" pile-up, and changing a filter returns you to the first page instead of leaving you stranded past the end of a narrower result set. Totals come from the existing status aggregation rather than a second query, except error logs, which have no status facet and so are counted with the same filter as the list.

  Paging keeps the previous page on screen while the next one loads, so the table no longer blanks out between pages, and the page buttons lock while the request is in flight. The admin list stopped ignoring the page you clicked. Error log rows open their detail from anywhere in the row, not just the 보기 button.

- 7732dce: Restore the popup list to cards and cap the body preview at two lines. Moving it to a table was wrong for this screen: the list shares the row with a 400px detail panel, and the table wrapper clips whatever overflows, so the view/edit/delete buttons ended up outside the visible area — the row was there but nothing could be done with it. The original complaint was that one popup stretched down the page because its whole body flowed into the card; clamping the preview fixes that without taking the layout away.
- bd2de4b: Fix the popup list hiding its own action buttons. The list shares the screen with a 400px detail panel, so moving it to a table with six columns pushed the view/edit/delete buttons past the edge — the row was visible but nothing could be done with it. Keep status, title, display window, and the actions; the target screens and last-edited time were already available in the detail panel.
- 65ef064: 관리자 대진 관리 화면에서 조 생성 단계와 조별 순위표의 표면, 시작선, 반응형 열 전환을 일관되게 정돈합니다.
- 3a8da7a: 매치·팀매치 목록 상단의 개인/팀 세그먼트가 화면 좌우 끝에 붙어 검색바·종목 칩·카드와 어긋나던 문제를 고쳐 같은 좌우 여백에 맞춥니다. 매치·팀·마이·리뷰 화면의 좌우 패딩도 페이지 여백 토큰을 쓰게 정리해 360px 이하 좁은 화면에서 여백이 어긋나지 않습니다.
- 1c009f8: alpha 배포 스크립트에 디스크 정리 단계 추가 — 빌드 직전 사용하지 않는 이미지·빌드 캐시를 전량 정리하고, 배포 성공 후에도 dangling 이미지·24시간 지난 빌드 캐시를 정리해 EC2 호스트 디스크가 반복 배포로 서서히 가득 차 빌드가 `No space left on device`로 실패하는 문제를 예방한다. 실행 중인 컨테이너가 참조하는 이미지는 `docker image prune`이 항상 보호하므로 무중단 배포에 영향 없음.
- c135ebe: alpha 배포가 카카오 OAuth `redirect_uri`로 프로덕션 도메인(`https://teameet.co.kr/v1/callback/kakao`) 값을 그대로 재사용하던 문제를 고친다. `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`는 alpha와 프로덕션이 같은 Kakao 앱을 공유하므로 그대로 두되, `KAKAO_REDIRECT_URI`만 alpha 전용 GitHub Secret(`ALPHA_KAKAO_REDIRECT_URI` = `https://alpha.teameet.co.kr/callback/kakao`)으로 분리한다. 기존에는 카카오 인증 완료 후 alpha가 아닌 프로덕션 도메인으로 리다이렉트되어 OAuth state 검증이 항상 실패했다.

  별도 조치 필요: 이 redirect_uri를 Kakao 개발자 콘솔의 허용된 Redirect URI 목록에 추가 등록해야 실제로 동작한다(코드/CI만으로는 해결 불가).

- b8d7712: landing 검색 설명 문구를 Teameet 사용자 문체 규칙에 맞춥니다.
- 62887e3: Broadcast admin notifications to every active user instead of only push subscribers, distinguish notification kinds by icon, and make the notification settings copy state-accurate.
- 1e80311: 대회 시상대의 메달 강조는 유지하면서 의미 없이 반복되던 스포트라이트 움직임을 제거합니다.
- 684e35a: Stop the deploy pipelines from destroying the Docker build cache they were designed to use, and split the production build out of the manual approval gate.

  The Dockerfiles already copy the lockfile before `pnpm install` and mount the pnpm store and Next cache as BuildKit cache mounts, but production built with `--no-cache` while alpha ran `docker builder prune -af` immediately before building — so neither reused anything. Production images are now tagged with the release commit SHA and only promoted to `:latest` after approval, which makes a rollback a re-tag instead of a full rebuild. CI splits into Gates/API/Web so the three run in parallel, and the Next.js `actions/cache` step is gone because it stored 95KB per commit and cached nothing.

- 19f7b81: Clarify login recovery and location permission states, and keep desktop navigation fully opaque over scrolled content.
- c610a5d: 팀 목록의 플로팅 생성 버튼이 카드 상태 문구를 가리지 않게 하고, 대회 카드 제목의 한글 어절 줄바꿈을 자연스럽게 유지합니다.
- a0f980c: 대회 문의 모달에 문의 대상, 문의자, 문의 유형을 명확히 표시하고 모바일 바텀시트와 데스크톱 다이얼로그 레이아웃을 개선합니다.
- dd949bb: Compact the home recommended-match error state and align its responsive padding with the surrounding dashboard grid.
- 7e0fbb2: Use the defined Teameet blue border token for campaign prize breakdown cards.
- efc0a01: Turn Changesets' changelog generator back on. `changelog: false` is not compatible with `changesets/action`: the version command succeeds, but the action then reads each bumped package's `CHANGELOG.md` to build the release PR body and dies with `ENOENT` — which is what killed the first release dispatch after the path was repaired. Enabling it also stops throwing away the summaries: until now every consumed changeset's text was discarded, and there was nowhere to read why a version moved.
- faf2890: 홈 추천 카드의 비율과 행동 버튼 정렬을 맞추고, 대회 목록의 필터·간격·이벤트 허브 여백을 공용 화면 규칙에 맞게 정돈합니다.
- 0eb5028: 팀 생성에서 선택한 종목이 화면 상태와 저장 요청에 동일하게 반영되고, 스폰서가 있는 대회 캠페인도 오류 없이 열리도록 수정합니다.
- 8e5e7e0: Finalize the managed terms copy, signup consent policy, and tournament consent flow.
- 01b9ef0: 알파 채팅 알림이 다른 채팅으로 보이던 문제 수정 — nginx 인증 헤더 스트리핑 제거, 채팅 조회 실패 시 mock 대화 대신 실제 에러 화면 노출, 로그인/가입 시 React Query 캐시 초기화
- 6ce620e: 모바일 캠페인 하단 CTA를 콘텐츠 패딩에 정확히 맞춰 불필요한 가로 스크롤을 제거합니다.
- 3f5a93d: 캠페인 소개 섹션이 전체 페이지 캡처와 빠른 스크롤에서도 기본 표시 상태를 유지하고, 상금 목록의 의미 구조를 올바르게 읽도록 보완합니다.
- fff1ead: 팀 전체조회의 팀장/감독 이름과 마이페이지 상단 이름 표시를 닉네임 우선으로 통일합니다 — 팀 목록 endpoint만 표시이름(실명)이 닉네임보다 먼저 노출되던 예외를 다른 모든 endpoint와 같은 순서로 맞췄습니다. 프로필 저장 직후 마이페이지 등에서 이전 닉네임이 잠깐 남아 보이던 문제도 함께 고칩니다 — 저장 응답으로 프로필 캐시를 즉시 갱신합니다.
- 15a0b42: Fix a real bug found via live E2E push-notification testing: `useV1PushRegistration().subscribe()` called `pushManager.subscribe()` on the registration `navigator.serviceWorker.register()` resolved directly, which on a brand-new registration is still installing — every user's first-ever subscribe attempt threw "no active Service Worker" and failed silently (caught by `reportClientError`, no visible error state). Now awaits `navigator.serviceWorker.ready` first, matching the existing pattern in `unsubscribe()`. Also adds a dismissible home-screen banner that re-nudges existing users who declined or never responded to the onboarding push prompt, shown once per login/session.
- 22b054f: 이미지 목록 로딩이 /uploads rate limit을 소진해 상세 진입 시 503 나던 문제 수정 — 대회 시상식/리뷰 갤러리·리뷰 목록 이미지에 loading="lazy" 추가
- 29042e2: 로그아웃/세션 무효화 시 배포 환경에서 로그인 화면("로그인 정보를 확인하고 있어요")에 멈추는 문제 수정 — /login으로의 리다이렉트를 하드 네비게이션으로 전환해 로그인 상태에서 prefetch된 인스턴스가 재사용되는 문제를 우회
- de8a75c: Allow a co-owner to leave a team when the active membership summary confirms that another owner remains, while keeping the last owner protected.
- bfc6ccc: Route direct email-signup entry through required terms before accepting account and profile input.
- 6835fda: Wire the GA_ALPHA GitHub secret through the alpha deploy pipeline (SSM command parameter, never written to deploy/.env) so the v1_web build on alpha.teameet.co.kr can pick up NEXT_PUBLIC_GA_MEASUREMENT_ID.
- fb6fc5a: Add GA4 trackEvent calls for chat, notification, review, and push-subscribe flows (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set).
- 132aa0d: Add GA4 trackEvent calls for team and tournament flows (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set).
- bd5575d: Fix GA4/structured-logging defects found by live alpha verification and a logic-correctness review: CSP was silently blocking GA's gtag.js script on every page (script-src had no googletagmanager.com allowance) — same fix applied to both alpha and prod nginx configs; the AllExceptionsFilter's manually-built `route` field bypassed the pino req serializer's query-string stripping, leaking PII (e.g. emails in `?email=...`) into structured logs; the pino req serializer stripped headers entirely before redact.paths could run, making the redact config a no-op; 5xx error stacks were logged unbounded; raw free-text search queries were sent to GA4 as an event parameter; and the client-error-reporter's dedupe key ignored severity/stack, letting a low-severity report suppress a differently-caused higher-severity one.
- d6fbb85: Hide incomplete campaign prize breakdown rows that do not include a display value.
- 625e71a: 대회 팝업 관리 화면의 쓰기 권한 표시를 API 권한과 일치시키고, 공개 팝업의 원격 이미지가 깨지면 로컬 이미지로 안전하게 대체합니다.
- 0dc046c: Deliver `NEXT_PUBLIC_KAKAO_SCOPE` to the built web image so the Kakao consent items can actually be requested. The signup prefill work added the code that appends `scope` to the Kakao authorize URL, but `NEXT_PUBLIC_*` values are inlined at build time and the variable was declared nowhere in the pipeline — no Dockerfile `ARG`, no compose entry, and absent from the allowlist of environment variables the alpha workflow forwards to its deploy script — so setting it had no effect. It is now wired through the Dockerfile, both compose files, the alpha deploy chain and the production build args, sourced from a `KAKAO_SCOPE` repository variable. Leaving it unset keeps today's behaviour exactly: no `scope` parameter is sent, which matters because Kakao fails the authorize step outright when asked for consent items the app has not been approved for.
- f42e2fe: 캠페인을 열어둔 채 신청 마감 시각이 지나도 대회 상세 CTA가 즉시 이어지도록 모바일 고정 행동을 보완합니다.
- 3209cac: Add loading="lazy" to gallery/list images in tournament awards, reviews, and admin review moderation to reduce concurrent /uploads requests.
- 29c006e: Update the deploy health contracts, E2E route contract, and ops docs so legacy `/v1/*` URLs are expected to redirect (308) to their current paths instead of returning 404.
- f83f4cd: 홈 추천 카드의 행동 버튼 기준선을 모바일과 데스크톱에서 동일하게 맞춥니다.
- f2f1d72: 후원사 로고를 클릭할 수 없는 전용 표시로 유지하고, 외부 이미지가 로드되지 않을 때 중립적인 후원사 이니셜을 보여주도록 개선합니다.
- 7eeef95: Fix the alpha rate limiter counting every visitor as one client. nginx sat behind the load balancer without `real_ip`, so `limit_req` bucketed all traffic under the balancer's own address and a single person opening `/my` could exhaust the budget for everyone — the resulting 503s surfaced as "로그인 상태를 확인하지 못했어요" even though the session was still valid. Trust the balancer's forwarded address, raise the budgets to match what one screen actually requests, give `GET /auth/me` its own budget so session checks no longer compete with login attempts, and let the auth probe retry transient failures instead of settling on an error the user cannot leave.
- 7bff77e: 옥토모 휴대폰 본인인증 폴링을 안정화한다(alpha). (1) desktop 자동폴링이 사용자가 QR을 스캔·전송하기도 전에 확인 상한(30회≈2분)을 소진해 "시도 초과"로 자멸하던 문제를 상한 180회(2초 폴링으로 5분 TTL 전체 커버)로 수정한다. (2) `OctomoClient`의 `fetch`에 5초 timeout(AbortController)을 추가해, 무료 API인 옥토모가 지연될 때 백엔드 커넥션이 누적돼 upstream이 503으로 죽는 것을 막는다. (3) 폴링 중 옥토모 오류(timeout·rate-limit·5xx)를 "아직 도착 안 함"으로 흡수해 매 폴링이 500이 되거나 행이 걸리지 않게 한다. (4) 폴링 간격을 4초→2초로 줄이고 진입 즉시 1회 확인해 체감 지연을 없앤다(verify throttle 40/60s와 정합). (5) 인증코드를 6자→8자로 강화한다(딥링크 자동삽입이라 입력 부담 없음).
- dfc6c4e: Preserve recent production BuildKit dependency caches across sequential API and web image builds while enforcing age, maximum usage, and minimum free-space limits.
- 82abb94: 휴대폰 본인인증 카드에 인증 코드를 크게 노출하고 복사 버튼을 추가한다(오타 방지). 모바일 `sms:...?body=CODE` 딥링크가 기기·문자앱(삼성 등)에 따라 본문(코드)을 신뢰성 있게 채우지 못해, 사용자가 코드를 잘못 입력·전송하던 문제(옥토모는 정확일치 조회라 한 글자만 달라도 영영 매칭 실패)를 막기 위함이다. 수신번호(1666-3538)와 코드를 명확히 표시하고, 딥링크 버튼은 "문자 앱 열기"로 보조 제공하며, 데스크탑은 QR + 코드 폴백을 함께 노출한다.
- 7b1639f: 휴대폰 인증 카드가 모바일에서 "문자 앱 열기" 버튼을 눌러야만(`sending`) 문자 도착 폴링을 시작하던 것을, **발급 직후부터 폴링**하도록 수정한다. 직전 코드 노출+복사 UX 도입으로 사용자가 코드를 복사해 직접 문자앱으로 보내면 그 버튼을 누르지 않아 폴링이 아예 시작되지 않았고, 그 결과 문자를 보내도 인증이 영영 완료되지 않던 회귀를 고친다. `sending` 상태를 제거하고 `polling = issued && !verified && !expired`로 단순화(기기 구분 없이 발급 직후 폴링, `MAX_POLL_ATTEMPTS`·throttle가 상한 보장).
- bc187f9: Show which phone number the verification code will be sent to on the phone verification screen, and let people correct a wrong stored number there instead of having to edit their profile first.
- 1998891: Refine the event hub into a responsive campaign card grid and strengthen tournament campaign conversion with registration countdowns, hero actions, prize emphasis, and sponsor information.
- f4580de: 신청할 수 없는 모바일 캠페인에서도 대회 상세 CTA를 유지해 빈 고정 영역이 나타나지 않도록 보완합니다.
- 42323ca: 전역 인증 게이트 중 `PendingSocialSignupGate`가 `/auth/me` 실패를 이유 불문 "로그아웃"으로 처리하던 문제를 고친다. `RequireAuth`/`SessionEntryGate`는 이미 진짜 401(미인증)일 때만 로컬 세션을 지우도록 수정됐지만(#100), 앱 전체를 감싸는 `PendingSocialSignupGate`는 여전히 `authMe.isError`(503/네트워크 오류 포함 모든 실패)만으로 세션을 지우고 소켓을 끊었다. alpha 배포 중 몇 분간의 백엔드 다운타임(503)에도 실제로는 로그인 상태인 사용자가 강제 로그아웃되는 현상의 원인이었다. 형제 컴포넌트와 동일하게 `error.statusCode === 401 || error.code === 'UNAUTHENTICATED'`인 경우에만 세션을 지우도록 통일한다.
- 3bea849: Let unverified accounts finish phone verification inside profile editing: the card now uses the authenticated flow (which updates the account) instead of only issuing a proof token, so saving no longer bounces off the server-side verification gate.
- cbd6ce6: Re-subscribe on pushsubscriptionchange so renewed browser subscriptions keep working, reuse an existing tab on notification click, and report real web-push delivery counts so an admin send that reached nobody is no longer shown as success.
- c24f85a: Show the browser-notification toggle as switching immediately while subscription is still in flight, instead of leaving it untouched for several seconds.
- 918c3e7: Alpha 배포에서 Nginx를 재생성해 새 릴리스 버전과 커밋 SHA 헤더가 실제 배포본과 일치하도록 합니다.
- 439fdf9: 프로덕션 호스트의 BuildKit 버전에서 지원되지 않는 캐시 정리 옵션을 제거하고, 호환되는 기간 기반 정리만 사용해 이미지 빌드 전에 배포가 중단되지 않도록 한다.
- a608551: 완료 대회 시상·리뷰 화면에서 상금 카드가 후기 컬럼 높이만큼 늘어나던 데스크톱 레이아웃을 콘텐츠 높이에 맞게 조정합니다.
- f56517b: 모바일 캠페인의 고정 CTA를 단일 주요 행동으로 압축해 소개 콘텐츠와 상금 정보를 가리지 않도록 개선합니다.
- 1169ba7: 태블릿 캠페인의 상금 요약과 상품 내역을 한 열로 배치해 긴 상품명과 시상 라벨의 가독성을 높입니다.
- 2586cd5: Break the self-contradiction that kept the release workflow from ever running. `resolve-changeset-version.mjs` asserted that at least one unreleased changeset exists, and `deploy-alpha.yml` calls it without a guard — so consuming the changesets (which is what releasing does) would have broken every subsequent alpha deploy. The resolver now tolerates an empty changeset directory and labels the build against the next patch, so a freshly released 0.1.0 is followed by `0.1.1-alpha.*` and SemVer ordering still holds. The "behavior changes need a changeset" gate is untouched — that lives in `check-changeset-policy.mjs`. The release PR now targets `dev` instead of `main`, matching the branch policy, and refuses to open when there is nothing to release. CI also runs `scripts/release/versioning.contract.test.mjs` for the first time — the suite existed but was never executed, which is why the contract violation survived.
- 4d163e2: 배포 후에도 오래 열려있던 탭이 옛날 JS 청크를 계속 참조하다 청크 로드 에러를 만나는 문제를 막기 위해, alpha가 매 응답에 싣는 `X-Teameet-Release` 헤더를 주기적으로(3분 간격 + 탭 포커스 복귀 시) 폴링해 배포 버전이 바뀌면 "새 버전으로 업데이트하고 있어요" 화면을 짧게 보여준 뒤 자동으로 새로고침한다(`ReleaseVersionWatcher`, 루트 레이아웃에 상시 마운트). 이 헤더가 없는 환경(local dev, 아직 헤더를 추가하지 않은 production)에서는 baseline 자체가 안 잡혀 조용히 비활성 상태로 남는다 — production에 동일 헤더를 추가하는 작업은 별도로 진행한다.
- 8c58848: 캠페인 하단 행동 영역을 일반 문서 흐름에 배치해 상금과 후원 콘텐츠를 가리던 고정 오버레이를 제거합니다.
- 6d9d4de: Harden production deployment with explicit GitHub token permissions, pinned SSH host keys, stdin-only secret transport, and the registered GA_PROD configuration.
- a129217: Fix 18 confirmed cross-PR integration gaps found by a whole-session review of the observability/realtime/web-push work (PR #81-93): chat messages now trigger web push, sockets disconnect on logout (closing a cross-user data-leak path), the realtime gateway no longer risks a process crash on a transient DB error during handshake, web-push send failures are now logged instead of silently swallowed, duplicate push+socket notifications are suppressed when the app is focused, and several smaller consistency/coverage gaps (missing GA event, dead `chat:join` emit, admin nav item, deploy docs, test-quality fixes).
- 71a6c5a: Make the alpha host load preflight compatible with Amazon Linux gawk so a healthy host can proceed to its sequential image build.
- 8480a46: Speed up and stabilize alpha delivery by keeping CI focused on the complete v1 verification contract and reusing safe dependency and Docker build caches.
- b2b33cb: Add GA4 trackEvent calls for sign-up, login, onboarding, and acquisition flows (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set).
- ab925c8: Fix a managerCount race in team self-leave (use the role read inside the transaction instead of a stale outer read) and de-duplicate the shared match/team-match creation-wizard fields (DraggableFilterSheet, CreateField, GenderRuleSelector) into `components/v1-ui/create-form-fields.tsx`.
- b440fac: Fix a flaky "window is not defined" crash in the tournament results champion banner replay animation — the requestAnimationFrame/setTimeout chain scheduled by clicking replay was never cancelled on unmount, so it could fire after the page/test environment was torn down.
- 834b496: Correct public tournament stage ordering and rebalance bracket layouts across desktop, tablet, and mobile.
- c004657: Keep Korean tournament status phrases together when card titles wrap.
- a50cd86: Explain why a tournament cannot take a new application instead of failing at submit time. Awaiting-payment teams reserve capacity on the server, so a tournament shown as "5 / 8 confirmed" could already be full; the list card now names the awaiting-payment teams, the per-team application hub shows the capacity breakdown and the concrete blocking reason, and the apply wizard checks capacity and the registration deadline up front rather than letting a re-applying team fill in every agreement before hitting a 409.
- d77451c: Require the depositor name to be typed when applying to a tournament. The wizard used to prefill it with the selected team's name, so the submit button turned active before the applicant entered anything — the application then carried a team name while the actual bank transfer arrived under a person's name, which is exactly what delays payment matching.
- f343459: 하위 화면에서 홈으로 나갈 방법이 없어 사용자가 갇히던 문제를 해결한다.

  - 대회 조회형 화면(내 신청·순위·최종결과·시상·리뷰·선수 명단)에 하단 탭바를 복원한다.
  - 하단 탭바가 없는 모든 하위 화면의 상단바에 홈 단축 버튼을 공통 추가한다.
  - 매치 상세·팀매칭 상세는 상단바까지 꺼져 있어 히어로 액션에 홈 버튼을 직접 둔다.
  - 전역 404 페이지를 추가한다. 기존에는 Next.js 기본 화면(영문·링크 0개)이 떠서 만료된
    링크로 들어오면 완전히 갇혔다.
  - `AppChrome`의 `activeTab` 기본값 `'home'`을 제거한다. 검색처럼 5개 탭 어디에도 속하지
    않는 화면이 "홈" 탭을 활성으로 잘못 표시하던 문제를 고친다.

- 2f52044: Let teams re-apply to a tournament after their previous registration was cancelled (the wizard no longer reuses the cancelled registration id, which the server rejects with 409), and redirect legacy `/v1/*` URLs to their current paths.
- 10a65b3: Reject upload video paths that escape the `/uploads/` prefix via traversal (including percent-encoded forms), and fall back to `crypto.getRandomValues` when a WebView lacks `crypto.randomUUID`, so search session ids and roster draft rows keep working on older Android WebViews.
- 759c9b8: 관리자 공지·팝업 실제 화면 미리보기 iframe이 alpha에서 X-Frame-Options: DENY로 차단되던 문제 수정 — /admin-content-preview 전용 same-origin 프레이밍만 허용
- 9604e8a: Fix a Socket.IO handshake regression discovered via live verification on alpha (Next.js's trailing-slash redirect ran before rewrites, 404ing every realtime connection in production) plus 8 confirmed findings from a security/functional adversarial review of PR #95/96/97: an open-redirect bypass in the admin push-send `url` field (backslash trick around the relative-path regex, hardened in both the DTO and `sw-push.js`'s notificationclick handler), the session cookie's `Path` scoped too narrowly to reach `/socket.io` (production cookie-based socket auth always failed), Referer header PII (OAuth code/state) missing from pino redaction, unscrubbed query-string PII in the client error reporter's `context.path`, sockets not force-disconnected when an account is suspended/blocked/deleted, silent swallowing of non-"already deleted" errors when cleaning up expired push subscriptions, a GA `search` event doc/implementation mismatch, and a defensive fix so the socket auth payload re-reads the latest session on every reconnect instead of caching the first one.
- bf4e5b0: Patch axios (ReDoS, prototype pollution, credential/header leaks via redirects and proxy handling), Next.js (middleware/proxy bypass, SSRF via WebSocket upgrade, connection-exhaustion DoS), and ws (memory-exhaustion DoS via socket.io) to their fixed versions.
- 0dcea25: Hide the participant team list on tournament detail/campaign pages while a tournament is still recruiting (status='open'). Team names/logos are only shown once registration closes (status='closed' or later); the confirmed-team count remains visible throughout so users can still see how many teams have signed up without seeing who.
- 5caad2a: alpha 배포 SSM 명령에 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI` GitHub Secret을 `GA_MEASUREMENT_ID`와 동일한 방식으로 전달한다. `deploy-alpha.sh`는 이미 이 변수들을 읽고 있었지만 `deploy-alpha.yml`이 전달하지 않아 alpha 인스턴스의 `deploy/.env`(운영자 관리 대상, 자동 동기화 없음)에 실제 카카오 값이 채워진 적이 없었고, 그 결과 alpha 로그인 화면의 카카오 버튼이 "준비 중"으로 계속 비활성화돼 있었다.
- 8ab529e: 회원 탈퇴 플로우의 UI 문구·백엔드 검증 로직·세션 처리를 정리합니다. 실제 상태를 반영하지 않는 고정 배지를 약관 화면과 동일한 접기/펼치기 안내로 바꾸고, 확인 모달 문구를 실제 동작(운영팀 검토 대기)에 맞게 수정했습니다. 진행 중인 매치 참여나 팀 운영 권한이 있으면 탈퇴를 막는 검증 로직을 새로 추가했고, 탈퇴 신청 성공 시 로컬 세션을 지우고 인증 가드도 `withdrawal_pending` 계정을 차단하도록 했습니다. 데스크탑에서 CTA 버튼이 콘텐츠 폭과 어긋나고 화면 하단에 큰 빈 공간이 남던 레이아웃 문제도 함께 고쳤습니다.
- f6b0eba: Add GA4 trackEvent calls for match and team-match flows (no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set).
