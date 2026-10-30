# Task 20261103: 대회·리그 탐색 필터와 정렬

Status: Review
Owner: Codex (단일 세션)
Created: 2026-10-22

## Context
대회·리그 상태 분석 후 사용자가 상세 필터, 신청 접수 퀵 필터, 목록 우측 정렬 구성을 승인했다.

### PR #2094 후속 — 2026-10-30 문서 연결
- 원인: 레벨 조건의 OR가 공개 범위 OR를 덮어썼고, 개인 매치 지역명 검색 누락·개최순의 지난 일정 우선 노출·필터 시트 오류 위치가 실제 사용을 방해했다.
- 현재 계약: 레벨은 공개 범위와 AND, 검색은 지역명 포함. 개최순은 종료·취소 및 KST 오늘 이전에 일정이 끝난 항목을 제외하되 진행 중·오늘 일정·날짜 미정은 남긴다. 종료를 직접 고르면 과거 항목도 조회한다.
- 날짜·참가비 범위 오류는 해당 칸 밑에 표시하고 스크롤한다. 최소 참가비만 고른 요약은 `N원 이상`이다.
- Owned: 이 task, [필터 시나리오 후속](../../docs/scenarios/competition-discovery-filters-2026-10-22.md#pr-2094-회귀-시나리오), scenario index. 제품 코드는 #2094의 기존 변경을 유지한다.
- Acceptance: 위 경계 7개 시나리오의 기대 결과를 고정하고 API·Web 회귀 경로를 연결한다. 실제 alpha 결과는 실행 전까지 미검증으로 둔다.
- Phase 1 원인/코드/문서 대조 완료, Phase 2 시나리오 연결 완료. Phase 3 alpha 0/7·viewport 0/3(미실행).
## Goal
전체 데이터에 적용되는 필터·정렬과 유형별 필터 UI를 제공한다. 2026-10-22 사용자 요청에 따라 dev 대상 PR을 생성한다.
## Original Conditions
- [x] 진행 상태와 모집 상태 분리, 대회 정원·리그 마감·선택적 리그 정원 계약 반영
- [x] 대회: 종목·성별·기간·방식·참가비, 리그: 종목·기간
- [x] 목록 우측 최신/마감/개최 정렬, 모바일 시트·데스크톱 드롭다운
- [x] 공통 필터 유지, 시트 draft 선택 후 결과 보기
## User Scenarios
대회+풋살+혼성+접수중 조회. 진행 중 리그의 접수중 조회. 기간과 겹치는 시즌 조회. 정렬 변경과 뒤로가기 복원.
## Test Scenarios
- [x] 마감 경계·정원 점유·리그 준비 단계·비공개 제외 (단위·SQL binding·MSW 검증)
- [ ] 같은 계약의 PostgreSQL 통합 검증: DATABASE_URL 미설정으로 미실행
- [x] 필터 URL/초기화/탭 전환 및 API 요청 계약
- [x] 빈 결과/실패·페이지 변경
- [x] MSW 계약 동기화
## Parallel Work Breakdown
순차 구현: API/공유 계약 → UI → 좁은 검증 → 문서. 병렬 에이전트 없음.
Owned: 대회 read DTO/service/helper/presenter, 목록 UI/필터/타입/훅/MSW, 관련 테스트·문서·changeset.
Forbidden: 스키마·마이그레이션·환경파일·기존 무관 WIP·머지·배포.
## Acceptance Criteria
- [x] 필터·정렬이 페이지네이션 전에 서버 적용
- [x] 숨김 대회 draft/cancelled 공개 없음
- [x] 승인한 화면과 계약 구현, 좁은 테스트 및 diff 확인
- [ ] alpha 390/768/1440 실제 화면 검증 (미배포 시 명시적 미검증)
## Tech Debt Resolved
준비 중 범위 불일치, 리그 성별 필터, 빈 결과 오안내, 탭 전환 필터 소실.
## Security Notes
공개 상태 게이트 유지, 입력 DTO 검증, SQL 값 파라미터 바인딩. 신청 권한 판정 변경 없음.
## Risks & Dependencies
WSL Docker·통합 DB URL 없음. 공유 의존성을 연결하되 Prisma client는 격리 생성 필요. alpha 실측은 변경 배포 필요. PR 생성은 사용자 승인 범위이며 머지·배포는 이번 요청 범위 밖.
## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-22 | 리그 진행 의미 | 현 운영 단계 유지. 준비= draft/open/closed, 진행=in_progress |
| 2026-10-22 | 미정 날짜·종료+접수중 | 날짜 선택 시 미정 제외. 모순 조건은 빈 결과와 초기화 제공 |
## Latest dev correction
- Canonical worktree: `/tmp/teameet-competition-discovery-20261022`
- Branch: `feat/competition-discovery-filters-20261022`, base `origin/dev` = `c184cff23`.
- 최초 공유 작업폴더의 이전 dev 기반 변경은 보존하고, 최신 dev의 keyset SQL·가시성·선택적 리그 정원·페이지/복귀 경로를 유지해 포팅한다.
- 최신 리그에는 `maxTeams`가 있다(null만 무제한). 보류(on_hold)·isPublic=false 공개 제외를 유지한다.
- Prisma client는 공유 산출물과 달라 worktree의 별도 node_modules에 생성하며, canonical schema와 migration은 바꾸지 않는다.

## Progress Snapshot
- Phase 1 API/공유 계약: 완료. 기존 SQL keyset에 필터를 결합하고 명시적 정렬 cursor를 구분한다. API의 기존 기본 순서는 유지하며 새 UI만 latest를 명시한다.
- Phase 2 UI: 완료. 목록 우측 정렬, 모바일 시트, draft 적용, 공통 조건 보존/전용 조건 해제 안내, 페이지/복귀 경로 보존.
- Phase 3 로컬 검증: 최신 dev에서 Web 111개 고유 테스트 PASS (기존 묶음109 + 페이지 보존1 + 실제 목록 필터폼 SSR1). API 고유81개 PASS (read52 + query12 + DTO/presenter17). 연도0 입력 거절까지 확인했다.
- Web/API 전체 타입 검사 PASS. API 표면 검사706파일 및 Web 패턴 검사 PASS. git diff --check PASS, touched-path debt marker0.
- Phase 4 문서: API README/global/domain, 상태 검토 정정, 시나리오와 이 task, changeset 작성 완료.
- 실 DB 통합 0/5, alpha 수동 시나리오0/8 및 viewport after0/3. DB URL·Docker 없음, 변경 미배포로 alpha 검증 미실행.
- 계획 도구(update_plan)는 현재 런타임에 없어 이 문서로 상태를 추적한다.
- 사용자 PR 생성 요청 수신. 관련 29개 파일을 명시 pathspec으로 커밋·push하고 dev 대상 PR을 생성한다. DB/alpha 미검증은 PR에 공개하며 머지·배포하지 않는다.

## Verification evidence
- `/tmp/teameet-current-web-test.log`: seed18/card72/controls6/hook3/model10 =109 PASS.
- `/tmp/teameet-current-web-final-test.log`: controls7/hook3 =10 PASS (추가 페이지 보존 및 보류·비공개·리그 정원 fixture 포함).
- `/tmp/teameet-current-web-regression.log`: seed 추가1/model10 PASS, 기존 seed18은 선택 실행에서 제외(앞 실행에서 PASS).
- `/tmp/teameet-current-api-test.log`: API3 suites78 PASS.
- `/tmp/teameet-current-api-final-test.log`: query12 PASS, 정렬 cursor 혼용 차단·null 마감 접수 종료 판정 추가.
- `/tmp/teameet-current-api-dto-final-test.log`: DTO/presenter17 PASS.
- `/tmp/teameet-current-api-tsc.log`, `/tmp/teameet-current-web-final-tsc.log`: 전체 타입 검사, exit0.
- 최초 공유 작업폴더의 검증 로그는 최신 dev 결과로 합산하지 않는다.
- 개발 의존성은 기존 설치를 연결했고 누락된 persister는 /tmp에 설치했다. Prisma client는 이 worktree의 node_modules/.prisma에 격리 생성했다. 스키마·migration·manifest·lockfile·공유 생성물은 변경하지 않았다.
- 앱 서버·브라우저·DB 프로세스 시작0. 검증 runner 모두 종료 확인. 앱/브라우저/DB cleanup 대상 프로세스 없음.

## PR 검토 및 dev 배포 보완 (2026-10-22)
- 사용자 요청: #2033·#2034 검토 후 dev/alpha 배포.
- #2034 기존 CI: Gates/API PASS, Web 6 suites 58 failures. 새 discovery 훅 경계·진행/모집 문구·draft 적용 계약과 기존 테스트/MSW의 drift 확인.
- 훅 mock, 필터 파라미터, 정원 카드, 빈 결과 및 모바일/데스크톱 상세 복귀 회귀 검증을 새 계약에 동기화. 필터 링크의 현재 조건 accessible name 복원.
- 단일 worker 검증: paging18/load-more2/capacity24 PASS, kind27/controls7 PASS, return18/fetching2 PASS. Web 전체 tsc --noEmit --incremental false PASS.
- 원격 PR CI 및 머지 이후 matching dev push CI/alpha 배포·공개 health/SHA 확인은 계속 진행.
- Windows 검토 환경에 Docker daemon 없음. 기존 API CI SUCCESS를 확인했으며 DB reset/seed 수동 실행 없음.
