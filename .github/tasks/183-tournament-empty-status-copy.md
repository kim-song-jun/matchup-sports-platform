# Task 183: 대회 목록의 빈 안내를 적용 조건과 일치시키기 (#1516)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
alpha 공개 `/tournaments`에서 진행 중·수영·남성부 필터의 정상 빈 결과를 '수영 모집 중인 대회가 없어요'로 안내한다. 상태와 무관한 모집 문구 및 알림 대기 설명이 원인이다. #1516의 실제 390/768/1440 before와 API 200 기록이 근거이며, 현재 열린 PR에서 중복 수정을 확인하지 못했다.

## Goal
기존 EmptyState 구조를 유지하면서 적용 조건과 모순되지 않는 문구 및 현재 가능한 행동을 안내하고, 별도 Ready for review PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] origin/dev에서 독립 이슈 브랜치·worktree를 만들고 #1514 미병합 코드를 포함하지 않는다.
- [ ] 최소 문구 수정과 상태별 테스트·lint·필수 aggregate·정확한 원격 head CI를 확인한다.
- [ ] PR은 Ready for review로 만들고 실제 alpha before 3장을 inline으로 연결한다.
- [ ] after는 별도 승인된 alpha 배포 대기로 명시한다. 병합·자동병합·배포·유료 리뷰 재요청은 하지 않는다.
- [x] QA179 명단·완료 QA 결과·다른 세션 작업·서버/데이터 계약은 변경하지 않는다.

## User Scenarios
- 진행 중·준비 중·종료·전체 상태와 종목 유무의 빈 결과는 선택 조건을 설명한다.
- 필터 열기 링크는 현재 URL 조건을 보존한다. 기존 팀밋 대회 보기 링크로 다른 대회를 확인할 수 있다.
- 실패하면 실제 오류·재시도를, 응답 대기 중이면 로딩을 보여준다.

## Test Scenarios
### Happy path
- [x] 4개 상태 × 종목 유무: 실제 route component의 요청 파라미터·필터 요약·빈 문구·CTA
### Edge cases
- [x] 무필터 전체와 복합 진행 중·수영·남성부
### Error paths
- [x] API 오류·재시도 및 로딩은 정상 빈 결과와 구분
### Mock data updates needed
- 스키마/API/DTO 변경 없음. 기존 컴포넌트 테스트의 외부 hook 경계에 수영 마스터 fixture를 추가한다.

## Parallel Work Breakdown
### Frontend
- [x] 기존 EmptyState의 문구 교정 → 좁은 회귀 테스트
- [x] frontend lint
- 사용자 지시 '최소수정' 및 이슈의 조건 중심 문구 예시에 따라 문구만 교정한다. 신규 화면·레이아웃·컨트롤 설계는 없다.
### Sequential
- [ ] 명시 pathspec 커밋·푸시·Ready PR·원격 CI·Sonnet 후속 검토
### Owned / Forbidden files
- Owned: `apps/v1_web/src/app/tournaments/tournaments-list-client.tsx`, `tournaments-list-kind.test.tsx`, 이 문서, 이슈 전용 changeset.
- Forbidden: #1514 worktree, shared hooks/types, backend/schema/migration, 공용 main worktree, 실제 QA 데이터·운영·권한·결제·통신.

## Acceptance Criteria
- [x] URL·요약·빈 안내가 모순되지 않는다(4상태 × 종목 유무).
- [x] 실제 오류/로딩을 빈 결과로 바꾸지 않는다.
- [ ] 관련 초점 테스트·lint·aggregate 및 원격 커밋/CI 증거를 남긴다.
- [ ] before 원본과 잔여 alpha after/3폭 회귀를 구분하며 전체 QA 완료라고 하지 않는다.

## Tech Debt Resolved
- 선택 상태와 무관한 모집·알림 고정 문구 및 해당 문구만 소비하는 종목 라벨 계산을 제거한다.

## Security Notes
문구만 수정한다. 인증·권한·API·데이터 및 외부 의존성 변경 없음. 환경 파일·자격증명은 읽거나 공개하지 않는다.

## Risks & Dependencies
- 실제 after 및 mobile→tablet→desktop 회귀는 승인된 alpha 배포 뒤 가능하다.
- 호스트 load 77/12 cores, swap 19.35/20GB, Node 147개. 검증은 최소 worker·직렬, 전체 반복은 CI로 위임한다.
- Sonnet이 아직 도착하지 않으면 리뷰 완료라고 하지 않으며 Copilot 오류는 코드 리뷰 결과로 인정하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 상태별 문구 또는 조건 중심 문구 | 이슈가 허용한 조건 중심 문구를 기존 EmptyState에 최소 적용 |
| 2026-10-02 | Codex | 문서 번호 | #1514의 미병합 Task182와 충돌하지 않게 Task183 사용 |

## Progress Snapshot
- base c59fef4561cd5ca145bc965c5a39af84820eed4e; worktree `/tmp/teameet-issue-1516-20261002`; branch `fix/issue-1516-tournament-empty-status`.
- #1514 head 5dfe52e68는 이 브랜치 조상이 아니다. 다른 작업자의 미커밋 변경을 건드리지 않았다.
- 실제 before: #1516의 f76c771dc0e5144a937a9f2b407928eb46e259a8 SHA 고정 공개 이미지 3장. 원본 픽셀 390×844/768×1024/1440×900 확인.
- 캡처 UTC 2026-10-02 02:11:54.955 / 02:11:55.599 / 02:11:56.009. 캡처 당시 앱 서빙 SHA는 미기록이며 이미지 commit과 혼동하지 않는다.
- 로컬 UI 서버를 띄우지 않는다. after·3폭 회귀·refresh/Back/Escape/필터 반복·console/network는 배포 대기다.
- RED: 수정 전 신규 문구 회귀 8 FAIL / 대조군 9 PASS(17 tests). 실패 위치는 실제 컴포넌트의 빈 제목이다.
- GREEN: 목록 kind·paging·fetching·SSR seed 4 files / 32 tests PASS(23.93s), 단일 worker. 신규 문구 8개와 오류·재시도/로딩 2개를 포함한다.
- frontend lint(tsc + 패턴) PASS. Android Play·v1 DB·production deploy security·compose parity·alpha seed runtime·immutable deploy 6/6 PASS. 변경 changeset 정책 accepted(이 이슈 항목은 v1_web patch).
- `git diff --check` PASS, touched-path TODO/FIXME/HACK/XXX 0. 새 외부 의존성이나 미추적 import 없음.
- 명시 4파일 커밋·원격 CI·Sonnet 리뷰는 게시 후 확인하며 최종 결과는 PR 본문과 부모 보고에 기록한다.
