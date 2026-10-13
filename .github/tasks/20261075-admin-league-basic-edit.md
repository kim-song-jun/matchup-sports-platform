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


## 2026-10-14 — 생성/수정 포맷 통일
- 사용자 요청으로 생성 화면을 시각 기준으로 고정했다. 동일한 기존 포맷을 재사용한다.
- Owned: league-basic-fields.tsx, league-matches/new/page.tsx, league-settings-client.tsx 및 회귀 테스트. API/DB 및 기존 미커밋 WIP는 변경하지 않는다.
- 기본 입력을 공유해 이름 → 종목/지역 → 기간 순서, 라벨, 입력창, 날짜 범위 검증을 통일한다. 수정 너비도 생성과 같은 max-w-2xl이며 총 경기 수는 기존 공유 필드를 재사용한다.
- 설명·신청 마감·오류/초안 보존·동시 수정·읽기 권한 보호는 유지한다. 종목 변경과 팀 구성/명단/경기 시간 설정 계약 확장은 이번 시각 통일의 범위 밖이다.
- [x] 생성/수정 회귀 테스트 및 diff 검증: 생성 14/14, 수정 9/9 PASS; 웹 tsc --noEmit --incremental false PASS; git diff --check PASS; touched-path TODO/FIXME/HACK/XXX 신규/잔여 없음.
- [ ] alpha 배포 후 390/768/1440 화면·console/network 검증 (현재 변경 미배포).
- Resume: fix/league-edit-create-format, tmp/worktrees/league-edit-format, base d10ce4df4.
- 생성과 같은 전체 너비의 저장 CTA를 사용하고 상세 복귀/재조회는 그 아래 보조 액션으로 유지한다.
- 초기 검증은 기존 설치의 query persist 패키지 누락으로 수집 실패했다. 격리 작업트리 설치 후 수정 9개 PASS, 생성은 Node 18 설치에서 제외된 Tailwind native optional dependency로 수집 실패했다. Node 22로 의존성을 설치한 후 생성 14개 PASS. lockfile/package.json 변경 없음. Vitest는 모두 단일 워커, 실행 종료 확인. 테스트용 API는 MSW이며 alpha 실측 증거로 취급하지 않는다.
- Alpha 실측 blocker: 변경은 로컬 격리 브랜치에서 검증했고 배포하지 않았다. 이 세션에는 실제 브라우저 QA 도구도 제공되지 않는다. UI 검증/배포 완료 또는 PR-ready로 판정하지 않는다.

### 배포 요청 후 CI 보정
- 사용자 요청: 추가 리뷰 없이 dev 머지 및 alpha 배포. main 승격은 하지 않는다.
- PR #1907 첫 CI는 기본 필드 추출로 줄어든 raw font size baseline(13 → 6) 미반영으로 Web 실패. 기준을 실제 6곳으로 낮춘다.
- API는 변경과 무관한 취소 알림 통합 테스트에서 HTTP 응답 직후 비동기 팀 이름 조회 완료를 가정해 0/2 알림으로 실패했다. 실제 대상 leagueId의 두 알림을 최대 5초간 기다린 뒤 동일한 개수 검증을 수행한다. production 서비스/API 계약은 변경하지 않는다. 알림 누락 시에는 그대로 실패한다. 관련 증거 업로드 실패는 선행 통합 단계 실패로 manual QA가 실행되지 않은 결과다.
- API 통합 검증은 GitHub CI의 실제 PostgreSQL에서 수행한다. 로컬 Docker daemon은 제공되지 않는다.
- 두 번째 CI의 Web은 759개 파일/8,988개 테스트 PASS, 기존 email-login-client 약관 갱신 목적지 테스트 1개 FAIL. 공통 resolveAuthContinuationPath 계약은 필수 인증 URL을 유지하고 `/my`는 세션에 보존하지만 해당 테스트만 URL query에 직접 붙기를 기대했다. 테스트를 실제 `/terms?mode=renewal` 이동 + 저장 목적지 `/my` + 최종 인증 성공 후 `/my` 소비/정리까지 검증하도록 동기화한다. 인증 production 코드는 변경하지 않는다.
- 로그인 소비자 7개 + 공통 인증 목적지 24개 = 로컬 31/31 PASS. 두 번째 CI의 API와 Gates 전체 PASS. 최종 커밋 CI 재검증 후 dev 머지한다.
