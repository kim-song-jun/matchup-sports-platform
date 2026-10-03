# Task 194: 대회 목록 영역 이름의 상태 모순 교정 (#1543)

Status: In Progress
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
실제 alpha의 준비 중 DOM 연결과 종료 AX excerpt에서 목록 영역 이름이 ‘진행 중인 대회 목록’으로 고정된다. 시각적인 필터 요약과 빈 결과 안내는 정상이다. 현재 v1 소스의 sr-only 문구가 원인이며 #1516의 시각 빈 안내 수정과 별개다.

## Goal
기존 SectionTitle과 같은 중립 이름 ‘대회 목록’을 제공하고 독립 Ready PR로 전달한다. 실제 alpha after는 별도 승인된 배포 뒤 검증한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev에서 독립 worktree와 이슈 브랜치를 만들고 다른 미병합 PR을 섞지 않는다.
- [x] 전체/준비 중/진행 중/종료의 DOM 연결·접근성 이름이 상태와 모순되지 않는다.
- [x] 빈 결과와 결과 있는 대조군의 필터·CTA·요청 조건을 유지한다.
- [ ] 최소 수정·초점 테스트·lint·aggregate·명시 pathspec 커밋·정확한 head CI를 기록한다.
- [ ] 실제 alpha before 이미지와 DOM/AX proof를 PR에 공개 연결한다. after와 3폭 회귀는 배포 대기로 구분한다.
- [x] QA179 명단·완료 QA 결과·실제 서버 데이터·다른 세션 작업·PR1545는 변경하지 않는다.

## User Scenarios
- 전체 또는 준비·종료 필터에서 목록 영역을 찾아도 진행 중 결과로 오인하지 않는다.
- 진행 중·빈 결과·결과 있는 목록에서 기존 필터와 카드/CTA를 사용할 수 있다.
- 초기 로딩·API 오류에서도 중립적인 목록 영역이 유지되며 실제 오류와 재시도를 보여준다.

## Test Scenarios
### Happy path
- [x] 실제 list client의 4개 상태 × 빈 결과/카드 대조군: 접근성 이름·aria-labelledby 연결·필터 요약·API 조건·CTA/카드 링크.
### Edge cases
- [x] league kind와 기존 목록 paging/fetching/SSR seed 계약.
### Error paths
- [x] 초기 로딩·실제 오류/재시도는 정상 빈 결과와 구분되며 중립 영역 이름 유지.
### Mock data updates needed
- API/DTO/schema 변화 없음. 기존 hook 경계 fixture만 사용하고 실제 region/공용 컴포넌트는 mock하지 않는다.

## Parallel Work Breakdown
### Frontend
- [x] sr-only 문구 한 줄을 기존 시각 제목과 맞추고 실제 컴포넌트 회귀 테스트를 확장한다.
- 1줄 문구 교정이며 새 화면/레이아웃/컨트롤 설계가 없다(CLAUDE UI 착수 예외).
### Read-only evidence
- [x] 독립 에이전트가 원본 공개 사진·proof·중복 여부를 확인한다. 제품 파일 편집·커밋·브라우저·데이터 변경은 금지한다.
### Sequential
- [ ] 명시 경로 커밋·전용 브랜치 푸시·Ready/base dev PR·정확한 head CI/독립 리뷰.
- [ ] 승인된 alpha 배포 후 mobile→tablet→desktop의 DOM/AX·빈 결과/카드·필터 반복/Back/Escape/취소·console/network를 재검증한다.
### Owned / Forbidden files
- Owned: `apps/v1_web/src/app/tournaments/tournaments-list-client.tsx`, `apps/v1_web/src/app/tournaments/tournaments-list-kind.test.tsx`, 이 문서, `.changeset/tournament-list-region-name.md`.
- Forbidden: 공용 hooks/types/스타일·API/DTO/schema·다른 이슈 worktree·PR1545·실제 QA/운영 데이터·권한·배포.

