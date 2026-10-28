# MD-QA #141 일반 팀매치 경기 규칙 설정

Status: In Progress

## Context
기존 리포트 https://teameet.jmandu.kr/issues/141/ 의 일반 팀매치 단판·전후반 설정 부재를 조사한다. root가 김성준 담당·확인 중을 실제 UI에서 확인했다. 현재 DTO에는 해당 입력이 없고 생성 시 종목 기본 immutable config version을 pin한다.

## Goal
최신 직접 사용자 선택 B: 경기 규칙 설정을 별도 화면으로 분리한다. 이전 A 선택은 B로 대체한다. 저장된 설정을 실제 Game/운영 콘솔이 사용하고 기존 종목·경기를 유지한다.

## Original Conditions
- [x] 2026-10-13 최신 직접 사용자 B 선택으로 A 대체
- [x] 관리형 전용 worktree/feature branch, origin/dev 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [x] 단판/전후반 저장·읽기 계약과 상태/권한/종목 제약 고정
- [ ] 실제 RED→GREEN·독립 리뷰·dev PR·기존 댓글

## User Scenarios
일반 팀매치 생성·수정 여정에서 별도 규칙 화면을 열고 지원 종목의 단판/전후반을 선택한다. 저장·복귀·재조회 후 같은 설정이 표시되고 운영 콘솔이 pinned config를 사용한다.

## Test Scenarios
- Happy: 별도 규칙 화면의 선택이 생성/수정 payload, pinned version, 상세와 콘솔에 일치한다.
- Edge: 뒤로가기/재진입, 기존 경기 호환, 지원 종목 전체, immutable config reuse를 확인한다.
- Error: 권한·완료/진행 경기 보호·지원하지 않는 설정·저장 실패를 노출하고 가짜 성공/빈 경로를 만들지 않는다.
- Mock: 실제 controller+DTO+service+hooks/type/MSW를 대조한다. 모델을 임의 변경하거나 mock만 성공시키지 않는다.

## Parallel Work Breakdown
Phase A readonly technical plan: v1 existing config version, general team-match create/edit, league custom-config reuse, console pin 계약을 조사해 실행 가능한 최소 범위를 root에게 전달한다. source/Git/tests/browser/공유문서 변경 Forbidden.
Phase B 단일 shared-contract owner: DTO/service/config resolver 및 hooks/types/MSW/API docs에 필요 변경을 선행한다. Phase C 그 뒤 별도 규칙 UI owner: 독립 routes/components. 같은 shared 파일은 중복 소유하지 않는다. root는 task/Changeset/Git/통합/직렬 검증/PR/브라우저를 소유한다. 별도 독립 reviewer가 적대적 검증한다.

## Acceptance Criteria
- Server optional `periods: [{ durationMinutes: number }]` accepts one/two periods with nested validation; omitted create keeps default and omitted edit keeps current pin. No UI-only serialized rulesText substitute.
- Rule-options read verifies active host owner/manager and returns actual same-sport defaults. Custom versions use a separate team-match lineage, never publish into `${sportCode}-v1` global default; immutable same-sport/content hash reuse and collision handling preserve non-period sections.
- Rule edit locks Game then TeamMatch and rechecks version/permissions/lifecycle. Real source-created revision-1 DRAFT roster is retained; submitted/locked/historical gameplay, periods with start/end/pause, events/results and LIVE/PAUSED/ENDED deny repinning.
- Create inserts `/team-matches/new/rules` between condition and place-time; edit uses `/team-matches/:id/edit/rules`, with entity/version-scoped draft and one final existing POST/PATCH. Existing console consumes pinned duration response, no new shared realtime protocol.
- B 별도 규칙 화면이 실제 생성·수정 여정에 연결되며 선택값은 실제 서버 저장에 반영된다.
- immutable config pin과 기존 경기·종목·상태·권한 계약을 보존한다.
- 실제 실패 회귀와 GREEN, committed tree/type/lint, 최신 head FindingsNone을 기록한다.
- alpha 배포 SHA에서 screenshot/console/network/viewport를 검증하기 전 runtime/시각 완료로 표시하지 않는다.

## Tech-Debt Resolved
조사 중. UI false affordance와 config/type/MSW drift를 같은 범위에서 정리한다.

