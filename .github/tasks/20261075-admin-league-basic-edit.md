# Task 20261075: 어드민 리그 기본 정보 수정

Status: Review
Owner: Codex (sequential)
Created: 2026-10-13

## Context
사용자가 정규 리그 개설 후 리그명·설명·기간·모집 조건을 수정할 수 없다고 제보했다. 최신 dev 9e9a01925의 리그 상세에는 개별 설정만 있고 기본 정보 수정 route/API가 없다.
## Goal
리그 상세 → 별도 수정 페이지 → 현재 정보 확인/변경 → 실제 원자적 저장/재조회.
## Original Conditions
리그명, 설명·운영 안내(rulesText), 지역, 시작/종료일, 신청 마감과 총 경기 수 계획을 수정한다. 종목/참가팀/대진/참가비는 기존 전용 흐름을 유지한다. 스키마 변경 없음.
## User Scenarios
운영자가 리그 수정 진입, 실제 route entity GET, 값 변경, 저장 성공 후 상세 복귀. 실패 시 입력 보존. 오래된 버전·다른 kind·권한 부족·종료/취소 상태는 거절.
## UI Decision
A 별도 페이지(추천) / B 팝업 / C 항목별 편집을 비교했고 사용자가 A를 선택했다. 기존 admin header·폼 토큰·fieldset 재사용.
## Test Scenarios
DTO 실제 ValidationPipe; 실제 DB 저장/재조회·audit·stale·support·대회 kind·기간 축소/기존 경기 보호. 웹 MSW GET/PATCH·KST 날짜·실패 입력 보존·정확한 리그 수정 링크.
## Parallel Work Breakdown
서브에이전트 없음. backend 계약 → frontend → 좁은 검증 → 타입/CI → alpha 실측.
Owned: league settings DTO/helper/controller wrappers, 별도 hook/type/edit route, 상세 수정 링크, 관련 테스트/API 문서/changeset.
Forbidden: 기존 WIP, main push, DB reset, 다른 도메인 변경.
## Acceptance Criteria
- [x] 3안 제시 → A 선택.
- [x] 현재 route의 실제 정보로 수정 화면 hydrate.
- [x] 모든 노출 필드 영속 저장, 원자적 audit 및 재조회.
- [x] 권한·동시 수정·진행 상태·기존 경기 보호.
- [x] 실패 초안 보존 및 오류 재시도.
- [x] 총 경기 수 계획(1~500/null)을 수정하고 기존 대진은 보존.
- [ ] 단위/통합/타입·CI 및 alpha 화면 증거.
## Tech Debt Resolved
기본 정보 수정 entry/API 부재, 기존 개별 설정과 일관된 cache invalidation.
## Security Notes
V1AuthGuard + getActiveAdmin/getMutationAdmin, regular_league kind, deletedAt guard. 수정 버전 검증 및 tournament row lock.
## Risks & Dependencies
완료된 리그는 수정 차단. 기존 경기 일정 자동 이동 없음; 새 기간 밖의 기존 경기는 기간 변경 거절. rulesText를 설명·운영 안내 저장 항목으로 사용한다. 사용자 제공 관리자 계정으로 alpha 로그인 성공. 비공개 자격증명은 /tmp 파일에만 보관하고 QA 종료 후 삭제.
## Ambiguity Log
2026-10-13: 사용자 기본 정보 수정으로 명확화, A 별도 페이지 선택. 모집 조건은 신청 마감이며 자동 상태 전이는 없음. 현행 정규 리그는 2026-09-03 사용자 결정에 따라 정원 제한 없음(registration-capacity.ts); teamCount 편집 제외.
## Progress Snapshot
GET/PATCH settings, 별도 edit route, 실제 hook/타입, 상세 수정 entry, 공개 운영 안내 구현. DTO 17 PASS, 실제 HTTP/DB 3 PASS, 기존 상세 103 PASS, 새 수정 폼 6 + 공개 상세 61 PASS. 초기 ConfirmModal 렌더 오류 RED 후 수정 GREEN. API/web tsc, API surface, 웹 pattern PASS. 관련 테스트 총 190개 PASS. Alpha 변경 전 390/768/1440 실제 로그인/스크린샷: 수정 entry 없음, overflow/pageerror/console error/관리 API 실패 0. 최소 워커 검증, 격리 PostgreSQL 종료 완료.
Base 9e9a01925, fix/admin-league-basic-edit, _worktrees/fix-admin-league-basic-edit. 구현/로컬 검증 완료, dev PR 리뷰·CI 및 배포 후 QA 대기.

2026-10-13 추가 작업: 후속 브랜치 `fix/league-mobile-copy-autostart`에서 설정 GET/PATCH·감사 로그·수정 화면에 `plannedFixtureCount`를 포함했다. 값 변경은 대진 생성 기본값과 자동 종료 기준만 바꾸며 기존 대진은 건드리지 않는다. 대진 생성·미리보기·재생성에서 `fixtureCount` 생략 시 0경기가 되던 `slice(0, undefined)` 경로도 공통 보정했다. API 전체 단위 6,086건, 관련 웹 128건, API/web 타입·표면·패턴 검사를 통과했다. 로컬 격리 PostgreSQL이 없어 설정 및 quick-result 통합 스펙은 CI에서 확인한다.

Surface gate: 단건 조회는 canonical findTournamentOnSurface(LEAGUE_KINDS) 사용. Prisma 미지원 행 잠금 SQL 1곳은 kind/deletedAt 조건·직후 재조회 근거와 함께 raw-SQL baseline에 등록. 신규 폼/운영 안내 글자 크기는 tm-text 토큰 사용.
