# Task 199: 활동 기록 종류 탭의 상세 복귀 상태 보존

Status: Review
**Owner**: Codex issue fix session
**Created**: 2026-10-02

## Context
Refs #1551. 실제 alpha의 활동 기록에서 리그 1건을 열어 페이지 Back으로 돌아오면 전체 5건으로 초기화된다. 목적지와 서버 기록 변경 문제가 아니라 선택 상태 보존 문제다. 원본 공개 증거는 개인 식별자와 기록 본문을 제외한 탭 크롭 4장 및 행동 기록이다.

## Goal
현재 records URL과 상세에 넘기는 from에 선택 종류를 보존하고 재진입·Back/Forward·연속 입력에서 실제 client의 선택과 조회 조건을 일치시킨다.

## Original Conditions
- [x] 리그·대회·친선 탭 선택을 상세 링크의 복귀 주소와 URL에 보존한다(초점 테스트).
- [x] 전체 선택은 type 파라미터를 제거하고 기존 from=/my 복귀 체인을 유지한다(초점 테스트).
- [x] 연속 입력의 마지막 선택, 재마운트, Back/Forward를 반영한다(초점 테스트).
- [x] 개인 패널·내 매치 조회는 현재 userId에 대해 서버가 본인임을 확인한 경우만 활성화한다(초점 테스트). 이전 사용자 응답에서 개인 탭 자체가 보이는 상황도 클릭과 패널·조회를 차단한다.
- [x] API/DTO/schema·consent·권한·기록/점수·공용 내비게이션 계약을 변경하지 않는다.
- [ ] Ready/base dev PR과 exact head CI를 확인하고 실제 alpha after는 별도 승인된 배포까지 대기한다.

## User Scenarios
1. 마이 → 활동 기록 → 리그/대회/친선 → 경기 상세 → Back: 선택 탭과 해당 조회 조건 유지.
2. 탭 연속 선택 → 전체 → refresh: 마지막 선택과 URL 유지, 전체에는 type 없음.
3. 본인 개인 탭 재진입: 기존 내 매치 패널 사용. 타인·응답 미확인·이전 userId의 본인 응답에는 패널 없음.

## Test Scenarios
### Happy path
- [x] 실제 client + 공용 content의 선택 탭·목록·상세 from 및 records Back 링크 검증.
- [x] 리그/대회/친선 URL 진입, 링크 왕복 재마운트, JSDOM native history Back/Forward + query snapshot 재렌더 검증.
### Edge cases
- [x] 빠른 연속 선택, 지연 query echo, userId 변경, 잘못된 type, type 제거, hash/기존 query 보존.
- [x] 실제 개인 패널의 본인/타인/로딩/이전 응답 경계 및 기존 목록 더 보기.
### Error paths
- [x] 오류·실제 refetch 재시도와 탭/URL·공개 동의 안내 보존(합성 API 경계).
### Mock data updates needed
- API 훅 경계만 합성 fixture로 대체한다. 실제 client/content/개인 패널/AppBackLink는 대체하지 않는다. API·전역 MSW fixture 변경 없음.

## Parallel Work Breakdown
### Frontend
- [x] Owned: `apps/v1_web/src/app/users/[id]/records/user-records-page-client.tsx`, 같은 폴더 `user-records-tab-history.test.tsx`, 이 task, `.changeset/activity-record-tab-history.md`.
- Forbidden: 다른 route, 공용 content/hook/navigation-history, API/DTO/schema, 실제 데이터와 다른 세션 코드.
### Sequential
- [x] RED → 최소 수정 → GREEN → scope lint 및 필수 guardrail → 독립 precommit 정적 리뷰.
- [ ] 명시 pathspec commit → feature push → Ready/dev PR → 정확 head CI·committed diff 리뷰(PR 기록으로 확인).
- [ ] 승인된 alpha 배포 뒤 실제 402→787→1180 왕복·refresh·console/network와 수정 after 확인.

## Acceptance Criteria
- [ ] Original Conditions와 초점 회귀 통과, 명시4파일 committed diff 확인.
- [ ] 독립 리뷰의 새 actionable 지적 해결 및 정확 head CI 확인.
- [ ] 원본 before 공개 링크와 조건/시각/한계를 PR에 남기고 미검증 alpha after를 PASS로 보고하지 않는다.
- [ ] 원 이슈 수용 조건의 실제 alpha 재검증 전 #1551 OPEN/Refs 유지.

## Tech Debt Resolved
- 상세 복귀 주소에서 종류가 누락되는 화면 로컬 상태와 URL의 불일치.