## Security Notes
host/team owner-manager 권한과 운영 콘솔의 별도 권한을 보존한다. 과거 경기 config를 소급 변경하거나 실제 개인정보·비밀을 읽지 않는다.

## Risks & Dependencies
기존 리그 설정을 일반 팀매치에 복사해 중복 config 엔진을 만들지 않는다. API contract 선행 후 UI 구현. #134/#135 콘솔 shared hook 소유권과 충돌하지 않게 명시적 도메인별 범위를 고정한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | A inline 또는 B 별도 화면 | 최신 B 선택. A는 superseded |
| 2026-10-13 | root | config version 저장 방식/종목별 제약 | Phase A 현재 v1 조사 중 |

## Progress Snapshot
- 2026-10-15 root final source checkpoint: 최신 dev `d77f8e3176ffa03ad39a32f0f6a04c19e7a75bcb`를 일반 merge한 뒤 `887e357b0` R4 수정과 `454871a5c` fixture 계약 보완을 커밋했다. 50개 전체 변경 경로의 diff-check/debt marker는 0이며 미추적 파일은 독립 리뷰 `.omo/evidence/`뿐이다. API13+문서3+Changeset1 독립17/17 및 frontend32/32 정적 리뷰 Critical0/Warning0이다.
- 2026-10-15 root final validation: committed API4파일250/250 PASS(20.192s)·API tsc PASS, UI6파일307/307 PASS(39.76s), fixture3파일34/34 PASS(12.97s), hook/cache/route chrome/조건5파일103/103 PASS(24.77s), shared facet 포함 이전3파일52/52 PASS. 그룹 간 중복을 전체 건수로 합산하지 않는다. 최종 Web tsc `--noEmit --incremental false` 및 실제 `apps/v1_web/scripts/v1-pattern-check.mjs` PASS. 초기 타입 fixture 오류3건은 필수 계약을 채우고 중복 선언을 제거해 해소했으며 타입을 약화하지 않았다.
- 2026-10-15 root adversarial loop: 저장17/19·전역단판/전후반 이력 없음에서 단판 선택 후 원래 전후반으로 돌아가지 못하는 실제2 FAIL을 확인했다. 현재 route ID·version·rulesEditable에 묶인 저장 두 기간으로만 복원하고, unchanged PATCH는 periods 생략/기존 pin 보존, changed23/29는 실제 PATCH/독립 GET 일치를 검증했다. 생성과 잠긴 수정은 전역/상태 gate를 유지한다.
- 2026-10-15 root remaining gates: 새 dev PR·정식 SHA 고정 리뷰·원격 CI/스레드·실제 dev 머지·alpha 배포와390/768/1440 실측·기존 리포트 댓글을 이어간다. 실제 PostgreSQL integration6건은 Docker daemon OFF로 NOTRUN이다. dev d77의 기존 worker lease 테스트 CI 실패는 별도 최소 수정 lane에서 처리하며 이 변경의 성공으로 숨기지 않는다. 초기 잘못된 루트 패턴 경로/인자 없는 Task127 전용 문서 검사 실행은 검증 성공 근거에 포함하지 않는다.
- 2026-10-15 root: 기존 WIP38파일을 cc76159be에 명시 pathspec checkpoint로 보존하고 최신 dev c4f477c31을 일반 merge한53218c4cd를 검토 기준으로 고정했다. 이전 Phase A 기록은 역사다. API11/11 C2/W1·frontend27/27 C4의 실제 결함을 별도 독립 reviewer가 찾았다. 최초 실제 DTO/service83건에서11 FAIL/72 PASS, canonical JSON 반례2 FAIL, 옵션 응답3 FAIL을 확인하고 같은 작업에서 수정했다.
- 2026-10-15 root: 실제 API DTO/service/controller/기존 service250/250 PASS(24.721s). 종목·ACTIVE·실제 canonical JSON 동일성으로 cross-writer reuse를 보호하고 유효 단판 default 및 페이지 끝까지의 실제 전후반 이력, nullable twoPeriodDefaults를 지원한다. int4 상한은2147483647이다. 기존1925 fixture 적용·잠금·동일 값 복구를 보존한다. 실제 PostgreSQL HTTP/잠금 회귀6건을 활성 경로에 작성했으나 Docker daemon OFF이므로 DB integration NOTRUN이다.
- 2026-10-15 root: UI 최초6 FAIL/162 PASS는 초안 보존·캐시 오류·상세 readback 수정 뒤 해소됐다(중간300 PASS/1개 이전 문구 기대 FAIL은 새 저장 초안 계약·실제 저장소/재진입 단언으로 보강). shared HTTP historical1 FAIL 및 옵션/상한5 FAIL, 날짜/이력7 FAIL 뒤 실제3파일52/52 PASS(18.86s). 날짜만 고정하고 네트워크 타이머를 유지하며 actual MSW validation/write/read를 검증했다. 단판→전후반 이력 및 int4/합계 UI4 FAIL은 같은 루프에서 수정했다. 최종 committed UI·타입·패턴·독립 immutable head·dev PR/CI·alpha·기존 댓글은 아직 PENDING이다.
- 2026-10-15 root: 역할은 API writer / frontend shared contract / UI writer / 각 독립 reviewer로 분리했고 root만 테스트·Git·문서·PR·브라우저를 수행한다. 새 schema/migration은 없다. API README/global/domain 및 Changeset을 같은 범위에서 맞췄다. 코드/테스트/정적 리뷰를 실제 alpha 또는 실제 PG PASS로 표시하지 않는다.
- Phase A readonly technical plan complete on9e3d596: existing schema supports immutable pin/period changes, no initial migration. Pure normalizer/validator/hash and version publication may be factored from tournament implementation, but admin-only endpoint/registry permission must not be reused for ordinary hosts. Single API shared owner prepares genuine DTO/service RED using real DRAFT source aggregate before production edits; frontend shared contracts follow frozen API, then one UI owner handles shared create/edit component. Root retains docs/Changeset/Git/tests/PR/browser.
- 2026-10-13 root: 관리형 생성/등록·feature branch 완료. 최신 B로 계약 계획을 시작한다. 구현/회귀/PR/alpha NOT RUN.


