# Task 20261090: 신규 리그 모집 마감·명시적 시작과 기존 데이터 호환성

Status: Review (local verification passed; PR/CI and alpha follow-up)
**Created**: 2026-10-18
**Canonical branch**: `fix/league-explicit-start` (base `origin/dev` e4e2d01a3)
**Canonical worktree**: `/tmp/teameet-league-explicit-start`

## Context
리그를 만든 뒤 대진 준비만으로 진행 중으로 보이는 문제. 사용자는 생성 → 모집 마감 → 리그 시작하기를 승인했고, 후속으로 PR 생성과 기존 데이터 무회귀를 요청했다.

## Goal
신규 리그만 명시적으로 시작하고, 기존 리그의 데이터와 동작은 유지한 dev 대상 PR을 만든다. 머지·배포는 요청 범위가 아니다.

## Original Conditions
- [x] 신규 독립 리그·시리즈 신규 시즌은 모집 마감으로 생성한다.
- [x] 신규 모드의 대진 생성/재생성·슬롯 배정·경기 활동은 자동 시작하지 않는다.
- [x] 리그 시작하기는 기존 mutation-admin 권한·상태 API·감사·에러 처리를 재사용한다.
- [x] 기존 draft/open/closed의 자동 진행·경기 시작을 포함해 기존 동작을 보존한다.
- [x] 기존 상태·신청·경기·공개·삭제 데이터의 UPDATE/삭제 없이 additive migration을 적용한다.

## User Scenarios
1. 관리자 생성 → 모집 마감 확인 → 팀/대진 준비 → 리그 시작하기 확인 → 진행 중 → 경기 시작.
2. 신규 리그의 시작 전 게임 start는 LEAGUE_NOT_STARTED로 거절한다. 조회 전용 계정은 시작할 수 없다.
3. 기존 closed 리그는 새 조건으로 막지 않고 예전처럼 대진/경기 활동으로 진행된다.
4. 모집을 다시 열면 모집 중으로 표시하되 신규 리그의 실제 시작은 별도다.

## Test Scenarios
- 공통 생성 경로에서 closed + requiresExplicitStart=true 저장.
- 기존/신규 모드 × closed/draft × 대진 생성/재생성 행 상태 검증.
- 기존 draft/open/closed 슬롯 채움과 경기 시작 유지, 신규 모드만 차단.
- 관리자 시작 payload·실패 표시·readonly 권한·모집 재오픈 표시.
- 실제 dev migration 체인 → 기존 7개 상태 삽입 → 신규 migration → 추가 컬럼 제외 전체 행 snapshot 동등성.
- 실제 스키마를 복제한 temp table에서 migration과 구버전 INSERT 기본값 false를 검증하는 DB integration 회귀.
- 생성/결과/몰수/자동 종료/NOWAIT/시리즈 승강 통합 시나리오에서 신규 리그를 명시적으로 시작한다.

## Parallel Work Breakdown
단일 에이전트가 API/DB → UI → 검증 → PR을 순차 처리한다.
Owned: v1 리그 생성·상태·경기 시작 소스, schema/additive migration, 관련 테스트/MSW/API 문서/QA/changeset.
Forbidden: 기존 운영 DB 변경, 공유 작업 폴더의 타 작업, main 대상 PR, dev 머지·실배포.
UI는 사용자가 승인한 기존 대회 방식이며 기존 헤더 Button·상태 모달을 재사용한다.

## Acceptance Criteria
- [x] 기존 7개 상태의 실제 migration 전후 데이터 보존 및 Prisma drift 0.
- [x] API 기존/신규 모드 unit 186개 통과.
- [x] 관련 DB assertion·시리즈 unit·양쪽 타입·표면/패턴 검사 검증(전체 DB runner 종료 대기는 아래에 별도 기록).
- [x] API 계약·정본 결정 이력·MSW·changeset 동기화.
- [ ] 정확한 파일 범위의 dev PR 검토·CI 정상 종료 확인.
- [ ] Alpha 로그인·390/768/1440·console/network·before/after 검증(머지 후).

## Tech Debt Resolved
대진 준비와 실제 시작의 결합을 해제한다. closed 상태만으로 구분하던 첫 로컬 구현은 기존 closed 행도 바꿀 수 있어 PR 전에 전용 모드로 보완했다.

## Security Notes
새 DTO 권한 우회 없이 getMutationAdmin·기존 감사 로그를 재사용한다. 게임 게이트는 커맨드 트랜잭션 안에서 상태 변경 전에 검사한다. 테스트는 운영 데이터와 분리된 전용 PostgreSQL과 승인된 integration DB 이름만 사용한다.