## Security Notes
- 실제 개인 ID·비공개 URL·기록 본문·자격증명 게시 금지. 합성 fixture만 테스트에 사용한다.
- 기존 sanitizeRedirectPath/withFromPath 및 서버 consent/owner 게이트를 보존한다.
- 개인 URL 선택만으로 본인 전용 패널을 요청하지 않도록 현재 userId와 응답의 owner를 함께 대조한다.

## Risks & Dependencies
- Next.js 공식 native history 문서와 설치된 App Router patch를 대조한다: https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api . `replaceState(null, '', url)`는 검색 상태를 동기화하며 탭마다 history 항목을 추가하지 않는다. 공유 History.prototype 패치는 현재 __tmIdx를 유지한다.
- 단위 테스트의 실제 history 동작과 query snapshot 재렌더는 실제 Next 서버·alpha 화면·접근성/스크롤 복원 검증을 대체하지 않는다.
- 원본 사진의 데스크톱만 리그 전후 쌍이다. 모바일은 별도 대회 Back 이후, 태블릿은 리그 Back 이후 컨트롤만 있다. 1→5 목록 건수는 행동 기록 근거다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-02 | Codex | 재연결 후 기존 /tmp worktree·코드·Task199·lint/test 로그 없음 | 브랜치는 dev base와 같고 원격 수정 PR 없음. 부모 명시 승인으로 새 독립 worktree/branch에서 재구현하며 이전 테스트 주장을 현재 증거로 승계하지 않는다. |

## Progress Snapshot
- Base: `1d09562a9b7d1b2be261a89519167ff2a031a576` (fetch origin/dev 직후).
- Worktree: `/tmp/teameet-issue-1551-20261002-reconnected`.
- Branch: `fix/issue-1551-activity-record-tab-history-reconnected`.
- 기존 root 및 다른 worktree 코드 변경 없음. 실제 서버 쓰기·QA179/완료 결과 변경·머지·배포 0회.
- 실제 client/content/개인 패널/AppBackLink/공유 history mirror를 사용한 새 20개 회귀: 수정 전 13 FAIL / 7 PASS, 수정 후 20 PASS. 기존 3 suite의 14개와 합쳐 4 suite 34 PASS.
- 중간 검증에서 테스트 rerender wrapper의 불일치를 바로잡고, 실제 URL과 상세 from의 query 순서 차이로 shared history가 Back 대신 replace를 고르는 결함을 수정했다. 현재 canonical query와 history mirror 왕복을 함께 검증한다.
- scope lint(typecheck + v1 pattern) PASS. 첫 lint의 테스트 helper `getByRole` 미지원 옵션을 제거한 뒤 재검증했다. 필수 guardrail 6/6, patch Changeset policy, diff check, touched-path tech-debt marker 검사 PASS.
- 독립 precommit 정적 리뷰: 제품 client + 새 test 2/2 파일, 20개 테스트 계약 확인, actionable 0. 제품 diff SHA-256 `b943e275f2bdc08bf92f73ae537dc7cedd3d171101dab350edd997a384a708d1`; 새 test 포함 candidate SHA-256 `a23bcb01cae7a594373473d058460b70c5ebda3a28d960ca3f203f42510e41f9`. 이는 아직 exact committed head 리뷰가 아니다.
- 첫 committed head `3cb3f3f8596db24a7ab92840e142bdc5373b27c0` 독립 리뷰: 4/4 파일, 제품/test 2/2 precommit 바이트 일치, 추가 경로·미추적 import·제품 actionable 없음. P3 문서 지적(개인 탭 렌더와 실제 패널/조회 gate의 표현 차이)을 이 후속 문서 수정으로 정정한다. 제품/test 변경이 없어 같은 34개·lint 결과를 유지하며 최종 head CI는 PR 기록에 남긴다.
- 원본 alpha 공개 증거: 5/5 HTTP 200·Git blob/bytes 일치, 4 JPEG 실제 픽셀·크기 확인. 데스크톱은 리그 before/Back 후 reset 쌍이고 나머지는 이슈 조건의 컨트롤 크롭이다. 사진 파일명의 after는 버그 발생 후이며 수정 after가 아니다.
- 2026-10-02 19:07 UTC alpha landing HEAD가 HTTP 503이었다. 수정 after, 실제 Next browser Back/Forward, refresh, console/network, 402→787→1180 전체 흐름은 승인된 배포 뒤 대기한다. 로컬/CI PASS를 alpha 전체 QA 완료로 취급하지 않는다.
- 현재 단계: 로컬 수정·초점 검증·precommit 리뷰 완료, 명시 4파일 commit/feature push/Ready dev PR와 exact head CI 대기. 이전 /tmp 로그는 현재 검증으로 사용하지 않는다.