## 2026-10-27 후속 — 일반 운영 진입 A

2026-10-27 직접 선택: **A — 상세에서 바로 열기·모집 중 보기 전용 미리보기**. 별도 규칙 화면 B 선택은 유지해요. 기존 PR #1932는 외부 소유의 완료된 규칙 변경으로 보존하고, 이 후속은 새 loop 소유 브랜치에서 진행해요. 2026-10-28 재개 시 최신 origin/dev 745eb4e352719dc654e9035f83d6b84a4151a52e로 FF했고, 이전 중단 때 제품 변경은 없었어요.

### 후속 목표와 계약
- 일반 TeamMatch 상세에서 canonical Game 운영 경로로 이동해요. 모집 중에는 저장된 단판·전후반을 보기 전용으로 확인해요.
- TeamMatch→Game source/id 관계, 실제 host owner/manager 권한, 직접 URL 접근과 명단의 side/state 개인정보 범위를 확인해요. 기존 Game GET/operations-lineup을 우선하며 새 API가 필요하다고 추정하지 않아요.
- 읽기 전용 preview 경계와 ordinary host lease-free / tournament leased 운영 모드를 구분해요. preview는 자동 takeover·명령·이벤트·queue 전송이 모두 0이에요. 상대 확정 후 host 운영은 기존 서버가 허용한 lease 없는 명령·이벤트 경로를 써요.
- tournament/regular league staff lease·authorization version·snapshot·reconnect·queue 계약은 유지해요. 가짜 TournamentOpsRoleProvider 또는 권한 우회는 금지해요.
- 일반 경기의 generic end는 서버가 금지하므로 노출하지 않고 현재 TeamMatch 결과 제출 경로를 연결해요. 결과 정책 정본은 ‘결과 보내기→어드민 확인’이며 이전 계획의 ‘상대 승인’ 표현은 새 정책으로 구현하지 않아요.

### 후속 ownership·순서
1. Wave A data/transport — Luna: use-v1-game-operations-console.ts, use-v1-game-operations.ts 및 관련 hook tests, 필요 시 game-operations types/queue helpers. UI·API·task·Changeset·Git은 금지해요. 실제 기존 서버 계약을 읽고 mode 계약을 먼저 고정해 UI 담당자에게 전달해요.
2. Wave B UI — Luna: team-matches/[id]/operate route, team-matches-client, operate-console 및 source/result adapter와 관련 UI tests. Wave A hook/type 파일은 금지해요. 데이터 계약 고정 전에는 읽기 조사·테스트 시나리오 준비만 해요.
3. Root: task/Changeset·Git/PR·직렬 검증 조정·조건부 dev merge·Alpha QA·tracker. 별도 Sol: exact diff 독립 리뷰와 반례 검증. 모든 작업자는 다른 세션의 변경을 보존해요.