## Risks & Dependencies
- V1Tournament.requiresExplicitStart는 NOT NULL DEFAULT false다. 기존 행과 구버전의 신규 INSERT는 false이며 새 생성 공통 함수만 true다. migration 먼저 → 새 API 배포 순서를 따른다. 롤백은 컬럼을 남기며 데이터 재작성 없이 구버전으로 돌아갈 수 있다.
- 최초 공유 폴더의 무관한 WIP를 보존하고 최신 origin/dev 격리 worktree로 이번 변경만 이전했다. 공유 generated Prisma client를 덮어쓰지 않고 별도 client를 생성했다.
- Docker CLI는 WSL 오류라 Unix socket API를 사용했다. 시작 전 실행 컨테이너는 없었고 작업 소유 codex-league-start-compat만 생성·사용한다. 종료 때 이 컨테이너만 제거한다.
- Alpha 검증은 미배포이므로 0/3이다. PR 본문에 머지 후 갤러리 사유를 명시한다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-18 | 기존 closed도 수동 시작으로 바꾸나? | 아니오. 기본값 false의 별도 모드로 모든 기존 상태의 동작을 보존한다. |
| 2026-10-18 | 모집 재오픈을 막나? | 기존 마감 시각 계약을 유지하고 실제 모집 여부를 별도 표시한다. |
| 2026-10-18 | PR 이후 자동 머지하나? | PR 생성만 요청됐으므로 머지·배포하지 않는다. |

## Progress Snapshot

### 2026-10-19: 시작 취소 후 모집 마감 복귀 (fix/league-status-rollback)
- Context / Goal: 진행 중을 모집 마감으로 되돌리고 dev 대상 PR을 생성한다. 머지·배포는 범위 밖이다.
- Owned: 리그 상태 서비스·모달·관련 회귀 테스트·API 계약·changeset·본 작업 문서. Forbidden: 운영 DB 변경, 다른 작업트리, main.
- Original Conditions / User Scenario: 관리자가 상태 변경에서 모집 마감을 선택하면 아직 시작한 경기가 없는 리그가 closed로 복귀하고 다시 시작할 수 있어야 한다.
- Test Scenarios: active → closed → active, 시작한 경기 차단, 멱등성, 모달 선택·성공·API 실패 표시. 기존 보류·종료 권한과 오류를 보존한다.
- Parallel Work Breakdown: 단일 에이전트가 순차 구현·검증·PR 생성한다.
- Acceptance Criteria: [x] 상태·화면 회귀 통과; [x] 양쪽 타입·surface/pattern 검사; [ ] dev PR 생성; [ ] CI·Copilot 결과 확인.
- Tech Debt Resolved: 호환용 draft API 값과 실제 closed 수명주기를 구분한다.
- Security Notes: 기존 mutation-admin 확인·시작 경기 차단·조건부 UPDATE·감사 로그를 유지한다. 신규 권한·스키마 변경 없음.
- Risks & Dependencies: API의 draft 요청/응답과 감사 action은 호환성을 유지하고 저장 status만 closed로 바꾼다. 신청 마감 시각·공개 여부·대진은 보존한다. UI는 기존 상태 모달의 목표 라벨과 설명만 맞춘다.
- Ambiguity Log: 사용자 요청의 '반대'는 진행 중 → 모집 마감 복귀이며, 이미 경기가 시작된 리그는 기존 차단을 유지한다.
- QA: alpha 화면 검증은 미배포이므로 0/3. PR 생성 범위에서 머지하지 않으며 갤러리는 머지·alpha 배포 이후 보완한다.
- 검증 증거: API 상태 unit 4/4, Web 모달 9/9 PASS. API 타입·surface PASS. 공유 Prisma client가 최신 스키마와 달라 최초 unit은 실행 전 타입 오류로 실패했으며, /tmp의 전용 client와 타입 매핑으로 검증했다(공유 client 변경 없음). Web 최초 2건 실패는 beforeEach가 mock 함수를 cleanup으로 반환하던 테스트 결함으로, 반환 제거 후 9/9 PASS.
- DB integration은 Docker daemon 미기동으로 로컬 미실행. 기존 실제 HTTP integration에 closed 저장·detail 투영·멱등·재시작 단언을 추가했고 CI에서 확인한다. 개발 서버·브라우저·운영 DB는 실행/변경하지 않았다. 임시 보조 소스는 삭제했다.
- Web 첫 타입 검사는 누락된 persist/validator 패키지와 기존 leave-team 테스트의 mutate 인수 누락 2건으로 실패했다. /tmp에 manifest 버전의 누락 의존성을 설치하고 작업트리 전용 링크로 보완했다(공유 설치 변경 없음). 후자는 `apps/v1_web/src/hooks/use-v1-api.leave-team.test.tsx`의 두 호출만 `mutate(undefined)`로 명시해 타입 오류를 바로잡고 해당 2개 테스트도 검증한다. 이 파일을 Owned에 포함한다.
- 최종 Web 검증: 타입·pattern PASS, 모달 9/9 + leave-team 2/2 PASS(최소 worker 1, 정상 exit 0). 임시 npm 설치의 Query peer 버전 중복은 관련 패키지 5.102.8 고정으로 해소했다. API 타입·surface PASS와 합쳐 양쪽 정적 검증 완료. Alpha는 미실행이며 DB integration은 CI에 남는다.
- 실제 전체 기존 migration 체인 재생 성공. 신규 migration 뒤 기존 7개 상태 전체 컬럼 snapshot 동일, 새 필드 전부 false. fixture 정리 완료.
- Prisma migrate diff: No difference detected.
- 모드 분리 후 API 4개 unit suite 186개 + 시리즈 2개 suite 6개, 고유 unit 총 192개 통과.
- 초기 DB suite 시작은 설치된 jest-environment-node 연결 누락으로 0 tests 실패했다. 격리 dependency 링크를 보완했다.
- 첫 Nest 전체 import가 Windows 마운트에서 15초 hook 제한을 넘어 후속 템플릿 복제도 실패했다. 해당 테스트 프로세스 종료와 base DB 연결 0을 확인하고, 로컬 실행에만 --testTimeout=120000을 적용해 재검증한다. 저장소 제한/검증 assertion은 바꾸지 않는다.
- 이전 로컬 UI 검증은 API176/Web38·양쪽 타입 PASS였다. 신규 marker 도입 후 backend 및 최신 dev에서의 최종 검증을 진행 중이다.
- 코드에 신규 runtime 파일/미추적 import 없음(신규 소스 파일은 spec뿐), dependency 링크·개인 설정·환경 파일은 PR 범위에서 제외한다.

