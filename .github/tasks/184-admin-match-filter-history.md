# Task 184: 관리자 매치 목록의 탐색 조건 복원 (#1520)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
#1520은 alpha 관리자 `/admin/matches`에서 검색 `1.0.3`·완료 상태로 상세를 조회한 뒤 browser Back 시 조건과 결과가 초기화되는 P2 결함이다. CSS 402/787/1180에서 실제 재현됐고, 상세 진입 전·Back 후 원본 6장이 공개돼 있다. 현재 v1 페이지는 상태 딥링크만 초기 읽기하며 검색·상태·페이지 변경을 URL에 쓰지 않는다. 열린 dev PR의 동일 관리자 목록 수정을 확인하지 못했다.

## Goal
목록의 검색·상태·페이지를 현재 history 항목에 보존하고 Back/Forward·새로고침에서 복원해 Ready for review PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev에서 독립 worktree·브랜치를 만들고 #1514/#1519 미병합 코드를 포함하지 않는다.
- [x] 검색·완료 상태에서 상세 조회→browser Back 후 입력·선택 상태·결과를 유지한다(초점 jsdom 검증; alpha after 대기).
- [x] 빠른 검색·상태 변경이 서로 덮어쓰지 않고 실제 빈 목록·API 오류를 구분한다(초점 검증).
- [ ] 초점 RED/GREEN·frontend lint·필수 aggregate·명시 pathspec 커밋·푸시·정확한 head CI를 기록한다.
- [ ] PR은 Ready/dev를 유지하고 실제 before 원본 및 승인된 alpha 배포 뒤 after 대기를 구분한다.
- [x] 병합·자동병합·배포·유료 리뷰 재요청 및 보호된 QA 데이터/권한/상태 변경을 하지 않는다.

## User Scenarios
### Scenario 1: 상세 조회 후 복귀
관리자는 `1.0.3`·완료로 한 경기를 찾고 상세로 이동한다. browser Back 후 같은 검색·상태와 목록을 확인하고 Forward로 상세에 다시 진입한다.
### Scenario 2: 연속 입력과 새로고침
검색 중 상태를 바꾸고 페이지를 이동한다. URL에는 최신 조건이 함께 남고 새로고침에서도 같은 조회를 한다. 검색 API의 300ms debounce를 유지하며 필터 변경은 첫 페이지로 돌아간다.

## Test Scenarios
### Happy path
- [x] 실제 route·공용 UI·jsdom history로 검색/완료→상세→Back/Forward 및 새로 마운트 복원
### Edge cases
- [x] 같은 act의 연속 검색/상태 변경, 외부 URL 복원, 페이지 이동/초기화, 알 수 없는 상태/잘못된 페이지
- [x] 검색 대기 중 상세 이동·unmount 후 오래된 timer가 URL을 덮지 않음
### Error paths
- [x] API hook 오류·재시도는 정상 빈 안내와 구분
- [x] 행이 있는 read-only 관리자는 상태 변경 동작을 얻지 않음; 쓰기 capability의 취소·Escape도 mutation 없이 조건 유지
### Mock data updates needed
API/schema 변경 없음. 외부 API hook 경계에 동일 synthetic 경기 fixture를 쓰고 실제 필터 결과를 렌더한다.

## Parallel Work Breakdown
### Frontend
- [x] 관리자 매치 route 전용 URL 조회 상태 및 회귀 테스트
- 화면 마크업·레이아웃·컨트롤을 바꾸지 않는 로직 전용 수정으로 CLAUDE.md의 A/B/C 설계 선택 대상이 아니다.
### Sequential
- [ ] 직렬 최소 worker 검증 → pathspec 커밋/푸시 → Ready PR → CI/Sonnet 확인
- [ ] 별도 승인된 alpha 배포 뒤 3폭 after·실제 브라우저 회귀
### Owned / Forbidden files
- Owned: `apps/v1_web/src/app/admin/matches/page.tsx`, 같은 폴더의 route 전용 query hook·테스트, 이 문서, 이슈 전용 changeset.
- Forbidden: 다른 관리자 목록, shared API hooks/types, backend/schema/권한, #1514/#1519 worktree, 다른 세션 변경, QA179·완료 QA 결과.

