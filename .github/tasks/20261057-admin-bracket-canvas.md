# Task 20261057: 어드민 대진 그림 편집기 — 그림 먼저, 팀은 자리에, 결과는 칸에서

## 2026-11-11 main 핫픽스 — 경기별 제목
Status: Main-target hotfix prepared; production not deployed

### Context / Goal / Original Conditions
사용자 후속 지시: "해당 내용 main에 핫픽스로 배포 진행해줘". alpha의 PR#2327 기능만 운영 핫픽스로 준비하며 번호/조/라운드/진출 계산 변경은 포함하지 않는다. 이전 리뷰 생략 지시는 유지한다.
- [x] 최신 main1416d7527e에서 격리 브랜치 hotfix/fixture-display-title-1.16.1 생성.
- [x] alpha 검증 커밋 ef2bc84369·4d34c4eaf9 두 개만 cherry-pick, 기타 dev 변경 제외.
- [x] 고정 Changesets CLI2.30.0으로 해당 Changeset 소비, API/Web 패키지1.16.0→1.16.1 및 두 CHANGELOG 생성.
- [ ] main PR 릴리스 게이트: 실제 소비 이력·두 버전 증가·두 CHANGELOG·additive migration·schema pin 검증.
- [ ] main 대상 PR CI 통과.
- [ ] 사용자 main PR 머지 및 production environment 승인 후 운영 배포 확인.

### User / Test Scenarios / Ownership
기존 제목 수정 시나리오 유지. main 대비 기능·마이그레이션·공개 조회·편집 테스트·문서와 버전 변경만 소유한다. 다른 dev 기능, 실제 결과/자동 배정 알고리즘, 운영 데이터 수동 수정, main 직접 push는 범위 밖이다.
단일 에이전트 순차: 변경 격리→Changeset 소비→좁은 검증/타입→main PR CI→사람의 머지/배포 승인 경계.

### Security / Risks / Ambiguity Log
기존 대회 관리자 권한/잠금/감사 유지, nullable varchar(120) 추가만 포함한다. alpha c4ae34c7e9b1에서 DB정상·공개 상세/일정 각9개·경기 상세 displayTitle 및 공개3폭(console/API오류0) 확인. 관리자 인증 저장 QA는 미실행이다.
CLAUDE.md의 main 머지 사용자 전용 규칙과 production 승인 게이트를 우회하지 않는다. 핫픽스 PR은 사용자의 명시적 main 요청 범위로 준비한다. 자동 배정의 번호 의존성은 기존 동작이며 이번 핫픽스에서 변경하지 않는다.

### Progress Snapshot
원격 main1416d7527e, 소스 패키지1.16.0, 실제 공개 운영 표기1.16.1. 릴리스 리졸버의 기존 next-patch 규칙에 따라 소스1.16.1을 준비한 신규 운영 표기는1.16.2가 예상된다. 해당 기존 정책은 수정하지 않는다.
API394/Web124 및 양쪽 TypeScript PASS, schema binding5 PASS. 원본 공유 작업트리/WIP 및 실행 중인 로컬 관리자/서버는 보존한다. 핫픽스 작업트리는 /tmp/teameet-fixture-title-hotfix.


## 2026-11-11 후속 — 경기별 제목 수정
Status: Implementation complete; local runtime running; alpha UI QA pending

### Context / Goal / Original Conditions
- [x] 경기일정 전체보기의 각 경기 수정창에서 제목을 개별 입력한다.
- [x] 저장된 제목을 목록·그림·모바일에 함께 반영하고 공개 일정·상세에도 반환한다.
- [ ] 로컬 Web/API를 실행하고 저장 round-trip을 확인한다.

### User Scenarios / Test Scenarios / Acceptance Criteria
- [x] 기존 공유 수정 폼 재사용안 사용자 확정(라운드 전체가 아닌 개별 경기).
- [ ] 경기 A만 이름 변경 → PATCH → bracket GET → 목록/그림 동일 제목 → 재진입 유지, 경기 B 불변.
- [ ] 빈 문자열/null은 자동 제목 복원, 생략은 보존, 120자 초과/비문자열 거절.
- [ ] 관리자 권한·감사·대회/경기 잠금 유지; 제목만 바꾸면 실제 팀/진출/결과는 불변.
- [ ] 실패 시 입력 유지·오류 노출; desktop/tablet/mobile alpha QA(미배포 시 별도 pending).

### Parallel Work Breakdown / Ownership
단일 에이전트 순차. Phase A DB nullable display_title/migration·DTO·저장/조회·API 문서 → Phase B 공유 수정 폼·목록/그림/모바일·공개 표시 → Phase C 단위/타입·로컬 실행.
Owned: 위 기능 관련 v1 API/Web, additive migration, schema pin, task/scenario/API docs와 changeset. Forbidden: unrelated WIP, main 쓰기, destructive seed/reset. 사용자 후속 요청으로 dev PR/머지·alpha 배포 허용, 리뷰 요청·대기 생략.

### Security Notes / Tech Debt Resolved / Risks & Dependencies
120자 plain text, trim, null 복원. 사용자 입력을 HTML로 해석하지 않는다. 기존 관리자 쓰기 gate·잠금·감사 재사용. 조/라운드/번호/진출 계약은 유지한다.
V1TournamentMatchDetails(v1_tournament_match_details)에 nullable varchar(120) display_title 추가, 기존 행 변경 없음. 생성된 Prisma client와 runtime schema pin/manifest 허용 목록을 동기화한다.
공유 트리 전체에 기존 CRLF diff가 있고 원격 dev와 차이가 있어 checkout/reset/merge하지 않는다. env 파일을 직접 읽거나 출력하지 않고 기존 앱 설정 로더만 사용한다.

### Ambiguity Log
2026-11-11 사용자: 라운드 전체가 아니라 경기마다 제목 수정. 기존 전체보기 수정창과 그림 동기화 확정, 로컬 서버 실행 명시 요청(alpha QA 원칙의 사용자 요청 예외).

### Progress Snapshot
최초 로컬 Base HEAD26db31b33. 배포 브랜치는 최신 origin/dev817d4fb88a에서 격리 생성(/tmp/teameet-fixture-title-release), 이전 공유 트리 보존. 사용자 요청에 따라 리뷰 요청/대기 생략, 필수 CI 유지.
Phase A/B 구현. Prisma generate 성공. Web 기존 관련20/20 PASS, API DTO/저장/조회49 PASS. 신규 제목 회귀 및 서비스/타입 검증 진행 중.
로컬 Web http://localhost:3013/login HTTP200. API 최초 실행 DATABASE_URL 누락(앱 cwd); root cwd로 재시도 중. Docker Desktop daemon 최초 미가동, 기동 시도 중. 실제 DB/alpha QA는 미검증.

최종: API 고유267 / Web60 PASS, API tsc PASS. 실제 PostgreSQL 한글 제목 저장·공용 조회·경기별 격리·생략 보존·빈 값 복원·실제 감사 로그 PASS(모든 검증 데이터 rollback). Web tsc는 기존 admin/league-matches/page.tsx:299 LeagueStateChip props 오류1개로 실패하며 관련 없는 화면은 수정하지 않았다.
로컬 Web3013 로그인200, API8121 직접 및 Web rewrite health db=true. Docker Desktop·기존 postgres 컨테이너를 기동했다. 기존 DB는 이전 스키마와 migration history 부재(P3005)로 보존, 별도 빈 DB migration replay는 기존 privacy v1.2 prerequisite 자료 누락(P3018)에서 실패했다. 이를 우회해 성공으로 표시하지 않고, 다른 새 빈 preview DB에 현재 schema만 생성해 요청된 로컬 API를 실행했다. shipping용 additive migration과 runtime schema pin은 준비했다. 계정/대회 seed는 실행하지 않았다.
상세: docs/scenarios/fixture-display-title.md. Alpha viewport0/3·실제 관리자 화면 저장 미검증; PR-ready/배포 완료로 주장하지 않는다. 사용자 요청에 따라 Web/API/DB는 유지한다.

로컬 관리자 표시 후속: HTTP200 이후 실제 브라우저 React/SWC exports 오류를 확인했다. 소유한 Next 종료→생성 캐시 `.next` 정리→재실행으로 해소. 사용자 요청에 따라 별도 preview DB의 로컬 관리자1개와 격리된 headed Chrome 창을 생성했다. 실제 `/admin`1440×1000 대시보드 렌더, pageerror0/API오류0 PASS. 화면은 사용자 요청으로 유지. 증거 tmp/local-admin-preview/admin.png, 재확인 도구 scripts/qa/local-admin-preview.cjs. 원격/기존 DB 변경0. 제목 편집 UI 및 alpha 3폭 QA는 여전히 별도다.


## 2026-10-28 후속 — 전체 대진 만들기 팝업 동작 복구
Status: Implemented / dev PR and Alpha deployment in progress

### Context / Goal / Original Conditions
- [ ] ‘전체 대진 만들기’가 페이지 전환·스크롤 컨테이너의 영향을 받지 않는 팝업으로 동작한다.
- 사용자 재지시는 팝업 우선 수정이다. 앞서 요청한 기존 팀 조별 무작위 배치는 요구를 유지하되 배정 유지/재배치 의미 확인 전 변경하지 않는다.

### User Scenarios / Test Scenarios / Acceptance Criteria
- [ ] 변형·overflow가 있는 페이지에서도 공용 ConfirmModal처럼 body portal과 modal z-index를 사용한다.
- [x] 컴포넌트 회귀에서 팀 수 입력·선택·취소/닫기·포커스 복원 및 기존 대진 교체 확인 계약을 유지한다.
- [x] 집중 회귀 테스트 RED → GREEN, touched diff/기술부채 확인.
- [ ] Alpha 관리자 390/768/1440 실제 클릭·console/network·스크린샷 확인. 접근 불가 시 미검증으로 기록한다.

### Parallel Work Breakdown / Owned / Forbidden
단일 에이전트 순차: 원인/회귀 → portal 로직 복구 → 집중 검증/문서화.
Owned: bracket-template-dialog.tsx, flexible-bracket-wizard.tsx, six-team-template-dialog.tsx 및 관련 테스트, 이 문서, 해당 changeset.
Forbidden: 다른 WIP, backend/DB/랜덤 배정 동작 변경, main 쓰기, 실제 대회 데이터 수정.

### Tech Debt Resolved / Security Notes / Risks & Dependencies / Ambiguity Log
공용 확인창과 달리 페이지 트리 안에 떠 있던 fixed 팝업을 body로 이동한다. 시각 디자인·정보구조 변경 없이 기존 동작을 복구하는 렌더링 로직 수정이다. 기존 권한·API·교체 확인·pending 잠금을 유지한다.
Alpha 관리자 세션/브라우저 도구가 현재 제공되지 않았다. 실제 alpha 검증을 합성 컴포넌트 테스트로 대체하지 않는다.

### Progress Snapshot
최신 origin/dev fetch 성공. 최신 origin/dev=b71a5d031 전용 작업트리 tmp/worktrees/admin-bracket-popup, 브랜치 fix/admin-bracket-popup. 기존 작업트리의 변경은 보존했다. 이전 표준 팝업 신규 회귀 RED 확인 후 최신 dev의 2파일 59계약에서 5개 RED/54개 PASS: 표준·6팀·로딩 팝업의 body 분리 누락, 유연 설정의 modal layer 누락. 3개 소스의 portal/레이어와 확인창 렌더 순서를 복구했다. GREEN 59/59 PASS.
검증: `pnpm --filter v1_web exec vitest run src/components/admin/bracket-canvas/flexible-bracket-wizard.test.tsx src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx --maxWorkers=1 --minWorkers=1 --reporter=dot`.
시나리오: 관리자 대진 설정, transform/overflow 부모에서 body 분리, 참가팀 수 입력, 닫기/포커스 복원, 로딩→오류→재시도, 3개 설정 분기, 확인창 동작. jsdom 컴포넌트 검증이며 실제 viewport/alpha 화면 검증은 0/3이다. 실제 대회 데이터·배포 변경 없음. 테스트 cleanup 수행; 로컬 서버/브라우저를 띄우지 않았다.
`git diff --check` PASS, touched 소스/테스트 TODO/FIXME/HACK/XXX 없음. 신규 런타임 소스 의존성 없음, React DOM 기존 의존성만 사용. 미커밋 작업트리 검증이므로 PR-ready·배포 완료로 주장하지 않는다. `pnpm exec tsc --noEmit --incremental false` PASS. 패턴 검사 최초 sandbox 하위 셸 EPERM 후 같은 읽기 전용 명령을 제한 밖에서 실행해 PASS(규칙 완화 없음).

2026-10-28 사용자 배포 요청으로 이 후속 범위의 dev 대상 PR·리뷰·머지·alpha 배포를 진행한다. main 승격은 포함하지 않는다. 최신 origin/dev=b71a5d031로 코드 차이 없음 확인; 앞선 59계약·타입·패턴 검증 이후 런타임 소스 변경 없음. Alpha 관리자 세션/브라우저 도구 미제공으로 배포 후 시각 QA는 별도 미완료로 추적한다.


배포 준비(2026-11-11): 사용자 dev PR·alpha 배포 지시 및 리뷰 생략 지시 반영. 최신 dev 기반의 기존 bracketTrack·BYE·기간 편집·대회 관리자 권한 변경을 보존하며 충돌 통합했다. 최신 기준 API338/Web124 PASS, API/Web tsc PASS, release schema binding5/5 PASS. 로컬 전용 QA 도구·계정은 PR에서 제외한다.

## 2026-10-17 후속 — 목록·그림 표시 문구와 경기 정보 편집 통일
Status: Implementation complete; draft PR / alpha QA pending

### Context / Goal / Original Conditions
사용자가 기존 목록 수정 창·그림 패널·모바일 BottomSheet에서 번호/홈·원정 문구/시각/등록 경기장을 편집하고, 팀이 없는 12강 부전승 자체를 클릭해 문구·팀을 편집하도록 요청했다. 표시만 바꾸며 경기 ID·실제 팀·승자/패자 연결은 보존한다. 이번 요청은 구현·dev 대상 PR 게시이며 머지/main 배포는 포함하지 않는다.

### User / Test Scenarios / Acceptance Criteria
- [ ] 목록↔그림에서 번호·문구·시각·등록 경기장 저장/새로고침이 같은 값을 사용한다.
- [ ] main/dev 조회·표시 경로 비교; 기존 시각/경기장 재입력 없이 카드와 패널에서 표시한다.
- [ ] 문구 빈 값/복원은 최신 자동 문구; 출처 번호 변경 시 자동만 갱신하고 사용자 문구는 보존한다.
- [ ] 시각 null과 경기장 미배정을 실제 저장하고 양쪽에서 미정으로 표시한다.
- [ ] 번호/문구 변경은 실제 팀·진출 연결을 보존하며 단계/조→번호→차전→ID로 안정 정렬한다.
- [ ] 빈 부전승도 그림에서 편집 가능; 연결된8강과 문구·배정팀 공유, 별도 경기 번호/시각/경기장 생성 금지.
- [ ] 확정 팀 이름 우선, 부전승 문구 보조; 실패 시 입력 유지·실제 오류 표시.
- [ ] desktop/tablet/mobile 회귀; API/DTO/fixture/MSW/docs/schema pin 동기화.

### Responsibilities / Ownership / Dependencies
단일 에이전트 순차. Phase A: v1 DB/DTO/서비스/조회·타입·fixture 계약. Phase B: 공유 편집 폼, 목록·그림·모바일, 부전승 노드. Phase C: 회귀·타입·리뷰·PR.
Owned: 대진 표시/편집 관련 v1 API/Web, additive migration 및 해시 바인딩, API/task/scenario 문서·tests. Forbidden: 다른 WIP, main 쓰기, 실제 결과/진출 규칙 변경, destructive seed/reset.

### Security / Risks / Ambiguity Log
사용자 지정 문구는 최대120자 plain text·trim/빈 값=null, 입력 검증·기존 admin 쓰기 권한·감사/잠금을 유지한다. BYE 문구는 슬롯 하나에 저장하며 연결된8강은 이를 읽고 쓴다. 실제 배정 변경은 기존 슬롯 API·결과 잠금 계약을 따른다.
사용자가 기존 UI 확장과 모바일 BottomSheet를 구체적으로 고정했으므로 해당 패턴을 구현한다. alpha 시각 QA는 PR 미배포 상태와 구분하고, 로그인/배포 제약을 기록한다.

### Progress Snapshot / Tech Debt Resolved
Base origin/dev=`ae24a67e9`, branch=`feat/bracket-display-edit`, worktree=`tmp/worktrees/bracket-display-edit`.
Phase A/B 완료. main/dev의 canonical serializer는 TeamMatch.startAt/placeName/fieldId를 동일하게 읽는다. 그림 카드 일정 미표시 및 목록/desktop panel의 빈 시각 PATCH 누락을 수정했다. 문구는 일반 경기 side override, BYE는 shared slot override 한 곳에만 저장한다. 경기 ID/진출 edge/배정은 문구 수정 시 그대로 유지된다.
Phase C: API 관련 269개 계약과 Web 대진 관련 566개 계약 검증(중간 실패 후 해당 파일 재검증 포함); 양쪽 TypeScript, Web pattern, API surface PASS. API 새 DTO/순수 저장 44, 서비스/공통 조회 213, 기존 일정·bye-side 12. Web 전체 관련 566 중 mock export 누락 2건을 고친 뒤 해당 mobile/node 68 재실행 PASS. 슬롯 응답 exact mock에 automaticLabel/displayLabel 동기화. 기존 MSW에는 admin bracket PATCH/GET handler가 없으며 실제 공용 test fixture를 갱신했다.
Schema LF SHA=96cf396f434e0fba80e9c2fa84e79ee347471ae56387ca6493b6d11f09c93a42. nullable varchar(120) 3개만 추가, 기존값 변경 없음. Docker/fixture/binder/manifest pin 갱신, 과거 manifest 허용 유지. 커밋된 LF export와 공식 체크섬으로 검증한 jq를 사용해 릴리스 바인딩/과거 manifest 호환성 7/7 PASS. expand-contract migration gate PASS. Windows CRLF/M11 digest 및 WSL jq 미설치로 발생한 로컬 도구 문제는 격리된 LF export/작업 폴더 도구로 해결했으며 게이트는 완화하지 않았다.
직접 코드 리뷰: null/omission, 최신 자동 문구, BYE 단일 정본, 공식 결과 문구 수정의 roster/result 무변경, 권한/감사/잠금, 실패 draft 유지, 단계/조→번호→leg→ID 정렬 확인. touched paths TODO/FIXME/HACK/XXX 없음. 실제 alpha QA 0/3 및 DB integration 미실행(Docker daemon 미가동): 완료/배포 가능으로 주장하지 않고 draft PR에 명시한다.
사용자 요청에 따라 구현/PR만 진행하며 dev/main 머지·배포 및 실제 대회 데이터 수정은 하지 않았다. GitHub CLI 표준 device login 대기; Git credential token 추출은 사용하지 않는다.

## 2026-10-16 후속 — 부전승 홈·어웨이와 저장 배치 일치

Status: In Progress

### PR #1957 순차 수정 — 2026-10-16
- 최신 `origin/dev=ebfac9aee`를 통합한 격리 작업트리에서 API 실패 3건을 재현했다. `tournament-bracket.service.spec.ts`의 이전 position 조회 단언 2건과 slots 응답 필드 누락 1건이다.
- 조회 기대값을 실제 `byeSortOrder` 계약으로 갱신하고 mock 슬롯에 nullable 필드를 명시했다. 교환 후 표시 위치 1·2·3·5·6에서 팀 변경이 연결된 자리 트랜잭션으로 위임되는 회귀 5건을 추가했다.
- RED: 소비자 테스트 394개 중 3개 실패. GREEN: 수정된 대진 서비스 207/207 PASS; 별도 슬롯·템플릿·일정 관련 296/296 및 나머지 소비자 192/192 PASS. API `tsc --noEmit` PASS. Windows 기본 find와 Unix find 충돌로 surface 검사 첫 실행 실패; Git Unix 도구 경로로 재실행 PASS(686개 파일).
- 이번 수정은 테스트/문서만 변경하며 UI/API/migration 내용은 유지한다. 로컬 Docker 미가동으로 실DB 재실행은 하지 않았고, 최신 PR CI 및 기존에 남은 alpha 관리자 저장/3폭 QA는 별도 확인 대상이다.

### Context / Goal
12강 템플릿은 부전승 sortOrder 0·3·4·7, 8강 연결은 모두 HOME으로 저장해 공개 그림이 1·3·5·7로 재배열됐다.
부전승의 슬롯 식별 번호와 표시 위치를 분리하고, 그림·목록·편집·승자 진출 자리를 같은 저장 상태로 맞춘다.

### Original Conditions / User Scenarios
- [ ] 어드민 그림의 8강 경기에서 부전승 홈(위)·어웨이(아래)를 선택한다.
- [ ] 해당 경기 안에서만 부전승과 12강 승자 자리를 맞교환한다. 상대 및 이후 진출 연결은 유지한다.
- [ ] 기존 대진의 표시 위치를 현재 연결에 맞게 migration으로 보정한다.
- [ ] 경기 시작·결과·이벤트가 있는 대상 및 후속 경기는 거절한다.
- [ ] 실패는 전체 롤백하며 비관리자/support 쓰기는 거절한다.

### Test Scenarios / Acceptance Criteria
- [ ] 빈 팀/배정된 팀/12강 승자 확정 후의 교환 및 재요청.
- [ ] 반대 방향 교환, 이후 부전승 팀 교체, 조간 자동 배정 호환.
- [ ] 그림·목록·편집·공개 화면의 순서와 홈·어웨이 일치.
- [ ] 관련 API·DTO·UI·레이아웃 테스트, 타입 검사, migration replay.
- [ ] alpha 실제 화면 검증 390/768/1440; 배포 전에는 완료로 표시하지 않는다.

### Parallel Work Breakdown / Owned Files
단일 에이전트 순차 실행. API 슬롯·템플릿·migration → 웹 공용 편집 컨트롤·목록·그래프 → 검증·문서.
전용 작업트리 `_worktrees/bye-side-consistency`, base `origin/dev` a8bd190a9. 다른 작업트리/사용자 WIP 수정 금지.

### Tech Debt Resolved / Security Notes
slot position을 화면 순서로 역산하던 결합 제거. 대회 잠금과 게임 행 잠금, 서버 권한/소속/결과 검사, 감사로그 유지.

### Risks & Dependencies / Ambiguity Log
사용자가 승인한 UI는 기존 그림 상세 패널의 홈·어웨이 선택이다. 새 화면이나 다른 경기로 이동은 범위 밖.
기존 대진 보정은 연결·상대를 바꾸지 않으며 migration 배포가 필요하다. Docker 미가동 시 DB replay 증거는 별도 확보해야 한다.

### Progress Snapshot
- [x] 최신 dev 조사, 전용 worktree 생성, 구현 범위 확정.
- [x] API/저장 배치 구현 및 단위 테스트. PostgreSQL 통합 실행은 CI 대기.
- [x] 웹·목록·공개 표시와 fixture 동기화.
- [ ] 검증 및 alpha 배포/실측.

검증 기록: API 관련 100개 통과 후 추가 권한/DTO 포함 28개 통과. 웹 관련 124개 통과 후 추가 표시 계약 포함 16개 통과.
API/Web tsc 통과. POSIX 명령 기반 lint가 Windows 기본 셸에서 실행 실패했으나 Git Bash로 두 패턴 게이트를 재실행해 통과.
alpha 변경 전 공개 그림 390/768/1440 캡처(`tmp/bye-side-before`), pageerror/HTTP 5xx 0. 관리자 인증 세션은 확보되지 않음.
브라우저 PID 66092(부모55640), 스크립트 finally에서 종료. DB Docker 미가동으로 migration replay/통합 검증은 PR CI에서 수행한다.

### PR #1957 리뷰 수정 (2026-10-16)
- [x] 팀 이동·교환 시 같은 경기의 잔류 팀 일정은 취소하지 않는다. 단위 회귀 테스트에서 수정 전 교환/이동 2건 실패 → 수정 후 관련 52개 통과.
- [x] `byeSortOrder: null` 응답을 기존 실DB 슬롯 응답 기대값에 반영하고, 양 팀 일정 ID·활성 상태·시각을 확인하는 실DB 교환 회귀 테스트 추가.
- [x] Git LF 정본 스키마 해시 `8776cccbf35b17cca2bd962cd44fe09fa98542c0395304b109e2a00f04684d0b`로 fixture·릴리스 바인더·Docker 정본 클라이언트 증명·매니페스트 생성/검증 동기화. 이전 릴리스 허용 해시는 보존.
- [x] API tsc 통과. 임시 LF 복사본에서 스키마 바인딩 7개와 릴리스 매니페스트 self-test 통과. WSL에 없는 jq는 공식 릴리스 체크섬 검증 후 임시 경로에서 사용·자동 삭제.
- [x] CI가 다음 단계에서 발견한 expand-contract 보정 SQL 미등록 해결: 기존 migration 여섯 문장에만 파일·정규화 SQL 일치 기준의 검토 사유를 등록. 게이트 self-test(미등록/다른 파일 거부 포함) 및 실제 PR diff 게이트 통과. migration 내용과 일반 판정 규칙은 유지.
- 배포 제약: 표시 좌표 보정 후에는 기존 고정 인덱스 부전승 배정 API로 롤백하지 않는다. 이 migration과 대응하는 API를 함께 배포하고 장애 시 forward fix한다. 이전 릴리스 조회용 해시 허용은 이 쓰기 호환성을 보장하지 않는다.
- [ ] PostgreSQL 실DB 통합 테스트와 migration replay는 로컬 Docker 미가동으로 갱신된 PR CI에서 확인한다. 기존 alpha 관리자 클릭/3개 viewport QA는 여전히 미완료이며 이번 수정은 UI를 바꾸지 않는다.

## 2026-10-12 후속 기획 — 5조·20팀에서 12강 진출팀 자동 배치

Status: Implemented / Validation in progress — Alpha 배포·실제 화면 검증 대기 (이 후속 범위만)

### Context / 현재 구현 근거

- 사용자 대상: alpha `/admin/tournaments/ad200600-0000-4000-8000-000000000003/overview`의 대회, 대진관리 **목록** 보기.
- 사용자는 팀 미정으로 경기들을 먼저 만들고, 조별리그 이후 결선 팀을 일괄 추천받아 수정한 뒤 저장하려 한다.
- 최신 origin/dev를 fetch했다(`a4b7c2d78`). 조사 작업트리 `3d7180ea2`와 비교해 관련 대진 소스 변경은 없음을 확인했다.
- `bracket/page.tsx`는 그림/목록을 분리한다. 목록은 `bracket-tab.tsx`와 `bracket-group-card.tsx`를 사용한다.
- 그림에는 `BracketStandingsFillButton/Dialog` 및 `slots/standings-preview`, `slots/fill-from-standings`가 이미 있다. 현 UI는 확정 후보를 표시하고 동률만 선택하게 한다.
- 기존 GROUP_RANK는 특정 조의 특정 순위다. `templates/group-rank-pairings.ts`는 2/4/8개 조의 정형 교차 대진만 지원하며, 5개 조 성적 비교·3위 와일드카드·12강 부전승 배치를 제공하지 않는다.
- 목록에서 만든 자리 없는 경기와 슬롯 연결 경기를 모두 지원해야 한다. 슬롯 API만 확장하면 사용자 경로가 빠진다.
- 기획 당시 alpha URL은 웹 도구로 열리지 않았다. 구현 후 headed 읽기 전용 접근은 로그인 화면으로 이동했다(auth/me401). 실제 관리자 화면·해당 대회의 조/경기/설정 상태는 미확인이고 실제 데이터 변경은 없다.

