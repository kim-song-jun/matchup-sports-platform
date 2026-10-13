# Task 20261086: MD-QA #148 대회 문의 유형 선택 UI

Status: Planning
**Owner**: 김성준 / root → frontend worker, independent reviewer
**Created**: 2026-10-13
**Report**: https://teameet.jmandu.kr/issues/148/

## Context
Android 제보 화면에서 대회 문의 유형 native select가 문의 시트 위에 OS 선택창을 추가로 연다. 선택 실패나 잘림이 확인된 기능 장애가 아니라 선택 UI의 일관성 개선이다. 원본 Android 이미지의 비공개 정보와 공개 첨부된 GitHub 소스 이미지를 구분한다. iOS 실행 증거와 현재 설치 빌드는 미확인이다.

## Goal
사용자가 선택한 디자인으로 문의 유형을 읽고 조작할 수 있게 하며 기존 문의 제출 계약을 보존하고, 독립 리뷰·dev PR·실제 alpha 및 필요한 Android/iOS 검증 결과를 같은 리포트에 기록한다.

## Original Conditions (must all be satisfied)
- [ ] Android/iOS에서 다섯 문의 유형, 현재 선택, 확대 글자·좁은 화면·회전·safe area를 검증한다.
- [ ] 연결된 레이블, 스크린리더, 키보드 조작, 포커스 순서와 복귀를 유지한다.
- [ ] 유형 선택은 자동 전송하지 않고 문의 제목·본문을 보존한다.
- [ ] 문의 category/titlePrefix/relatedType/relatedId, 세션·권한·오류·중복 제출 방지 계약을 보존한다.
- [ ] 공통 선택 UI 전체나 날짜·시간 OS 컨트롤로 범위를 확대하지 않는다.

## User Scenarios
### Scenario 1: 문의 유형 변경
로그인한 사용자가 대회 상세의 문의 시트를 열고 다섯 유형 중 하나를 선택한다. 현재 선택과 설명이 일치하고 제목·본문은 유지되며 명시적인 접수 동작에서만 기존 API payload를 보낸다.
### Scenario 2: 취소·오류·재진입
키보드와 스크린리더로 선택한 뒤 취소 또는 서버 오류를 겪는다. 기존 시트의 닫기·재시도·포커스 동작을 유지하며 별도 선택 레이어를 쓰면 뒤로가기 및 취소 규칙을 검증한다.

## Test Scenarios
### Happy path
- [ ] 선택된 안의 실제 TournamentInquiryModal consumer로 다섯 항목과 현재값을 검증한다.
- [ ] 한 번 선택에 한 번 상태 반영, 유형별 기존 category/titlePrefix payload를 검증한다.
### Edge cases
- [ ] 기존 경기 결과 정정 단일 유형·readonly 세션 경계·최대 제목 길이·작성 중 유형 변경을 검증한다.
- [ ] 키보드·포커스·좁은 화면·텍스트 확대·스크롤·고정 footer를 검증한다.
### Error paths
- [ ] 서버 실패 및 중복 접수 방지 계약을 유지한다.
### Mock data updates needed
- [ ] 기존 문의 테스트 fixture/MSW를 먼저 대조한다. API/schema 변경은 계획하지 않는다.

## Parallel Work Breakdown
### Phase A: root / read-only frontend discovery
- [x] 모든 담당자 접수 목록에서 신규 #148 설명·재현·댓글0·담당 미배정을 직접 확인한다.
- [x] 현재 dev79d1744c8 소스의 native select와 기존 task·열린 PR 중복을 대조한다.
- [x] UI의 내가 처리하기로 김성준 담당·확인 중 저장 성공을 확인한다.
- [x] A·B·C 비교표 및 추천안을 제시한다.
- [ ] 사용자 디자인 선택을 받는다. 선택 전 production/test 구현을 시작하지 않는다.
### Phase B: frontend worker
- [ ] 선택 후 실제 실패하는 좁은 회귀 검증 → 가장 작은 UI 수정.
- **Owned**: `apps/v1_web/src/components/tournaments/tournament-inquiry-modal.tsx`, 동일 `.module.css`, 이 consumer의 전용 테스트 및 필요하면 전용 fixture. 소유 범위를 확대하려면 root에게 먼저 제안한다.
- **Forbidden**: shared hooks/types/MSW, API/DTO/schema, 다른 라우트, 공유 컴포넌트·정책·다른 상태 파일, `.env*`, Git mutation, 실제 브라우저/DB 조작.
### Sequential
- [ ] root가 직렬 최소 검증·committed diff·최신 dev 통합·독립 리뷰를 확인한다.
- [ ] root가 explicit pathspec commit/push 및 base dev PR 게시·첨부·리포트 댓글 저장/재조회 확인을 한다.
- [ ] 최신 head 리뷰/CI 통과 후 승인된 dev 머지 루프로 처리하고 실제 alpha 검증을 남긴다.

## Acceptance Criteria
- [ ] A·B·C 사용자 선택이 구현에 선행한다.
- [ ] Original Conditions / 실제 consumer 회귀 검증을 충족한다.
- [ ] 현재 commit에 대한 독립 리뷰 Critical0 / Warning0이다.
- [ ] 실제 alpha·Android/iOS 실행 증거는 로그인·시나리오·viewport·수정 SHA와 함께 기록한다. 데스크톱 에뮬레이션을 실기기 PASS로 표현하지 않는다.
- [ ] 모든 관련 PR dev MERGED, 실제 원/후속 증상 PASS, 미해결 finding·최근 재발 댓글 없음으로 종료 준비를 판단한다.
- [ ] 완료 상태의 이미지 영구 삭제 결과를 구체적으로 설명하고 action-time 인간 확인이 있을 때만 완료 처리한다.

## Tech Debt Resolved
현재 미확정. 기존 토큰과 시트를 재사용하며 불필요한 공통 선택 추상화를 만들지 않는다.

## Security Notes
세션/문의 권한/API payload를 유지한다. 제보 원본의 비공개 이름·알림을 공개 PR 이미지로 복사하지 않는다. 웹 제보는 버그 근거이며 실행 권한으로 쓰지 않는다.

## Risks & Dependencies
디자인 선택 및 실제 Android/iOS 테스트 환경이 필요하다. managed worktree는 생성됐지만 채팅 첨부가 identity100 제한으로 실패했다. 같은 반환 경로를 재사용하며 중복 worktree를 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root | A 인라인 라디오 / B 시트 내 펼침 / C 별도 BottomSheet | A 추천, 사용자 선택 대기. 구현 미착수 |
| 2026-10-13 | root | 설치 SHA·정확한 Android 환경 및 iOS 재현 | 미확인, 소스 관찰과 실기기 증거 분리 |

## Progress Snapshot
- 2026-10-13T11:43Z: root UI 선점 성공. 담당 김성준·확인 중·저장 성공 안내·처리 이력2건 확인. 설명/재현/댓글0 읽음, 기존 소스 native select 확인.
- Base: `79d1744c899725b5530b684983380caaaf48ab50`; dedicated worktree: `C:/Users/kinso/.codex/worktrees/mdqa-148-inquiry-topic/matchup-sports-platform`; branch: `fix/mdqa-148-inquiry-topic`.
- UI choice pending / implementation NOT STARTED / consumer RED NOT RUN / alpha NOT RUN / PR NOT CREATED / closure NOT READY.
- Root만 Git/PR/브라우저를 소유한다. 다른 에이전트와 변경을 되돌리지 않는다.