### 후속 검증·완료 기준
- [x] A/B/C 비교·선택 완료, 기존 B 별도 규칙 결정 보존
- [ ] 실제 UI preview의 운영 hook 미마운트·쓰기0 및 hook RED→GREEN: authorized ordinary lease-free command/event, unauthorized/preview negative, tournament lease 회귀
- [ ] 상세→route binding·권한·로딩/오류/미일치, period label/duration, ordinary end 숨김·실제 결과 경로, tournament 결과 흐름 보존
- [ ] 영향 범위의 직렬 최소 worker 테스트·Web tsc·pattern·committed diff·node_modules 추적0
- [ ] Sol 독립 리뷰·지적 재수정·현재 head 필수 CI/check-runs·실제 원격 리뷰 게이트
- [ ] dev merge와 Alpha 서빙 SHA 조상 증명, ego 실제 역할·390/768/1440 화면·console/network·gallery
- [ ] 실제 검증 범위에 따른 tracker PASS 완료 또는 미완 범위 기록

### 후속 QA 허용 범위·잔여 위험
기존 승인으로 만든 일반 QA 경기 A/B(모집 중)만 재사용해요. 새 진입 A 선택은 새 데이터·신청/승인·takeover·명령/이벤트·경기 진행·결과·권한 쓰기 승인을 확대하지 않아요. 모집 preview만으로 command-flow PASS를 주장하지 않아요. 실제 브라우저 작업 뒤 별도 finish keep:[]와 부재 확인으로 QA 창을 닫아요. 로컬 Next 서버/build·공유 Prisma generate·main/prod 변경은 하지 않아요.

### 후속 Progress Snapshot
- 2026-10-28 11:53 root: 중단1050 잠금을 복구했고, 제품 변경 없이 최신 dev로 FF했어요. #141 후속 owner=loop, 신규 PR은 아직 없어요. 구현·독립 리뷰·CI·Alpha QA는 대기예요.

### 2026-10-28 Wave A 고정 인터페이스
`useV1GameOperationsConsole`의 옵션에 `operationMode?: 'ordinary-host' | 'tournament-leased'`, `teamMatchContext?: { teamMatchId: string; gameId: string | null; status: V1TeamMatchApiStatus; isStandalone: boolean; viewerCanManageHost: boolean }`, `gameSourceType: GameSourceType | null`, `gameActorRole: GameActorRole | null`을 추가하고 `canOperate`를 반환해요. 기존 Game detail id/status/realtimeAuthorization 옵션은 유지해요.

일반 host gate는 성공한 실제 Game id·TEAM_MATCH source·team_owner/manager actorRole·unscoped/0 권한과, 실제 TeamMatch 응답의 gameId 일치·matched·nonleague·viewer.manageableHostTeam을 함께 검증해요. Game read actorRole만으로 host를 판정하지 않아요. Game 응답에는 sourceId가 없으므로 존재하지 않는 필드를 만들지 않아요. 모집 preview와 completed/cancelled/권한 변경은 쓰기 불가예요. 기존 tournament adapter는 leased 모드를 사용하고, 생략 시 기존 leased 동작을 보존해요. 실제 쓰기 권한은 각 서버 API가 다시 검증해요.

### 후속 실제 서버 입력 계약 발견·범위 보완
2026-10-28 Wave A에서 ordinary TEAM_MATCH의 `requireTakeover` 예외와 달리 REST DTO·Socket.IO parser가 takeoverToken을 필수로 선검증하는 불일치를 확인했어요. client transport mock의 GREEN 9/9는 실제 서버 수락 근거에서 제외해요. 원 계획의 ‘기존 API 부족을 증명하면 최소 backend 보완’ 조건에 따라 API 담당 Luna를 추가해요. 서비스의 기존 host/lease 인가는 유지하고, transport는 토큰 생략만 허용하며 제공된 null·빈 값·잘못된 타입은 거부해요. 대회/리그의 토큰 없는 쓰기와 비주최/비관리자 쓰기가 거절되는 실제 경계 테스트를 함께 확인해요.

