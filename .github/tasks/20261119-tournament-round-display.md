# Task 20261119: 결선 결과·어드민 표시 순서와 단판 합산 정리
Status: Review
Created: 2026-10-28
Scope: frontend + backend 조회 정렬 + docs. 원본 데이터/스키마/진출 로직 변경 없음.

## Context
사용자 지정 production 대회 3b0b8241-71d7-4d55-a1ca-dfe3750eef4e 결과에서 결승 다음 4강, 단판에도 합산 행 표시.
공개 API 및 배포 SHA852290b7 소스로 확인. 4강 두 경기는 번호1/2·leg1 각각 2:0/0:2, 3위전4:0, 결승1:4.
사용자가 제안한 기준을 승인: 어드민4강→3·4위전→결승, 종료결과 결승→3·4위전→4강→8강…, 시간순 일정은 실제 시각 우선.
기존 카드/배치 유지, 승인된 순서와 불필요 행 제거만 적용(별도 UI안 재선택 없음).

## Goal
기존 기록/진출/일정의 값은 보존하면서 목적에 맞는 표시 순서와 실제 차전 구성만 보여준다.

## Original Conditions
- [x] 결과조회 결승→3·4위전→4강→8강→12강→16강.
- [x] 어드민 기본 목록·그림·모바일은4강→3·4위전→결승.
- [x] 단판4강은4강만 표시. 합산/1차 표시는 실제같은대진1·2차전일 때만.
- [x] DB migration/write0, 점수/참가팀/진출연결/경기시각/식별자 불변.

## User Scenarios
- 관전자: 결승·3위전 결과를 먼저 본 뒤 이전 라운드 확인. 각 실제 경기 링크 유지.
- 운영자: 3위전을 결승보다 먼저 확인하되 실제 시간순 일정은 일정대로 확인.
- 홈원정2차전: 같은대진·같은경기번호·서로다른leg1/2만 합산, 팀명 비공개에도 식별자로 정합성 확인.

## Test Scenarios
- [x] 실제 페이지 렌더 단판/결과순서 RED→GREEN.
- [x] 실제2차전 정방향/역방향 및 다른상대·단독2차전·미확정 점수 합산 금지.
- [x] 어드민 desktop좌표/승자·패자 edge 보존 및 모바일 section순서.
- [x] API getBracket 표시 순서 및 기존 입력 객체 불변.
- [ ] 기존 결과·시상·조별경기·캔버스·시간순 일정 회귀.

## Parallel Work Breakdown
단독 순차: 계약 테스트 → 결과 표시 → 어드민 정렬 → 좁은 회귀 → 문서/상태.
Owned: 해당 결과 화면, canvas layout/mobile model, admin bracket read service와 관련 테스트/문서.
Forbidden: DB/schema/migrations/결과확정·진출·stage rank 정책/다른 작업트리.

## Acceptance Criteria
- [x] 원본 조건 충족, 관련 테스트/타입 통과.
- [x] 표시만 변경. 실제 쓰기 경로 및 schema diff0.
- [ ] 배포 후 alpha390/768/1440 화면·console/network 증거. 미배포 로컬검증과 구분.

## Tech Debt Resolved
단판을2차전처럼 렌더하고 팀명으로 홈원정 방향을 판단하던 부분, 중복 결과 정렬 규칙.

## Security Notes
권한 변경 없음. 운영/공개 데이터 쓰기 없음. 비공개 팀명으로 대진 동일성을 추정하지 않음.

## Risks & Dependencies
표시 위치 변경으로 목록/캔버스좌표는 바뀜. 저장 sortOrder·fixtureNumber·진출 edge는 그대로.
대진 시작 순서를 검증하는 competitionStageRank는 결승/3위전 같은 단계 정책을 유지.

## Ambiguity Log
- 사용자 승인된 순서/단판합산 수정 범위로 진행. 기존6강PR2076과 별도 브랜치.

## Progress Snapshot
- origin/dev ec33d1609(PR2076 merge) 기반 fix/tournament-round-display, `/tmp/teameet-round-display`.
- [x] 공개 API 및 실제 배포 소스 확인.
- [x] 계약 RED/GREEN 및 구현.
- [ ] alpha검증(미배포).


## Local Validation
- 결과 화면 RED2(순서/잘못된 합산) → GREEN. 실제2차전·단독2차전·점수 미확정·입력 불변 포함.
- Web 5 files141 tests + 어드민 실제 desktop/mobile2 files62 tests =203 PASS.
- API 해당 bracket service221 tests PASS. getBracket 3위전→결승 및 원본 배열 불변/쓰기없음 포함.
- Web/API tsc PASS, API surface/Web pattern gate PASS, git diff --check PASS. touched source의 TODO/FIXME/HACK/XXX0.
- DTO/응답필드/Prisma/schema/migration/결과확정·진출 서비스 변경0. backend는 getBracket의 phase 표시 정렬 상수만 변경.
- 실제 시각 우선 정렬 코드는 수정하지 않음. admin 순서변경은 기본단계 보기만 적용.
- Alpha 화면/console/network 0/3(미배포). 로컬 Next 서버 및 브라우저 실행0. 프로덕션 읽기 전용 조회만 수행.
- 신규 데이터, 점수·참가자·진출·시간·sortOrder 수정0. API/화면의 반환/표시 순서만 변경.
- 미커밋 별도 worktree. 기존6강PR과 원본 공유트리 변경 없음. 사용자 PR 생성 요청에 따라 명시 경로 커밋 및 dev 대상 PR 진행. 배포 후 alpha 검증은 후속.

## CI 후속 수정
- CI40646348721: Web/Gates PASS. API 통합1347 PASS/1 FAIL(16강 조회 순서 기대값이 이전 정책을 유지).
- 승인된 어드민3위전→결승 순서에 맞춰 해당 기대값만 갱신. 공개 원본 조회 순서 및 실제 경기 생성·진출 검증은 보존.
- 전용 로컬 PostgreSQL에 기존 migration 전체 적용 후 bracket-round16 통합4건 PASS. 운영 DB 접근/쓰기0.
- 최신 head CI 재실행 대상. Copilot 모델 불가 외부 오류/필수리뷰 예외 승인 대기. 미머지·미배포.