### Goal / 판단

목록의 12강 영역에서 **자동 팀 배정 → 추천 확인·수정 → 한 번에 저장**으로 진출 12팀의 배정을 끝낸다.
기존 경기의 시각·장소·경기번호·진출 연결은 유지한다. 팀 추천만으로는 저장하지 않는다.
12강 경기 8자리뿐 아니라 부전승 4자리와 연결된 8강 직행 자리도 같은 화면에서 확인한다.

### Original Conditions

- [x] 조별리그는 4팀씩 5개 조, 총 20팀이다.
- [x] 조 1위 5팀을 비교해 상위 4팀은 8강 직행, 나머지 1팀은 12강에 배정한다.
- [x] 조 2위 5팀은 성적순으로 12강에 배정한다.
- [x] 조 3위 중 상위 2팀만 추가 진출한다.
- [x] 진출한 3위 두 팀의 상대는 마지막 조 1위 팀과 최상위 조 2위 팀이다.
- [x] 팀 미정으로 만든 기존 대진에 적용하고, 팝업에서 팀을 수정한 뒤 저장할 수 있다.
- [x] 목록 보기에서 직접 진입한다.

### 화면 후보 / 선택안 (사용자 구현 승인)

| 안 | 구성 | 판단 |
|---|---|---|
| A | 12강 카드의 큰 팝업에 진출팀 비교표·부전승·4경기 편집 | 권고. 현재 목록 작업을 유지하며 한 번에 검수 가능 |
| B | 별도 전체 화면에서 순위 비교와 대진 편집 | 향후 다단계 규칙이 많아지면 유리하나 이번 범위엔 이동이 늘어남 |
| C | 목록의 각 경기 행에 추천팀 적용 버튼 | 전체 중복·진출선 검수가 어렵고 개별 작업이 남음 |

A안은 데스크톱 큰 팝업, 모바일 전체 높이 다이얼로그로 한다. 기존 공유 dialog 접근성/토큰을 재사용한다.
12강 조 생성 폼에는 형식 안내만 두고, 실제 적용 버튼은 생성된 12강 영역에 둔다.

### User Scenarios / A안 흐름

1. 운영자가 조별리그와 결선의 빈 경기를 미리 만든다.
2. 12강 영역의 `자동 팀 배정`을 누른다. 대상 조 5개, 12강 4경기, 부전승 4자리, 연결된 8강 자리를 확인한다.
3. 팝업 상단에 `20팀 → 12팀 진출 · 4팀 8강 직행 · 8팀 12강 경기`와 공식 결과 확정 현황을 표시한다.
4. `추천 근거`에는 조 1위 5팀·2위 5팀·3위 5팀의 비교표를 보여준다. 조/조 내 순위/승점/골득실/득점/적용된 후속 기준/진출 여부를 표시한다.
5. `배정 미리보기`에는 부전승 4팀과 12강 4경기의 홈·원정 팀 선택기를 보여준다. 현재값 → 변경값, 시드·원천 조·수동 수정 표시를 제공한다.
6. 이미 배정된 팀을 선택하면 두 자리 교환을 제안한다. 중복 저장은 불가하다. 진출 12팀 안에서의 자리 변경을 기본 범위로 권고한다.
7. 동률 때문에 진출 팀 자체가 미정이면 해당 동률 후보 중 선택한다. 그 밖의 탈락팀 임의 진출은 이번 기본 기능 범위에 포함하지 않는다.
8. `추천으로 되돌리기`는 편집 초안만 초기화한다. `다시 계산`은 새 결과로 추천을 재조회하며, 수정 중이면 초안 덮어쓰기를 확인한다.
9. `배정 저장`은 변경 개수와 기존 배정 교체를 확인한 뒤 전체를 원자적으로 저장한다. 취소하면 서버 변경이 없다.
10. 저장 후 재조회에서 같은 팀·부전승·8강 직행·공개 대진을 확인한다. 이미 저장한 동일안의 재저장은 추가 변경을 만들지 않는다.

### 추천 시드 / 대진 초안

| 시드 | 대상 | 배정 |
|---|---|---|
| 1~4 | 조 1위 상위 4팀 | 부전승, 8강 직행 |
| 5 | 조 1위 중 5번째 | 12강 12번 상대 |
| 6~10 | 조 2위 5팀 성적순 | 12강 |
| 11~12 | 조 3위 상위 2팀 성적순 | 12강 |

12강: **5–12 / 6–11 / 7–10 / 8–9**. 앞선 대화에서 제안한 정확한 시드 조합이며 사용자의 “그렇게 해서 수정 진행” 승인으로 적용했다.
8강 연결 권고: 1–(8/9 승자), 2–(7/10 승자), 3–(6/11 승자), 4–(5/12 승자).
기존 연결이 있으면 표시하고 호환성을 검증한다. 추천 배치를 이유로 연결을 몰래 재작성하지 않는다.
부전승 표기와 8강 실제 팀을 동기화하되 동일 팀의 정상적인 단계 간 반복은 중복 진출로 오판하지 않는다.

### 순위 비교 / 적용한 기준

- 조 내 순위는 해당 대회의 공식 순위 계약을 따른다. 여러 순위 계산기가 있으므로 구현에서 현재 대회의 competitionConfig와 실제 재계산 경로를 확인한다.
- 조 간 비교에는 서로 경기하지 않은 팀의 상대전적을 적용할 수 없다. 권고는 **승점 → 골득실 → 다득점 → 완전 동률이면 운영자 결정**이다. 대회의 다른 적용 가능한 기준이 있으면 확인 후 반영한다.
- 조별 모든 예정 경기의 공식 결과 확정 및 최신 순위 반영을 저장 전제조건으로 권고한다. 현재 진행 중 순위는 참고 표시만 하고 최종 배정 저장은 막는다.
- 잔여 동률은 팀 이름·ID·기존 배열 순서로 확정하지 않는다. 부전승 경계(4/5위), 3위 진출선(2/3위), 시드 순서 경계를 포함해 운영자 결정이 필요하다.
- 조별 경기 수가 같다는 전제를 검사한다. 다른 경기 수/몰수/취소로 비교가 달라지면 자동 보정하지 않고 사유를 표시한다.
- 같은 조 재대결은 기본적으로 경고만 하며 시드를 몰래 바꾸지 않는 안을 권고한다. 회피를 필수로 하면 대진 우선순위 규칙을 별도 확정한다.

### Backend / Frontend / Sequential Work Breakdown

- Backend: 조 간 비교·진출팀 선정 순수 함수 → 배정 preview → 전체 적용 트랜잭션 순서. 현재 직접 사이드/슬롯/부전승/8강 연동을 공통 배정 계획으로 묶는다.
- Frontend: 목록 12강 진입점 → 비교 근거·전체 배정 팝업 → 후보 교환·초안 검증 → 저장/재조회. 그림도 동일 추천 계약을 재사용할 수 있게 하되 첫 완료 범위는 목록이다.
- Infra: 신규 인프라 불필요. 영속 데이터 확장이 필요하다고 확인되면 migration을 포함한다.
- Sequential: 데이터 계약 확정 후 화면 구현, 좁은 계산/저장 검증 후 alpha 실제 관리자·공개 390/768/1440 확인. 현재 서브에이전트 dispatch 없음.
- API 계약 변경 시 `docs/api/`와 frontend hooks/types/MSW를 같은 변경에서 동기화한다. 특정 URL의 대회 ID는 구현 규칙에 하드코딩하지 않는다.

### Acceptance Criteria / Test Scenarios

- [x] 표준 5조×4팀 공식 결과에서 1위5 + 2위5 + 3위2, 중복 없는 12팀을 선정한다.
- [ ] 부전승4 + 12강4경기 + 8강 직행 배정이 저장/재조회/공개 화면에서 일치한다.
- [x] 목록에서 직접 생성한 슬롯 없는 대진과 슬롯 있는 대진 모두 동작한다.
- [ ] 미확정 결과/오래된 순위/진출선·부전승선 동률/경기수 차이/부족한 자리/잘못된 연결이 조용히 적용되지 않는다.
- [ ] 수동 교환, 추천 초기화, 취소, 기존 팀 교체, 동일안 재저장을 검증한다.
- [x] 열어 둔 사이 결과나 대진이 바뀌면 저장 시 conflict로 막고 재확인을 요구한다. 화면에서 본 것과 다른 추천을 조용히 저장하지 않는다.
- [ ] 비관리자·support 쓰기 거절, 다른 대회 팀·자리 참조 거절, 중복 배정 거절을 검증한다.
- [ ] 시작/제출/공식 결과가 있는 대상 경기나 영향 받는 후속 경기에는 이 일괄 배정을 적용하지 않는다. 실패하면 전체 미적용이다.
- [ ] 날짜/장소/경기번호/정상 진출 연결을 유지하고 기존 배정 경로의 명단·일정·팀매치 동기화를 수행한다.
- [ ] fixture/MSW에 20팀·5조·완전 동률·결과 변경·직접 사이드/슬롯 혼합·부전승 사례를 추가한다.
- [ ] alpha 실제 관리자 입력 및 공개 대진/순위/진출 표시 확인, desktop/tablet/mobile 증거를 남긴다.

### Tech Debt / Security / Risks

- 조별 ENTRY와 결선 BYE의 정상적인 단계 간 반복을 허용하고 결선 내부 중복은 차단했다. 무작위 채우기는 조별 ENTRY로 한정했다. 기존 조 내 순위 판정을 재사용하며 sourceGroupId 없는 진출 자리를 기존 조별 순위 채우기에서 제외했다.
- 저장은 admin 권한, 동일 대회 소유 관계, 진출 자격, 중복, 전체 영향 경기 잠금을 서버에서 검증한다.
- 미리보기 버전(결과·순위·대진) 검증과 기존 대회 잠금 안의 재검증을 결합한다. 감사에는 계산 근거, 전후 배정, 수동 선택과 사유를 남긴다.
- 시작된 경기 교체에 대한 기존 단건 예외를 이 일괄 기능에 자동 확대하지 않는다.
- 와일드카드가 있는 대회의 공개 진출 표시가 기존 advanceCount만으로 오표시되지 않도록 실제 선정팀과 교차 검증한다.

### Ambiguity Log / Progress Snapshot

| Date | Question | Resolution |
|---|---|---|
| 2026-10-12 | 팝업/별도 화면/행별 추천 | A 팝업 적용 (사용자 구현 승인) |
| 2026-10-12 | 조 간 순위 기준 | 상대전적 제외 + 완전 동률 직접 선택 적용 |
| 2026-10-12 | 같은 조 재대결 회피 | 시드 우선·경고 적용 |
| 2026-10-12 | 추천 후 수정 범위 | 진출팀 안의 자리 교환 + 동률 후보 선택 적용; 탈락팀 임의 추가 불가 |
| 2026-10-12 | 8강 직행 연결 | 표준 연결을 생성하고 기존 연결은 호환성 검증; 실제 Alpha 대상 구조는 미확인 |