## Acceptance Criteria
- [x] 원본 상태별 접근성 이름 조건을 초점 테스트로 증명한다.
- [x] 기존 시각 문구·aria 연결·kind/상태/종목/성별 요청·필터 및 카드/CTA 계약을 유지한다.
- [ ] 테스트·lint·6 aggregate·changeset 정책과 committed-tree 범위를 확인한다.
- [ ] 402/787/1180px 실제 alpha after와 전체 원 이슈 조건이 충족되기 전 이슈를 종료하지 않는다(Refs #1543).

## Tech Debt Resolved
- 상태와 무관한 ‘진행 중’ 숨김 영역 이름을 기존 중립 시각 제목에 맞춘다.

## Security Notes
문구 교정이다. 인증·권한·저장·필터/API 계약 변경 없음. 환경 파일·자격증명은 읽거나 공개하지 않는다. 브라우저/서버 저장 실행 0회.

## Risks & Dependencies
- 원본6장은 실제 alpha before다. 사진만으로 sr-only 이름을 입증할 수 없어 DOM/AX proof를 함께 연결한다.
- 모바일4상태 URL/요약과 준비 중 DOM, 태블릿/데스크톱 종료 AX만 공개됐다. 모든 상태×모든 폭 AX, 실물 기기·스크린리더 발화·serving SHA·전체 console/network는 미확보다.
- 실제 alpha after는 별도 승인된 배포 대기이며 로컬 테스트를 전체 QA 완료로 표현하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 중립 이름 또는 상태별 이름 | 이슈가 허용한 중립 ‘대회 목록’을 기존 SectionTitle과 동일하게 사용 |
| 2026-10-02 | Codex | 숨겨진 이름의 이미지 증거 | 사진은 실제 필터/시각 빈 안내의 before로 한정하고 직접 DOM/AX proof를 함께 인용 |

## Progress Snapshot
- base `be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d`; worktree `/tmp/teameet-issue-1543-20261002`; branch `fix/issue-1543-tournament-list-region-name`.
- 공개 before/proof commit `d9b6b835ee8a99e2780dd3142301d8bca5dde025`, `docs/qa/2026-10-02-1516-status-empty/`. UTC 2026-10-02 10:27:09.601–10:33:29.353. CSS 402×606/787×505/1180×757(모바일 JPEG402×605).
- 기존5 PR1536/1537/1539/1541/1542는 Ready/base dev/OPEN, 정확한 각 head의 Gates/Web/API SUCCESS를 재확인했다. 열린 PR1545는 다른 저자의 admin 분류 변경이며 수정하지 않는다.
- 호스트 preflight: load22.13/59.01/108.88, 12cores, swap4938.31/6144MB, Node141/browser44. 사용자 재개 지시에 따라 최소1worker 직렬 검증만 실행한다.
- 신규 실제 region 계약 RED 9 FAIL/17 SKIP → 관련 4 suites GREEN41 PASS(신규9+기존32). 실제 region/heading/필터/카드/EmptyState 렌더, 외부 API/navigation 경계 fixture. 전체 브라우저 AX·API DB 검증으로 확대하지 않는다.
- frontend lint(tsc+패턴) PASS, 필수 aggregate6/6 PASS, changeset patch 정책 accepted, diff check PASS. touched-path 새 부채 marker/import/의존성 없음.
- Docker read-only 상태 조회는 local engine HTTP500으로 막혔다. alpha HEAD200이며 이 문구 수정은 Docker/DB 기동을 요구하지 않는다. 다른 프로세스는 종료하지 않았다.
- 독립6/6 byte/SHA256/Gitblob/raster/픽셀 대조 PASS. proof21,995B/blob `d33fee7e…`. 모바일 Tab sample은 홈 링크 포커스여서 CTA 키보드 PASS 근거가 아니다. 태블릿 프레임 아래 CTA도 접근 불가 근거가 아니다.
- 게시 뒤 정확한 원격 head CI·독립 리뷰 결과는 PR 본문에 기록한다. alpha 수정 after/대표3폭 회귀는 승인된 배포 대기다.