## Acceptance Criteria
- [x] URL/입력/선택 상태/API 요청/렌더 결과가 Back·새 마운트·외부 탐색에서 일치한다(초점 검증).
- [x] 검색·상태 연속 변경 및 debounce 중단이 조건/목록 URL을 유실시키지 않는다(초점 검증).
- [x] 필터 변경은 page1, 페이지 복원은 저장된 페이지이며 기존 권한·오류·빈 안내를 유지한다(초점 검증).
- [ ] 초점 검증과 전체 QA를 구분하고 before 실제 원본/after 대기·Sonnet 결과를 사실대로 기록한다.

## Tech Debt Resolved
관리자 매치 목록의 읽기 전용 상태 딥링크와 일회성 검색 상태를 탐색 가능한 URL 상태로 연결한다. 변경하지 않는 공용 목록 hook을 복제 수정하지 않는다.

## Security Notes
조회 조건만 저장한다. 인증·capability·서버 상태 변경 payload/API 계약을 수정하지 않는다. 환경 파일·자격증명을 읽거나 게시하지 않는다. 이슈의 공개 synthetic 데이터 증거만 사용한다.

## Risks & Dependencies
- 실제 alpha after는 별도 승인된 배포 대기. 로컬 Next 서버를 QA용으로 띄우지 않는다.
- jsdom history 검증은 Next 런타임·실제 브라우저·물리 기기 QA를 대신하지 않는다.
- Sonnet 리뷰 미도착은 검토 대기로 기록하며 모델 불가/HTTP429를 코드 리뷰로 계산하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 페이지도 보존할지 | 기존 page 단위 API를 그대로 사용해 같은 목록 위치를 복원하고 필터 변경 시 1로 초기화 |
| 2026-10-02 | Codex | history 갱신 방식 | Next 공식 native History 연동을 사용해 현재 항목만 replace, local draft로 연속 입력을 병합; 검색 API만 debounce |
| 2026-10-02 | Codex | 다음 큐 우선순위 | 부모 지시대로 #1520 P2 우선, #1518 P3와 #1522 표시 수정은 독립 브랜치 후속 |

## Progress Snapshot
- base `98a2a9e93`; worktree `/tmp/teameet-issue-1520-20261002`; branch `fix/issue-1520-admin-match-filter-history`.
- 실제 before: 이슈 #1520의 f9c2d024576f16ea8b35b29da83cb196c61e2498 고정 공개 이미지 6장 다운로드 성공. CSS402×606에서 JPEG402×605, CSS787×505/JPEG787×505, CSS1180×757/JPEG1180×757. 픽셀과 CSS 크기를 혼동하지 않는다.
- 캡처 UTC 2026-10-02 02:34:56.040/02:35:25.432, 02:37:57.774/02:38:06.704, 02:38:17.951/02:38:33.404. 앱 serving SHA 미기록.
- 원본 6장 HTTP 성공·픽셀 검토 완료. 상세 조회 전과 Back 후 모두 수정 전 결함 증거이며 after가 아니다.
- RED: 기존 코드에서 route 6 FAIL / 6 PASS(12 tests), 실제 입력 복원·URL 병합·page·빈 결과에서 실패.
- GREEN: 매치 목록/상세·회원 목록·공용 query hook 4 files / 23 tests PASS(3.03s). 추가 배치 입력·취소/Escape/read-only 검증 뒤 route 14 tests PASS(1.92s), 단일 worker.
- frontend lint/typecheck PASS. 첫 타입검사에서 테스트의 미지원 `exact` 옵션을 발견해 제거한 뒤 통과. runtime matcher 의미는 동일하다.
- Android Play·v1 DB·production deploy security·compose parity·alpha seed runtime·immutable deploy aggregate 6/6 PASS. v1_web patch changeset 정책 accepted.
- touched-path TODO/FIXME/HACK/XXX 0, `git diff --check` PASS. 새 API·외부 의존성·미추적 import 없음.
- base 98a2a9e93에서 #1519 head는 조상이 아니다. #1514/#1519 미병합 코드와 다른 세션 변경을 포함하지 않는다.
- 다음은 명시 5파일 커밋·푸시·Ready PR·정확한 head CI 확인이다. 게시 후 결과는 PR 본문과 부모 보고에 기록한다. Sonnet 미도착/alpha after 대기는 완료로 표현하지 않는다.
