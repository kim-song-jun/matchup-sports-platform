# Task 20261082: 리그·대회 경기 장소와 경기장(필드) 목록 통합

Status: Review — implementation/local validation PASS; DB integration and alpha QA pending
Owner: Codex (단일 실행)
Created: 2026-10-14

## Context / Goal
사용자 승인: 스태프 아래 경기장 등록, 기존 장소 이름별 목록, 경기별 필드 선택. 후속 **“싹 다 해줘”**로 기존 미배정 경기 자동 연결 및 새 경기/장소 수정의 자동 등록·배정까지 확장했다. 리그·대회 공통. Task 20261081 브랜치에서 이어가며 main/운영 데이터는 직접 변경하지 않는다.

## Original Conditions
- [x] 스태프 배정 아래 기존 경기장 등록 영역 재배치·정리.
- [x] 기존 경기 장소를 대회/리그별 이름 기준으로 중복 없이 필드 목록에 추가하는 migration/API 구현 (실제 DB 적용 대기).
- [x] 리그·대회 경기 설정에서 등록 필드 선택 및 장소/필드 동시 저장.
- [x] 기존 장소·주소·좌표·필드 ID·종료 경기 보존 계약 구현·unit 검증 (DB round-trip 대기).
- [x] 기존 권한 유지, 다른 대회 필드·비활성 필드 거절, 실패 숨김 없음.

## User Scenarios
운영자가 스태프 화면에서 기존 장소와 새 필드를 확인한다. 경기 생성/설정에서 등록 필드를 선택하거나 새 장소를 입력하면 필드 등록·배정을 함께 저장한다. 기존 미배정 경기까지 이름으로 연결하며 공개 일정/상세/목록과 공용 팀매치 상세는 필드 이름 하나로 표시한다. 실제 주소·좌표는 역사적 스냅샷으로 보존한다.

## Test Scenarios
- [x] 같은 대회 이름 중복·공백/대소문자 정규화, 다른 대회 같은 이름 독립.
- [x] 장소 미정 제외, 기존 배정 유지, 주소·좌표 보존.
- [x] 필드 선택 atomic save, 유효 범위/active 검증, 장소와 필드 충돌 입력 거절.
- [x] 기존 입력 폼·필드 배정·담당 권한·오류/캐시 회귀.
- [x] schema/migration/Prisma/API/types/mock sync.

## Parallel Work Breakdown
병렬 에이전트 요청 없음. 아래 Phase를 순차 실행한다.
### Phase 1: data/contract
- [x] 필드 장소 스냅샷 + additive migration + 기존 이름 registry backfill 및 미배정 경기 연결 (기존 배정/장소 불변).
### Phase 2: API
- [x] 기존 필드 배정과 경기 설정의 공통 장소 저장 계약.
### Phase 3: frontend
- [x] 승인된 스태프 영역 배치와 등록 필드 선택 공용 컨트롤.
### Phase 4: validation/docs
- [x] 좁은 테스트/타입/표면/패턴/diff 검증 및 API·시나리오 문서.
- [ ] alpha 390/768/1440 로그인·console/network·before/after QA.

## Owned / Forbidden Scope
Owned: V1TournamentField additive schema/migration; fields 서비스/DTO; 경기 생성/수정의 place-field helper와 호출부; staff-client; 경기 설정 컨트롤; hooks/types/MSW; 관련 unit/integration fixture; API/task/scenario/changeset.
Forbidden: 다른 WIP·legacy·환경파일·운영 DB 직접 실행·main 승격·이미 배정된 필드 ID 자동 변경·기존 장소 일괄 덮어쓰기.

## Acceptance Criteria
- [ ] Original Conditions 및 변경 계약 검증 충족.
- [x] 새 marker/권한 우회/partial save 없음, additive migration 포함.
- [x] API/types/mock/doc sync, intended diff 확인.
- [x] 미실행 DB/alpha QA는 명시하고 완료로 계산하지 않는다.

## Tech Debt Resolved
장소와 fieldId가 별개 API 호출로 부분 성공하는 흐름 제거. 필드 수정 API가 이미 존재하는데 불가능하다고 안내하는 stale 문구 정리.

## Security Notes
직접 catalogue create/update/import는 platform_ops, 기존 필드 배정은 tournament_admin. admin 경기 생성/수정 권한 안에서 입력한 새 장소의 자동 등록·배정을 허용한다. field_operator는 admin 경로에 접근하지 못한다. 스태프 grant 자체는 불변이나 기존 필드에 연결된 새 경기는 기존 field scope 적용 대상이 된다.

## Risks & Dependencies
DB/Docker 미가동 및 브라우저 sandbox 초기화 오류. backfill은 정상 배포의 migration deploy에서만 반영하며 로컬/alpha 데이터에 직접 실행하지 않는다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-14 | 기존 경기 fieldId도 이름으로 자동 배정하는가 | 후속 “싹 다 해줘” 승인으로 미배정 경기만 자동 연결. 기존 fieldId/장소/결과는 보존 |
| 2026-10-14 | 같은 이름의 서로 다른 주소 | 이름은 하나로 모으되 단일 장소가 확정되지 않으면 공용 핀을 임의 선택하지 않는다. 기존 경기의 동일 이름 장소는 보존 |
| 2026-10-14 | UI 3안 재선택 | 사용자 직접 지정: 스태프 배정 아래 등록, 경기 설정에서 등록 필드 선택. 이 명시 승인 배치로 구현 |

