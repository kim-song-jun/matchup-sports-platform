# Task 20261102: 대회 목록·상세 이미지와 상세 노출 설정
Status: Review
Owner: Codex (단독 순차 작업)
Created: 2026-10-22

## Context
사용자는 대회도 리그와 같은 목록·상세 2장 구성으로 변경하고 상세의 종목 기본 이미지까지 숨길 수 있기를 요청했다.
## Goal
등록/초안 재개/관리자 수정의 이미지 저장 계약과 공개 목록/상세 표시를 일치시키고 dev 대상 PR을 생성한다. 추가 사용자 요청에 따라 #2032 dev 머지·alpha 배포 및 결과 기록까지 수행한다.
## Original Conditions
- [x] 대회 목록·상세 이미지 2장
- [x] 상세에서 업로드가 없으면 종목 기본 이미지 표시
- [x] 상세 이미지 표시 스위치를 끄면 기본 이미지와 영역/여백까지 제거
- [x] 구현 완료 후 dev 대상 PR 생성 (#2032)
- [x] 추가 요청: #2032 dev 머지·alpha 배포 및 공개 응답 확인
- [x] 별도 #2031(main→dev 이력 동기화) dev 머지 및 alpha 배포 확인 완료
## User Scenarios
운영자는 목록/상세 사진을 각각 올리거나 하나를 공유한다. 상세 표시를 껐다 켜도 사진은 보존된다. 관람자는 숨김 대회에서 제목·정보를 바로 본다.
## Test Scenarios
- Happy: 이미지 2장 저장/재조회, 상세 기본값 true, false 저장·재개·복원
- Edge: 한 장/둘 다 없음, 깨진 원격 이미지 종목 fallback, 완료 대회 상세
- Error: 읽기 전용 관리자·CAS 충돌·업로드/저장 실패 실제 오류 유지
- Mock updates: 관련 admin/presenter 테스트와 MSW response 동기화
## Parallel Work Breakdown
병렬 에이전트 없음. Owned: v1 tournament DTO/service/presenters/schema/migration, web tournament create/info/detail/image helpers 및 관련 테스트/API문서/changeset. Forbidden: 기존 공유 작업트리 WIP, main 승격, seed/reset.
## Acceptance Criteria
- [x] UI A/B/C 제시 후 사용자 A안 승인(2026-10-22)
- [x] DTO→저장→응답→공개 UI 계약 일치
- [x] 관련 테스트/타입 검증 및 diff/debt 검사
- [x] dev PR 생성, CI 상태 기록 (#2032, 61840a809; CI/Copilot 진행)
- [x] 공개 상세 사진/기본 그래픽 390/768/1440 실제 QA (2 routes × 3 widths = 6/6)
- [ ] alpha 관리자 업로드/숨김 저장/재표시 UI (인증 세션 미확보)
## Tech Debt Resolved
기존 커버 단일 업로더와 실제 상세 이미지 미표시 불일치 정리. 기존 홍보 이미지 데이터는 삭제하지 않으며 이전 홍보 커스터마이징 호환 유지.
## Security Notes
기존 관리자 쓰기 권한, expectedVersion CAS, 감사 기록을 재사용. 불리언은 DTO 검증, 이미지 URL 기존 문자열 계약 유지. 새 endpoint 없음.
## Risks & Dependencies
v1_tournaments/V1Tournament에 show_detail_image 기본 true 추가 migration 필요. list_image_url은 기존 컬럼 재사용. alpha 화면 QA는 이 PR 배포 이후 가능.
## Ambiguity Log
A안은 상세 노출 스위치로 확정. 두 장은 리그와 동일한 listImageUrl/coverImageUrl이며 업로드 없는 상세는 종목 그래픽으로 표시한다.
## Progress Snapshot
#2032 dev 머지/alpha 배포 SHA c184cff233af2f77a4c2f6842e1d9905fbe10278. source branch feat/tournament-two-images의 코드 작업은 dev에 반영됐다. PR CI39709551247 및 dev CI39715119478 모두 PASS, alpha39715119491 SUCCESS.
Phase 1 contracts / Phase 2 UI / Phase 3 validation·PR·deploy: completed. 공개 대표 사진+종목 기본 그래픽2 routes ×390/768/1440 =6/6 실측 완료. 관리자 저장 UI는 세션 미확보로 pending이며 Status Review를 유지한다.
증거 branch docs/pr2032-alpha-evidence, worktree /tmp/teameet-pr2032-evidence-worktree. before3장+after6장 및 README/evidence.json을 원래 PR에 SHA 고정 갤러리로 게시한다. 원본 shared WIP 보존, 실제 로컬 dev --ff-only 동기화 완료.

## Validation (2026-10-22, 아래 배포 전 원본 기록)
- API unit 185 PASS (admin service, DTO, public detail presenter), schema snapshot 5 PASS.
- Web 4 suites/153 PASS (create→payload/draft hydration, admin CAS+readonly, public open/completed hide/default, two-image resolution).
- API/Web full TypeScript 검사 exit0. API surface 및 Web pattern PASS.
- 임시 PostgreSQL 18.4-beta, localhost:56442에 전체 migration 재생 PASS, Prisma diff No difference detected, 실제 DB integration 1 suite/2 PASS. 사진 두 장/DB default true/숨김·복원/공개 목록·상세/권한·CAS 검증. 생성한 클러스터 종료·제거 확인.
- 배포 binding 계약 7 PASS (현재+이전 manifest 허용, schema/M11/checksum/client mismatch 거절). 최초 jq 부재 실패는 테스트 성공으로 취급하지 않았고 /tmp의 공식 jq 고정 실행파일로 재검증.
- 격리 작업트리 전용 Prisma client 생성. 공유 client와 원본 shared WIP는 수정하지 않음.
- 신규 debt marker 없음, git diff --check PASS. 신규 import는 동일 PR의 tournament-images-field.tsx이며 외부 dependency 변경 없음.
- Phase 1 contracts completed; Phase 2 UI completed; Phase 3 validation/docs completed, PR/CI in_progress.
- Alpha UI QA pending 0/3 (390/768/1440): 신규 이미지 작업 미배포로 after/console/network 미검증. PR 요청 범위는 PR 생성이며 신규 PR dev 머지는 승인받지 않았음. 머지 후 alpha 갤러리 게시 필요. baseline은 아래 후속 증거 참고.

## PR / baseline handoff
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2032 (base dev, 최초 head 61840a809). 31파일 scoped commit, committed-tree diff/check PASS, 추적 WIP 없음. 원본 shared tree 보존.
- Copilot review 요청 완료. 최신 head 리뷰/CI 성공 여부는 최종 보고 시 확인하며 clean으로 선판정하지 않는다.
- before alpha: 비로그인 공개 방문자, `/tournaments/aa100000-0000-4000-8000-000000000004`, 390/768/1440 캡처 `/tmp/teameet-tournament-images-before/{390,768,1440}.png` 및 evidence.json. 세 폭 모두 overflow false. 각 폭에서 선재 React hydration error #418 1건과 비로그인 auth/me 401을 관찰. 신규 UI와 무관한 배포 전 기준이며 after PASS로 취급하지 않는다.
- headed Playwright 소유 node PID43405/browser PID43424(PPID43405), 종료 후 두 PID 부재 확인. 임시 캡처 스크립트 제거. local Next 서버/alpha 데이터 쓰기 없음.
- #2031 merge cd901fa688e7226cdcaaa74ea1cd543d5d9cb864, matching CI run39705838073 SUCCESS. Windows 실제 dev worktree synced-dev-20261012를 --ff-only로 동기화 완료. alpha run39705838057 서버 반영·공개 배포 identity 검증 SUCCESS.

- #2031 alpha 실측(2026-10-22T01:50:42Z): landing HTTP200, x-teameet-commit=cd901fa688e7226cdcaaa74ea1cd543d5d9cb864, x-teameet-release=1.11.5-alpha.20261022.gcd901fa688e7. /api/v1/health success, checks.db=true. 신규 이미지 PR #2032는 아직 dev 머지/배포하지 않았으므로 이미지 after QA는 계속 pending.
- PR #2032 최초 code head 61840a809의 Gates PASS, API/Web CI 진행 중. Copilot 요청은 완료했지만 제출된 리뷰가 없어 clean으로 판정하지 않음. 후속 커밋은 이 task의 PR/배포/기준 화면 증거 동기화만 포함한다.

## #2032 배포 요청 — 2026-10-22
- 사용자 dev/alpha 배포 승인 및 Copilot 외부 오류 예외 명시 승인. 최신 head95d0dd865의 Copilot run39708108350은 모델 claude-opus-5 unavailable로 검토 전 실패; clean으로 표시하지 않는다. 예외 PR comment6330899608.
- CI39708104473: Gates/Web PASS, API unit 6852 PASS/1 FAIL(451 suites 중1). read-service 기존 테스트가 regular_tournament에는 listImageUrl이 없어야 한다는 이전 계약을 유지하고 있었다. 구현의 새 응답은 요청한2장 계약대로 필드를 제공한다.
- read-service fixture의 listImageUrl/showDetailImage 기본값을 sync하고, 대회/리그 목록 fallback·대회 상세의 두 원본 URL·표시 true/false를 모두 검증하도록 수정한다. assertion을 제거하거나 오류를 성공 처리하지 않는다.
- after merge: alpha 배포 SHA/health/공개 상세3폭 확인 및 PR 갤러리. 관리자 인증 세션 미확보로 실제 관리자 저장 UI는 별도 제한을 명시한다.

- CI 실패를 RED 증거로 유지하고 read-service suite 재검증 52/52 PASS(단일 worker). git diff --check PASS, 신규 debt marker 없음. 기존 구현/DB/API 계약은 유지하고 읽기 응답 테스트와 fixture만 동기화했다.

## #2032 배포 결과 및 공개 QA
- #2032 dev 머지 c184cff233af2f77a4c2f6842e1d9905fbe10278. PR CI39709551247 및 dev CI39715119478 모두 SUCCESS. Windows 실제 dev 작업트리를 --ff-only 동기화 완료.
- alpha run39715119491의 동일 SHA 공개 identity와 health/DB 정상 확인 후 공개 상세 390/768/1440(3/3)을 headed 브라우저로 캡처했다.
- 증거: docs/visual-qa/pr2032/README.md, before/after 각3폭 PNG와 evidence.json. 기능 코드 변경 없이 evidence 전용 branch docs/pr2032-alpha-evidence에 보관하고 원래 PR에 SHA 고정 갤러리로 게시한다.
- 공개 대표 이미지3/3 및 두 사진이 모두 null인 대회의 종목 기본 그래픽3/3, 총6/6 실측. 가로 넘침0/pageerror0. before의 hydration #418은 이번 after에서 미관찰. 비로그인 auth/me401, 보조 요청 중단 및 최초 fallback 진입 중단은 증거에 따로 기록했다.
- 사용자 외부 리뷰 오류 예외 승인 적용. 최신 Copilot run39709553504의 unavailable 모델 오류는 clean 리뷰가 아니다.
- 관리자 세션 미확보: alpha에서 2장 업로드/숨김 저장/재표시 실제 UI는 pending. DB통합 및 웹 회귀 PASS를 수동 QA로 바꿔 표기하지 않는다.
- 배포 요청 완료. 공개2경로6/6 실측 완료. 관리자 저장 UI는 인증 세션 미확보로 Review 상태 보존. 리포트의 오류·재캡처 이력을 생략하지 않는다.

## #2032 배포 결과 및 공개 QA
- #2032 dev 머지 c184cff233af2f77a4c2f6842e1d9905fbe10278. PR CI39709551247 및 dev CI39715119478 모두 SUCCESS. Windows 실제 dev 작업트리를 --ff-only 동기화 완료.
- alpha run39715119491의 동일 SHA 공개 identity와 health/DB 정상 확인 후 공개 상세 390/768/1440(3/3)을 headed 브라우저로 캡처했다.
- 증거: docs/visual-qa/pr2032/README.md, before/after 각3폭 PNG와 evidence.json. 기능 코드 변경 없이 evidence 전용 branch docs/pr2032-alpha-evidence에 보관하고 원래 PR에 SHA 고정 갤러리로 게시한다.
- 공개 대표 이미지3/3 및 두 사진이 모두 null인 대회의 종목 기본 그래픽3/3, 총6/6 실측. 가로 넘침0/pageerror0. before의 hydration #418은 이번 after에서 미관찰. 비로그인 auth/me401, 보조 요청 중단 및 최초 fallback 진입 중단은 증거에 따로 기록했다.
- 사용자 외부 리뷰 오류 예외 승인 적용. 최신 Copilot run39709553504의 unavailable 모델 오류는 clean 리뷰가 아니다.
- 관리자 세션 미확보: alpha에서 2장 업로드/숨김 저장/재표시 실제 UI는 pending. DB통합 및 웹 회귀 PASS를 수동 QA로 바꿔 표기하지 않는다.
- 배포 요청 완료. 공개2경로6/6 실측 완료. 관리자 저장 UI는 인증 세션 미확보로 Review 상태 보존. 리포트의 오류·재캡처 이력을 생략하지 않는다.

- 추가 공개 fallback 경로는 배포 후 선정하여 해당 경로의 before는 없다. 대표 이미지 경로의 before3장 + after3장, fallback after3장 및 각 evidence.json을 보존한다.