### PR final validation progress
- DB integration 7개 suite 68개 assertion PASS. 해당 로컬 Jest가 종료 대기에 남아 명령을 확인한 소유 PID만 SIGTERM으로 정리했다. command exit를 PASS로 바꾸거나 forceExit로 숨기지 않는다. 신규 migration 단독 DB 회귀는 1/1 PASS, 정상 exit 0이며 기존 데이터 snapshot과 구버전 INSERT를 검증했다.
- API 타입 검사 PASS. 표면 검사가 불필요하게 추가된 raw 잠금 1곳을 검출해 제거했다. 상태 UPDATE의 기존 CAS를 유지하며, API surface는 baseline 32/32로 PASS다. 관련 상태 unit을 다시 확인한다.
- 최종 Web38·양쪽 타입·API surface·Web patterns 모두 PASS. 신규 marker 0, git diff --check PASS, exact pathspec 34개 파일 확인. 작업 소유 PostgreSQL 컨테이너·볼륨은 제거했고 테스트 프로세스도 종료됐다. 커밋 SHA 기준 migration/changeset 게이트와 PR/CI가 후속이다.

### PR #1977 CI follow-up (2026-10-18)
- Head 613a3dded의 CI run 39129731346: Web PASS, Gates/API FAIL. 실패 원인은 스키마 체크섬 미동기화와 신규 리그를 자동 시작으로 가정한 기존 통합 스펙 4곳이다.
- 실제 신규 스키마 SHA-256 23d87a502b12225fce2a6c5926cc272c14212da9da957cf4f5c26fb26b076644로 현재 binder·Docker client attestation·game snapshot을 갱신하고, manifest 생성·검증에는 기존 허용 체크섬을 보존하며 추가한다. M11·StageB 고정 계약은 바꾸지 않는다.
- 공개 상태 필터는 대진 생성 후 draft 유지, 실제 시작 API 후 active를 모두 단언한다. 시즌 승계·경합 fixture는 실제 시작 API를 거쳐 원래 검증 목적을 유지한다. 생성 dual-write 스펙은 closed+명시적 시작 모드를 확인한다.
- final-schema-binding 7/7 PASS. 첫 로컬 실행의 manifest 실패는 jq 미설치 때문이며, 공식 jq 임시 도구 설치 후 동일 계약·부정 테스트까지 통과했다.
- GitHub Advanced Security run 39129735820은 `session.create failed: Model "claude-opus-5" is not available`로 분석 시작에 실패했다. 코드 finding/clean 리뷰가 아니며 모델·계정 설정을 바꾸거나 반복 요청하지 않는다. Copilot 제출 리뷰·inline comment는 현재 0건이다.
- CI에서 실패한 5개 DB suite + 기존 데이터 migration 회귀 1개를 전용 DB에서 직렬 재검증: 6 suites/30 tests PASS, 정상 exit 0. 전체 migration deploy도 PASS. bash syntax·git diff --check PASS. 전용 DB/볼륨 정리 후 보완 커밋을 push하고 새 CI를 확인한다.
- 보완 API 타입 검사 exit 0. 이미지 빌더 client attestation과 release manifest 생성 허용 목록까지 canonical SHA와 5곳 일치 확인.