API 담당 소유: GameCommand/GameEvent DTO와 spec, realtime gateway의 관련 event parser/handler와 spec, 가장 좁은 기존 integration test, docs/api 정본 계약. 서비스 제품·Prisma/마이그레이션·frontend·task·Changeset·Git은 금지해요. 기존 서비스의 권한 결함이 새로 입증되면 root에게 범위 재배치를 요청해요. DB 통합 테스트는 CI에서 실행하고 로컬에서는 DTO/parser/handler의 실제 좁은 단위 계약만 직렬로 실행해요.

사전 Alpha 증거: Sol 요청의 별도 검증자가 기존 모집 A/B의 단판2분/전후반1+1을 실제 승인 신원과3폭에서 대조했어요. 운영 진입은 배포 전 없고 실제 운영은 미검증이에요. TaskSpace27은 별도 finish와 부재 확인을 마쳤어요.

- 2026-10-28 API checkpoint: DTO 실제 RED4/입력거부PASS5 뒤 GREEN9/9를 확인했어요. 최초 초안 선수정·자기 소유 baseline 복원과 harness0tests는 RED 근거에서 제외해요. root API 타입 검사에서 새 gateway 오류2건을 찾아 고쳤고 재검사에서 변경 경로 오류0, 기존 생성타입 관련172건은 남아 있어요. gateway assertions와 PostgreSQL HTTP/Socket 통합은 CI 확인 전이에요. 공유 Prisma 생성/타입 약화 없이 남은 검증을 명시해요.

- 2026-10-28 최소화: 모집 preview는 저장 규칙을 읽는 독립 화면으로 운영 Core/hook을 마운트하지 않아요. 실제 소비자가 없던 hook 수준 preview 모드·queue분기·mock-only test는 삭제했어요. 운영 hook은 실제 ordinary-host/tournament-leased 두 모드만 남겨요. UI는 공유 Card/InfoRow/ErrorState를 재사용하고 미정의 tm-page-shell을 없앴어요.
- 2026-10-28 독립 API R1: C0/W3으로 QA 게이트를 보류했어요. REST/Socket 공백 토큰 차이, 테스트간 LIVE 상태 의존, 새 retry 쓰기와 실제 assist 해제 효과 누락을 수정해요. 새 공백 DTO 실제 RED5/PASS6은 관찰했고 GREEN/독립 재검토는 대기예요.

- 2026-10-28 root frontend checkpoint: Web전체타입오류0·관련8파일161/161·패턴통과를관찰했어요. takeover/게임전환snapshot/authversion/reconnect와기존콘솔122회귀를포함해직렬1worker로확인했어요. 기존동기식콘솔테스트의act경고와id없는과거payload대조군의key경고는로그에남았고경고0이라고주장하지않아요. API Sol R2 C0/W0정적PASS이며gateway/PG실행·원격head CI와frontend독립리뷰·Alpha사후QA는아직대기예요.

- 2026-10-28 UI R1 재수정: 이전 화면·Game/user/source/실제권한 문맥의 확인 후 명령을 차단하고, 같은 경기에서 정상적으로 갱신된 현재 lease token을 쓰는 기존 동작은 유지해요. 공통 guard가 가렸던 기존 만료 원인 안내2건은 실제166PASS/2FAIL을 보고 수정했어요. 일반 시작에는 대회 전용 명단 필수 요건을 복사하지 않고 서버의 기존 일반 start 경로를 따라요. 마지막 period 안내는 결과 제출로 연결하고, 실제 TeamMatch를15초/포커스에 재조회해요.
- 2026-10-28 root 최종 R1 검증: Web 타입0·관련9파일168/168·패턴PASS를실제로관찰했어요. 실제 TanStack/MSW focus 대조군과entry미재조회RED→GREEN을확인했어요. 초기C1/C2/종료안내RED원본은미보존이라소급주장하지않아요. root가잘못제시했던같은entity정상lease재획득거부기대는범위밖으로격리하고기존명세를보존했어요. act/key경고는남았고0이라고표시하지않아요. frontend독립R2·현재headCI·Alpha사후QA/갤러리는여전히대기예요.