- 구현 기준: `origin/dev` 37a06cea0, `feat/group-round12-seeding`, `_worktrees/feat-group-round12`. 조사용 작업트리와 분리했다.
- 구현: 목록 전체 템플릿 생성, 5조·20팀 프리셋, 조별 자리 직접/무작위 배정, 12강 자동 배정 팝업, 비교표·동률 선택·수동 교환·사유·저장, preview 버전 검증 및 원자적 저장/감사. 영속 스키마 변경 없음.
- 실제 DB: 개인 임시 PostgreSQL 16.2(127.0.0.1 전용), 현 migration 전체 재생 후 격리 clone 환경에서 신규 3 + 기존 슬롯 44 = **47/47 통과**. 자리 없는/있는 대진, 12팀·부전승4·8강 직행, 조별 ENTRY20 유지, 교환, 중복 거절, stale409, support403, 미확정409 검증. 정렬 안정화·결선 LIVE 차단·조별 20자리만 무작위 배정 및 재호출 no-op 추가 후 신규 3/3 재통과.
- Web: 프리셋/계산/조별 입력 60개 + 목록/조 카드/신규 HTTP 팝업 54개 = **114/114 통과**. 빈 목록에서 프리셋 생성 API, 12팀 교환 저장, 동률 확인, stale409 초안 유지 포함.
- API: 범위 단위 최초 105개 통과, narrowing 수정 후 서비스/선정 7개 재검증 통과(선정 4개는 중복). API 타입 검사 및 surface 검사 통과.
- Web 타입 검사: 변경 파일 오류 없음, 선재 `use-v1-api.leave-team.test.tsx:42,65`의 mutate 무인자 호출 오류 2개로 전체 타입 검사는 실패. 이번 범위에서 관련 없는 테스트는 변경하지 않았다. Web 패턴 검사 통과.
- 2026-10-12 Alpha 배포 요청: 최신 dev 37a06cea0과 동일 base 확인. 로컬 TanStack 5.91→lockfile 5.102.8 일치 후 기존 leave-team 타입 오류 2개가 사라졌다. 신규 테스트 role query의 지원하지 않는 exact 옵션을 앵커 정규식으로 수정했다. 수정 후 Web 전체 타입 검사 0, 배포 전 신규 HTTP/선정 회귀 재확인 및 dev PR 진행.
- 배포 진행: 구현 커밋 `332fa2efb`를 push하고 dev 대상 [PR #1855](https://github.com/kim-song-jun/matchup-sports-platform/pull/1855)를 생성했다. 웹/Gates CI 통과, API 전체 통합 1,167개 중 정규 리그 무작위 배정 2개 실패를 확인했다. `regular_league`에도 group_knockout format이 저장될 수 있으므로 조별 ENTRY 제한은 대회 kind에만 적용하도록 수정했다. 최신 dev `7570bd809`를 기능 브랜치에 merge했다. 새 임시 DB에 전체 migration + CI competition-config backfill을 적용하고 기존 리그 11 + 신규 12강 3 = **14/14 통과**(108.906초). 첫 로컬 재검증은 기존 임시 DB 데이터·미완료 초기화 때문에 실패해 새 DB로 교정했으며 통과 증거로 계산하지 않는다. CI 재확인 중이고 Copilot 요청 2회에도 리뷰는 아직 0건이다.
- 2026-10-12 배포 승인: 사용자에게 Copilot 리뷰 미도착 상태와 정본 게이트를 설명했고 이번 PR의 예외 진행 승인을 받았다(“진행해줘”, 이후 대회 범위 재확인 후 “오케이 배포 해줘”). API/Web/Gates CI `38215920209` 모두 PASS. 이후 dev의 템플릿 편집 PR #1853 병합으로 충돌이 생겨 최신 dev `c97fe65a5`를 반영했다. 두 작업의 task 기록·경기 생성 후 편집·조별 슬롯 제한을 모두 유지하고 팀 수 기반 생성 UI에 20팀·5조·12강 프리셋을 연결했다. 수정 후 영향 웹 5개 파일 **113/113 PASS**, 웹 전체 타입 검사 PASS. 새 CI 확인 후 dev 병합·Alpha 배포 진행.
- 미실행: Alpha 로그인 후 실제 관리자/공개 화면 QA **0/3 폭**, 실제 대회 데이터 편성, dev 병합 및 해당 기능 Alpha 배포. 기존 Alpha 배포 성공은 이 기능 반영의 근거가 아니다.
- 브라우저: 초기 libnspr4/libnss3/libasound2 누락을 /tmp 추출 라이브러리로 해결했다(시스템 설치 없음). headed 합성 컴포넌트 **390/768/1440 3/3 PASS**, 각 폭 템플릿·팝업 상단·배정 하단 3장, 가로 overflow0·JS/console/network 오류0. 본문 스크롤과 저장 버튼 영역 분리, desktop 비교표 3열 확인. 실제 Alpha에서는 로그인 이동/auth/me401 확인, 기능 검증은 0/3이다. 변경 전 기능 화면은 인증 없어서 확보하지 못했다. 브라우저 트리는 모두 종료했고 임시 PostgreSQL도 `pg_ctl stop -m fast`로 종료했다.
- 결정은 `docs/design/competition-canonical-flow.md` §6에 반영했다. API README/global/domain 및 변경 기록을 함께 갱신했다.

### Headed 시각 증거 (합성 데이터, 실제 Alpha 기능 검증 아님)

| 폭 | 생성 프리셋 | 추천·비교 | 배정·저장 | 판정 |
|---|---|---|---|---|
| 390 | [생성](../../docs/screenshots/round12-list/template-390.png) | [상단](../../docs/screenshots/round12-list/round12-top-390.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-390.png) | PASS: 전체 높이, 본문 스크롤, 분리된 저장 영역 |
| 768 | [생성](../../docs/screenshots/round12-list/template-768.png) | [상단](../../docs/screenshots/round12-list/round12-top-768.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-768.png) | PASS: 모달 경계·3열 비교·2열 배정 |
| 1440 | [생성](../../docs/screenshots/round12-list/template-1440.png) | [상단](../../docs/screenshots/round12-list/round12-top-1440.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-1440.png) | PASS: 모달 최대폭896·비교표·저장 영역 |

- [합성 화면 측정](../../docs/screenshots/round12-list/evidence.json), [Alpha 읽기 전용 접근 기록](../../docs/screenshots/round12-list/alpha-readonly.json), [로그인 이동 화면](../../docs/screenshots/round12-list/alpha-before-access.png).
- 명령: 현재 컴포넌트 esbuild 번들 + Tailwind compile + 임시 정적 서버(Next 서버 아님), Playwright `chromium.launch({ headless: false })`. 합성 20팀은 `src/test/msw/cross-group-round12-fixture.ts` 사용. PID/PPID 기록: 최종 정적 QA Node13088→Chrome13216, Alpha Node12871→Chrome12893. 모두 finally browser.close/server.close 후 종료.
- 남은 배포 후 시나리오: 관리자 목록에서 실제 전체 생성→20팀 편성→공식 결과→추천/동률/교환/저장→공개 대진·진출 표시를 3폭에서 확인. 이번 범위의 완료 상태는 코드·로컬 계약 검증까지다.

## 2026-10-12 추가 요청 — A + C 선택

Status (추가 요청): In Progress — PR #1853·#1863 dev 머지·alpha 배포 완료. 생성 화면3폭·초안 보존·4형식 실제 생성/편집/저장 확인. 후속 #1873 CI·alpha의 목록 기본 팀 수/카드 대비 재검증 진행 중.

- 사용자 요청: 첨부 운영자 피드백의 대회·리그 템플릿을 다듬어 dev 대상 PR과 alpha 테스트까지 진행.
- 원문 피드백: 12강 지원이 불명확하고, 템플릿과 수기 입력이 잘 이어지지 않으며 수정·삭제가 번거롭다. 기능 제거 의견은 첨부 대화의 제안이며 사용자 확정 요구로 취급하지 않는다.
- 사용자 결정: "A + C 로 가는게 좋겠네." 기존 그림 편집 유지 + 참가 팀 수부터 가능한 구성 안내 + 생성 뒤 수기 경기와 동일한 편집 흐름.
- 현재 근거: HEAD/origin/dev/alpha `a4b7c2d78` 일치. 단독 토너먼트 4·8·12·16팀, 12팀 선택 시 4팀 부전승 안내·경기 수 표시를 실제 alpha에서 확인. 이번 조사에서 생성·저장하지 않음. 조별 이후 결선은 2·4·8·16팀 지원.
- 설계 비교: 로컬 의사결정 목업 A(그림 편집 통합), B(수기 목록 우선), C(팀 수부터 안내)를 작성한 뒤 사용자 A+C 선택. 제품 코드에 목업 파일을 포함하지 않는다.

### 2026-10-12 후속 그래픽 카드 제안

- 사용자가 생성창의 숫자·설명 중심 구성을 보완해, 리그 → 토너먼트 / 토너먼트만 등 진행 구조를 작은 그림과 함께 2×2 카드로 비교하자고 제안했다.
- 로컬 `template-graphic-options.html`에 A(2×2 카드, 추천)·B(선택 + 큰 미리보기)·C(대표 카드 강조)와 선택·복사 제어를 제공했다. 아래 S1 결정에 따라 제품에 구현하고 검증 중이다.
- 기존 템플릿 API는 현재 대회 format에 맞춰 생성한다. 대회 생성 단계의 방식 선택 카드와, 기존 대진 관리에서 format까지 전환하는 기능은 범위가 다르다. 정규 리그는 별도 경로다.
- 사용자 S1 확정: 대회 생성에서 방식 선택, 대진 관리에서는 현재 방식의 그래픽 템플릿 선택. 기존 대회 format 전환은 범위에 넣지 않는다.
- 생성 API는 세 format만 저장하고 단일/홈·어웨이는 생성 DTO에 없다. 생성 카드 네 번째는 실제 별도 `/admin/league-matches/new`로 이어지는 정규 리그로 구성하며, 단일/홈·어웨이는 실제 리그 템플릿 카드에 제공한다.
- 후속 Wave: Luna 공통 shared 카드 + 생성/대회·정규 리그 템플릿 UI → Sol 독립 계약·접근성 검토 → 범위 lint/정확한 PR SHA CI → dev 머지·alpha 3폭/4형식 실제 검증. 공유 계약 API/DTO/Prisma/format 전환은 변경하지 않는다.
- 2026-10-12 재로그인 후 alpha는 `89e7dcba577afdeaaf190393e4fe43f0d586a3aa` / `1.8.0-alpha.20261012.g89e7dcba577a`, 운영자 조회 200. 최신 cross_group_round12 지원을 보존하며 origin/dev를 격리 checkout에 병합했다. 기존 12팀 QA 경기 시각 PATCH/GET `2026-11-02T09:00:00.000Z` 저장 확인. 앞선 자동화 fill은 React 변경 이벤트를 발생시키지 않아 키보드 이벤트로 바로잡았다.
- Sol의 독립 계약 검토에서 생성 API가 저장하지 않는 단일/홈·어웨이 그림과 저장된 초안의 미저장 입력 경고 누락을 발견했다. 생성에는 중립 리그 그림을 적용하고, 저장 초안도 이동 전에 입력 유실 경고를 제공하도록 수정했다. 실제 단일/홈·어웨이 카드는 템플릿 단계에서만 사용한다.
- S1 구현: Luna 구현, Sol 최종 정적 PASS. 12팀 그림 연결선·결승, 홈·어웨이 단계 제목, 링크 focus outline을 보완했다. 생성 카드·초안 이동 경고·12팀·리그 라운드의 집중 계약은 PASS. 기존 presentation Tab7과 240경기 제한 테스트는 로컬 5초 timeout이었고 baseline으로 단정하지 않는다. 마지막 20팀 카드 단언 수정은 재실행하지 않았으므로 정확한 PR SHA의 CI가 최종 확인한다. root tsc PASS 후 폰트 토큰·baseline을 수정하여 패턴 검사 PASS. 전체 로컬 suite/build는 반복하지 않았다.
- 후속 dev PR [#1863](https://github.com/kim-song-jun/matchup-sports-platform/pull/1863) 생성. alpha `979500ea3`에서 재로그인 직후 admin/me 200을 확인했으나 이후 일반 auth/me 200·account active·약관 compliant 상태에서 admin/me/bracket/수기 생성이 모두 403 `Active admin access is required`로 변경됐다. 수기 생성은 성공하지 않았고 기존 QA 데이터는 그대로다. 활성 관리자 접근 문제를 계정 소유자에게 전달했으며 우회하지 않는다. PR 정확한 SHA CI·후속 배포·실제 그래픽 after 검증은 아직 미완이다.
- 운영자 확인 후 alpha9795 admin/me 200·ops 재확인. 수기13번 경기 추가201→편집 자동 열림→이미 다른 경기에 배정된 두 팀 PATCH200×2/GET 저장 확인→삭제 확인/DELETE200→GET에서 신규ID 부재·원래12경기 유지. 신규 QA 경기만 변경·삭제했고 결과·공개 상태는 유지했다.
- PR head56ef의 CI38228980712 Web은 8,710 PASS / 4 FAIL: 비선택 카드까지 포함한 부전승 문구·중복 조 구성 radio·옛 특수 checkbox 선택자 때문에 실패했다. 실제 선택 카드/미리보기로 범위를 좁히고 HTTP 소비 테스트는 20팀 입력→실제 특수 카드 선택으로 수정했으며 POST payload 단언은 유지했다. 영향을 받은 6개 계약 최종 PASS. 로컬 timeout 두 건은 해당 CI에서 재현되지 않았다.
- 자동 리뷰에서 20팀 특수 선택 후11팀 변경 시 해제 불가와 visible title/접근성 이름 불일치 두 건을 수정했다. 특수 모드 해제/복구 회귀1개 PASS, radioLabel prop·override를 완전히 삭제하고 titleId를 접근성 이름으로 사용한다. Sol 최종 정적 PASS, root 최종 lint(tsc+패턴) PASS. 새 head CI·alpha after가 최종 게이트다. Advanced Security는 기존과 동일한 미지원 모델 claude-opus-5의 session.create 실패이며 보안 검사 PASS로 취급하지 않는다.
- 최종 PR head `9f82f2efc60f302efc7e6fdf4b7dd4a71df3213e` CI `38233610168` API/Web/Gates PASS(Web 740파일/8,723테스트·lint/typecheck·production build). base dev와 expected head를 확인해 #1863을 merge `eb38409219dc23d2ec347c211f64d5d9251e0b96`로 머지했다. 두 커밋의 Git tree `3d2775e43499a1035826fe018744796699f2a720`는 동일하다. 머지 커밋 CI `38235211195`도 모두 PASS, alpha Deploy `38235211193` SUCCESS.
- 19:34 KST alpha Web/API commit `eb38409219dc23d2ec347c211f64d5d9251e0b96`, Web release `1.8.0-alpha.20261012.geb38409219dc`를 실제 확인했다. 브라우저 인증 쿠키 0·admin/me 401이므로 같은 ego326을 로그인 화면에서 계정 소유자에게 넘기고 재인증을 요청했다. 변경 후 실제 UI·저장 PASS는 아직 미완이다. 공유 primary HEAD는 dev와 diverged하여 FF 동기화가 거절됐고 외부 WIP는 보존했으며 격리 작업트리만 정상 FF했다.
- 같은 새 배포의 cookie 없는 guest HTTP에서 admin/me 401 `UNAUTHENTICATED`, 비공개 QA 공개대진 404·data 없음 확인. 관리자 UI/생성/저장 검증을 대체하지 않는다. 다음 cursor: 사용자 로그인 확인 → 동일326 takeOver → 생성 2×2/3폭 after 캡처 → 4형식 실제 생성·편집·저장 → 증거·cleanup. 로그인 대기에는 task.finish를 호출하지 않는다.
- 사용자의 ㄱㄱ 후 관리자200으로 재개. alpha eb384 실제 생성 화면에서 desktop1440/tablet768은2×2, mobile390은1열·가로 넘침0·44px 다음 CTA를 캡처했고 스크롤 끝의 성별 선택 가림 없음. Sol 실제5장 독립 캡처 PASS(BLOCK0/WARN0, 작은 SVG 보조 라벨 FYI). 새 입력 정규 리그 이동 경고→계속 작성 입력 보존→이동하기 실제 별도 route 확인. 토너먼트만 선택→12팀 초안 POST201/GET200(format knockout/status draft/scheduledAt2026-11-02T09:00Z), Runtime exception0.
- 신규 초안 `f24be679-642b-439b-81a3-ee631eb74502`의 기본 isPublic=true다. 일반 update에 visibility를 보낸 요청400은 전용 `/visibility` 계약으로 바로잡았으나, 새로고침 뒤 auth cookie가 사라져401이 되어 private flag 저장은 미완이다. 저장된 초안의 미저장 입력 경고 문구는 실제 확인했으나 그 취소/이동 확인은 미완. 접수/공개를 시작하지 않았다. 이후 alpha f9d38(eb384의 직접 descendant, 다른 사업자 fragment PR #1866)에서 새 초안의 guest detail/bracket404·data 없음 확인. Luna 읽기 전용 auth 분석상 TTL7일·401 자체 cookie삭제 없음, 소실 직접 원인은 미확정. 같은326 이메일로그인 handOff·재인증 요청; 다음 첫 작업은 신규 초안 visibility false만 저장한 뒤 나머지4형식 대진 테스트다.

- 2026-10-13 로그인 후 alpha b446537 admin200. 신규 초안 visibility false PATCH/GET200·나머지 핵심 필드 보존; 저장 초안 경고 취소 시 미저장 입력 보존·확인 시 정규 리그 route 이동·서버 초안 그대로 확인. 단독12팀12경기(3·4위 포함), 조별12팀33경기, 대회 리그4팀6경기, 정규 리그4팀6경기의 생성→첫 경기 편집→양팀·일정·장소 서버 저장 확인. 20→11→20 특수 선택 해제/잠금 해제/유효 편성 복구 확인. 정규 리그 모바일 수기 추가201→7경기·기존6ID 보존→4주차/신규 sheet/양팀 확인→닫기/reload 후 sheet0 확인. 결과·공개/진행 변경 없음. 상세 증거는 `docs/visual-qa/template-graphic-cards-20261012/README.md`.
- 목록의 전체 대진 만들기가 실제 확정팀 수를 누락해12팀에도8로 열리는 결함과 비활성 카드 가독성 WARN을 발견·수정. Luna4소스/5테스트 변경, Sol 독립 정적 PASS. 집중70테스트·lint/typecheck/패턴 PASS. 사유 입력의 async act 경고 수정 후 해당1계약 PASS·경고 없음. 후속 dev PR #1873; exact-head CI와 배포 후 실제 기본 선택·3폭 대비가 남았다.

### Owned / Forbidden scope

- 구현: `apps/v1_web/src/components/admin/bracket-canvas/`, 관련 `apps/v1_web/src/lib/bracket-template-*`, 대회 `bracket-tab.tsx`, 정규 리그 대진 편집·템플릿 화면 및 관련 좁은 테스트.
- root: 이 task 추가 요청 절, changeset, PR·CI·alpha 증거.
- Forbidden: Prisma·DB migration, production, 새로운 임의 팀 수 지원·조별 뒤 12팀 결선 확대, 템플릿 제거, 다른 도메인·다른 세션 WIP.
- 구현/검증은 각각 Luna/Sol 순차 위임. 서브에이전트 self-commit·push·merge·테스트 병렬 fan-out 금지.

### Acceptance Criteria

- [x] A·B·C 3안 및 추천안 → 사용자 A+C 선택.
- [ ] 참가 팀 수를 먼저 입력하고 해당 대회 진행 방식에 맞는 실제 지원 구성과 경기·단계 미리보기를 제공한다. 등록 팀 수를 유효하게 활용하고 지원하지 않는 조합은 이유를 명시한다.
- [ ] 템플릿 생성 경기와 수기로 만든 경기의 팀·일정·진출 연결 편집 동선이 이어진다. 목록 편집도 slot/source 계약을 우회하지 않는다.
- [ ] 생성/수기 추가 성공 뒤 해당 경기 편집으로 이어지고, 삭제 영향·기록 보호 이유를 확인할 수 있다. 실패를 성공으로 표시하지 않는다.
- [x] 정규 리그도 참가 팀 수·라운드·경기 수 안내와 생성 후 편집 흐름을 유지한다.
- [ ] 기존 권한·공개 대진·결과·전적·알림 API 계약을 유지한다.
- [x] 최소 계약 테스트·범위 lint/typecheck, dev 대상 PR의 정확한 SHA CI·독립 리뷰.
- [ ] alpha 배포 SHA 확인 후 대회/정규 리그와 390·768·1440px 실제 흐름·스크린샷 검증. 테스트 데이터 변경 범위를 증거로 남긴다.

### Progress Snapshot

1. 컨텍스트·최신 dev·alpha 기준 확인 완료. alpha space 326 재사용, 사용자의 운영자 직접 로그인 후 `/admin/me` 200 확인.
2. A+C 구현 완료. Luna 구현 → Sol 독립 검토에서 임의 팀 수 올림 추천·양쪽 동일 팀 선택·모달 높이 문제를 수정 → Sol 정적 재검토 PASS. 템플릿/helper/목록 94개 중 93 PASS 후 마지막 오류 표시 테스트의 refetch mock을 실제 Promise 계약에 맞추고 관련 3개 PASS. 경기 패널 45개 PASS. `pnpm --filter v1_web lint`(tsc·v1 패턴 검사) PASS; PR·배포·변경 후 alpha PASS는 아직 없음.
3. alpha 전용 QA 데이터: 비공개 대회 `1c7cb376-70cf-4532-a95d-3bf088bae1bb`(확정 12팀, 결과 없음), 정규 리그 `48603613-3382-4993-9106-34661ae74fa6`(4팀, 준비 상태). 기존 다른 QA 대회/리그는 조회만 했으며 변경하지 않음.
4. 변경 전 1440px 템플릿 화면 캡처. 저장된 테스트 계정은 401이었으나 사용자 직접 로그인으로 해소. 준비 도중 다시 로그인 화면으로 전환되었으므로 배포 후 로그인 재개 필요. 자동화 selector 오기와 파일 경로 오기는 실제 snapshot/파일 목록으로 바로잡음. context-mode DTO 조회 타임아웃은 native 파일 조회로 대체.
5. 종료 시 ego `finish({ keep: [] })`, 위임 에이전트 상태 확인/종료, 소유 프로세스 회수.
6. 작업 중 alpha/dev가 `37a06cea0`으로 갱신됨. 이전 base 대비 릴리스 버전·changeset 소비·별도 task 문서만 변경되었고 이번 기능 소스와 충돌 없음. 공유 메인 작업트리에는 다른 세션 WIP가 있으므로 손대지 않음.
7. dev PR [#1853](https://github.com/kim-song-jun/matchup-sports-platform/pull/1853), head `01f35f11e`. CI `38208150429` API/Gates PASS, Web FAIL: 전체 8,663개 중 14개가 기존 공개·행 액션 테스트 2개 파일의 새 slot 훅 QueryClient 계약 누락으로 실패. Copilot은 해당 head에서 open findings 0건이나 Codex inline 6건은 미해결.
8. 보완 범위: 직접 입력 쪽의 참가팀 선택·hybrid 경기 쪽별 잠금, 이미 다른 경기에 쓰인 진출 연결 후보 제외, 모바일 리그 생성 후 편집 연결, 늦게 도착한 등록 팀 수·로딩/오류 처리, 12팀 부전승 진행 순서. Sol이 등록 팀 수 초기화 문제를 독립 재현해 이전 PASS를 supersede했고 Luna가 수정 중. 기능 완료·변경 후 alpha PASS로 보고하지 않는다.
9. 6건 수정 후 Sol 정적 검토 PASS. 모바일은 해당 라운드도 선택하고, 같은 focus ID의 refetch에서는 닫힌 시트를 다시 열지 않음. Luna의 집중 실행 35개 중 33 PASS 후 모호한 alert·선택 chip 단언 2건을 실제 UI에 맞게 수정하고 해당 계약 PASS; CI 소비 테스트 14개 포함. 모바일 refetch 회귀는 새 rounds 배열로 강화한 단일 테스트 PASS. 소유 테스트 PID `86281`, `92241` 종료 확인. 신규 커밋 CI·배포·변경 후 실제 화면 검증은 아직 없음.
10. 사용자 재로그인 뒤 `/admin/me` 200 확인. alpha는 아직 `37a06cea0` / `1.7.1-alpha.20261012.g37a06cea0f77`이며 변경 전 390·768px 증거를 추가 기록한다. 캐시 데이터가 있는 등록 목록의 refetch 실패 처리는 기존 stale-data 정책을 유지하고, 데이터 없는 pending/error만 템플릿 적용을 막는다.
11. root 최종 lint 1회에서 group shape의 `legs`·`thirdPlace` 타입 누락 검출 → 기존 완전한 값에 shape를 병합하여 수정 → root `pnpm --filter v1_web lint` 재실행 PASS(tsc·패턴 검사). lint shell PID `17370` 실행 종료. 로컬 전체 suite는 반복하지 않고 새 PR head CI로 확인한다.
12. head `932ee6992` CI `38213260004` API/Web/Gates 모두 PASS. 최신 Copilot 1건은 양쪽에 동일한 진출 출처를 선택할 수 있는 문제이며 v1 서버 거절 계약과 교차 확인해 패널·목록·수기 선택을 보완한다. 수정 뒤 새 head의 CI·Copilot을 다시 확인한다.
13. 사용자 UI 표시 요청에 A/C 설계 미리보기를 메시지에 직접 표시했다. 실제 alpha after 증거로 취급하지 않는다. 다른 dev 변경 `7570bd809`의 계정 약관 배포로 space 326이 필수 약관 화면으로 이동하고 관리자 조회 403이 확인되어 계정 소유자에게 직접 동의 후 재개를 요청했다. 약관을 대신 수락하지 않는다.
14. 마지막 Copilot 선택 오류를 공유 side-options helper로 패널·수기 연결·목록 모두 수정하고 중복 저장도 막았다. 서버의 `BRACKET_SOURCE_INVALID` 계약과 Sol 독립 정적 검토 PASS. 선택된 소비 테스트 2개 PASS; helper/panel 3개 PASS(잘못 구성한 테스트 입력 1개를 실제 계약에 맞게 정정한 뒤 좁게 재검증). root 최종 lint PASS. 소유 테스트 PID `20434`, `22329` 종료 확인; 로컬 전체 suite를 반복하지 않는다.
15. head `2e6283559` 최신 Copilot inline 미해결 0건. CI `38216609886` Web은 8,677 PASS/7 FAIL: 새 목록 출처 테스트가 공유 조·경기 배열을 복구하지 않아 후속 테스트에 영향을 줬다. 해당 describe의 afterEach로 상태를 복구하고 단언은 유지했다. 좁은 bracket-tab 파일 40/40 PASS; 기존 started-team-change 테스트에서 React act 경고 1개가 있으므로 무경고 검증으로 보고하지 않는다. 테스트 PID `78004` 종료 확인. 제품 코드 변경은 없다.

### Alpha 실행 계획 (아직 결과 아님)

- 배포 SHA 확인 → 운영자 로그인 200 → 이번 작업 QA 리그 비공개 확인 후 진행한다.
- 단독 12팀: 등록 팀 수 초기값·부전승 순서·경기 수 확인, 템플릿 교체 → 첫 경기 편집, 팀/일정 저장, 수기 경기 추가 → 해당 경기 편집, 수기 경기에서 슬롯에 배치된 팀 선택, 삭제 영향 확인.
- 조별 후 결선·대회 리그: 이번 작업 전용 데이터로 12팀 조별 구성(2×6, 4×3)·진출 수와 리그 경기 수를 확인하고 생성·편집을 밟는다. 지원하지 않는 팀 수는 저장이 잠기는지 확인한다.
- 정규 리그 4팀: 단/복수 라운드 경기 수, 생성 뒤 편집, 수기 추가 뒤 모바일 편집 시트 연결을 확인한다. 기존 모바일 화면에는 템플릿 생성 진입이 없어 그 동선을 실행했다고 보고하지 않는다.
- 390·768·1440px: 데이터 로딩 후 동일 모달/편집 상태의 캡처, 본문 끝 스크롤, 마지막 입력·CTA 가림, console/network, 운영자·로그인 필요 상태를 기록한다.
- 기존 대회·리그는 변경하지 않고, 생성한 QA 데이터는 비공개·결과 없는 상태로 남긴다. 종료 시 ego space 326과 소유 프로세스를 회수한다.


Status: Review — 2026-10-10 구현 PR 18개 dev 머지(마지막 #1766 `da879b17a`), #1771 로 C3 정정 테스트 고정, alpha E2E 6회 모두 통과. 남은 것: 동률 조의 공개 순위표 진출 표시(결정 A 구현 `fix/bracket-tie-standings` — 머지·alpha 재확인 대기), PR별 갤러리 일부 미게시, Copilot clean 미확인(장애) — 끝나거나 면제되면 Done
**Owner**: Planning(main) → backend-data-dev · backend-api-dev · frontend-data-dev · frontend-ui-dev
**Created**: 2026-10-08
**Base**: origin/dev `c62b5ec08`

## Context

운영자는 지금 어드민 「대진 관리」에서 경기를 목록에 한 줄씩 추가하고, 승자 연결을 경기마다 손으로 걸고,
조별·리그는 팀이 정해진 뒤에야 경기를 만들 수 있다. 결과 하나를 넣으려면 라이브 콘솔에서
시작 → 종료 → (고쳐서 제출) → 확인을 거쳐야 해서, 대회를 새로 만들거나 alpha 에서 "결승까지 한 바퀴"를
테스트하는 데 수십 번 클릭이 든다.

원요청(2026-10-08): "어드민에서 리그 / 토너먼트 등 대진 만들 때 그래픽으로 대진 먼저 만들고 이후에 팀 선택할
수 있는 기능 … 결과입력이나 그런 것도 잘 수정할 수 있는 거고 … 대회 만들거나 테스트할 때 좀 더 쉽게".

설계 검토(3안 + 세부 결정 D1~D8, production-fidelity 목업)는 HTML 결정 페이지로 진행했고 사용자가 아래로 확정했다
(UI 착수 규칙 "A·B·C 3안 → 선택" 충족):

| 결정 | 확정 |
|---|---|
| D1 접근 | **B — 실제 대진을 그림으로 편집** (칸 = 실제 경기, 템플릿으로 뼈대 생성) |
| D2 정규 리그 빈칸 | **b — 리그도 빈 경기를 실제로 만든다** (추천 a 와 다름) |
| D3 조별 → 결선 | **a — "A조 1위" 자리 + 「순위대로 채우기」** |
| D4 팀 넣기 | **a — 칸 누르기 + 끌어 놓기 + 「빈 자리 무작위 채우기」** |
| D5 빠른 입력 알림 | **a — 일반 확정과 똑같이 보낸다** |
| D6 결과 고치기 | **a — 점수 고치기·결과 무효는 그림에서, 득점 기록 있는 경기는 정정 화면으로** |
| D7 기존 카드 화면 | **a — 같은 탭에서 [그림 \| 목록] 전환, 기본 그림** |
| D8 모바일 | **a — 보기·팀 넣기·결과 입력, 구조 편집은 768px 이상** |

추가 회신: 대상은 토너먼트·조별+결선·리그 방식 대회·정규 리그 전부. 결과 입력은 점수만 넣고 바로 확정
(득점자는 라이브 콘솔에서 실시간으로 넣으므로 그림 입력은 테스트·비상용). 사용자는 플랫폼 어드민(/admin)만.

## Goal

플랫폼 어드민이 대회·정규 리그의 대진을 템플릿으로 한 번에 만들고, 그림 위에서 자리에 팀을 넣고, 칸에서 점수를
넣어 즉시 확정하고 고칠 수 있으며, 그 결과가 기존 공개 대진표·자동 진출·순위·전적·알림에 그대로 반영된다.

## 현재 코드 사실 (2026-10-08 실측 — 설계 근거)

- 대회 경기는 팀 없이 만들 수 있다: `createTournamentMatchInTx`(`tournaments/tournament-match-creation.ts:159`)가
  home/away 팀 null 을 허용하고 사이드 이름을 '홈 팀 미정'/'어웨이 팀 미정'으로 두며, 팀이 있을 때만 팀 일정을 만든다.
- 승자 연결은 `V1TournamentMatchAdvancementEdge`(WINNER/LOSER → HOME/AWAY), tx 헬퍼
  `createTournamentMatchAdvancementEdgeInTx`(같은 파일 :284). 결과 OFFICIAL 시 `projectCanonicalAdvancement` 가 다음 칸을 채운다.
  허용 인접표: quarter←round12, semi←quarter, final←semi, third_place←semi(LOSER) (`tournament-bracket.service.ts:851`).
- 팀 배정 tx 함수 `updateTournamentMatchInTx(tx, input)`(`tournaments/tournament-match-update.ts:28`)가 사이드·팀 일정·명단 무효화·
  재계산 이벤트를 처리한다. 서비스 `updateFixture` 의 선검증(확정 등록·같은 팀·결과·부전승)은 tx 밖에 있다.
- `createGroup`·`createFixture`·`updateBracketSources`·`deleteFixture`·`deleteGroup` 은 내부에서 `$transaction` 을 직접 연다
  → 템플릿 한 트랜잭션에 묶으려면 `…InTx` 추출이 선행돼야 한다. 대회 대진 변경은 advisory lock
  `league-fixture-generation:{tournamentId}` 을, 정규 리그 대진 변경은 `v1_tournaments` 행 `FOR UPDATE`(`league-match-admin.service.ts:585`)를
  먼저 잡는 것이 관례다(둘은 서로 직렬화되지 않는다). 경기 생성은 `competitionConfigVersionId` 가 필수다.
- 결선 round 문자열은 한글('12강','8강','4강','결승','3·4위전'), 조별 라운드로빈은 'league_r{n}'. fixtureNumber 는 대회 전체 연속.
- 라운드로빈 페어링 `generateRoundRobin`(`common/scheduling/round-robin.ts`)·`buildLeagueFixtureRows`
  (`tournaments/league-fixture-generator.service.ts:261`)는 순수 함수라 자리 id 를 그대로 넣을 수 있다.
- 12강 부전승: 빈 자리는 `V1TournamentByeSlot{groupId, sortOrder}`, 팀이 정해진 부전승은 `V1TournamentGroupTeam.isBye`.
  공개 그래프(`apps/v1_web/src/lib/tournament-bracket-graph.ts`)는 부전승 팀이 8강 칸에 배정돼 있으면 BYE 연결선을 그린다.
- 정규 리그(`kind=regular_league`) 참가팀 = 확정 `V1TournamentRegistration`. 리그 경기는 `createLeagueFixture`
  (`league-matches/league-fixture-creation.ts`)로 만들고 home/away 팀 non-null, `V1TournamentMatchDetails` 가 없다
  (games 쪽은 details 부재를 리그로 판정). 리그 공개 경로 여러 곳이 `hostTeamId === null` 을 500/409 로 던진다
  (`league-match-public.service.ts:43-66`, `tournaments-read.service.ts:46-68`, `public-tournament-records.service.ts:2252-2273`,
  `league-fixture-videos.service.ts:73-79`), 취소·재생성은 `requireLeagueHostTeamId`(`league-match-admin.service.ts:128`)로 409.
  알림·리마인더·명단 동기화·채팅은 이미 팀 null 을 건너뛴다.
- 결과: 대회 경기는 점수만으로 리비전을 만들 수 없다(`TOURNAMENT_RESULT_DERIVED_ONLY`). 확정(officialize) 내부 단계와 재사용
  함수는 `tournament-result-review.service.ts:403-577`·`withResultCommand`(:836, private, Serializable·감사·멱등). 상태 머신
  `assertRevisionTransition`(`games/core/revision-state-machine.ts:71`)은 DRAFT→OFFICIAL 을 CORRECTION 흐름에만 허용한다.
  어드민 전용 판정은 `TournamentStaffAccessService.assertAccess` 결과의 `role === 'platform_ops'`(owner·ops; support 제외).
- 확정 결과 고치기(corrections→officialize)·무효(void)·웹 훅(`hooks/use-tournament-result-review.ts`)은 이미 있다.
- 웹: 어드민 대진은 `app/admin/tournaments/[id]/bracket-tab.tsx`(카드·목록), 공개 그림은
  `components/tournaments/tournament-bracket.tsx`(조회 전용, 칸 컴포넌트 비공개). 드래그 라이브러리 없음.

## 설계

### S1. 자리(slot) — 팀이 들어갈 칸의 정본

새 모델 `V1TournamentSlot` (표 `v1_tournament_slots`). 대회·정규 리그 공통(둘 다 `V1Tournament`).

| 필드 | 의미 |
|---|---|
| `id`, `tournamentId` | 대회(리그) 소유. 대회 삭제 시 cascade |
| `kind` | enum `V1TournamentSlotKind { ENTRY, BYE, GROUP_RANK }` |
| `groupId?` | ENTRY: 소속 조/결선 그룹(정규 리그는 null) · BYE: 12강 그룹 · GROUP_RANK: 그 자리가 속한 결선 그룹 |
| `position` | 1부터. ENTRY·BYE: 그룹 안 순번 · GROUP_RANK: 순위(1위=1) |
| `sourceGroupId?` | GROUP_RANK 전용: 순위를 가져올 조 |
| `registrationId?` | 배정된 팀(확정 등록). null = 비어 있음. FK onDelete SetNull 은 안전망일 뿐 — 등록은 지우지 않고 상태만 바뀌므로, confirmed 를 벗어나는 전이에서 S3 헬퍼가 명시적으로 비운다 |
| `createdAt`, `updatedAt` | |

- 유일 제약: `@@unique([tournamentId, kind, registrationId])` — 같은 팀이 같은 종류 자리 두 곳에 못 들어간다(빈 자리는 null 이라 겹쳐도 됨).
  ENTRY 와 BYE 를 동시에 차지하는 것은 서비스에서 막는다. 여러 자리를 한 번에 바꾸는 배치(순위대로 채우기·무작위)는
  **바뀔 자리를 먼저 모두 null 로 비운 뒤** 새 값을 넣는다(맞바꾸기에서 유일 제약 위반 방지).
- 경기 연결: `V1TeamMatch` 에 nullable `homeSlotId`·`awaySlotId`(FK → slot, onDelete Restrict). 대회·리그 경기가 같은 컬럼을 쓴다
  (리그 경기엔 `V1TournamentMatchDetails` 가 없으므로 details 가 아니라 TeamMatch 에 둔다).
  **경기가 빠지는 모든 경로는 자리 연결을 같이 푼다** — 대회 `deleteFixture`(소프트 삭제), 리그 취소(`status='cancelled'`, 리그엔 소프트 삭제가 없다),
  템플릿 교체. 그래야 자리 삭제가 FK 로 막히지 않는다.
- **"자리를 쓰는 경기"** = `deletedAt IS NULL AND status <> 'cancelled'` 인 경기만. 반영(fan-out)·잠금 판정·공개 게이트 모두 이 정의를 쓴다.
- 라벨은 저장하지 않고 직렬화에서 계산: 조별 그룹 ENTRY "A조 1번" · 결선 그룹/리그 ENTRY "1번 자리" · BYE "부전승 1" · GROUP_RANK "A조 1위".
- 승자/패자 자리는 자리 행을 만들지 않는다 — 기존 연결선(edge)이 정본이다.
- 마이그레이션은 additive 만: 새 enum·새 표·새 nullable 컬럼 2개·새 FK·인덱스. 백필 없음. 기존 경기는 slot null 로 그대로 동작.

### S1-b. 16강 단계 (2026-10-09 사용자 확정)

- `V1TournamentGroupPhase` 에 `round16` 을 추가한다(자리 마이그레이션과 같은 스키마 변경 — `ALTER TYPE … ADD VALUE`, additive).
- 연결 인접표: `quarter ← round12 | round16`. 라벨 '16강'(round 문자열 '16강', 단계 라벨 표·공개 대진표 라운드 순서·진행 단계 표시·어드민 조 추가 템플릿 "+16강").
- 16강엔 부전승이 없다(부전승은 12강 전용 그대로).

### S2. 템플릿으로 뼈대 만들기

- 대회: `POST /admin/tournaments/:tournamentId/bracket/template`
  - `{ kind: 'knockout', size: 4 | 8 | 12 | 16, thirdPlace: boolean, replaceExisting?: boolean }`
  - `{ kind: 'group_knockout', groupCount: 2..8, teamsPerGroup: 3..6, advancePerGroup: 1 | 2, legs: 1 | 2, thirdPlace: boolean, replaceExisting? }`
    — 결선 크기 K = groupCount × advancePerGroup ∈ {2, 4, 8, 16} 만 허용(그 밖은 422 `BRACKET_TEMPLATE_UNSUPPORTED`).
  - `{ kind: 'league', teamCount: 3..20, legs: 1 | 2, replaceExisting? }` — 리그 방식 대회(`format='league'`).
  - `kind` 는 대회 `format` 과 맞아야 한다(knockout↔knockout, group_knockout↔group_knockout, league↔league), 아니면 422 `BRACKET_TEMPLATE_FORMAT_MISMATCH`.
- 정규 리그: `POST /admin/league-matches/:leagueId/fixtures/template`
  `{ teamCount: 3..20, legs: 1 | 2, schedule: <기존 리그 일괄 생성 schedule DTO 그대로>, replaceExisting? }`.
  리그는 시각·장소가 정본 계약(공개 가드가 요구)이므로 **일정 입력이 필수**다.
- **잠금은 레인마다 기존 관례를 따른다.**
  - 대회 레인(`regular_tournament`): advisory lock `league-fixture-generation:{tournamentId}` 를 먼저 잡는다(`createFixture`·`deleteFixture`·조별 생성과 같은 락).
  - 정규 리그 레인: 기존 리그 서비스와 같이 `SELECT id FROM v1_tournaments WHERE id = $1 FOR UPDATE`(`league-match-admin.service.ts:585`) 후
    `assertFixtureGenerationAllowedInTx`(보류·완료 등 불허 상태 거부)를 먼저 한다. advisory lock 은 리그 경로와 서로 직렬화되지 않으므로 쓰지 않는다.
  - 한 변경이 여러 경기를 갱신하면 대상 경기를 **id 순으로 정렬해** 잠근다(`updateBracketSources` 의 관례).
- 한 트랜잭션(timeout 45s, 생성 경기 상한 240)에서 만든다:
  - knockout 4/8/16: 첫 결선 그룹 ENTRY 자리 size 개 + 각 라운드 빈 경기 + WINNER 연결(+ 3·4위전 LOSER 연결). 16 은 그룹 16강(phase `round16`)·8강·4강·결승(·3위 결정전),
    16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이.
  - knockout 12: 그룹 12강·8강·4강·결승(·3위 결정전) + 12강 ENTRY 8개(12강 4경기) + BYE 자리 4개(position 1~4 ↔ ByeSlot sortOrder 0,3,4,7)
    + 8강 i번 경기: 홈 = BYE 자리 i, 어웨이 = 12강 i번 경기 WINNER 연결. 이후 라운드는 WINNER 연결.
  - group_knockout: 조 A.. 각 ENTRY 자리 teamsPerGroup개 + 라운드로빈 빈 경기('league_r{n}', legs) + 조 advanceCount
    + 첫 결선 라운드 사이드 = GROUP_RANK 자리(교차 대진: 2조×2 → 4강 A1–B2, B1–A2 / 4조×2 → 8강 A1–B2, C1–D2, B1–A2, D1–C2 /
    4조×1 → 4강 A1–D1, B1–C1 / 8조×1 → 8강 A1–H1, D1–E1, B1–G1, C1–F1 / 8조×2 → 16강 A1–B2, C1–D2, E1–F2, G1–H2, B1–A2, D1–C2, F1–E2, H1–G2 /
    2조×1 → 결승 A1–B1) + 이후 WINNER 연결.
    K=2(결승만)에서 `thirdPlace=true` 는 422 `BRACKET_TEMPLATE_UNSUPPORTED`(3·4위전의 패자 원천은 4강뿐).
  - league(대회): 그룹 "리그" 1개(phase group) + ENTRY 자리 teamCount개 + 라운드로빈 빈 경기.
  - 정규 리그: ENTRY 자리 teamCount개(groupId null) + 라운드로빈 빈 경기(시각·장소는 schedule 로 계산, 팀 null).
- 그룹 이름은 기존 화면 규칙(`templateFor`: A조…, 12강/8강/4강/결승/3위 결정전), round 라벨·fixtureNumber 연속·
  `durableCommandId` 규칙은 `createFixture` 와 같다.
- 비어 있음 판정과 `replaceExisting`:
  - 대회: 비삭제 경기·조가 하나라도 있으면 409 `BRACKET_NOT_EMPTY`. `replaceExisting=true` 면 **모든 경기가 시작 전·결과 없음일 때만**
    같은 트랜잭션에서 ① 경기 소프트 삭제(기존 `deleteFixture` 와 같이 round 개명·연결 삭제·자리 연결 해제 — `…InTx` 추출 재사용)
    ② 자리 삭제 ③ GroupTeam·`V1TournamentStanding`·ByeSlot 삭제 ④ 조 삭제 순으로 지우고 새로 만든다. 새 경기의 멱등 키는
    `nextFixtureCreationCommandId`(소프트 삭제 이력 수 반영)를 쓴다. 하나라도 시작·결과가 있으면 409 `BRACKET_LOCKED`.
  - 정규 리그: 기존 일괄 생성과 같이 경기가 1건이라도 있으면(취소 포함) 409 `LEAGUE_FIXTURES_EXIST`. `replaceExisting=true` 면
    **취소 안 된 경기가 전부 시작 전·결과 없음일 때만** 기존 재생성처럼 `status='cancelled'` + `cascadeCancelFixtureInTx` 로 접고
    자리 연결을 푼 뒤 옛 자리를 지우고 새로 만든다(대회용 `deleteFixture` 는 details 가 필요해 리그에 쓰지 않는다).
  - 자리를 쓰는 리그에서 기존 「재생성」(`regenerateFixtures`)은 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` 로 막고 템플릿 교체로 단일화한다.
    기존 「경기 하나 추가」(팀 지정 수동 생성)는 자리 없이 그대로 허용한다.
- 정규 리그 상태: 템플릿은 리그 `status` 를 바꾸지 않는다(빈 경기만 있는 리그가 공개에 "진행 중"으로 보이지 않게). 자리 배정·경기 취소 뒤
  **자리를 쓰는 경기 중 팀이 빈 사이드가 하나도 없으면** 기존 일괄 생성과 같은 진행 상태로 바꾼다. 기존 코드엔 전이 함수가 없고
  `generateFixtures` 안의 인라인 `updateMany` 이므로, 조건부(`status in (draft, open, closed)` — 경기 시작 전 상태 전부)로만 바꾸는 헬퍼를 새로 두고 보류·완료 리그는 건드리지 않는다.
  팀 수가 자리 수보다 적으면 운영자가 남는 빈 경기를 취소해야 전이된다(그때까지 예정 상태 유지 — 의도된 동작).

### S3. 자리에 팀 넣기·빼기

- `PUT /admin/tournament-slots/:slotId/assignment` `{ registrationId: uuid | null }` (대회·리그 공통).
  - 등록은 같은 대회의 confirmed 여야 한다(422 `SLOT_REGISTRATION_INVALID`). 이미 다른 자리에 있으면 409 `SLOT_TEAM_ALREADY_PLACED`.
  - **자리를 쓰는 경기**(S1 정의: 비삭제·비취소)가 전부 시작 전(game SCHEDULED, 공식 결과 없음)이어야 한다, 아니면 409 `SLOT_LOCKED`.
  - 잠금: 레인별 S2 규칙(대회 advisory lock / 리그 대회 행 `FOR UPDATE` + `assertFixtureGenerationAllowedInTx`) 후 대상 경기를 id 순으로 잠근다.
  - 한 트랜잭션에서: 자리 갱신 → 자리를 쓰는 경기마다 사이드 배정 → 조 편성 → BYE 전환 → (리그) 상태 전이 판정 → 감사 로그.
    - 대회 사이드 배정: `updateFixture` 의 tx 안 로직(확정 등록·같은 팀·결과·부전승 가드 + `updateTournamentMatchInTx` + `enqueueRosterResync`)을
      `assignTournamentFixtureSideInTx` 로 추출해 `updateFixture` 와 자리 서비스가 함께 쓴다(동작 보존 리팩터).
    - **조 편성**: phase=`group` 조(조별리그·리그 방식 대회)의 ENTRY 자리에 팀을 넣으면 `ensureGroupPhaseTeams` 로 `V1TournamentGroupTeam` 을 만들고
      순위를 재계산한다. 교체·비우기 때는 그 조의 다른 비삭제 경기에 더 이상 나오지 않는 이전 팀의 GroupTeam 을 지우고 순위를 재계산한다
      (해제 로직은 지금 없으므로 새로 만든다). 순위표·순위대로 채우기가 GroupTeam 을 정본으로 읽기 때문이다.
    - BYE 자리: 12강 그룹의 해당 sortOrder ByeSlot ↔ GroupTeam(isBye) 전환(기존 `createBye` 의미 그대로).
    - 리그 사이드 배정 `assignLeagueFixtureSideInTx`(대회 `tournament-match-update.ts` 패턴 이식): 사이드 팀·표시 이름, 라인업·전술 무효화,
      교체된 팀의 명단 조정 회수(`revokeReplacedSideTeamAdjustments`), `enqueueRosterResync({scope:'game'})`.
      **팀 일정은 양 팀이 모두 정해진 순간에 두 팀 몫을 만들고**, 한쪽이 비면 두 팀 몫을 모두 취소한다(반쪽 경기는 공개 게이트로 숨겨져
      일정 링크가 404 가 되므로). 원정 승인 신청서는 `(teamMatchId, applicantTeamId)` 유일 제약 때문에 **upsert** —
      있으면 `approved` 로 되살리고 없으면 만든다. 원정이 바뀌거나 비면 이전 팀 행은 `withdrawn`.
- 자리에 연결된 사이드는 기존 `PATCH /admin/fixtures/:id` 로 직접 바꿀 수 없다(409 `SLOT_LINKED`, `BRACKET_SOURCE_SLOT_LINKED` 와 같은 원칙).
- `POST /admin/tournaments/:id/slots/random-fill`: 잠금 안에서 다시 읽은 빈 ENTRY·BYE 자리에, 아직 어느 ENTRY·BYE 자리에도 없는
  confirmed 등록을 서버에서 무작위로 배정(남는 쪽이 있으면 남은 만큼만). 같은 S3 규칙·트랜잭션. 응답에 배정 목록.
- **등록이 confirmed 를 벗어나는 모든 전이**(리그 `removeTeam`, 어드민 등록 취소, 참가 취소 요청 승인 등 — 구현 시 전이 지점을 전수 확인)는
  공통 헬퍼 `releaseSlotsForRegistrationInTx` 로 그 팀의 자리를 비운다: 자리를 쓰는 경기가 전부 시작 전이면 S3 비우기와 같고, 시작된 경기가
  있으면 자리를 그대로 둔다(기록 보존). 자리 없는 기존 경기의 취소 동작은 지금 그대로. 팀 해체는 진행 중 등록이 있으면 이미 차단되므로 대상이 아니다.
  팀의 **참가 취소 요청**(confirmed → cancel_requested)은 철회될 수 있으므로 자리를 비우지 않고, 운영자가 승인하는 순간 비운다.
  리그 방식 대회(`format='league'`)도 자리를 쓰면 기존 조별 생성기의 `replaceExisting` 재생성을 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` 로 막는다.

### S4. 조 순위로 결선 채우기 (D3=a)

- `GET /admin/tournaments/:id/slots/standings-preview` → GROUP_RANK 자리마다 `{slotId, label, candidate: registration|null,
  state: 'ready' | 'tied' | 'group_incomplete', currentRegistrationId}`.
  조의 비취소 경기가 전부 OFFICIAL 이어야 `ready`/`tied`. 순위는 기존 `V1TournamentStanding`(공식 결과만),
  동률은 정본 §5 동점 처리(`league-tie-break.ts`) 5단계 뒤에도 갈리지 않는 **완전 동률 구간**에 그 순위 위치가 걸리면 `tied`
  (구간 크기·순위 무관 — 1위·2위 동률, 3팀 동률 포함). 정본 §5 의 "잔여 동률은 공동 순위"를 자동 배정이 임의로 깨지 않는다.
- `POST /admin/tournaments/:id/slots/fill-from-standings` `{ overrides?: [{slotId, registrationId}] }`(DTO 는 `@ArrayMaxSize` 상수 상한·uuid 검증, 서비스가 그 대회 GROUP_RANK 자리 소속·중복을 재검증) → `ready` 자리 + override 를 S3 규칙으로 한 번에 배정(바뀔 자리 먼저 비우기 — S1). `tied` 인데 override 가 없으면 그 자리는 건너뛴다.
  override 는 `tied` 자리면 그 동률 팀 중에서만, `ready` 자리면 그 자리의 원천 조 팀 중에서만 받는다(422 `SLOT_REGISTRATION_INVALID`).
  저장된 순위(`V1TournamentStanding.position`)와 §5 동점 처리 결과가 어긋나면 그 자리는 `tied` 로 돌려 운영자가 고르게 한다.
  결선 경기가 시작 전이면 다시 채우기 가능.
- 공개 대진표: 팀이 없는 사이드에 자리 라벨(예: "A조 1위")을 보여 준다 — 공개 경기 직렬화에 `homeSlotLabel`·`awaySlotLabel` 추가.

### S5. 빠른 결과 확정 (D5=a, D6=a)

- `POST /admin/games/:gameId/quick-result`, 헤더 `Idempotency-Key` = body `clientCommandId`.
  `{ clientCommandId: uuid, expectedVersion: int, score: { home: int≥0, away: int≥0, penalties?: { home: int≥0, away: int≥0 } } }`.
- 권한: `V1AuthGuard` + `staffAccess.assertAccess(result_officialize)` 결과가 `platform_ops` 일 때만(대회 디렉터·support 는 403).
- 대상: 대회 canonical 팀매치 경기와 정규 리그 팀매치 경기. 친선 등은 409 `QUICK_RESULT_UNSUPPORTED`.
- 입장 조건(409): 게임이 SCHEDULED 이거나 ENDED 이면서 **현재 리비전이 없거나 VOID**(무효 뒤 재입력) —
  아니면 `QUICK_RESULT_NOT_AVAILABLE`(진행 중·확정 전 결과가 있음·이미 확정이면 정정을 쓴다) ·
  팀매치 `status='matched'`(VOID 재입력이면 `completed` 도 허용 — 지금 무효 처리는 팀매치 상태를 되돌리지 않는다), 아니면
  `QUICK_RESULT_FIXTURE_CANCELLED`(리그 취소는 게임을 SCHEDULED 로 남기므로 게임 상태만으론 못 거른다) ·
  게임 이벤트 0건, 아니면 `QUICK_RESULT_HAS_LIVE_RECORDS` · 양 사이드 팀 확정, 아니면 `QUICK_RESULT_TEAMS_REQUIRED` ·
  양 사이드 `V1GameParticipant` 1명 이상이고 그 게임의 미처리 `COMPETITION_ROSTER_RESYNC` outbox 가 없을 것, 아니면 `QUICK_RESULT_ROSTER_SYNCING`
  (자리 배정 직후 명단은 비동기로 채워진다 — 그 사이 확정하면 출전자 0명인 불변 OFFICIAL 이 남는다; 화면은 잠시 뒤 다시 시도 안내) ·
  승부차기는 기존 검증 순서와 코드(`TOURNAMENT_PENALTY_REQUIRED`/`_NOT_ALLOWED`)를 따르되 **킥 수는 요구하지 않는다** —
  `assertPenaltyShootoutPersistable(…, { requireKickCounts: false })`(확정 승격 게이트와 같은 값). 정정 경로는 지금 base 와 다른 승부차기에
  킥 수를 요구하므로(`tournament-result-review.service.ts:1280`), **득점 기록 0건 경기의 정정은 킥 수를 요구하지 않도록** 같은 규칙을 정정에도 넣는다
  (기록할 승부차기 이벤트가 없는 경기에서 킥 수는 대조할 대상이 없다).
- 한 Serializable 트랜잭션(`withResultCommand` 확장, 같은 클래스에 메서드 추가): DRAFT 리비전(점수·`eventsHash=hash([])`·
  `goalEvents=[]`·reason 마커 `[quick-result]`, VOID 재입력이면 `supersedesId`=VOID 리비전) → 참가자 = 각 사이드의 **무효화되지 않은 최신 라인업 리비전**의 `V1GameParticipant`
  전원 `started=true`·기록 0(명단 동기화는 옛 리비전 행을 지우지 않으므로 게임의 참가자 행 전부를 쓰면 이전 명단이 섞인다) → OFFICIAL(`submittedAt=officialAt=now`; 상태 머신에 새 흐름 `ADMIN_QUICK` 을 추가해 DRAFT→OFFICIAL 을
  이 흐름에만 허용 — CORRECTION 으로 위장하지 않는다) → 게임 ENDED·version+1·`currentOfficialRevisionId` → 열린 피리어드 닫기 →
  `completeTeamMatchAtResultBoundary` → 대회면 `projectCanonicalAdvancement`(다음 경기 시작됐으면 409 `NEXT_FIXTURE_CONFLICT`) →
  outbox `GAME_RESULT_OFFICIAL`(순위·전적·개인 기록(출전)·리그 완료·알림은 기존 워커) → 운영 감사 `QUICK_RESULT`.
  `GAME_RESULT_SUBMITTED` 는 쓰지 않는다(검토 알림 없음).
- 확정 결과 고치기·무효·"확정 전" 확인은 **기존 API 재사용**: 점수 고치기 = `POST /games/:id/corrections` → 만든 DRAFT 를 같은 흐름에서
  officialize(2단계), 무효 = void, 확인 = officialize. 빠른 입력 경기 정정 payload: `baseRevisionId`=현재 OFFICIAL, `actualParticipants` 는
  base 리비전 참가자 그대로, `eventsHash`=`hash([])`, `goalEvents` 생략. 득점 기록이 있는 경기는 그림에서 고치지 않고 기존 「결과 정정」 화면으로 보낸다.
- 어드민 대진 응답(`GET /admin/tournaments/:id/bracket`, 리그 어드민 상세)에 경기별
  `game: { id, state, version, hasLiveRecords, latestRevision: { id, state, score, entryMethod: 'quick' | 'console' | 'correction' } | null }`
  와 `homeSlotId`·`awaySlotId`, 최상위 `slots[]`(라벨 포함)를 추가한다. 리그 어드민 참가팀 응답(`listTeams`·상세 `teams[]`)에는
  자리 배정 PUT 에 보낼 `registrationId`(confirmed 등록 id)를 추가하고 웹 `V1AdminLeagueTeam` 타입·테스트 데이터를 같은 변경에서 고친다.
  정정·무효에 필요한 리비전 상세(참가자·eventsHash·goalEvents·mvp)는 대진 응답에 싣지 않고, 패널이 열릴 때 기존 `useGameResultRevisions(gameId)` 로 읽는다.

### S6. 정규 리그 빈 경기 (D2=b)

- `createLeagueFixture` 가 팀 null + 자리 id 를 받는다(대회와 같은 규칙: 팀이 없으면 팀 일정·참가자·신청서를 만들지 않음, 사이드 이름 미정).
  상태는 대회 빈 경기와 같이 `matched`.
- **공개 노출 게이트**: 자리에 연결됐는데 팀이 비어 있는 리그 경기(`homeSlotId≠null ∧ hostTeamId=null` 또는
  `awaySlotId≠null ∧ approvedApplicantTeamId=null` — 반쪽만 찬 경기 포함)를 **술어 하나의 공통 헬퍼**(Prisma where 조각 + raw SQL 조각)로 만들어
  다음 경로 전부에서 제외한다: 공개 리그 일정·순위(`league-match-public.service.ts`), 통합 상세의 리그 경기·진행률(`tournaments-read.service.ts`),
  리그 기록 일정·경기 상세(`public-tournament-records.service.ts`), 공개 `/team-matches` 목록·상세와 그 sitemap 원천(`team-matches.service.ts`),
  공개 영상 경로(구현 시 전수 확인), 마이 팀매치 **전 범위**(created·applied·hosted·기본 all — 지금 `assertTeamMatchReadInvariant` 가 host null 에 409).
  팀이 다 들어가면 나타난다. 자리 없는 기존 경기의 동작은 바꾸지 않는다. 공개 가드(host null → 500)는 필터 뒤라 그대로 둔다.
  **주차(N주차) 계산의 형제 경기 집합은 게이트와 무관하게 비삭제 전체로 고정**한다 — 게이트는 표시 목록만 거른다(화면마다 주차가 갈리지 않게).
- 어드민 경로는 빈 경기를 보여 준다: 리그 어드민 상세 직렬화·웹 타입 `homeTeamId: string | null` 로 바꾸고 문구는 "미정".
  어드민 리그 영상 목록(`league-fixture-videos.service.ts`, 운영자용)도 host null 을 409 로 막지 않고 팀 이름 null 로 직렬화한다.
- 빈 경기 취소가 막히지 않게 `requireLeagueHostTeamId` 경로를 고친다(팀이 없으면 팀 알림만 건너뜀). 재생성은 S2 대로 자리 리그에선 막는다.
- 결과 미입력 리마인더는 팀이 비어 있으면 보내지 않는다.
- 리그 완료 판정은 그대로(빈 경기가 남으면 완료 안 됨 — 운영자가 팀을 넣거나 취소).

### S7. 웹 — 그림 편집기

- 대회: `app/admin/tournaments/[id]/bracket/page.tsx` 에 `SegmentedTabs` [그림 | 목록](기본 그림, `?view=list` 로 목록). 목록 = 기존 `BracketTab` 그대로.
- 정규 리그: `app/admin/league-matches/[leagueId]` 대진 영역에 [일정 보드 | 목록] 전환(기본 일정 보드).
- 새 컴포넌트(`components/admin/bracket-canvas/`): 캔버스(라운드 열 + 칸 + SVG 연결선 — 위치는 순수 함수
  `lib/bracket-canvas-layout.ts` 가 계산), 칸(선택·드롭 대상·상태 태그 예정/진행 중/확정 전/확정·"어드민 빠른 입력" 표시),
  참가팀 트레이(HTML5 끌어 놓기 + 누르고 고르기), 상세 패널(자리 배정·일정/장소·삭제·결과), 점수 입력(무승부 결선은 승부차기),
  템플릿 창, 순위대로 채우기 창, 리그 일정 보드(열 = 경기 날짜 = 주차. 리그 경기엔 round 값이 없고 템플릿은 날짜 하나에 한 라운드를 만든다;
  옛 일괄 생성 리그는 하루에 여러 라운드일 수 있다).
- 툴바: 템플릿으로 시작 · 경기 추가 · 연결(기존 bracket-sources) · 빈 자리 무작위 채우기 · 대진표 공개 상태(대회 — 기존
  `useV1PublishTournamentBracket`·`useV1UnpublishTournamentBracket` 훅 재사용).
  이미 공개된 대회를 편집하면 "바꾸는 즉시 참가팀에게 보여요" 안내.
- 상태: 로딩 = 스켈레톤, 에러 = 재시도 버튼이 있는 `ErrorState`(템플릿 버튼 숨김), 빈 대진 = `EmptyState` + 「템플릿으로 시작」 유도.
- 권한: `canWrite=false`(support 어드민)면 **읽기 전용 캔버스** — 툴바·끌어 놓기·패널 쓰기·점수 입력을 숨긴다(서버 403 에 기대지 않음). 리그 화면도 같은 판정.
- 결과 패널: 점수 고치기·결과 무효는 **필수 사유 입력 모달**(기존 어드민 사유 모달이 있으면 재사용)을 거치고, 열릴 때
  `useGameResultRevisions(gameId)` 로 현재 리비전을 읽어 정정 payload(S5)를 채운다. 409 `QUICK_RESULT_ROSTER_SYNCING` 은
  "명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요" 로 안내.
- 공개 대진표: 팀이 없는 사이드는 `homeSlotLabel`/`awaySlotLabel` 을 'TBD'·'미정'보다 우선해 보여 준다
  (`components/tournaments/tournament-bracket.tsx` 의 이름 치환 순서·`teamDisplayName`, 공개 일정 화면 — 적용 화면은 구현 시 전수 확인).
- 모바일(<768): 라운드 탭 + 칸 목록, 칸을 누르면 `BottomSheet` 에서 팀 넣기·점수·확인. 구조 편집 버튼은 숨기고 "큰 화면에서 편집해요" 안내.
- 디자인 시스템: 토큰만(하드코딩 색·`text-[Npx]` 금지), 44px 터치, 키보드로 전부 가능(끌어 놓기 대체 = 누르고 고르기),
  `aria-label`, 모달 a11y(`use-modal-a11y`), 다크 모드 4.5:1, `transition-colors`/`transform` 만. 재사용: `SegmentedTabs`·`BottomSheet`·
  `ConfirmModal`·`EmptyState`·`useAdminToast`.
- 캐시: 변경 후 `adminTournamentBracket`·`adminLeagueMatch`·공개 `tournament` 키와 결과 훅 키를 함께 invalidate.

## Original Conditions (must all be satisfied)

- [x] 어드민에서 대진을 **그림(그래픽)으로 먼저** 만든다 — 토너먼트·조별+결선·리그 방식 대회·정규 리그 전부.
- [x] **팀은 나중에** 자리에 넣는다(칸 누르기·끌어 놓기·빈 자리 무작위 채우기).
- [x] **결과 입력**을 그림에서 한다 — 점수만 넣고 바로 확정(무승부 결선은 승부차기).
- [x] **결과를 잘 수정**할 수 있다 — 점수 고치기·결과 무효는 그림에서, 득점 기록 있는 경기는 정정 화면으로.
- [x] 조별리그 결선 칸은 "A조 1위" 같은 자리로 미리 그리고, 「순위대로 채우기」로 채운다.
- [x] 정규 리그도 빈 경기를 실제로 만든다(편집 중 빈 경기는 공개 화면에 나가지 않는다).
- [x] 빠른 입력 결과도 일반 확정과 똑같이 알림·순위·전적에 반영된다.
- [x] 기존 카드 화면은 [그림 | 목록] 전환으로 남는다(기본 그림).
- [x] 모바일은 보기·팀 넣기·결과 입력, 구조 편집은 768px 이상.
- [x] 사용자는 플랫폼 어드민(owner·ops)만. 대회 운영 콘솔(스태프)은 바꾸지 않는다.
- [x] 목적: 대회 만들기·테스트가 쉬워진다 — 8강 대회를 새로 만들어 결승까지 클릭만으로 한 바퀴 돌 수 있다. — (E2E 6회: 새 8팀 대회를 템플릿·무작위 채우기·빠른 결과 클릭만으로 3·4위전·결승까지 확정)
- [x] 16강 템플릿도 포함한다(토너먼트 16팀, 조별 8조×2 → 16강) — 2026-10-09 사용자 확정.

## User Scenarios

### Scenario 1: 8강 토너먼트를 처음부터 끝까지 (테스트)
As a 플랫폼 어드민, I want to 8강 대회 뼈대를 만들고 팀을 채우고 결과를 넣어 결승까지 돌리기 so that 대회 기능을 빠르게 검증한다.
1. 대진 관리 → [그림] → 템플릿으로 시작 → 토너먼트·8팀·3·4위전 넣기 → 만들기 (경기 8·연결 8·자리 8).
2. 빈 자리 무작위 채우기 → 8강 4경기에 팀이 들어감.
3. 8강 칸마다 점수 → 결과 확정 → 승자가 4강 칸에 자동으로 들어감. 무승부면 승부차기를 넣어야 확정된다.
4. 4강·3·4위전·결승까지 같은 방식. 칸에 "어드민 빠른 입력" 표시.
Expected: 공개 대진표·팀 전적·순위가 같은 결과를 보여 주고 양 팀에 결과 알림이 간다.

### Scenario 2: 결과를 잘못 넣었다
1. 확정된 8강 칸 → 점수 고치기 → 새 점수 확정 → 4강 칸 팀이 바뀐다(4강 시작 전).
2. 또는 결과 무효 → 4강 칸이 비고, 그 경기는 다시 점수를 넣을 수 있다.
Expected: 4강이 이미 시작됐으면 "다음 경기가 이미 시작돼서 바꿀 수 없어요". 라이브로 득점이 기록된 경기는 「결과 정정」 화면으로 연결.

### Scenario 3: 조별리그 + 결선
1. 템플릿 조별+결선 · 2조 × 4팀 · 조 2팀 진출 → 조 자리 8 + 조별 12경기 + 4강(A1–B2, B1–A2) + 결승.
2. 조 자리에 팀을 넣으면 그 팀의 조별 3경기에 모두 들어간다.
3. 조별 결과를 다 넣으면 「순위대로 채우기」가 열리고, 미리보기에서 동률 자리는 직접 고른 뒤 채운다.
Expected: 공개 대진표에 조별 진행 중엔 "A조 1위", 채운 뒤엔 팀 이름.

### Scenario 4: 정규 리그 일정을 팀보다 먼저
1. 리그 어드민 → [일정 보드] → 템플릿 4팀 · 2회전 · 일정(첫 경기일·간격·시각·장소) → 빈 경기 12개.
2. 공개 리그 화면엔 아직 아무 경기도 안 보인다.
3. 자리 1~4에 참가팀을 넣으면 그 팀의 경기·팀 일정이 생기고 공개 일정에 나타난다. 마지막 자리가 채워지면 일괄 생성과 같은 상태가 된다.
4. 경기마다 점수 → 확정 → 순위 반영.

### Scenario 5: 모바일 현장 입력
1. 390 화면 대진 관리 → 라운드 탭 → 칸을 누르면 바텀시트 → 점수 → 확정. 구조 편집 버튼은 없고 안내 문구가 보인다.

## Test Scenarios

### Happy path
- [x] 템플릿 개수 계약: knockout 8+3위전 = 경기 8·연결 8·ENTRY 8 / knockout 4(3위전 없음) = 경기 3·연결 2·ENTRY 4 /
      knockout 12+3위전 = 경기 4+4+2+1+1=12·BYE 4·ENTRY 8·ByeSlot 4·연결(8강←12강 4, 4강←8강 4, 결승←4강 2, 3위←4강 2) /
      group_knockout 2×4·adv2·legs1 = 조별 12 + 4강 2 + 결승 1 (+3위 1)·ENTRY 8·GROUP_RANK 4 / league 대회 6팀 legs2 = 30경기 / 정규 리그 4팀 legs2 = 12경기(일정 계산 일치).
- [x] 자리 배정 fan-out: 조 자리 하나 → 그 자리를 쓰는 3경기의 사이드 팀·표시 이름·팀 일정·명단 재계산 이벤트가 바뀌고 **다른 경기는 그대로**(대조군).
- [x] 자리 비우기 → 그 자리를 쓰는 경기 전부 "미정"으로 돌아가고 팀 일정 취소.
- [x] BYE 자리 배정 → 12강 그룹 ByeSlot 이 GroupTeam(isBye)로 바뀌고 8강 홈에 팀이 들어감, 비우면 원복.
- [x] 무작위 채우기: 빈 자리 수 ≤ 미배치 팀 수면 전부, 반대면 팀 수만큼만 채우고 중복 없음.
- [x] 순위대로 채우기: 미리보기 ready/tied/group_incomplete 판정, override 반영, 다시 채우기.
- [x] 빠른 결과(대회): SCHEDULED → OFFICIAL 한 번에, 승자 다음 칸 진출, outbox `GAME_RESULT_OFFICIAL` 1건, `GAME_RESULT_SUBMITTED` 0건, 참가자 전원 started.
- [x] 빠른 결과(리그): OFFICIAL, 리그 완료 투영·순위 반영.
- [x] 무효 뒤 재입력: VOID → 빠른 결과 가능, `supersedesId`=VOID 리비전.
- [x] 정정(그림): corrections → officialize 로 점수 바뀌고 다음 칸 재투영.
- [x] 웹 레이아웃 순수 함수: 라운드 열 순서·칸 y 위치·연결선(WINNER/LOSER/BYE/GROUP_RANK 점선) 계산.
- [x] 교차 대진 표 전수: (2조×1)·(2조×2)·(4조×1)·(4조×2)·(8조×1)·(8조×2) 각각의 GROUP_RANK 자리 ↔ 결선 사이드 매핑.
- [x] knockout 16+3위전 = 경기 8+4+2+1+1=16·연결(8강←16강 8, 4강←8강 4, 결승←4강 2, 3위←4강 2)=16·ENTRY 16. 16강→8강 연결 인접 허용, 16강 부전승 거부.
- [x] 조 편성: 조 자리 배정 시 GroupTeam 생성·순위 행 생성, 교체·비우기 시 이전 팀 GroupTeam 제거(다른 경기에 남아 있으면 유지).
- [x] 공개 경기 직렬화 `homeSlotLabel`/`awaySlotLabel`: 팀이 없을 때만 라벨, 팀이 있으면 null. 공개 대진표는 라벨을 'TBD' 보다 우선.
- [x] 빠른 결과 → 워커 소비(통합): 순위·팀 전적·개인 기록(출전)·완료 알림 1회. 같은 경기 정정 후 알림 재발송 없음.
- [x] 리그 반쪽 경기: 한쪽만 찬 동안 팀 일정 0건, 양쪽 다 차면 2건, 다시 비우면 2건 취소.
- [x] 웹: 기본 view 는 그림, `?view=list` 면 목록 / <768 에서 구조 편집 버튼 숨김·안내 / `canWrite=false` 면 읽기 전용 /
      로딩·에러(템플릿 버튼 숨김)·빈 대진 상태 / 끌어 놓기 없이 키보드(팀 선택 → 칸 선택)로 배정.
### Edge cases
- [x] 결선 무승부 + 승부차기 없음 → 409 `TOURNAMENT_PENALTY_REQUIRED`; 조별 무승부 + 승부차기 → 409 `TOURNAMENT_PENALTY_NOT_ALLOWED`.
- [x] 같은 팀을 두 자리에 → 409 `SLOT_TEAM_ALREADY_PLACED`; ENTRY 와 BYE 동시 → 409.
- [x] 시작된 경기를 쓰는 자리 변경 → 409 `SLOT_LOCKED`; 자리 연결 사이드를 PATCH 로 직접 변경 → 409 `SLOT_LINKED`.
- [x] 비어 있지 않은 대진에 템플릿 → 409 `BRACKET_NOT_EMPTY`; replaceExisting + 결과 있는 경기 → 409 `BRACKET_LOCKED`.
- [x] 대회 format 과 다른 템플릿 → 422; 결선 크기가 지원 집합({2,4,8,16}) 밖(예: K=6 → `BRACKET_TEMPLATE_UNSUPPORTED`) → 422; 상한 240 경기 초과 → 422.
- [x] 정규 리그 공개 게이트(좁히는 변경 — 양쪽 대조군): fixture = {자리 빈 경기, 홈만 찬 경기, 원정만 찬 경기, 다 찬 경기, 자리 없는 기존 경기(원정 null 포함)}.
      S6 에 나열한 **모든** 경로(공개 일정·순위·통합 상세·진행률·기록 일정·경기 상세·공개 `/team-matches` 목록·상세·sitemap·마이 팀매치 전 범위)에서
      앞의 셋은 빠지고 뒤의 둘은 **그대로 포함**됨을 각각 단언. 주차 라벨은 게이트와 무관하게 같은 값.
- [x] 리그 빈 경기 취소 성공(팀 알림 0건), 결과 미입력 리마인더 0건, 어드민 영상 목록 200.
- [x] 리그 참가팀 제외·어드민 등록 취소 시 자리 연결 시작 전 경기는 취소되지 않고 자리만 비워짐; 자리 없는 경기는 기존대로 취소.
- [x] 자리 리그에서 기존 재생성 → 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE`; 리그 템플릿 + 경기 있음 → 409 `LEAGUE_FIXTURES_EXIST`; 보류·완료 리그 템플릿·자리 변경 거부.
- [x] 리그 상태 전이: 마지막 빈 사이드가 채워지면(또는 남은 빈 경기를 취소하면) 진행 상태, 보류 리그는 그대로.
- [x] 원정 신청서 upsert: 같은 팀 비웠다 다시 넣기, A→B→A 교체에서 P2002 없이 최종 팀만 approved.
- [x] 리그 취소 경기는 자리 반영·잠금 판정에서 제외되고 자리 연결이 풀린다; 취소 경기에 빠른 결과 → 409 `QUICK_RESULT_FIXTURE_CANCELLED`.
- [x] K=2 + 3·4위전 → 422. 순위대로 채우기 A1↔A2 맞바꾸기에서 유일 제약 위반 없음. 완전 동률(1·2위, 3팀) → `tied`.
- [x] 동시성(통합): 같은 리그에 템플릿과 기존 일괄 생성을 동시에 → 하나만 성공. 같은 대회 템플릿 두 번 동시에 → 하나만 성공.
- [x] 빠른 결과: 자리 배정 직후 명단 동기화 전 → 409 `QUICK_RESULT_ROSTER_SYNCING`, 동기화 뒤 성공. 결선 무승부 승부차기(킥 수 없음) 201.
- [x] 빠른 입력 경기의 그림 정정(승부차기 점수 변경 포함, 킥 수 없음) 성공 → 다음 칸 재투영.
### Error paths
- [x] 빠른 결과: support 어드민·대회 디렉터·일반 사용자 403 / 친선 409 `QUICK_RESULT_UNSUPPORTED` / 이벤트 있음 409 `QUICK_RESULT_HAS_LIVE_RECORDS` /
      팀 미정 409 `QUICK_RESULT_TEAMS_REQUIRED` / 진행 중·확정 전·이미 확정 409 `QUICK_RESULT_NOT_AVAILABLE` / version 불일치 409 / 다음 경기 시작 409 `NEXT_FIXTURE_CONFLICT` /
      Idempotency-Key ≠ clientCommandId 422 / 같은 키 재요청은 같은 응답(replay).
- [x] 템플릿·자리 API: support 403, 다른 대회 등록 422, 미확정 등록 422, 대회 설정 버전 없음 409 `COMPETITION_CONFIG_REQUIRED`.
- [x] 웹: 각 409/422 를 `extractErrorMessage` 해요체 토스트로, 입력 유지.
### Mock data updates needed
- [x] `apps/v1_api/test/fixtures/game-schema.fixture.ts` 스키마 해시, 대진·리그 서비스 spec 의 Prisma mock 에 `homeSlotId`/`awaySlotId`/`v1TournamentSlot`.
- [x] `apps/v1_web/src/types/api.ts`(`V1AdminTournamentBracket` 등)·`types/league-match.ts`(nullable 팀) 와 해당 테스트 고정 데이터,
      `bracket-tab.test.tsx` 의 `vi.mock` 데이터, 공개 대진 타입의 `homeSlotLabel`/`awaySlotLabel`.

## Parallel Work Breakdown

PR 은 순서대로 dev 에 머지하고 매번 alpha 에서 확인한다(dev 머지 = alpha 실배포).

공통: **PR 마다** `.changeset/*.md`(v1_api·v1_web 함께, 기능은 minor)와, 엔드포인트·응답 계약을 바꾸면 `docs/api/domains/tournaments.md`·
`league-matches.md` 를 같은 PR 에서 고친다.

### PR-1 Backend 기반 (Sequential 선행)
- [x] **첫 커밋: 정본 `docs/design/competition-canonical-flow.md` §6 결정 이력 행 추가**(정본 §8 — 구현보다 먼저):
      ① 대진 자리(slot)와 템플릿 ② 정규 리그 빈 경기(자리 미배정 경기는 공개 제외) ③ 어드민 빠른 결과(어드민 입력 = 어드민 확인, §4 확인 한 단계의 어드민 단축 경로,
      득점자 없음 → 개인 기록은 출전만) ④ 득점 기록 0건 경기의 승부차기 킥 수 면제.
- [x] 스키마·마이그레이션(S1 + S1-b 의 `round16` enum 값 — 스키마 변경은 이 PR 한 번) + 스키마 해시 5곳(`deploy/Dockerfile.v1-api`, `deploy/alpha-manifest-common.sh`(추가),
      `scripts/release/create-alpha-release-manifest.sh`, `scripts/release/prepare-task168-final-steady-inputs.sh`, `apps/v1_api/test/fixtures/game-schema.fixture.ts`).
- [x] `…InTx` 추출(동작 보존 리팩터): 그룹 생성, 빈 경기 생성, 사이드 배정(`assignTournamentFixtureSideInTx`), 경기·그룹 삭제(자리 연결 해제 포함).
- [x] 자리 서비스(S3): 배정·비우기·무작위 채우기, 조 편성·해제 + 순위 재계산, `SLOT_LINKED` 가드, BYE 전환, 대회 레인 잠금·id 순 잠금,
      `releaseSlotsForRegistrationInTx`(대회 등록 취소 경로 연결).
- [x] 대회 템플릿(S2): knockout 4/8/12 + league(대회).
- [x] 어드민 대진 응답 확장(S5 마지막 항목) + 공개 경기 직렬화 `home/awaySlotLabel`.
### PR-1c 16강 (PR-1b 뒤)
- [x] 단계 `round16` 의 서버 규칙(인접표·라벨·DTO 단계 목록·대진 정렬)·knockout 16 템플릿·웹 라벨/공개 라운드 순서/진행 단계/어드민 "+16강". enum 값 자체는 PR-1a 마이그레이션.

### PR-2 Backend 빠른 결과 (PR-1 과 병렬 가능, 머지는 PR-1 뒤)
- [x] 상태 머신 흐름 `ADMIN_QUICK` + `quickResult` 메서드(S5, 입장 조건 전부 — 취소·명단 동기화 포함) + 컨트롤러 `admin/games/:gameId/quick-result` + DTO.
- [x] 정정 경로의 승부차기 검증: 득점 기록 0건 경기면 킥 수 면제(S5).
### PR-3 Frontend 그림 편집기 — 토너먼트 (PR-1·2 머지 후)
- [x] 타입·훅(템플릿·자리·무작위·빠른 결과) + 레이아웃 순수 함수 + 캔버스·칸·트레이·패널·점수 입력·템플릿 창 + [그림|목록].
- [x] 정정·무효·확인(기존 훅) 연결, 공개 대진표 빈칸 자리 라벨.
### PR-4 조별+결선 (BE+FE)
- [x] group_knockout 템플릿 + GROUP_RANK 자리 + 순위 미리보기·채우기(S4) + 캔버스 조 표·점선 연결 + 채우기 창.
### PR-5 정규 리그 (BE+FE)
- [x] `createLeagueFixture` 팀 null + 자리 id, 리그 템플릿(행 잠금 + `assertFixtureGenerationAllowedInTx`, `LEAGUE_FIXTURES_EXIST`, 취소 기반 교체).
- [x] `assignLeagueFixtureSideInTx`(양 팀 찬 순간 팀 일정 2건, 신청서 upsert) + 조건부 상태 전이 헬퍼.
- [x] 공개 게이트 공통 헬퍼(S6 경로 전부, 주차 집합 분리) + 취소 경로 수정 + 자리 리그 재생성 409 + 리마인더 + 어드민 영상 목록.
- [x] `releaseSlotsForRegistrationInTx` 를 리그 `removeTeam`·등록 취소 전이에 연결.
- [x] 리그 어드민 응답(빈 경기 nullable, 참가팀 `registrationId`)·웹 타입 + 일정 보드.
### PR-6 모바일·마감
- [x] 390 라운드 탭 + 바텀시트, 구조 편집 숨김. changeset. 태스크 문서 Status 갱신.
### Sequential
- [ ] PR 마다 dev 머지 → alpha 배포 SHA 확인 → **새 테스트 대회로**(alpha 데이터 쓰기 — 사용자 승인 후) ego-browser E2E → 390/768/1440 갤러리를 그 PR 에 게시. — (부분 충족: PR별 E2E 대신 alpha E2E 6회로 통합. 1·2회는 2026-10-09 결정 B 범위, 3~6회는 별도 사용자 결정. #1705 16강 갤러리는 2026-10-10 사후 게시. #1753 은 계산값 코멘트만 있고 같은 화면의 3폭 갤러리는 후속 #1759 에 있다. #1765 는 화면 변경이 없다)

## Acceptance Criteria
- [x] Original conditions 전부 충족, User scenarios 1~5 alpha 에서 통과(ego-browser 스크린샷) — (시나리오 1의 8팀 한 바퀴·양 팀 알림, 시나리오 3의 동률 자리 직접 고르기, 시나리오 4의 2회전 빈 경기 12개는 E2E 6회, 나머지는 1~5회. 시나리오 3 에서 나온 공개 순위표 진출 표시 문제는 아래 남은 관찰)
- [x] Test scenarios 전부 green (단위 + CI 통합 스펙)
- [x] UI: A·B·C 3안 제시 → 사용자 선택 완료(2026-10-08 결정 페이지, D1~D8) — 구현은 선택안대로
- [x] 범위 내 tech debt 해결(새 부채 0), 자리·리그 빈 경기로 생긴 모든 null 경로 정리
- [x] Security 리뷰 통과(아래), Mock·schema sync, 마이그레이션 replay·drift·expand-contract 게이트 green — 근거: 권한 스펙·CI 게이트 green, 별도 보안 리뷰 문서는 없음
- [x] 디자인 시스템 준수(토큰·컴포넌트·44px·WCAG AA·다크 모드)
- [x] 리그 방식 대회 대진 그림: 라운드×조 격자 + 조별 순위표, 1440 가로 스크롤 없음, 순위 숫자 = 공개 순위 탭, 「경기 연결」 없음 (PR-7, 2026-10-09 B안) — (대체: 「경기 추가」는 결정 B·3 으로 조·라운드 선택, #1766)
- [ ] Code review Critical=0, Warning=0 / Copilot clean — 미완: Copilot 오류 응답 PR 6건은 clean 미확인, 자체 리뷰로 대체

## Tech Debt Resolved
- 대진 변경 서비스의 내장 트랜잭션을 `…InTx` 로 분리해 여러 변경을 한 트랜잭션에 묶을 수 있게 한다.
- 승자 연결을 매번 손으로 걸던 흐름을 템플릿이 대신한다(화면 자동 생성이 연결을 만들지 않던 문제).
- 리그 공개 경로의 host null 가드가 "빈 경기 한 건에 전체 500" 이 되지 않게 필터를 앞에 둔다.

## Security Notes
- 위협: 권한 없는 결과 확정·대진 조작, 다른 대회 등록 주입, 무작위 채우기 조작, 멱등 키 재사용.
- 완화: 모든 새 쓰기 엔드포인트 `V1AuthGuard` + `getMutationAdmin`(support 거부), 빠른 결과는 추가로 `platform_ops` 판정. 서비스 계층에서
  등록 소속·confirmed·자리 소속 대회 재검증(라우트 가드만 믿지 않음). DTO `whitelist + forbidNonWhitelisted` 범위 검증.
  무작위는 서버에서. 멱등 키 = clientCommandId 검증. 모든 변경 감사 로그. 프론트에 비밀 없음, `dangerouslySetInnerHTML` 없음.

## Risks & Dependencies
- 빠른 결과는 득점자가 없어 개인 기록엔 출전만 남는다 — 회신대로 실제 경기는 라이브 콘솔, 그림 입력은 테스트·비상용. 칸에 입력 방법 표시.
- 정본 §4 에 없는 새 경로(어드민 입력 = 어드민 확인)와 자리·리그 빈 경기 — **구현 PR 전에 정본 §6 결정 이력에 먼저 적는다**.
- 템플릿 트랜잭션 크기(최대 240 경기) — 45s timeout, 상한 초과 422.
- 정규 리그 빈 경기는 영향 범위가 넓다(PR-5). 공개 게이트 대조군 테스트와 alpha 실데이터 전후 응답 비교로 회귀를 막는다.
- alpha E2E 는 새 대회·결과를 만든다(결과 있는 경기는 지울 수 없음) — 실행 전 사용자 승인.
- 참가 취소 요청 중인 팀은 운영자가 승인할 때까지 자리를 차지한다 — 그 사이 그 팀 경기가 시작되면 승인 시점에 자리를 비울 수 없다(`SLOT_LOCKED` 규칙, 기록 보존). 통합 테스트로 고정.

## 완료 기록 (2026-10-10)

### 구현 PR (18개, 모두 base `dev`)

| PR | 내용 | dev 머지 SHA |
|----|------|--------------|
| #1700 | PR-1a 대진 자리 스키마·`…InTx` 함수·어드민 응답 확장 | `0dcb03c32` |
| #1701 | PR-1b 대진 템플릿, 자리 배정·무작위 채우기 | `496a1307e` |
| #1702 | PR-2 어드민 빠른 결과 확정 | `78ee72690` |
| #1705 | PR-1c 16강 단계(템플릿·연결 규칙·화면) | `adf995050` |
| #1712 | 리뷰 P2: 기존 부전승 API 와 템플릿 자리 동기화, 웹 타입 동기화 | `cde0128c5` |
| #1720 | PR-5a 정규 리그 빈 경기·리그 템플릿·공개 게이트 | `c8ac7d702` |
| #1723 | PR-3 대진 그림 편집기(토너먼트) | `a35c7bf37` |
| #1725 | 자리 없는 경기의 팀 표시·편집 바로잡기 | `d2694edd9` |
| #1727 | PR-4 조별+결선 템플릿, 순위대로 채우기 | `844fdb595` |
| #1734 | PR-5b 정규 리그 일정 보드 | `1e4b3e930` |
| #1745 | PR-6 모바일 목록·시트, 태블릿 시트, 화면 마감 | `2d21368f8` |
| #1746 | 팀 없이 취소된 리그 경기가 공개 상세·순위를 500 으로 만들지 않게 | `119569c28` |
| #1748 | PR-7 리그 방식 대회 라운드×조 격자 + 조별 순위표 | `164a80ccc` |
| #1749 | 어드민 하단 창이 화면 전체를 덮게 | `c70fa0a25` |
| #1753 | 리그 방식 격자가 1024 이상에서 잘리거나 사라지지 않게 | `afffa0267` |
| #1759 | 격자 옆 열은 1440 이상에서만(1280 조 열 잘림) | `259c161fa` |
| #1765 | 스펙 대조 결손 4건: 반쪽 경기 취소 공개·끝난 리그 가드·공개 캐시·워커 단언 | `984ae3124` |
| #1766 | 리그 방식 「경기 추가」 조·라운드 선택, 옛 리그 라운드 통일, 한 팀 한 조(409) | `da879b17a` |

### alpha E2E (ego-browser, 새 테스트 대회로 실행)

| 회차 | 확인한 것 | 결과 |
|------|-----------|------|
| 1 (10-09) | 4팀 토너먼트: 템플릿 → 수동·무작위 배치 → 빠른 결과 → 승부차기 정정 → 결과 무효·재확정 → 경기 추가, 390/768/1440 | 통과 |
| 2 (10-09) | 2조×3팀 조별+결선: 템플릿 → 무작위 → 순위대로 채우기(4자리) → 4강·결승, 3폭 | 통과(무작위 단언 1건은 스크립트 키 오기재로 수정 후 재확인) |
| 3 (10-09) | 정규 리그: 빈 경기 6개가 공개 0건 → 팀 넣는 대로 공개 → 무작위 → 빠른 결과 → 순위 반영, 390 | 통과 |
| 4 (10-10) | 전체 공개, 16강 템플릿·조별 라벨("A조 1위") 공개 화면 3폭, 390 시트 확정, 라이브 결승 진행. 결승 진행 중 **승자가 같은** 4강 정정은 막히지 않고 반영됐다(단계 C3 — 시나리오 2 는 다음 칸 팀이 바뀌는 정정만 막는다). 승자가 바뀌는 정정은 `NEXT_FIXTURE_CONFLICT` 로 거부 | 통과 — C3 은 #1771 통합 테스트(`tournament-quick-result.integration-spec.ts` 「정정 vs 이미 시작된 다음 경기」, 양쪽이 찬 LIVE 결승)로 고정. 정정 초안 1건 남음(아래 관찰) |
| 5 (10-10) | 리그 방식 대회 「경기 추가」: 옛 라운드에서 조·라운드 선택, 기존 경기와 같은 줄에 합침, 다른 조 팀 목록 제외, 한 팀 한 조 409(`TEAM_IN_OTHER_GROUP`) | 통과 |
| 6 (10-10) | 8팀 토너먼트 한 바퀴: 템플릿(8팀+3·4위전) → 무작위 → 8경기 빠른 결과(승부차기 1경기, 승부차기 없는 결선 무승부는 거부) → 공개 대진표·우승팀 전적 일치, 결승 양 팀 결과 알림. 조별+결선 2조×3팀 완전 동률: 「동률」 표시·고르기 전 채우기 꺼짐 → 직접 고른 팀이 4강에 들어감. 정규 리그 4팀 2회전: 빈 경기 12개 공개 0건 → 무작위 채우기 뒤 12건 공개·진행 중 → 빠른 결과가 순위에 반영 | 통과 — 동률 조의 공개 순위표 진출 표시가 어드민 선택과 다르다(아래 관찰) |

### 스펙 전수 대조(2026-10-10)

8영역 211개 요구 중 204개 충족(의심 8건은 재검증에서 충족), 결손 7건. 반쪽 경기 취소 공개·끝난 리그 가드·공개 캐시 무효화·워커 통합 단언은 #1765, 리그 방식 「경기 추가」 막다른 길은 #1766 에서 고쳤고, alpha 시나리오 공백은 위 E2E 4~6회가 메웠다.

### 남은 관찰

- 결과 무효 뒤 노드 칩은 예정으로 돌아가지만 `fixture.status` 는 `completed` 로 남는다(E2E 1회 6b 관찰, 원인 미조사).
- 409 `TEAM_IN_OTHER_GROUP` 의 `details.groupId` 는 겹친 팀이 이미 속한 조가 아니라 편성하려던 대상 조다(문서화된 계약).
- 노드 패널의 후보 팀 순서는 내림차순이다(기존 정렬 그대로).
- 1440 옆 패널은 Escape 로 닫히지 않는다(기존 동작, 닫기 버튼과 포커스 복귀는 정상).
- alpha 테스트 4강 한 경기에 정정 초안(DRAFT) 1건이 남아 있다. 차단 확인(회차 4)에서 생긴 것이며 공식 결과는 그대로다.
- **동률 조의 공개 순위표(회차 6, 2026-10-11 사용자 결정 A → `fix/bracket-tie-standings`, 아래 결정 표):** 완전 동률 조에서 어드민이 직접 고른 팀이 4강에 들어가도, 공개 「순위·대진표」 조별 순위표는 임의로 붙은 순위 숫자 기준으로 상위 팀을 진출로 칠한다(`bracket-page-client.tsx` `GroupStandingsSection`). 실측: A조 03·06 이 진출로 칠해졌지만 4강에는 04·06 이 들어갔다. 정본 §5 의 「남은 동률은 공동 순위」와도 다르다.
- 1440 어드민 그림에서 8팀 대진의 결승 열은 가로 스크롤해야 보인다. 공개 390 대진표는 긴 팀 이름을 말줄임한다(회차 6).

## 2026-10-12 Extension: 정규대회 하나 · 상위/하위 결선 · 시상 두 세트

Extension Status: In Progress

### Original Conditions and Selected Design

- 대상은 `kind=regular_tournament`의 조별리그+토너먼트다. 정규리그는 제외한다.
- 첨부 요구: 각 조 1·2위는 상위, 3·4위는 하위 토너먼트로 이어진다.
- 사용자 선택: 첫 번째 A안, 기존 대진 그림과 템플릿을 확장한다. 대회·신청·명단은 하나이며 결선 결과와 시상은 두 갈래다.
- 사용자 추가 확정: 팀 시상과 개인상 모두 어드민에서 조절 가능해야 한다. 팀 시상은 대회 전체 안내 또는 상·하위별 안내, 개인상은 각 항목의 전체/상위/하위 범위를 선택한다.
- 한 구간은 경기/단판, 두 구간은 전반/후반 표기를 기존 경기 설정에서 가져온다. 조별 회전·토너먼트 번호와 혼동하지 않는다.
- 목표 시각은 2026-10-12 17:00 KST. 실제 검증 전 완료로 보고하지 않는다.
- 사용자 추가 강조: 실제 참가자의 공개 화면도 중요하다. HTML에 조별 진행/결선 배정/대회 종료의 단계 전환 미리보기를 추가했다. 제품 공개 화면은 경기 전부터 1·2위→상위, 3·4위→하위를 설명하고, 분리 진출 요약이 null일 때 기존 상위 2팀 진출로 오해시키지 않고 확인 중 상태를 표시한다.
- 구현 전 로컬 HTML에 A/B/C, 추천, 선택·복사 control, 대진·기간 예시를 제공했다. alpha 기존 단일 결선 템플릿의 before 이미지를 확보했다.

### Implementation Plan and Interfaces

**Architecture:** 기존 순위 슬롯과 결과 진출 그래프를 재사용하며 라운드(`phase`)와 결선 범위(`bracketTrack`)를 분리한다. 기존 데이터의 범위는 `overall`, 신규 분리 결선은 `upper`/`lower`다. 두 팀 시상 안내는 별도 행으로 저장하고 개인상은 동일 범위 enum을 사용한다.

1. 공통 스키마를 먼저 고정한다.
   - enum `V1TournamentBracketTrack { overall upper lower }`.
   - `V1TournamentGroup.bracketTrack`, `V1TournamentAward.bracketTrack`: default `overall`.
   - 개인상 unique는 `[tournamentId, bracketTrack, awardType]`. 과거 개인상은 전체 범위로 보존한다.
   - `V1TournamentAwardSet`: `id`, `tournamentId`, `bracketTrack`, nullable `prizePool`, `prizeSummary`, `prizeBreakdown`, timestamps; unique `[tournamentId, bracketTrack]`. API는 이 행의 `upper`/`lower`만 허용한다.
   - additive migration과 Prisma client 생성. 기존 대회/등록/경기/결과/시상 삭제·재생성 없음.
2. 템플릿과 순위 계약을 확장한다.
   - `group_knockout` 입력에 optional `lowerBracket:boolean` 추가. 생략/false면 기존 단일 결선 계약 그대로.
   - true는 `advancePerGroup=2`, `groupCount in [2,4,8]`, `teamsPerGroup>=4`를 요구한다. 기존 조당 3~6팀 범위는 유지하며 5·6위는 분리 결선에 진출하지 않는다.
   - 상위 rank1/2, 하위 rank3/4 자리; 그룹/fixture/edge 키는 track별로 분리; 첫 결선은 같은 조를 피한다. 3·4위전은 선택 시 양쪽에 생성한다.
   - 모든 수동/자동 연결은 같은 `bracketTrack`만 허용한다. 결과 정정·무효도 다른 결선에 영향을 주면 안 된다.
   - 순위 override 상한을 최대 32로 맞춘다. 미확정·동률 확인 계약은 유지한다.
   - 공개 group에 `qualificationByTrack`을 추가한다. 기존 `qualification`은 단일/상위 판정으로 유지하고 하위 실제 배정이 상위 진출 표시를 밀어내지 않게 한다.
3. 시상 API를 확장한다.
   - `GET/PUT /api/v1/admin/tournaments/:id/award-sets`, PUT `{awardSets:[{bracketTrack:'upper'|'lower',prizePool?,prizeSummary?,prizeBreakdown?}]}`. 빈 배열은 분리 시상 안내를 해제하며 최대 두 행, track 중복 거절.
   - 개인상 GET/PUT에 `bracketTrack`(생략은 `overall`) 추가. 중복 판정·알림 변화 key에 범위를 포함한다. 수상자 실제 명단·공개 동의 기존 가드 유지.
   - 공개 정규대회 detail에 `awardSets`와 개인상 범위를 노출한다. 기록의 개인상에도 범위를 전달한다.
4. A안 화면을 연결한다.
   - 기존 템플릿 대화상자에 단일/분리 옵션과 정확한 경기 수, 지원하지 않는 조합 안내.
   - 대진 그림·목록·순위·연결 후보를 track별로 구분한다. 공개 그래프는 두 독립 대진으로 렌더한다.
   - 완료 화면은 두 결승 승자를 각각 표시한다. 하위 결승을 임의로 대회 전체 우승으로 선택하지 않는다.
   - 어드민 시상 화면에서 팀 시상 전체/분리와 개인상 항목별 범위 설정. 공개 시상 페이지는 저장된 범위를 그대로 구분한다.
5. 리뷰·검증·반영을 순차 수행한다.
   - 최소 단위/계약 테스트 → 변경 범위 typecheck/lint 1회 → Sol 독립 리뷰 → pathspec 커밋/커밋본 검사.
   - 검토 가능한 변경을 준비한 다음 원격 반영 게이트를 진행한다. PR base는 dev, main 승격은 범위 밖.
   - 배포 SHA 확인 후 alpha 테스트 대회에서 생성→팀 배정→조별 결과→순위 배정→두 결승·시상 저장까지 검증한다.

### Parallel Work Breakdown / Owned Files

- Root: 이 task extension, 공통 Prisma schema/migration, 변경 이력·검증 실행·alpha ego task space·최종 책임. 기존 shared tree의 타 세션 변경은 제외한다.
- Backend bracket (Luna): `src/tournaments/templates/*`, `slots/*`, `tournament-bracket*`, group DTO/helpers, 정규대회 read query/presenter 및 이에 필요한 테스트. 시상 write 서비스/controller와 프론트는 금지.
- Backend awards (Luna): 시상 안내 새 service/controller/DTO, `tournament-reviews.service.ts`의 개인상 범위·알림, 개인상 records mapper, 관련 테스트. schema·read presenter·template·frontend는 금지.
- Frontend (Luna): `src/types/api.ts`의 이번 계약, 관련 훅, 템플릿·대진 canvas/public bracket/완료 화면·시상 설정/표시 및 관련 테스트. backend·task·migration은 금지.
- Independent review (Sol): 전 변경의 실제 코드·경계 조건 검토, 구현자 주장 그대로 승인 금지. 테스트는 root가 직렬로 실행한다.
- 모든 worker는 혼자 작업하지 않는다. 타 변경 revert·자가 commit·branch 전환·fanout·빌드/테스트·배포 금지. 공통 계약 이후에만 parallel 구현한다.

### Acceptance / Test Scenarios

- [x] 분리 결선 계약을 실제 planner에 적용하는 RED 테스트: 2조×4팀에서 예상 18경기, 기존 15경기로 실패 관찰(기존 39개 pass).
- [x] 2/4/8조 분리 planner: rank1/2와 rank3/4의 독립 결선, 유일 경기 번호, track별 WINNER/LOSER 연결, 상한·입력 거절(단위 계약).
- [x] 수동 연결은 상위↔하위 및 tracked↔전체 범위 혼합을 거절한다(단위 계약).
- [x] 동률·미확정 조는 임의 배정되지 않으며 실제 하위 배정은 상위 진출 표시를 바꾸지 않는다(단위 계약).
- [x] 팀 시상 안내 전체/분리 저장·조회, 개인상 동일 종류를 다른 범위에 지정, 같은 범위 중복 거절, 수상자 명단 가드·알림 identity 검증(단위 계약).
- [x] 공개 완료·대진·시상 화면에서 상위와 하위 결과를 각각 표시한다. 기존 단일 결선·전체 개인상은 그대로 동작한다(컴포넌트 계약, alpha 시각 검증 대기).
- [ ] 실제 저장 가능한 모든 control과 오류/빈 상태를 확인한다. fixture/MSW/API 문서 sync, debt marker 및 diff/import 검사.
- [ ] alpha 로그인·실제 테스트 대회 한 바퀴, 모바일390/태블릿768/데스크톱1440, console/network, before/after, cleanup 증거.

### Risks / Security / Progress Snapshot

- 조회가 phase/final만 기준으로 묶이면 두 결선이 섞인다. structured track 기준으로 분리하며 이름 문자열로 분기하지 않는다.
- 개인상 unique와 알림 diff 모두 범위를 포함해야 한다. 전체 기존 수상자는 `overall`로 보존한다.
- 정규리그 API는 변경하지 않는다. 어드민 권한, 명단·동률·결과 revision 가드는 유지한다.
- 2026-10-12 시작 HEAD=origin/dev=`a4b7c2d78`. current tree는 detached이고 branch/worktree 전환 없이 시작했다. 타 세션의 untracked `release-files.txt`는 이번 범위가 아니다.
- 호스트 baseline: load21.37/15.56/19.69, Node128, browser67, swap10.9GB. 13:36 load13.58/18.03/18.99, Node212, browser90, swap11.6GB; 새 동일 Node signature 증가 최대15, 54개 증식 signature 없음. 부하 작업은 최소·직렬, 타 세션 프로세스는 종료하지 않는다.
- 14:25 현재: HTML A 선택과 팀/개인상 어드민 조절 확정. 공통 schema/migration/client·backend·frontend 첫 구현 완료, API 계약과 정본 결정 이력 sync. Sol 독립 리뷰의 수동 배정 우회·advanceCount·시상 동시 저장·분리 결선 해제/시상 보존·로딩 중 범위 보존을 보완 중이다. 구현 완료 및 alpha 완료로 보고하지 않는다.
- 15:08 현재: 참가자 null 진출 요약의 잘못된 상위 2팀 문구를 수정했다. 로컬 HTML 참가자 단계 전환 및 두 우승팀 표시 확인. Web 10파일 첫 실행 216/224 통과; 표시 assertion 2건과 5초 timeout 6건은 2파일로 좁혀 재검증 중이다. Backend 직접 경기 생성 및 분리 시상을 둔 단일 결선 교체의 유효한 RED를 관찰했다. 수동 배정 fixture 오류는 성공 증거로 쓰지 않는다. 스키마/마이그레이션/현재 릴리스 바인더 4파일과 참가자 문구 수정은 Sol static PASS; DB 적용·CI·변경 후 alpha QA는 미실행이다. 호스트 15:05 load247.61, swap15.3GB, Node272(직전 signature 증가40 이상 없음), 테스트는 최소 worker 직렬로 실행한다.
- 16:01 현재: Backend 521개, Web 224개, schema-binding 7개 계약이 좁은 재실행을 포함해 누적 통과했다. Sol 독립 static review critical0. API typecheck/lint PASS, Web typecheck PASS이며 오류 상태의 폰트 token 패턴 2건을 정리하고 패턴 검사만 재실행한다. DB 적용·커밋본 CI·변경 후 alpha 화면은 아직 검증 전이다. 호스트15:57 load215.75, swap13.7GB, Node383. 새 cua_node/node_repl69개는 다른 Codex 실행들의 parent로 관찰되어 종료하지 않았다. 이번 owned lint/test는 직렬 종료를 확인하고, 새 fan-out은 추가하지 않는다.
- 16:13 현재: 변경84파일을 pathspec 커밋060ec427c로 고정하고 최신 dev7570bd809를 비파괴 merge한 head2f5514f로 PR#1858을 열었다. API/Web 타입과 Web 패턴, 커밋본 마이그레이션 게이트 PASS. Sol 전체 frontend 검토에서 모바일 단계 순서 및 support 하위 시상 조회 P2 두 건을 찾아 수정했으며 독립 재검토 PASS, 실제 반례 계약2/2 PASS(누적 Web226). 수정 head CI 대기. GitHub AI code scan은 코드 결함 판정 전에 Model claude-opus-5 unavailable로 실패했고 기본 CI Gates는 PASS; API migration replay/Web unit은 실행 중이다. 새 QA 대회·결과 생성은 기존 task의 명시 승인 규칙에 따라 사용자 답변을 기다리며 변경 후 alpha QA는 미실행이다.
- 16:26 현재: GitHub Codex review의 source snapshot pin P1 및 공개 수상 이력·조별 진출 배지 P2를 보완했다. 스키마 snapshot5개와 웹 선택검증15개(신규 반례3개 포함) PASS, Web typecheck/pattern PASS, Sol 좁은 독립 재검토 블로커0. 사용자가 새 QA 대회로 끝까지 검증 및 관리자 로그인 완료를 명시했다. 기존 대회는 변경하지 않으며 새 검증 대회만 종료 후 비공개 처리한다. 수정 커밋본 CI·alpha 실제 플로우는 이어서 실행한다.
- 18:16 현재 PR #1858 CI 수정을 격리 WT `codex/ci-pr1858-repair` (기준 `40a9633d`)에서 재적용했다. API integration CI의 실제 실패는 `getBracket` 자리 직렬화 계약에 새 `bracketTrack: 'overall'` 필드가 추가됐는데 deep-equality 기대값이 누락된 것이다. Web CI 실패는 진행 중인 기존 원천 `q1`이 신규 후보에서 걸러지면서 선택값이 빈 문자열로 바뀐 것이다. Web 계약 테스트에서 실패를 재현한 뒤 현재 링크 보존·비활성 `현재 연결` 표시와 split track 대조군을 보강했고, 좁은 Vitest 2 passed, 8 skipped, worker 1로 통과했다. 별도 GitHub Advanced Security 실패는 코드 결과가 아니라 외부 agent의 `claude-opus-5` 미지원 오류다. 실제 DB API integration, 전체 Web CI, typecheck, alpha 수동 검증은 아직 미실행이다. 호스트 load 40.30/61.43/105.39, swap 19.4GB, Node 251, browser 70였으며 테스트는 사용자의 명시 지시에 따라 worker 1로 실행했고 owned Vitest 트리는 종료 확인했다. 본문 worktree의 `node_modules`와 `apps/v1_web/node_modules`는 공유 의존성 심볼릭 링크다.
- 18:59 Sol 재리뷰에서 `isFixtureLocked`의 `latestRevision !== null`이 API가 검사하지 않는 최신 DRAFT까지 막는 false negative를 지적했다. DRAFT 원천의 기존 연결을 저장하는 행동 테스트를 먼저 추가해 RED(`연결 저장` disabled)를 재현한 뒤 helper를 응답 필드 기준 `game.state=SCHEDULED && !game.hasOfficialResult`로 바꿔 최신 DRAFT를 막지 않게 했다. 기존 잠금·대상 노출 테스트와 정상 save 테스트를 함께 GREEN(7 passed, 7 skipped, worker 1) 확인. API는 `currentOfficialRevisionId === null`을 검사하지만 Web 응답은 포인터 id 대신 `hasOfficialResult`(포인터 상태가 OFFICIAL인지)만 노출하므로 완전히 같은 포인터 판정은 표현할 수 없다. VOID 포인터는 생성 경로상 공식화 뒤 game state ENDED에 남아 현재 SCHEDULED gate로 차단되는 코드 흐름을 확인했으나 운영 데이터 실측은 하지 않았다. 또 Web `fixture.status='scheduled'`은 API raw status `matched`의 direct exposure가 아니라 serializer가 몇 상태를 합쳐 투영한 값이다. 이 항목의 도달성은 입증하지 않았고 API 계약/정책은 확장하지 않았다. 실행 전 host: load 125.33/204.15/147.31, swap 16.8GB, Node 242, browser 35, Docker daemon unavailable; RED shell PID 85879/PPID 50452, GREEN shell PID 99138/PPID 50452, 실행 후 Vitest/tinypool 프로세스 없음. API DB integration, 나머지 Web suite/typecheck/build 및 alpha QA는 미실행이다.
- 검증: planner 18경기 계약, scoped 개인상, frontend 분리 화면 RED 관찰. 공개 presenter 48개 pass(유효한 RED 이전 구현된 테스트이며 RED 증거로 쓰지 않음). 수동 순위 guard 추가 검증은 fixture/type 오류를 수정하고 다시 좁게 실행 중. 60초 제한 실행은 timeout이며 pass 아님. 첫 장시간 실행의 DTO namespace 오류와 lock 대상 kind 선택 누락은 수정했다.
- 런타임/호스트: 로컬 web 서버 없이 alpha ego task325 재사용, HTML 핵심 control/복사와 최신 결정 설명 확인. 14:14 host load83.53, Node274, browser61, swap14.9GB; 최소 worker·직렬 검증 유지. 공유 체크아웃 HEAD는 다른 릴리스의 FF로 `37a06cea0`(Teameet1.7.0)로 갱신됐으며 이번 변경과 무관한 파일은 보존한다. owned timed-out test75922 트리 및 종료 test97839는 잔존 없음 확인; 다른 세션 프로세스는 종료하지 않는다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-08 | main | 16강 템플릿? 결정 페이지 C안 목업에 "16강"이 있었다 | **2026-10-09 사용자 확정: 포함.** phase `round16` 추가(S1-b), knockout 16 · 조별 8조×2 결선 16강, PR-1a 스키마 변경에 enum 값 포함 + PR-1c 에서 로직·템플릿·라벨 |
| 2026-10-08 | main | D2=b 의 "리그 공개 게이트"를 무엇으로? | 별도 공개 버튼 대신 "자리에 연결됐는데 팀이 빈 경기는 공개에서 제외"(S6). 팀이 다 차면 자동 공개. 자리 없는 기존 경기 동작 불변 |
| 2026-10-08 | main | 리그 빈 경기의 시각·장소 | 정규 리그 템플릿은 일정 입력 필수 — 공개 가드의 startAt·placeName 계약 유지 |
| 2026-10-08 | main | 리그 템플릿 후 status | 템플릿은 바꾸지 않고, 자리를 쓰는 경기에 빈 사이드가 없어지는 순간 조건부(draft·open 만) 전이. 기존 코드엔 전이 함수가 없어 헬퍼 신설 |
| 2026-10-08 | main | 원정 자리 배정 시 신청서 | 승인 신청서 upsert(유일 제약), 교체·비움 시 이전 것 `withdrawn` |
| 2026-10-08 | main | 빠른 결과의 승부차기 킥 수 | 요구하지 않음 — 확정 승격 게이트와 같은 `requireKickCounts:false`. 정정 경로는 지금 킥 수를 요구하므로 득점 기록 0건 경기에 한해 면제 규칙 추가(검증 워크플로가 첫 서술의 오류를 잡음) |
| 2026-10-08 | main | 빠른 결과의 리비전 흐름 | 상태 머신에 `ADMIN_QUICK` 흐름 추가(CORRECTION 위장 금지) |
| 2026-10-08 | main | 리그 참가팀 제외 시 자리 경기 | 시작 전 자리 경기는 취소 대신 자리 비우기(`releaseSlotsForRegistrationInTx`, confirmed 이탈 전이 전부). 팀 해체는 진행 중 등록이 있으면 이미 차단돼 대상 아님 |
| 2026-10-08 | main | 리그 잠금 | 리그 레인은 기존 대회 행 `FOR UPDATE` + `assertFixtureGenerationAllowedInTx`, 대회 레인만 advisory lock(검증 워크플로 지적) |
| 2026-10-08 | main | 자리 리그의 기존 재생성 | 409 로 막고 템플릿 교체로 단일화 |
| 2026-10-08 | main | 빠른 결과 직전 명단 | 자리 배정 직후 비동기 명단 동기화가 끝나기 전엔 409 `QUICK_RESULT_ROSTER_SYNCING` |
| 2026-10-08 | plan-writers | 리그 상태 전이 대상 | `draft·open` 만 적었던 것은 표현 오류 — 경기 시작 전 상태(`draft·open·closed`) 전부. 보류·완료는 제외 |
| 2026-10-08 | plan-writers | 빠른 결과 VOID 재입력의 팀매치 상태 | 무효 처리가 팀매치를 `completed` 에서 되돌리지 않으므로 VOID 재입력에 한해 `completed` 허용(최초 입력은 `matched` 만) |
| 2026-10-08 | plan-writers | 빠른 결과 참가자 원천 | 게임의 참가자 행 전부가 아니라 사이드별 무효화되지 않은 최신 라인업 리비전의 참가자(옛 리비전 행이 남아 있음) |
| 2026-10-08 | plan-writers | 참가 취소 요청 시 자리 | 요청(철회 가능) 단계에선 유지, 운영자 승인 시 비움 |
| 2026-10-08 | plan-writers | 리그 방식 대회의 재생성 | 자리를 쓰면 기존 조별 생성기 `replaceExisting` 도 409 — 템플릿 교체로 단일화(정규 리그와 같은 규칙) |
| 2026-10-08 | plan-writers | 순위 채우기 override 범위 | tied 자리는 동률 팀 중, ready 자리는 원천 조 팀 중에서만. 저장 순위와 §5 결과가 어긋나면 tied |
| 2026-10-08 | plan-writers | 리그 보드 열 | 리그 경기엔 round 가 없어 열 = 경기 날짜(주차). 템플릿 리그는 날짜당 한 라운드 |
| 2026-10-08 | spec-verify workflow | 검증 결과 | 6관점·38 에이전트, 확인된 지적 44건(중복 포함) 전부 위 S1~S7·Test·PR 분해에 반영, 반박 2건 |
| 2026-10-09 | 사용자 | 태블릿(768~1023) 칸 패널 위치 | **A** — 칸 패널을 BottomSheet 로, 참가팀 트레이는 한 줄 요약으로 접기. 1024 이상 옆 패널 그대로, D8(구조 편집 768+) 불변. 근거: alpha 768 에서 패널이 누른 칸보다 1,150px 아래 열림 |
| 2026-10-09 | main | 자리 없이 만든 경기(옛 대진·「경기 추가」) | 서버 계약 그대로 — 자리 연결 사이드는 자리 API, 자리 없는 사이드는 `PATCH /admin/fixtures/:id`. 그림·시트는 `classifyFixtureSide`(slot/feeder/direct)로 갈라 direct 를 그 경로로 편집(#1725) |
| 2026-10-09 | 사용자 | alpha 쓰기 E2E 범위 | **B** — 새 4팀 토너먼트 + 조별+결선(2조×3팀) 전체 흐름, QA 스쿼드 팀 사용. 두 단계 모두 PASS(#1723·#1727 코멘트) |
| 2026-10-09 | main | 리그 방식 대회(`format=league`)의 대진 그림은 토너먼트 캔버스에 라운드 열로 올리면 열이 라운드 수만큼 늘고 순위가 없다. 어떻게 보여 줄까? | **2026-10-09 사용자 확정: B안.** 라운드(행) × 조(열) 격자 + 조별 순위표(1024 이상 sticky 옆 열 · 패널 열리면 접힘 · 768~1023 시트). 「경기 연결」 숨김. 옛 데이터(라운드 번호 없음)는 경기 번호 순서로 조마다 `max(1, floor(팀수/2))` 경기씩 끊음. 서버 변경 없음, 토너먼트·조별+결선 캔버스·정규 리그 보드·공개 페이지 불변. 모바일 라운드 탭은 같은 모델 재사용(PR-7) |
| 2026-10-10 | spec-audit workflow | 스펙 전수 대조 | 8영역 211개 중 204개 충족(의심 8건은 재검증에서 충족), 결손 7건. 서버·웹 결손 4건은 `fix/bracket-canvas-audit-gaps` 에서 수정, 리그 방식 「경기 추가」·추가 alpha E2E 는 사용자 결정 |
| 2026-10-10 | main | 홈만 찬 리그 경기를 취소하면 자리 id 가 지워져 공개 게이트를 빠져나간다 | 공개 게이트(단일 출처)는 그대로 두고 **취소 헬퍼**가 원정 자리가 비어 있던 경기의 홈 팀도 비운다 — 게이트에 "취소 + 원정 없음" 을 더하면 자리 없는 옛 경기의 원정 null 취소 기록까지 숨겨 #1746 계약이 깨진다. 대가: 그 취소 경기는 어드민에서 홈 팀 이름이 남지 않는다(공개된 적 없는 경기) |
| 2026-10-10 | main | 완료·취소 리그의 대진·자리 변경 | 가드에 `409 LEAGUE_ENDED` 추가(보류는 `LEAGUE_ON_HOLD` 그대로). 등록 취소·참가팀 제외의 자리 풀기는 가드를 거치지 않아 계속 된다 |
| 2026-10-10 | 사용자 | 리그 방식 대회의 「경기 추가」 | **B** — 대화상자에서 **조 + 라운드**(기존 `league_r{n}` 또는 새 라운드 N+1)를 골라 `POST /admin/tournaments/:id/fixtures`(`{groupId, round: 'league_r{n}', fixtureNumber}`)로 대진 미정 경기를 만든다. 팀은 격자 카드를 눌러 기존 직접 지정 경로(`PATCH /admin/fixtures/:id`)로 넣고, 만든 경기가 순위에 바로 잡히는 것은 수용. 토너먼트·조별+결선 대화상자·모바일 구조 편집 숨김(D8) 불변, 이 기능 자체는 서버 무변경(조별 단계 한 팀 한 조 가드는 결정 4 행). 옛 대진 처리와 다른 조 팀 편성은 아래 결정 3·4 행을 따른다 |
| 2026-10-10 | 사용자 | 옛 리그(라운드 번호 없음)에서 라운드 고르기 — 결정 3 | **B** — 격자 규칙 통일: 옛 경기의 조별 k번째 끊음 묶음(`max(1, floor(팀수/2))` 경기씩, 경기 번호 순)을 k라운드로 읽고, 새로 넣는 경기는 `league_r{k}` 로 저장해 같은 줄에 합친다. 옛 리그도 「1~N라운드 / 새 라운드」를 고른다. 데이터 백필 없음. 근거: alpha 리그 방식 7개 중 5개가 옛 리그. 대가: 옛 경기를 지운 적 있는 대회는 추정 라운드가 실제와 어긋날 수 있다(지금 화면도 같은 추정). 결선 단계 코드(`final` 등)나 한국어 이름으로 쓴 round 도 번호가 아니면 예외 없이 옛 경기로 끊는다 — 사용자 문구(번호 없는 옛 경기는 끊는다)를 그대로 따른다. 리그 조에 그런 round 가 들어가는 것은 수동 입력뿐이고 그 경기는 k번째 묶음 라운드 칸에 합쳐진다(2026-10-10 계획 비평 반영). |
| 2026-10-10 | 사용자 | 한 팀이 두 조에 들어가는 문제 — 결정 4 | **A** — 조별 단계(`phase=group`) 경기에 **다른 조별 단계 조에 이미 있는** 팀을 넣으면 서버가 `409 TEAM_IN_OTHER_GROUP`, 어느 조에도 없는 팀은 지금처럼 그 조에 자동 편성. 칸 패널·탭/끌어놓기·모바일 선택창 후보에서 다른 조 팀을 뺀다. 리그 방식·조별+결선의 조별 경기 모두 적용. 근거: alpha 2개 대회에서 7팀이 이미 두 조에 동시 편성(순위표 중복). 이미 겹친 데이터는 그대로 |
| 2026-10-11 | 사용자 | 동률 조의 공개 순위표 진출 표시 | **A** — 공개 「순위·대진표」 조별 순위표의 진출 색·「진출」 배지는 결선 경기에 실제로 들어간 그 조 팀만 칠한다(아무도 안 들어갔으면 순위로 정해진 자리만, 동률로 안 정해진 자리는 칠하지 않고 「동률 — 운영자가 진출 팀을 정해요」). §5 로 끝까지 안 갈린 팀은 「공동 n위」(n = 그 묶음의 저장 순위 최솟값), 판정은 어드민 「순위대로 채우기」와 같은 `group-rank-preview.ts` 에서 나온다. 같은 조 표가 탭마다 달라 보이지 않게 「경기 일정」 탭 조별 순위에도 「공동」을 싣는다. 순위 계산·동점 규칙·어드민·`format=league`·정규 리그 불변, 스키마 무변경. 기각: B(고른 순서 저장 — §6 공동 순위와 충돌·스키마 변경), C(안내만) |

### PR #1960 완료 진행 — 2026-10-18
- 사용자 승인 범위: 기존 PR 수정·리뷰·검증·dev 머지·alpha 배포 후 1440/768/390 실측. main 승격 제외.
- 단일 에이전트 순차 실행, 전용 작업트리 `/tmp/teameet-pr1960-complete`. 다른 작업트리/WIP 수정 금지.
- [x] 최신 dev `5a5de5662`와 PR `bff8ec8f9` 통합. nullable 문구 3필드와 기존 온라인 분류를 함께 포함한 스키마 바인딩 충돌 5곳 해결.
- [x] CI RED 확인: PostgreSQL 168 suites 중 167 PASS, 1240 tests PASS / 1 FAIL. 실패는 슬롯 응답의 automaticLabel/displayLabel 기대값 누락. 두 필드를 정확히 단언하도록 수정.
- [ ] 통합 변경 코드·보안·디자인 검토 및 좁은 검증.
- [ ] 최신 head CI 및 Copilot clean 확인.
- [ ] dev 머지·로컬 dev FF·alpha 배포 SHA 확인.
- [ ] alpha 3폭 UI/저장/새로고침/실제 진출 QA·갤러리·정리 기록.
- 검증: API 관련 5 files/257 tests PASS, Web 편집·목록·모바일·레이아웃 6 files/203 tests PASS. API/Web tsc PASS. surface/pattern 게이트의 sandbox spawn EPERM은 앱 경로에서 권한 있는 동일 명령으로 재실행한다.
- 실DB 회귀 2개 추가: 기존 TeamMatch 일정·필드 무입력 조회 → 번호/문구 편집 → 출처 번호 편집 → null 비우기; 빈 BYE 문구 → 팀 배정 → 8강 공유 조회 → 문구 복원 및 edge/팀 보존. 로컬 Docker daemon 부재로 CI에서 실행한다.

### 2026-10-18 alpha 결함 — 부전승 후보가 조별 ENTRY와 충돌
Status: Fix in progress
- 재현: alpha `5444656fac`, 20팀/5조 대회에서 빈 BYE 편집의 팀 옵션이 0개. 서버는 조별 ENTRY 팀의 BYE 진출을 허용하지만 웹은 모든 ENTRY를 이미 배정된 팀으로 제거했다. 동일 필터가 목록 8강·desktop panel·mobile picker에도 있다.
- 기존 대상의 문구는 실행 직전 값으로 복원했고 실제 팀·결과는 아직 변경하지 않았다. metadata 3폭 QA는 PASS이며 BYE team QA는 실패로 기록한다.
- Owned: `src/lib/bracket-slot-candidates.ts`, 관련 model/helper 테스트, BYE editor·목록·node panel·mobile picker 소비자, task/scenario/API gotcha 문서와 Changeset. Backend/schema/진출 규칙 변경 금지. 다른 WIP 금지.
- 서버 `assertPlaceable`의 kind/조별 ENTRY 예외를 공용 후보 계산으로 맞춘다. BYE는 조별 ENTRY와 중복 진출을 허용하지만 결선 ENTRY/BYE/GROUP_RANK 중복은 계속 막는다. 현재 자리의 팀은 유지한다.
- [ ] 실제 사용자 후보 선택 경로 RED → GREEN.
- [ ] Web 관련 회귀·타입·pattern 및 PR CI.
- [ ] 후속 PR/배포·alpha BYE 3폭 및 실제 진출 재검증.
- RED: 빈 부전승 편집과 연결된 8강 목록의 실제 후보 선택 회귀 2건 모두 FAIL(후보 option 누락), 기존 44 PASS. GREEN: 공통 슬롯 kind/조별 ENTRY 예외 계산을 목록·desktop panel·mobile picker·BYE editor로 연결한 뒤 관련 6 files/170 tests PASS.
- 같은 alpha `5444656fac`의 독립 QA: 출처99번 변경→사용자 문구 유지/최신 자동 복원, 의도적503 입력 유지·실제 재시도, 공식 점수 확정→승자 결승/패자 3위전, 12강121번→8강 진출 모두 PASS. 경기 ID·진출 edge 유지, 실제 팀 이름 우선. 실패503은 QA가 한 번 의도적으로 주입한 응답이며 다른 pageerror/HTTP 실패 없음.
- Web lint(tsc + pattern) PASS. 신규 테스트 fixture의 단계 union·필수 이름 타입 오류를 수정한 후 통과. 제품 API/schema/진출 동작 변경 없음. 변경 경로 debt marker 없음, `git diff --check` PASS.

## 2026-10-18 후속 — 사용자 대진 문구·일정 표시 불일치

Status: In Progress
- 사용자 재현: alpha `/admin/tournaments/ad200600-0000-4000-8000-000000000003/bracket`에서 홈/어웨이 문구 수정 후 사용자 화면 미반영, 목록에서 수정한 시각/경기장이 그림과 불일치.
- 발견: 공개 상세와 공개 일정 projection이 details의 side override 및 BYE slot displayLabel을 읽지 않고 자동 slotLabel만 만든다. 공개 그림 카드는 venue를 표시하지 않는다. 관리자 목록/그림의 실제 같은 ID 응답을 추가 대조한다.
- Owned: v1 공개 대진/일정 조회·presenter·회귀, 공용 문구 해석, 공개 그림 카드, 관련 API/QA/task docs 및 Changeset. Forbidden: 타 세션 WIP·사용자 저장값 덮기·진출 규칙/schema 변경·main 승격.
- AC: 관리자 저장 문구→사용자 상세/일정/그림 동일, 실제 팀명 우선·BYE 보조 유지, 자동 복원, 동일 ID 시각·등록 필드 동기화, desktop/tablet/mobile alpha 실측.
- 단일 에이전트 순차. 좁은 RED→GREEN, 타입/CI, PR 리뷰, dev/alpha 검증 순서. 이전 Copilot 예외는 #1960/#1971에만 해당한다.
- 재현 실측: 같은42개 ID의 admin/public scheduledAt·venue 차이0, admin31번 카드10/19 20:33 확인. 31번 fieldId/venue는 현재null이며 실제로 미배정. public GET31번은 자동 결선5번 문구지만 admin은 `ddddd`, BYE35번은 admin `dd`가 public 자동값으로 누락. 공개 그림의 venue 렌더 누락 확인.
- 수정: 공개 상세/일정의 custom/BYE shared slot label 공용 해석, BYE 타일 보조 문구·fieldId, 등록 field 이름 우선, public 카드 venue·미정 표시·간격176/112 확보. API84 tests 및 신규field-name1 PASS, Web 화면/그룹33 PASS. 양쪽 tsc·Web pattern PASS. 그래프 좌표 회귀는 새 정보 높이에 맞춰 업데이트. 실DB public presenter 경로2건을 기존 통합 시나리오에 추가(CI 대상).


### 2026-10-18 공개 부전승 → 8강 연결선 후속

Status: In Progress
- Context/Goal: 팀 미배정 부전승도 저장된 BYE 슬롯과 연결된 8강 HOME/AWAY까지 공개 그림에 표시한다.
- Original Conditions/AC: 팀 배정·문구와 무관한 연결 유지, 실제 팀 이름 우선/부전승 보조 유지, 별도 경기 생성 없음, 수동 미연결 대진의 관계 추정 금지.
- User/Test Scenarios: 빈 HOME/AWAY 부전승 → 팀 배정 → 문구 수정 → 새로고침에도 같은 대상. 명시적 슬롯 연결이 같은 팀 추정보다 우선. 기존 승자/패자·legacy 배정 연결 유지.
- Parallel Work Breakdown: 단일 실행. Owned: public presenter/query/types, graph 및 회귀, API 문서/시나리오/changeset. API 저장·DB 스키마·관리자 이름 수정은 제외.
- Security Notes: 대진 공개 게이트 그대로, 사용자 대회 데이터 변경 없음. 공개 구조 정보만 추가한다.
- Tech Debt Resolved: 팀 registrationId 일치에 의존해 빈 부전승 연결이 누락되던 공개 그래프.
- Risks & Dependencies: alpha after 3폭/console/network 검증은 dev 머지·배포 이후 가능. 이번 요청은 PR 생성까지이며 미배포 상태를 명시한다.
- Ambiguity Log: 사용자가 승인한 기존 연결선 복구로 디자인 변경안 재선택 없음. 신규 슬롯 연결은 API로 명시하고 기존 슬롯 없는 배정 방식은 호환 유지.
- Progress Snapshot: origin/dev e4e2d01a3에서 fix/public-bye-connectors 분기. 분석 완료, 회귀 테스트 작성 중.

- RED: 공개 그래프 3건(빈 HOME/AWAY·명시 연결 우선), API 2건(빈 HOME/AWAY 대상 직렬화) 실패를 먼저 확인. GREEN: Web 3파일 50/50, API presenter 50/50 PASS.
- Alpha before: 원 대회 ad200600-0000-4000-8000-000000000003 공개 그림에서 1440/768/390 모두 부전승 4카드·BYE 연결선 0개로 재현. console/pageerror/HTTP 오류 0. 로그인·원격 쓰기 없음. headed PID49359/PPID49314 정상 종료. 증거: docs/screenshots/public-bye-connectors/before/.
- Web tsc PASS. 패턴 검사는 sandbox spawnSync EPERM으로 중단되어 해당 단계만 권한 있는 셸에서 재실행 PASS. API lint 결과 및 PR/CI는 아래에 기록한다.

- API tsc/surface PASS. Web 패턴 PASS. diff whitespace/debt marker 검사 PASS. 새 응답 타입은 optional로 추가해 기존 MSW/수동 대진 호환을 유지했다. PR에는 수정 전 3폭을 포함하고 after 갤러리는 머지·alpha 배포 뒤 채운다.

## 2026-11-02 extension — 정규리그 + N개 토너먼트

Status: Review — local validation passed; alpha pending

### Context / Goal
PR #1858의 고정 상위·하위 결선을 일반화한다. 기존 조별+토너먼트는 보존하고 별도 진행 방식 `league_knockouts`(표시명: 정규리그 + N개 토너먼트)를 추가한다. 여기서 정규리그는 한 정규대회의 예선 조별리그이며 시즌 승강 정규리그와 별개다.

### Original Conditions
- [x] 예선 조별리그의 팀 수에 고정 상한을 두지 않는다.
- [x] 토너먼트 개수·이름을 운영자가 설정한다.
- [x] 각 예선 조의 순위별 토너먼트 목적지와 진출 팀 수를 설정한다.
- [x] 순위는 기본 배정이다. 확정 참가팀을 직접 추가·제외·교체·이동할 수 있다.
- [x] 수동 편집된 배정은 순위 재계산으로 덮어쓰지 않는다.
- [x] 토너먼트별 대진·부전승·결과·팀/개인 시상을 같은 대회에서 관리한다.

### User Scenarios
예선 편성 → N개 토너먼트 이름/진출 규칙 설정 → 공식 결과로 기본 명단 제안 → 운영자가 명단 편집 → 확정 명단으로 토너먼트 대진 미리보기/생성. 참가자 화면은 각 결선을 이름으로 구분한다.

### Test Scenarios / Acceptance Criteria
- [ ] 5조 및 조당 9팀 이상 설정; 홀수 총 참가 수 허용.
- [ ] 3개 이상 토너먼트와 서로 다른 조별 진출 규칙.
- [ ] 순위 범위 밖 참가팀 수동 추가/제외/이동, 순위 재계산 뒤 편집 유지.
- [ ] 다른 대회·미확정 참가팀, 중복 순위 출처·중복 참가팀 거절.
- [ ] 3/5/6/10팀 결선의 부전승과 경기 연결; 실제 시작 경기 변경 차단.
- [ ] 권한·stale preview·동시 요청·rollback·시상 범위 검증.
- [ ] 기존 단일 결선·6강·12강·순위 채우기·시간 재정의 회귀.
- [ ] API/Web 계약 동기화, migration replay/drift, alpha 390/768/1440 evidence.

### Parallel Work Breakdown / Ownership
단일 세션 순차 실행. Phase 1: PR1858/latest-dev 통합 및 계약. Phase 2: DB/API/생성/수동배정. Phase 3: 프론트/시상/공개. Phase 4: 검증/문서.
Owned: apps/v1_api tournament·schema·migration·관련 테스트, apps/v1_web 대회·대진·계약·관련 테스트, docs/api·시나리오·정본 결정 및 schema digest 바인딩 파일.
Forbidden: 공유 원본 트리의 WIP, main 승격, 운영 데이터 변경/seed/reset, 무관한 auth 기능.

### Security Notes
기존 admin mutation 권한·대회 잠금·같은 대회 확정팀 검증·시작 경기 보호·감사 로그 유지. 순위 외 배정을 권한 우회로 취급하지 않고 명시적 수동 편집으로 기록한다.

### Tech Debt Resolved
고정 upper/lower enum 및 순위 범위 하드코딩을 이름을 가진 독립 토너먼트 계약으로 일반화.

### Risks & Dependencies
PR1858 latest-dev merge 30개 충돌 파일. generated Prisma client/의존성 준비 및 alpha UI QA 환경 필요. 기존 521/226 테스트 결과는 이번 확장 증거로 재사용하지 않는다.

### Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-11-02 | 화면 구성 | 사용자 A안 선택: 예선 편성 → 토너먼트·순위 규칙 → 진출팀 편집 → 미리보기. |
| 2026-11-02 | 중복 진출 | 기본적으로 같은 팀은 한 토너먼트만. 이동은 원래 명단에서 제외 후 추가하는 원자적 처리. |
| 2026-11-02 | 최소 결선 팀 수 | 대진 생성 시 2팀 이상. 명단 초안은 빈 목록 허용. |
| 2026-11-02 | 진행 후 편집 | 해당 결선에 시작/결과가 있으면 명단·대진 재생성 거절. 예선 결과는 보존. |

### Progress Snapshot
- 격리 worktree: /tmp/teameet-multi-finals-20261102; base origin/dev ddbe6a5ce.
- 원본 PR1858 head f8d2b5326 통합 중. 기존 공유 작업트리 변경 없음.
- Phase 1/2/3 completed. Phase 4 local validation PASS; alpha 0/10·after 0/3 pending.
- PR1858/latest-dev 충돌 30개 모두 해소. 최신 대진·6강·부전승·시간 재정의 보존.
- DB 전체 migration229개 재생 PASS, drift0. 실제 PostgreSQL 통합9/9: 275경기 저장, 순위 추천, 수동 팀 편집/재계산 유지, 예선 보존, 중복/타 대회, 동시 CAS, stale preview/일정 덮어쓰기 차단, 시작/완료 잠금, 시상 범위, support 권한, DB 강제 실패 rollback.
- 생성기11/11 PASS. 최초 API 회귀17개 스위트의 기존 고정 enum DTO 기대값2개를 새 계약에 맞게 수정한 뒤 관련6개 스위트516 tests PASS(중복 합산 안 함).
- Web 최초16개 스위트의7개 실패는 병합 시 설명 문구 누락과 새 시상 라벨/최신 상금 제목의 기대값 drift였다. 수정 후3개 스위트99 PASS. 추가 생성/그래프/모바일 모델/설정6개 스위트190 PASS, N개 시상·팀 수 계약47 PASS, 캔버스·목록90 PASS, 모바일59 PASS, 전용 구조 안내20 PASS(각 실행은 중복 포함, 합산 안 함).
- API/Web 전체 typecheck PASS. API surface752개 파일 PASS, Web pattern PASS, debt marker는 task 문서의 과거 검사 기록뿐(소스0), diff whitespace PASS.
- 검증용 Git tree945e0d65794cb7b0bbb96fbafc862af48542c899의 expand/contract gate 및 negative/self controls PASS. 이후 UI 제약·상태 잠금 보완의 최신 tree는 PR 반영 전 재검증.
- UI 전용 ego/headed browser 도구 없음 및 alpha 미배포: 실제 사용자/viewport 검증 미실행. 단위/DB 테스트를 alpha PASS로 표기하지 않는다.
- 운영 DB·공유 원본 작업트리 변경0. 임시 PostgreSQL 127.0.0.1:55483, 소유 runner PID48657만 사용하며 최종 검증 후 종료했다(PID48657 runner와 PostgreSQL 정상 종료 확인).
- 배포/운영 반영은 미실행. PR은 draft 유지.

### 2026-11-02 PR 반영 cursor

- 구현 커밋 `04b4892d561d43a52e537083989e5e179c54a9e5`, PR1858 원본8커밋 이력 보존 병합 `3d59a4277ea8affa938f88797a1a07b8da182fde`.
- 기존 draft PR1858 브랜치에 fast-forward push 완료. 제목/본문을 정규리그 + N개 토너먼트·직접 진출팀 편집 범위로 갱신. base=dev/draft=true 재확인. dev/main push·머지·배포 없음.
- 새 CI run41413245625의 API/Gates/Web 시작 확인. 현재 remote CI는 진행 중이며 아직 PASS로 표기하지 않는다. 이 문서 업데이트 후 최신 head의 Checks를 최종 기준으로 사용한다.
- local typecheck 양쪽0, 생성기11/11, 실제 DB통합9/9, migration229개·drift0, 실제 커밋3d59a4277의 expand/contract PASS. 이후 N개 결선 구조 편집 안내 UI20/20·모바일59/59 PASS. 신규 alpha0/10·after0/3.
- Git tree clean 및 commit scope127개 파일 확인. 원본 공유 트리 WIP 보존. Linux git 인증 부재는 기존 Windows gh.exe의 활성 keyring 인증을 명령 단위로 사용해 해결; 전역 인증/설정 변경 없음.

### 최종 범위 검증 보완

고정 enum DTO를 이름 범위로 확장하면서 기존 대회 방식에도 임의 범위가 열리지 않도록 서비스 검증을 분리했다. 기존 방식은 overall/upper/lower만, 새 방식은 실제 설정된 토너먼트 이름만 허용한다. 범위 검증 + 시상/개인상 관련3개 스위트96 tests PASS. 원격 CI는 이 보완을 포함한 최신 PR head 기준으로 확인한다.

### 편집 재진입 UX 보완

기존 설정을 단순 조회하며 진출팀 편집 단계로 이동할 때는 no-op 저장/결선 삭제를 하지 않는다. 저장 명단의 참가 확정이 해제된 팀은 안내와 명시적 제외 액션으로 제거한 뒤 편집을 계속할 수 있다. 실제 API payload·재시도/실패 상태를 검증하는 전용 설정 UI4/4 tests PASS.

### 원격 CI RED → GREEN 보완

- CI run41414776750 Gates의 `test_modified_m11_does_not_publish_binding`가 OR/AND 우선순위 오류를 검출했다. 새/기존 schema SHA 허용 조건을 괄호로 묶어 모든 경우 M11 SHA를 함께 검사하도록 수정. 공식 jq1.8.1을 /tmp에 SHA256 검증 후 준비해 실제 binding tests9/9 PASS(가짜 jq 없음).
- 같은 run의 Web 전체878개 파일·10747 tests 중 라운드 이름2개 실패(10745 PASS). 128강 지원의 group-name 선택이 기존 같은 조의 결승까지 준결승 이름으로 바꾸던 회귀를 수정했다. 기존 테스트를 약화하지 않았고 128강/64강·부전승 이름 분리 회귀를 추가해 관련4개 파일61 tests PASS.
- 위 두 수정은 실제 실패 원인을 고친 것이며, 이전 CI를 PASS로 표기하지 않는다. 최신 head의 원격 CI 재검증이 필요하다.

### 2026-11-03 PR 미해결 리뷰 후속

- 이전 head6c931c765의 원격 CI Gates/API/Web 모두 SUCCESS 확인(run41416672719). alpha 배포는 실행하지 않았다.
- 미해결5개 thread를 최신 코드로 재검토: 모바일 동일 sortOrder의 upper/lower 순서를 UUID보다 먼저 고정, 공통 slot 타입에 실제 API의 bracketTrack을 추가하고 지역 cast 제거, 동일 모듈 중복 import 병합.
- 관리자 serialize에 실제로 누락됐던 `kind` 추가: 시상 화면과 split 대진 허용 판단의 공통 원인을 수정. API 계약 문서와 생성 응답 회귀 assertion도 함께 반영.
- Owned paths: tournaments-admin.service.ts/spec.ts, bracket-canvas-mobile-model.ts/test.ts, bracket-canvas.tsx, bracket-fixture-tools-dialog.tsx, types/api.ts, 이 task 및 docs/api/domains/tournaments.md. 원본 공유 작업트리 변경 없음.
- 검증: API admin service134/134, web mobile model 및 fixture tools46/46 PASS. UUID 역순 upper/lower의 준결승·결승 회귀를 포함한다. API/Web typecheck0 및 diff-check PASS.
- alpha 수동 QA0/10·viewport0/3 유지. 현재 세션 도구 목록에는 ego-browser/Playwright/browser 도구가 없으며 PR은 draft·미배포 상태다. 로컬 Next를 QA 대체로 실행하지 않았다.

### 2026-11-03 재리뷰 3건 수정 (active)

- Phase A completed: manifest 생성·재사용 및 수동 rollback의 runtime version=2 검증. 후보 앱/시드 writer 시작 뒤 자동 실패 복구도 호환성 검증을 통과해야 하며, 시작 전 실패의 기존 복구는 유지. 실제 git history·manifest pairs·실제 restore 함수·배포 seed 실행 block의 mutation 회귀7/7 PASS.
- Phase B completed: group phase로 track별 결승/3·4위전을 구분하고 승부차기 포함 공식 3/4위를 표시. 새 회귀2건 RED(기존14 PASS) 확인 후 전체16/16 GREEN.
- Phase C completed: server/browser가 함께 사용하는 v1MswHandlers에 named-final sample fixture와 stateful handler 등록. 시상 저장→GET→공개 상세→빈 배열 초기화, invalid 입력의 상태 보존, 시상 재범위, 수동 명단·preview·생성·idempotence·stale 및 support/member/guest 권한8/8 PASS.
- Phase D in_progress: 좁은 회귀·typecheck·정적 검토 완료, 명시 경로 커밋 및 PR1858 갱신. 최신 이전 head c67554fab의 Gates/API/Web SUCCESS 확인.
- 사용자 수정 승인: 재리뷰 P1/P2 3건 전체. 기존 3폭 alpha baseline은 PR review5745573131에 게시. 새 기능 after 화면은 미배포로 남아 있으며 이번 코드 검증과 구분한다.

- Phase D 검증: Web typecheck0, rollback compatibility7/7, immutable manifest self-test PASS, StageB manifest21/21, immutable-deploy checker PASS, shell syntax·diff check PASS. 실제 trap 복구 검사는 현재 bash5.3에서 원래 bare-return 결함 재현이 없어 정적 guard만 유효하다는 제한을 그대로 기록한다. 운영 DB/이미지/배포 변경0, schema/migration 추가0.
- 기존 release-state shell 검사는 sandbox의 sudo 실행 제한으로 중단(보완 코드를 성공으로 간주하지 않음). 더 좁은 실제 rollback/restore 경로와 manifest 양성/음성 검증으로 변경 계약을 확인했고 전체 반복은 원격 CI에 맡긴다.

- 최종 좁은 Web 통합: 공개 결과16 + 공용 MSW8 + wizard4 + 기존 shared MSW facet14 = 42/42 PASS. runtime version7/7 및 현재·과거 schema binding9/9 PASS. 이전 P1/P2 세 항목의 코드 수정은 완료, 새 head CI 및 신규 alpha after QA는 별도 gate로 유지한다.

### 2026-11-04 미정 결선 선생성 및 예선 종료 후 배정 (active)

- Status: In Progress. 기존 task의 N개 결선 기능 후속이며 단일 세션 순차 실행.
- Original Conditions: [ ] 예선 편성 다음 단계 이동, [ ] 팀 선택 없이 규칙의 자리 수로 대진 생성, [ ] 예선 종료 후 전체 순위·동률 표시와 자동/수동 배정.
- Phase 1 in_progress: 현행 계약/회귀 및 미정 결선 API. Phase 2 pending: 사용자 화면 선택 후 wizard 연결. Phase 3 pending: 좁은 테스트·타입·리뷰·alpha QA.
- Owned: multi-finals API/plan/tests, wizard/hooks/MSW/tests, API 문서·changeset·본 task 및 별도 QA 시나리오. Forbidden: 공유 원본 WIP, main 승격, 운영 DB 변경.
- Acceptance: 미정 팀을 부전승으로 처리하지 않음; 규칙으로 결선 규모 결정; 공식 순위만 자동 추천하고 동률은 운영자 선택; 동일 구조의 후속 팀 배정은 경기 ID/일정 유지; 시작/기록/중복/권한/CAS 보호 유지.
- User/Test Scenarios: 최초 편성→규칙→미정 대진 생성→예선 공식 종료→전체 순위 확인→자동 선택/동률 수동 선택→기존 대진에 배정. 미정/동률·stale·중복·API 실패도 검증.
- Risks: 원본 트리는 오래된 dev 및 다수 WIP. 최신 origin/dev 185043dcb에서 `_worktrees/multi-finals-deferred-teams` / `fix/multi-finals-deferred-teams-20261104` 격리. 기본 터미널 초기화 실패는 escalated 실행으로 해결. 사용자 B안 선택: 생성과 배정을 독립 진입점/화면으로 분리.
- Security: mutation admin, 대회 잠금, 확정 참가팀 검증·결선 시작 보호·감사 로그 유지. schema 변경 없이 기존 multiFinals JSON과 슬롯 사용.
- Tech Debt Resolved: 실제 명단과 대진 자리 수의 결합 해제; 순위 미확정 상태의 명시적 보존.
- Ambiguity: 빈 자동 명단은 규칙 자리 수로 미정 대진을 생성. 규칙도 팀도 없는 결선은 크기를 추측하지 않고 거절.
- Progress Snapshot: Phase1/2 코드 완료. API15/15, Web146/146, 실제 PostgreSQL10/10, 양쪽 tsc0·API surface753·Web pattern PASS. 순위/동률·일정 보존과 권한/CAS/rollback을 검증했다. schema/migration 변경0.
- UI 재진입: 저장된 예선을 건너뛰지 않고 읽기 전용으로 확인→다음 가능. 생성 화면은 팀 선택 단계를 거치지 않는다. 단계 이동/검증 실패 시 본문 스크롤을 상단으로 초기화한다.
- Phase3 제한: alpha 기능0/7·viewport0/3. `cua.getState()`가 sandbox 초기화 오류로 브라우저 생성 전에 종료됨. 미배포·미수동검증이며 완료/PR-ready로 표기하지 않는다. 상세는 `docs/scenarios/multi-finals-deferred-teams-20261104.md`.
- 검증 환경: 기존 공유 client가 구 schema라 최초 단위 실행이 type mismatch로 중단됨. 최신 v1 의존성을 읽기 전용 링크로 재사용해 해결. 임시 PostgreSQL55484 runner는 종료됨. 전체 migration replay는 기존 Android policy materialization gate에서 중단됐고, 별도 빈 DB에 최신 schema를 준비한 기능 통합만 PASS로 집계한다.
- 사용자 후속 요청: 공개 사용자 순위표에서 조별 순위·결선이 모두 빠지는 문제 확인/수정. API는 두 데이터를 제공하지만 bracket-page-client의 3개 표시 gate가 group_knockout만 허용해 league_knockouts를 제외한다. 기존 공개 순위표·이름별 결선 컴포넌트를 그대로 복구하는 조건/분류 로직 수정이며 신규 UI 설계는 없다.
- 후속 Owned: 공개 bracket-page-client.tsx/test.tsx, 이 task·시나리오·changeset/API 설명. 이전 PR2149의 후속 커밋으로 전달. 회귀 RED→GREEN으로 조별 전체 순위·N개 미정 결선·공식 배정 후 진출 표시를 확인한다.
- 공개 후속 검증: 최초 3개 UI 회귀 RED → 표시 gate 수정 후 신규5개 포함 공개 순위/분류/결선/최종결과177/177 PASS, Web tsc0·pattern PASS. alpha 공개 API에서 해당 대회의 예선3조/42경기와 결선8개 편성/전체58경기 존재를 확인했으나 예선 팀 배정·순위행·완료는 모두0이다. 데이터 쓰기0, API 읽기를 브라우저 PASS로 집계하지 않는다.

### 2026-11-03 alpha 배포 요청 후속

- 사용자 요청: PR1858 기능을 alpha에 배포. main 승격은 범위 밖이다.
- Phase A completed: 최신 origin/dev `84ebe114e`에서 별도 Windows worktree를 만들고 PR head `6154cca39`를 충돌 없이 통합했다. 원본 dirty tree는 수정하지 않았다.
- Phase B completed: 최초 immutable 전환의 `restore_legacy_runtime`도 후보 writer 시작 이후에는 구버전 복구를 거절한다. 실제 복구 함수의 source 전환 여부를 검증하는 회귀를 추가했다.
- Phase B completed: preview는 살아 있는 예선 최대 경기 번호 다음부터 결선을 계산하며 generate는 검증된 preview plan을 그대로 저장한다. 재미리보기에서 기존 결선 번호가 누적되지 않는다. API 문서 및 실제 DB 통합 시나리오에 미리보기/저장 번호 일치 검증을 추가했다.
- 좁은 검증: service/plan 단위 13/13 PASS, WSL의 실제 bash/git/jq로 runtime rollback 8/8 PASS, bash syntax PASS. jq1.8.1 공식 배포 바이너리의 SHA256을 공식 checksum과 대조했다. 운영 DB rollback 실험은 하지 않았다.
- Phase C in_progress: API/Web typecheck0, API surface752 PASS, diff-check PASS. Web pattern checker는 Windows cmd의 POSIX find/grep 구문 비호환으로 실행 실패했으며 성공으로 집계하지 않는다. 전체 pattern/실제 DB 통합 검증은 최신 head의 Linux CI에서 확인한다. exact-path commit 및 PR 갱신 후 최신 CI 통과, dev merge와 alpha 배포 상태 확인을 진행한다.
- Progress Snapshot: alpha 미배포 상태의 신규 수동 QA0/10·viewport0/3은 그대로 유지한다. 배포 완료 후 실제 serving SHA 및 health를 별도로 기록한다.

## 2026-11-06 extension — N개 토너먼트별 독립 진출팀 확정

Status: In Progress

### Context / Goal
예선·결선 대진 생성과 실제 진출팀 확정을 분리하고, `league_knockouts`의 토너먼트 하나만 독립적으로 배정한다. 현재 배정은 모든 결선의 명단 저장/재생성을 한 번에 실행해 한 결선의 미확정 상태가 다른 결선을 막는다. 순위표는 대회 계산기, 추천은 리그 계산기를 사용해 순위 불일치를 동률로 표시한다.

### Original Conditions / Acceptance Criteria
- [x] `league_knockouts`에만 적용하며 기존 조별+결선 계약은 유지한다.
- [x] 대진 생성/진출 규칙 설정/토너먼트별 진출팀 확정을 구분한다.
- [x] 선택한 토너먼트만 원자적으로 확정하고 다른 결선의 명단·진행 상태·일정·경기 ID를 보존한다.
- [x] 예선 미완료·미확정 팀·중복·자리 수 불일치·stale revision·선택한 결선의 시작/기록은 서버에서 거절한다.
- [x] 순위표와 추천은 대회 계산기로 저장된 공식 순위를 함께 사용한다. 기존 시드 배정에 4개 조 12팀의 교차 배치 옵션을 추가했다.
- [x] A/B/C 제시 후 사용자 A안 선택. 기존 모달에서 토너먼트 선택→명단/시드→해당 대진 확인→독립 확정하며 기존 두 결선 일괄 저장 단계를 제거했다.

### User Scenarios / Test Scenarios
- 예선과 빈 결선을 만든 뒤 프리미어만 선택/확정해 대진에 반영한다. 챌린지 미확정 상태는 유지한다.
- 다른 결선이 시작됐어도 아직 시작하지 않은 선택 결선의 배정은 허용한다.
- 확정 전 미리보기/취소는 명단이나 경기 데이터를 저장하지 않는다.
- 권한, CAS, 다른 대회 팀, 중복 시드, 미완료 조, 시작한 결선은 실패 원인을 노출한다.

### Parallel Work Breakdown / Ownership
서브에이전트 없이 순차 실행. Owned: multi-finals API/DTO/service/tests, hook/wizard/page/tests, API 문서, canonical flow 변경 이력, 본 task·시나리오·changeset. Forbidden: 원본 dirty tree WIP, 다른 진행 방식 변경, 실대회 데이터 변경, main 승격.

### Tech Debt Resolved / Security Notes
기존 대회별 권한/슬롯 배치/감사/게임 잠금을 재사용한다. 토너먼트별 확정은 전체 결선 재생성 API를 사용하지 않는다. 개인정보·로그인 정보는 저장하지 않는다.

### Risks & Dependencies / Ambiguity Log
- 사용자 A안 선택 완료. 새 기준은 순위 계산 옵션이 아니라 시드 배치 옵션이다. 후속 확인: 1위4팀은 8강 직행, 2·3위8팀은 12강4경기. A/B/C/D의 8강 1위 상대 쪽에 B/C/D/A의 2위 고정, 3위는 두 상대 조를 피해 균등 추첨한다. 미리 본 배열을 그대로 저장한다.
- Docker daemon 연결 실패(npipe dockerDesktopLinuxEngine 없음)로 실제 DB 통합은 로컬 미실행. headed Playwright는 임시 라이브러리 추출로 준비했고 alpha 변경 전 1440/768/390 캡처 및 console/network 확인 완료(0오류), 쓰기0. controller PID5751/browser5763 트리는 종료했다. 증거 `/tmp/teameet-multi-finals-evidence/`. 변경 후 alpha 수동 QA는 미배포 상태라 대기.

### Progress Snapshot
- Phase 1 completed: 최신 origin/dev `0b7720cb7d06`에서 `/tmp/teameet-multi-finals-20261106`, `fix/multi-finals-independent-assignment-20261106` 격리. 기존 원본 트리 수정 없음.
- Phase 2 completed: 화면/DTO/hook/선택 정책/미리보기 sourceVersion/대상 결선 독립 확정 구현. 새로운 옵션은 적합한12팀 결선에서만 표시하며 수동 편집 시 기본 방식으로 전환한다.
- Phase 3 in_progress: API101 회귀, Web15, 양쪽 tsc0, Web pattern PASS/API surface761 PASS, diff-check PASS. 실제 DB 통합 회귀는 추가했으나 daemon 없음으로 로컬 미실행. 변경 전 alpha3/3폭 PASS, 변경 후 alpha0/3폭·기능0/7. 커밋본 CI/리뷰와 alpha 검증 대기.

- Review follow-up: 교차 배치 옵션은 실제12자리일 때만 제공한다. 생성 뒤 운영자가 편집한 실제12강→8강 연결도 검증해 같은 조 회피가 깨지는 그래프를 거절한다. 순위/시드 배열만 보고 성공 처리하지 않는다. 유효 순열 전수 및 실제plan의 승자 연결 변조 회귀로 확인했다.
- Delivery cursor: dev 대상 draft PR2169, 최초 커밋 daf8ca3c5. 원격 credential helper의 오래된 경로는 해당 push에서만 gh helper로 override했으며 전역 설정 변경0. 커밋본 CI 진행 중.

- Flow completeness fix: 생성 단계의 필수 순위 매핑을 제거했다. 신규 `capacity`로 이름·자리 수·3/4위전만 정해 빈 결선을 만들고, 별도 rules 화면에서 목적지를 연결한다. 이전 JSON/클라이언트의 capacity 생략은 기존 명단/규칙 수를 사용한다. 규칙 편집 시 기존 크기를 고정해 연결 수 변경으로 경기/일정이 재생성되는 것을 방지한다. 규칙 미설정 결선은 배정 UI에서 명시적으로 안내한다.

- Capacity follow-up validation: 규칙 없는12자리 생성/진출 규칙 연결/명단 확정의 실제 DB 통합 회귀를 추가했다(CI 대상). 로컬 API101·Web15, 양쪽 타입 검사 PASS. 생성 단계의 순위 선택 제거와 별도 규칙 단계 진입을 실제 렌더/API payload로 검증했다. 기존 PR head의 Web/Gates CI는 PASS, API migration replay는 진행 중이며 이 후속 커밋은 새 CI 대상이다.

- Rule-only correction: 순위 목적지를 수정해도 기존 승인 명단을 null로 만들지 않는다. 같은 크기의 규칙 저장은 현재 실제 슬롯과 명단을 그대로 보존하고 새 추천 적용은 독립 assignment 확정으로만 수행한다. UI→실제 selection payload 회귀를 추가했다.

- Final UI boundary validation: 규칙 화면은 단일 저장 액션으로 완료하고 결선 preview/generate를 호출하지 않는다. 기존 승인 명단/크기는 유지하며 변경되는 것은 목적지 규칙뿐이다. 신규 rule-only 회귀 포함 Web16/16 PASS. 최신 로컬 API101 PASS/양쪽 tsc PASS. 이후 CI·리뷰 결과를 최종 SHA 기준으로 확인한다.

### 2026-11-06 current verification / resume cursor

- Runtime code cursor: `364b5d071` (dev PR2169). Source changes complete; code remains frozen pending remote validation/review.
- Local: API101/Web16 regressions PASS; API/Web typecheck PASS; API surface761/Web pattern PASS; committed diff-check and untracked-import check PASS.
- Docker alternative: PostgreSQL16.15 binaries extracted under `/tmp/teameet-assignment-pg`, isolated localhost55486, approved test DB `ulw_v1_integration_assignment`, latest Prisma schema only. No existing DB, alpha data, or env files accessed. Owned PID10171 stopped and absence verified.
- Actual PostgreSQL: new capacity→rules→assignment and independent-final/other-final-LIVE integration cases2/2 PASS. Separate `/tmp/teameet-cross-assignment-qa.cjs` exercised actual4-group/12-team preview→cross assignment, exact draw persistence, fixture ID preservation and broken quarterfinal-edge rejection422; both outcomes PASS. This is functional evidence on a fresh current schema, not migration-history replay proof.
- Alpha BEFORE: real administrator login, 1440/768/390 captures3/3; console0/network failures0; mutation0. Evidence `/tmp/teameet-multi-finals-evidence/`; browser/controller5751/5763 closed. AFTER alpha0/3 and feature0/7 because no deployment.
- Remote code-head CI: Gates PASS5m56s, Web PASS12m54s; API remained in `V1 migration replay + drift gate` on run42061455599 as of2026-11-06 01:34 KST. No API failure output yet. This pending state must not be called a pass.
- Copilot: official requests accepted with empty requested_reviewers; final-head recovery response explicitly matched364b5d071, but no review record or findings/clean result arrived. No settings/account/merge-rule changes and no review bypass.
- Remaining: final PR CI/review, dev merge (base must be rechecked), alpha serving-SHA verification, AFTER headed QA and screenshots. No main promotion. Review result absence blocks merge under repository S6. No final completion/PR-ready claim.

### 2026-11-06 PR2169 CI repair and Alpha delivery

- User authorized fixing the current PR and deploying to Alpha; main/prod are out of scope.
- Own isolated worktree `_worktrees/pr2169-alpha-fix`, branch `fix/pr2169-alpha-20261106`, created after fresh origin/dev fetch (29e256c14), then integrated PR head b3bd74ac0. Preserve other sessions and their WIP.
- RED evidence: exact-head CI42066264451 failed 2/193 integration suites. Existing generation test expected automatic participants; real mock-seed flow omitted explicit assignment, leaving 24 instead of32 submitted lineup sides.
- Fix: keep generation unassigned; update the existing integration test to explicitly preview/confirm and retain fixture ID/schedule assertions. Mock generation now confirms each final through assignmentPreview/assign, carries the current revision/sourceVersion, and syncs rosters only after successful assignments. Existing mock integration's32-lineup and actual qualification roster assertions remain unchanged.
- Owned follow-up: mock seed service, multi-finals integration test, relevant API documentation/Changeset, this task. No schema/migration or UI design changes in the repair itself.
- Local preparation: own WSL dependencies and localhost PostgreSQL16.4 on55489; no existing DB or env files read. Windows CRLF altered a historical policy SQL hash, so a separate LF copy matching Git blobs was replayed into a fresh approved test DB; all230 migrations passed. Do not count the initial CRLF attempt as a pass.
- Remaining: focused real-DB/unit/type/surface validation, exact-path commit/PR2169 update, latest Copilot clean and CI, dev merge/FF sync, Alpha SHA/health and headed after QA. Default UI runtimes failed initialization; own headed Chrome PID22720/controller16392 is open for administrator login (no credentials persisted).

- Repair validation PASS: full230-migration LF replay on fresh isolated PostgreSQL; both formerly failing integration suites17/17, related unit suites56/56, API typecheck0/surface761 PASS, diff-check/debt grep clean. Owned PostgreSQL PID2444 stopped and absence verified. Latest PR-head CI and review still pending; Alpha after QA remains unverified.


## 2026-11-06 follow-up: stable public qualification colors
Status: In progress
### Context / Goal
User approved the local 10-color badge preview without T numbering. Use blue, orange, teal, purple, rose, ochre, indigo, brown, olive, mauve in setup order; retain existing colors across changes.
### Original Conditions
All qualification badges and promoted rows used blue. Named finals used mutable names as their only identity.
### User Scenarios / Acceptance Criteria
- [ ] Two/three/ten finals use the first two/three/ten palette colors.
- [ ] Rename/reorder/delete/add preserves surviving destination colors across reload and generate/reset/assignment.
- [ ] Actual confirmed qualification gates remain unchanged; names remain visible; no T prefix.
- [ ] Desktop/tablet/mobile and dark mode remain legible.
### Parallel Work Breakdown / Owned Scope
Single agent. Multi-finals identity/color helper, DTO/service, admin wizard identity round-trip, public detail presenter/type, public standings badge styles/tests, API docs and changeset. No other session resources or main changes.
### Test Scenarios
Lifecycle JSON round-trip, duplicate/stale identity rejection, 2/3/10 colors, public route qualification mapping, admin rename identity round-trip, API/web type checks, CI/review, Alpha browser screenshots.
### Tech Debt Resolved
Remove dependence on mutable names or rendered row order for color identity.
### Security Notes
No new auth path; color is server-owned; existing publication/qualification/privacy gates unchanged. No schema migration.
### Risks & Dependencies
Existing configs derive initial color from stored order. Old clients renaming without returned ID create a new destination. More than ten lifetime color positions cycle the palette; names remain the discriminator. Copilot clean and Alpha checks pending.
### Ambiguity Log
Approved badge-only local sample, no T prefixes. Main/prod out of scope.
### Progress Snapshot
Implementation in isolated feat/final-colors-20261106 from origin/dev ec705f79d.

### Validation snapshot
- API unit: final colors/assignment/presenter focused rerun 74/74. Existing preview/reset suites passed. Web three suites 82/82; updated API-to-badge route assertions additionally 2/2.
- API lint/tsc + surface check and web lint/tsc + v1 pattern check passed. Light/dark 20 text/background contrast pairs minimum 4.79:1.
- Real DB integration assertions added for persisted identity/color across generate and rename (CI execution pending).
- Alpha baseline captured at 390/768/1440. Existing baseline image optimizer 400 and a transient health 503 observed; subsequent health HTTP 200 with DB true. Do not classify these pre-existing responses as a clean session.
- UI gallery will be posted after dev merge and exact Alpha deployment, per repository workflow. New PR review waiver has not been requested; previous #2169 exception is not assumed for this change.

### Resume cursor (2026-11-06 13:38 KST)
- PR #2173, head 6dfa13fa125c97c06d11cfdc6087090bcc19f33a. PR CI 42162182740 all SUCCESS (Gates 5m47s / API 9m47s / Web 12m55s); API migration replay step includes real DB integration suite and passed. PR base dev, MERGEABLE/CLEAN.
- Copilot requested via gh and official REST; zero reviews returned. Requested user exception through async question; no reply received yet. DO NOT merge before clean review or explicit exception for this PR. #2169 exception is not inherited.
- Owned Alpha QA tournament: 5dab06e4-0379-46b9-affc-ccdb8981e8a0, `(목업) 1106-0424 정규리그+N개 토너먼트 20팀 진행중`. Created via actual admin UI with results (48 games / 80 lineups), then own fixture preconditions via admin API: 5 groups x4 teams, ten named finals of two teams each, selected+generated, revision 6. Before deployment it has no IDs/colors stored; new server must hydrate colors 0..9 by config order (public track key order is NOT configuration order).
- QA fixture visibility PATCH false returned 200 at 04:38 UTC; do not cancel until QA finishes. To inspect through ordinary user UI, temporarily publish only this own QA fixture, then hide/cancel at completion. Existing f67894a6-1c89-456b-8c00-e8f87f4d3520 tournament is READ ONLY baseline.
- Headed Chrome PID51568 / parent66416, exec session10355 closed normally with contexts. Temp Playwright prefix: Windows TEMP/teameet-final-colors-browser; PR/review request files use same task prefix. WSL own install log /tmp/teameet-final-colors-install.log. No owned local DB.
- Own worktree `_worktrees/final-colors-20261106`, branch feat/final-colors-20261106; do not remove while unmerged. Local task note and ten-before-{390,768,1440}.png remain outside the source PR head. Source head has tsc/lint success, public baseline PNGs and headed QA helper scripts/qa/final-colors-browser.cjs. Preserve root's unrelated preview/ads task and other sessions' worktrees.
- After approval/review: check exact head/base+CI, merge dev, synchronize root+dedicated local dev by safe FF, monitor exact dev CI/Alpha run, verify commit headers+DB health, inspect public user table at 390/768/1440/light/dark and ten destinations. Verify id/color persistence after rename/reorder via own QA fixture only. Commit after-evidence on separate evidence branch, post raw-SHA 3-column gallery on #2173, hide/cancel own QA fixture, clean owned browser/process/temp/worktree resources. Main/prod out of scope.


### Scope extension: league + N finals usability (user approved)
User requested adding filters to the same PR #2173 and retitling it. Add named-final selection then canonical round selection, union rounds for all, preserve common round on track switch and reset unavailable round. Single-final hides name row; preserve legacy upper/lower/league semantics. Group/name/round rows scroll horizontally without wrapping, independently reveal selected chip, retain full names and stable color dots even before qualification resolves. Add route regressions for differing rounds, one/ten finals, existing single/split/league suites. Source changed after original CI, new exact-head CI/review required. No review exception has been approved for #2173.

### Filter extension validation / next cursor
- Public bracket route 60/60, independent horizontal reveal 1/1, public presenter 53/53 passed. API tsc/surface and web tsc/pattern checks passed. Initial web tsc caught two missing fixture status fields in newly added tests; corrected and rerun passed.
- Current Alpha a6f8bdcd4be6a4a01a5539ed8b234291b23dd95d filter baseline captured at 1440/768/390; existing image optimizer 400 observed on first capture, no page errors. Owned headed Chrome3316/controller70848 closed normally.
- Source PR title updated to `feat: 리그 + N개 토너먼트 사용성 개선`. Same feature branch, dev base. Latest scope includes independent group/name/round scroll rows, native horizontal round-jump navigation, selected-row-only reveal, real round union/filter/reset, and public bracketColorIndex for pre-qualification color dots.
- Push this extension and validate its NEW exact-head CI/review. Original 6dfa13fa1 CI success does not validate the added filters. #2173 is still unmerged and undeployed; no review waiver received. Owned 10-final QA fixture remains private and reserved for post-merge Alpha checks. Preserve this unmerged worktree. No main/prod action.


### Admin diagram extension (user approved, same PR2173)
Separate preliminary and named-final diagrams vertically; preserve horizontal round flow inside each diagram, independent geometry and no inter-final lines. Add same stored color, native accessible collapsible sections and jump navigation. Preserve fixture selection/slot assignment callbacks and full group context for preliminary rank slot labels. Legacy single/upper-lower/six-team diagrams retain their existing layout. Validate 2/10 sections, geometry separation, labels and actual node action callbacks. Previous filter head 113419e58 CI is not the validation for this extension.

### Admin diagram extension validation / resume
- Admin bracket service unit 232/232 PASS; API tsc/surface PASS. Canvas full rerun21/21 PASS after correcting an invalid test expectation: GROUP_RANK final slots remain managed/read-only, while preliminary ENTRY assignment still works. Final named-section focus rerun3/3 PASS; existing layout62/62 and assignment hook16/16 passed. Final web tsc/pattern PASS.
- Rendering now separates preliminary/other fixtures and every named final into vertically stacked native details, with independent canvas/SVG/scroll geometry, complete source-label/shared-slot lock context, jump navigation that opens and focuses the destination, server-owned color dot and match count. Repeated track title prefixes removed. Existing single/upper-lower/six-team layouts stay on the existing single renderer.
- Actual Alpha admin baseline at 1440/768/390 captured from owned private20-team QA tournament; no page/network errors observed. Chrome41968/controller55576 exited normally. QA tournament stays private, unchanged by this task.
- Filter head113419e58 CI42168900113 all SUCCESS. This admin extension requires NEW exact-head CI/review after push. No merge or Alpha deployment yet and no #2173 review waiver received. Keep this unmerged worktree; main/prod remain out of scope.

## 2026-11-06 follow-up: 경기 일정 필터 정합성
Status: In Progress
### Context / Goal / Original Conditions
PR2173 deployed colors and bracket filters but ScheduleContent retained its combined wrapping group/round filter. User authorized fixing, new dev PR, and Alpha deployment. Apply the already approved UX to 경기 일정 without new design choices.
### User Scenarios / Acceptance Criteria
- [ ] 결선 > 전체·토너먼트 이름 > 전체·실제 강수. All uses union; selected final limits available rounds. Preserve common round, reset unavailable round.
- [ ] Two/three/ten finals retain actual names and stable color dots; single final omits name row.
- [ ] Group/name/round rows independently scroll horizontally with no wrap.
- [ ] Scheduled/live/unscheduled and 내 팀만 share the same predicates. URL state/deep links/back/forward and fixture detail return preserve selected final and round.
- [ ] Single/upper-lower/pure-league behavior and auth/publication gates retained.
### Test Scenarios
Focused ScheduleContent behavior and route wiring; existing schedule/history/league regressions; one Web type/pattern run; exact-head CI/review; Alpha3viewports screenshots/network evidence.
### Parallel Work Breakdown / Ownership
Single agent; own fresh fix/schedule-final-filters-20261106 worktree from origin/dev1245860f0. Owned ScheduleContent, bracket schedule wiring, focused tests, changeset and this task. No backend/API/schema migration, main/prod, other sessions' files/processes.
### Tech Debt Resolved / Security Notes
Reuse BracketFilterRow; eliminate wrapping duplicate filter implementation and keep local draft state. Stable track colors come from existing tournament-detail metadata, never infer identity by translated name parsing. Preserve existing visibility and session gates.
### Risks & Dependencies / Ambiguity Log
Schedule rows have no bracketTrack, so hub supplies fixture-ID keyed final metadata from its existing detail response, including rows whose schedule groupId is null. Standalone /schedule redirects to /bracket; regular league uses separate wrapper. No new API request. PR2173 review waiver is not assumed for this new PR.
### Progress Snapshot
Fresh branch1245860f0 (includes PR2180 image work). Narrow tests added for union/reset/common round/10final URL restoration; dependencies installed in owned WSL worktree, ignore-scripts. No local Next server.
### Schedule filter validation snapshot
- RED: new N-final schedule cases failed2/2 on old implementation because 일정 토너먼트 선택 did not exist.
- GREEN: four focused suites164/164 PASS (schedule75, actual bracket route61, URL-return14, league14). Includes10final deep-link/re-entry/popstate, common/missing rounds, live/unscheduled/mine intersection, single-final hidden-name row, fixture-ID association with null schedule.groupId and saved color.
- Changes: supply named-final fixture IDs/colors from the already loaded tournament detail; keep per-entry named group headings; add scheduleFinal to existing local draft/URL sync and fixture return source; reuse independent BracketFilterRow with padded=false inside existing schedule padding. No extra API requests or backend/DB changes.
- Baseline Alpha1245860f0 captured after deploy42183991187 SUCCESS at1440/768/390. Actual login through player fixture account, read-only tournamentf67894a6; no page/network errors observed in this scoped baseline. Browser28716/controller14088 closed normally. Do not alter that existing tournament.
- Web lint/tsc pending; commit/PR/CI/Copilot/Alpha after verification remain. Own browser helper/dependencies in Windows TEMP/teameet-schedule-final-browser, WSL install/test/lint logs prefixed teameet-schedule-final. No local Next/DB runtime.
- Final pre-commit Web lint (tsc --noEmit + v1 pattern check) PASS. Focused164/164 and diff/debt checks passed; baseline images reviewed. Ready for exact-scope commit and latest-head CI/review.