## Progress Snapshot
- [x] 최신 origin/dev=792042b7d 확인, Task 20261081 변경 보존.
- [x] 지침 및 fields/place/fixture/staff 계약 확인.
- [x] Phase 1 implementation
- [x] Phase 2 implementation
- [x] Phase 3 implementation
- [ ] Phase 4: local PASS, DB/alpha pending

## Validation / Handoff

### 후속 전체 연결 변경
- 배포 게이트 보완: CTE INSERT/UPDATE 세 문장을 expand-contract 정식 review 목록에 **정확한 SQL 문자열**로 등록했다. field 생성은 NOT EXISTS/ON CONFLICT, metadata 갱신은 NULL snapshot+유효·단일 위치, 경기 연결은 NULL field_id+같은 competition 이름 lookup으로 제한한다. 기존 place/result/staff/배정 ID 불변 및 이전 API rollback 호환 근거 포함. 기존 negative controls/allowlist integrity/base diagnostics와 실제 dev→HEAD 검사 PASS. 이전 전체 CI의 Web 9048/9049·DB 1192건 통과 후 구 표시 기대값·해제 거절 검증·source schema pin을 수정, 로컬 공개 records 75/75 PASS.
- 2026-10-14 dev 배포 승인: PR #1920 (base dev), 최신 dev 병합 후 TypeScript/API·Web PASS 및 병합 회귀 77/77 PASS. 최초 CI Gates가 새 스키마 binding 미갱신을 검출해 Docker final attestation·steady binder·alpha manifest builder·historical allowlist를 committed LF schema SHA256 `25c3ae304406a5be304731fc9d3aa4251d6a0faf77acbbbecf3f23a975ddd572`로 sync. StageB/M11 고정값과 역사적 hash는 보존. 로컬 binder 정상/변조 거절은 WSL 임시 LF copy로 검증; manifest validator는 WSL jq 미설치로 CI 검증에 위임. 브라우저 연결 재시도도 kernel reset으로 실패.
- [x] 기존 미배정 경기 migration/import 연결, 종료 경기 포함. 기존 ID와 장소 스냅샷은 불변.
- [x] 리그 자동/수동 생성과 대회 공통 생성, 양쪽 장소 수정의 등록·배정 atomic save.
- [x] 공개 일정/상세/목록·공용 팀매치 read의 필드 이름 단일 표시. 길찾기 실제 좌표 유지.
- [x] 이미 등록된 동명 장소에 다른 주소를 입력하면 명시적 FIELD_PLACE_CONFLICT. nullable fieldId만 보내도 남아 있는 장소를 재연결.
- [x] 실제 장소가 남은 DELETE field는 FIELD_PLACE_LINK_REQUIRED로 거절. 모바일은 등록 필드 선택만 제공해 장소/필드 분리 방지.
- [x] Game → TeamMatch → 이름 advisory lock 순서로 import/수정 정렬. 새 조회 뒤 기존 종료 리그 NOWAIT 게이트도 검증.
- [x] 최신 좁은 API 173개 PASS + fields/helper 최종 24개 PASS. 프론트 단일 이름/길찾기 포함 103개 PASS (일정 복귀 4건의 모호한 tab selector를 단계 tablist로 좁혀 RED → GREEN).
- [x] 공용 TeamMatchesService 조회 회귀 144/144 PASS. 최종 API/Web tsc, API surface, Web pattern 및 diff --check PASS. touched source marker 없음. 모든 테스트 프로세스 종료, 새 서비스/브라우저 프로세스 없음.
- 자동 승인 검토는 기존 장소 이름 일괄 변경 및 해제 시 주소 삭제를 거절했다. 해당 변경은 적용하지 않고, 역사적 데이터 보존 및 미배정만 연결하는 대안을 적용했다. 별도 위치 삭제 승인은 요청하지 않음.
- 후속 fetch origin/dev=`dde8964c` 확인. 작업 base는 `792042b7d` 유지; 원격 커밋 흡수/공유 WIP 변경 없음. 배포 전 최신 dev 병합 및 committed-tree 검증 필요.

아래는 선행 단계 검증이며, 배정 해제/자동 연결 계약은 위 후속 변경이 우선한다.
- Backend fields+helper 최신 검증 21/21 PASS (주소 충돌 후 스냅샷 갱신·재실행·경기 불변 포함). 경기 수정 30, league admin/public schedule 95, public record 14 관련 unit PASS.
- Frontend 관련 unit 318개 PASS: staff/picker/리그 설정/대회 설정/모바일/공개 표시/실제 hook cache invalidation. 기존 React act 경고는 league fixtures 테스트에서 관측됐으며 숨기지 않음.
- 양 앱 tsc PASS, API surface 및 Web pattern PASS (Windows에서는 Git Bash 기반 scripts 실행), Prisma generate PASS. diff --check PASS; touched source 새 TODO/FIXME/HACK/XXX 없음.
- DB integration 추가했으나 Docker daemon 미가동, DATABASE_URL 환경 미설정으로 미실행. migration replay/drift/실제 데이터 round-trip은 CI/배포 전 필수.
- alpha 미배포 및 브라우저 sandbox 초기화 실패: 390/768/1440 screenshot·console/network·실제 로그인 verdict 없음. 테스트 통과를 QA 완료로 계산하지 않음.
- [시나리오](../../docs/scenarios/competition-place-field-registry.md). branch `feat/league-schedule-filter`, base origin/dev `792042b7d`; Task 20261081과 같은 분리 worktree. 커밋/push/merge/DB 적용/배포/main 변경 없음. PR-ready 아님.