- 2026-10-28 UI R2: a0f7111의 독립 리뷰는 C3/W1 FAIL이었어요. 이전 코드에서도 통과하던 C1 테스트를 실제 ConfirmProvider의 지연된 닫기 경로로 고쳐 이전 코드 요청1건/현재0건을 확인했어요. fixture/역할 문맥 변경 뒤 pending 초기화와 결과 링크 터치 토큰도 RED→GREEN으로 고쳤고 좁은4개가 통과했어요. 마지막 변경 후 전체 Web 타입 검사는 출력 없이240초 제한으로 TERM 종료돼 통과로 표시하지 않아요. 앞선 a0f7111의9파일168개/타입PASS와 최신4개는 서로 다른 범위·시점이며 합산하지 않아요.
- 2026-10-28 잔여 게이트: 새 team-matches→tournament-live 내부 import의 공용 경계 분리는 아직 미해결이에요. 기존 소비처/회귀를 보존하는 약36경로 분리 계획을 로컬 틱 증거에 남겼어요. 이번 독립 리뷰4회 상한을 사용했으므로 현재 수정과 구조 분리의 새 독립 리뷰는 다음 틱으로 넘겨요. 초안 dev PR로 게시하고 dev 머지·Alpha 사후QA·갤러리·트래커 완료는 보류해요. 사전 QA TaskSpace27은 별도 finish와 목록 부재를 확인했어요.
- 2026-10-28 root 최신 좁은 검증: 마지막 R2 수정의 실제 운영 콘솔1파일126/126과 패턴 검사가 통과했어요. 타입 검사의240초 종료는 그대로 미완이에요. 이126개와 앞선168개·집중4개는 겹치므로 합산하지 않아요. 모든 해당 검증 자식은 종료·회수됐어요.

- 2026-10-28 14:16 후속: Codex P1 실제 경기 시작/상대명단 누락과 P2 lease 만료 뒤 pending 고착을 실제 RED→GREEN으로 수정했어요. 상대명단 재조회 실패는 기존 명단 오류 화면에서 조작을 막고 재시도해요. QueryClient/MSW 테스트2개, 운영 Core 127개, 관련30파일 중365개 및 이동 경로 보완 후 가독성24개가 통과했어요(서로 겹치는 개수는 합산하지 않아요). Web tsc 및 패턴 검사도 통과했어요.
- FSD 공용 경계 분리에서 독립 리뷰가 발견한 nullable ID, auth 역의존, 외부 private mock을 정리했어요. 기존 일반 경기에서도 사용하던 abnormal-end는 기능을 제거하지 않고 공용 위치에 유지했어요. 기존 font/radius 예외는 동일 건수만 새 파일 경로로 이전하고 font 합계 표기 오류를 바로잡았어요. 전체 변경의 최종 독립 리뷰, 새 head CI/두 원격 리뷰 스레드 처리, dev 머지와 Alpha 사후 QA는 아직이에요. API 기존 subscribe ACK timeout 원인은 미확정이에요.

- 2026-10-28 15:30 후속: 현재 원격 head의 독립 리뷰에서 공용 운영 코드가 상위 hooks에 의존하는 경계 위반을 확인했어요. 운영 의존성을 adapter에서 주입하도록 수정 중이며, 공용 테스트의 상위 adapter 의존과 일반 경기 명단 로딩·오류 중 운영 hook 마운트 시점도 바로잡고 있어요. 중간 버전의 운영 Core 127개·Web 타입·패턴 검사는 통과했지만, 최종 수정본 검증과 독립 재검토를 대신하지 않아요. Copilot의 assist 권한 문서 지적은 실제 서비스 인가를 대조해 로컬에서 수정했어요. 원격 head API CI는 진행 중이고 기존 ACK timeout 원인은 미확정이에요. 머지와 Alpha 사후 QA는 아직이에요.
- 후속 로컬 검증: 공용 Core 92개, 대회 adapter 27개, 일반 adapter 12개, 일반 명단 통합 3개, 전송 상태 4개를 관련 변경에 따라 직렬로 확인했어요. 테스트 이관 중 발생한 실패와 타입 오류를 수정한 뒤 Core·대회 adapter 및 Web 전체 타입·패턴 검사를 다시 통과했어요. Core 테스트에는 기존 React act/key 경고가 남아 있어요. 이전 원격 dd27 head의 API CI는 성공했지만 기존 ACK timeout의 원인은 확정하지 않았고, 이 로컬 수정본의 독립 리뷰·새 head CI·Alpha 사후 QA는 아직이에요.
