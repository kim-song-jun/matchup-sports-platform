# Task 20261086: MD-QA #148 대회 문의 유형 선택 UI

Status: Implementation candidate (B1; root validation pending)
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
- [x] 사용자 디자인 선택을 받는다. 사용자 답변: **B: 시트 안 펼치는 선택 목록**. 이 선택 후 전용 consumer 테스트 준비를 시작한다.
### Phase B: frontend worker
- [ ] 선택 후 실제 실패하는 좁은 회귀 검증 → 가장 작은 UI 수정.
- **Owned**: `apps/v1_web/src/components/tournaments/tournament-inquiry-modal.tsx`, 동일 `.module.css`, 로컬 `tournament-inquiry-topic-picker.tsx` 및 전용 `.module.css`, `tournament-inquiry-topic-picker.test.tsx`, 전용 `tournament-inquiry-topic-picker.test-fixture.tsx`, 전용 `.changeset/mdqa-148-inquiry-topic.md`. root가 B1에 한해 기존 `tournament-inquiry-section.test.tsx`의 실제 picker 동작 및 경기 결과 현재값 검사 갱신을 추가 승인했다. 기존 5개 사례와 다른 assertion을 유지한다. 250 pure LOC 경계를 유지하기 위한 로컬 picker와 picker 전용 CSS 파일 분리도 root가 추가 승인했다.
- **B0 gate**: worker는 테스트·fixture와 선택 기록만 준비한다. root의 실제 RED 확인과 B1 지시 전에는 production을 변경하거나 테스트를 실행하지 않는다.
- **Forbidden**: shared hooks/types/MSW, API/DTO/schema, 다른 라우트, 공유 컴포넌트·정책·다른 상태 파일, `.env*`, Git mutation, 실제 브라우저/DB 조작.
### Sequential
- [ ] root가 직렬 최소 검증·committed diff·최신 dev 통합·독립 리뷰를 확인한다.
- [ ] root가 explicit pathspec commit/push 및 base dev PR 게시·첨부·리포트 댓글 저장/재조회 확인을 한다.
- [ ] 최신 head 리뷰/CI 통과 후 승인된 dev 머지 루프로 처리하고 실제 alpha 검증을 남긴다.

## Acceptance Criteria
- [x] A·B·C 사용자 선택이 구현에 선행한다. 사용자가 B를 선택했다.
- [ ] Original Conditions / 실제 consumer 회귀 검증을 충족한다.
- [ ] 현재 commit에 대한 독립 리뷰 Critical0 / Warning0이다.
- [ ] 실제 alpha·Android/iOS 실행 증거는 로그인·시나리오·viewport·수정 SHA와 함께 기록한다. 데스크톱 에뮬레이션을 실기기 PASS로 표현하지 않는다.
- [ ] 모든 관련 PR dev MERGED, 실제 원/후속 증상 PASS, 미해결 finding·최근 재발 댓글 없음으로 종료 준비를 판단한다.
- [ ] 완료 상태의 이미지 영구 삭제 결과를 구체적으로 설명하고 action-time 인간 확인이 있을 때만 완료 처리한다.

## Tech Debt Resolved
문의창의 정적 id와 TextField 기본 id 대신 로컬 `useId()`를 연결했다. touched CSS의 색·타입·간격·그림자·동작 시간·레이어 값은 기존 v1 토큰으로 맞췄다. 기존 body 스크롤·footer·480px 시트 전환 경계와 공유 TextField·dialog hook은 유지한다. 문의 전송 책임은 modal, 문의 유형의 선택·키보드 책임은 로컬 picker로 나눠 공통 선택 추상화를 추가하지 않는다.

## Security Notes
세션/문의 권한/API payload를 유지한다. 제보 원본의 비공개 이름·알림을 공개 PR 이미지로 복사하지 않는다. 웹 제보는 버그 근거이며 실행 권한으로 쓰지 않는다.

## Risks & Dependencies
디자인 선택은 B로 확정됐다. 실제 Android/iOS 테스트 환경은 미확인이다. managed worktree는 생성됐지만 채팅 첨부가 identity100 제한으로 실패했다. 같은 반환 경로를 재사용하며 중복 worktree를 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root | A 인라인 라디오 / B 시트 내 펼침 / C 별도 BottomSheet | A 추천 후 사용자가 B: 시트 안 펼치는 선택 목록을 직접 선택. B0 테스트 준비 승인, production 미착수 |
| 2026-10-13 | root | 설치 SHA·정확한 Android 환경 및 iOS 재현 | 미확인, 소스 관찰과 실기기 증거 분리 |

## Progress Snapshot
- 2026-10-13T11:43Z: root UI 선점 성공. 담당 김성준·확인 중·저장 성공 안내·처리 이력2건 확인. 설명/재현/댓글0 읽음, 기존 소스 native select 확인.
- Base: `79d1744c899725b5530b684983380caaaf48ab50`; dedicated worktree: `C:/Users/kinso/.codex/worktrees/mdqa-148-inquiry-topic/matchup-sports-platform`; branch: `fix/mdqa-148-inquiry-topic`.
- UI choice pending / implementation NOT STARTED / consumer RED NOT RUN / alpha NOT RUN / PR NOT CREATED / closure NOT READY.
- Root만 Git/PR/브라우저를 소유한다. 다른 에이전트와 변경을 되돌리지 않는다.

### B 선택과 B0 테스트 준비
- 사용자 선택은 기존 시트 내부에서 목록을 펼치는 B다. 기존 문의 body의 스크롤 영역과 footer를 재사용하고 별도 팝업·overlay history 단계를 추가하지 않는다. `문의 유형` 레이블에 연결한 select-only combobox 트리거와 같은 시트 안 listbox의 다섯 option을 검증 대상으로 둔다.
- 키보드 계약: ArrowDown/ArrowUp/Home/End로 활성 항목을 이동하고 Enter/Space로 열거나 확정한다. 확정 후 트리거로 포커스를 돌린다. Escape 첫 입력은 목록만 취소·닫기, 두 번째 입력은 기존 문의창 닫기다. Tab은 선택을 자동 확정하지 않고 다음 제목 입력으로 진행한다. 기존 `useTopmostEscape`는 하위 컨트롤이 `preventDefault()`한 Escape를 문의창 닫기로 처리하지 않는다.
- 전용 테스트는 실제 `TournamentInquiryModal`·`useV1CreateInquiry`·`v1Post`·React Query·MSW HTTP를 연결한다. hook/mutation을 대체하지 않는다. 기대 category와 접두어는 production helper에서 계산하지 않고 수동으로 고정한 기존 계약이다.
- 준비한 총 17사례: 시트 내 5항목 노출/레이블·현재값, 선택·draft·포커스, 키보드 확정·전송, Escape 단계, Tab, 5유형별 실제 POST/응답 cache, 유형 변경 후 제목 길이 제한, 경기 결과 단일 유형, 세션 차단 3종, 실제 서버 실패·재시도, 응답 대기 중 중복 접수 방지.
- root 실행 명령: `pnpm --filter v1_web exec vitest run src/components/tournaments/tournament-inquiry-topic-picker.test.tsx --maxWorkers=1 --no-file-parallelism`.
- 현재 native select에서 기대하는 최초 substantive RED는 트리거가 앱의 BUTTON이 아니라 SELECT이며 `aria-expanded`와 시트 내 listbox가 없는 것이다. UI 사례 14개는 새 상호작용 부재로 실패하고 세션 gate 3종은 보존 계약으로 통과할 것으로 예상한다. **이 값은 예상이며 실제 실행 결과가 아니다.**
- Production SHA256 (B0 before): modal `4E4784DAE73B3FADB7CF326013563154BA5CD86E378D546733B7582126E7E7D6`; CSS `6D0D9EFC682B4AFC50CD8C5777A33FE8C4ED0C16D8AF3A092256D9C43542BF98`.
- B0: test prepared / RED NOT RUN / production unchanged / independent review pending / alpha NOT RUN / Android NOT RUN / iOS NOT RUN / PR NOT CREATED / closure NOT READY. 데스크톱 jsdom이나 viewport 에뮬레이션으로 실제 Android/iOS PASS를 주장하지 않는다.

### B0 실제 RED와 B1 구현 후보
- root 실제 B0 실행 결과는 **17개 중 13 FAIL / 4 PASS, 15.85s**다. 위 14/3은 실행 전 예상이며 관측값으로 대체하지 않는다. 실제 원인은 SELECT 대 BUTTON, 시트 내부 listbox 부재, 키보드 선택 부재였다. Tab과 세션 차단 3종은 기존 동작으로 통과했다.
- 실제 로그: `F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa148-topic-picker-original-red.log`. runner가 실행된 뒤 나타난 pnpm 후행 `vitest not found` wrapper를 bootstrap 미실행으로 해석하지 않는다.
- root가 B1을 승인한 뒤 앱의 combobox button과 동일 문의 시트 안 inline listbox를 구현했다. five topic constants와 기존 category/titlePrefix/relatedType/relatedId는 변경하지 않았다. Enter/Space·Arrow/Home/End 활성 항목, Escape 단계, Tab 다음 제목, 선택 후 포커스 복귀, 경기 결과 고정 유형, 접수 대기 잠금과 draft/error 유지를 검증 후보로 둔다.
- 새 17사례와 기존 5사례는 그대로 유지했다. 기존 section 테스트의 native select change를 실제 option click으로 갱신했다. 키보드 사례에 활성 항목 id·미확정 이동과 기존 선택을 별도로 확인하는 assertion을 보강했다.
- deferred MSW 응답은 `try/finally`의 모든 종료 경로에서 해제한다. 전용 fixture는 모든 QueryClient를 추적·정리하고 GC 타이머를 만들지 않는다. shared MSW/hooks/helper는 편집하지 않았다.
- root GREEN 후보 명령: `pnpm --filter v1_web exec vitest run src/components/tournaments/tournament-inquiry-topic-picker.test.tsx src/components/tournaments/tournament-inquiry-section.test.tsx --maxWorkers=1 --no-file-parallelism`. **worker는 실행하지 않았으며 22사례의 실제 GREEN은 미확인**이다.
- root가 실제 alpha 변경 전 화면을 확인했다: 로그인 E2E 관리자, 제보 대회 `aef0d98f...`, native SELECT와 5유형. desktop 1682×1244 및 CDP 실제 viewport 390×844/visualScale1/dialog390×765/scrollWidth390. root QA evidence의 `mdqa148-alpha-before-desktop.png`·`mdqa148-alpha-before-mobile390-cdp.png`를 before로 기록했다. 일반 Cua screenshot의 잘못된 scale과 미적용 cap.set은 증거에서 제외했다. 문의 POST 없이 창을 닫고 CDP override 해제 후 1682×1244 복원했다.
- alpha before serving SHA는 NOT VERIFIED다. **수정 후 alpha NOT RUN / physical Android NOT RUN / physical iOS NOT RUN / independent final review pending / PR NOT CREATED / closure NOT READY**다.
- B1 파일 분리 후 modal은 201 pure LOC, picker는 114 pure LOC, 새 consumer test는 226 pure LOC다. 200~250 경고 구간의 modal/test는 후속 확장 시 책임 분리를 검토한다. worker는 테스트·타입·린트·브라우저·Git mutation을 실행하지 않았다.
- root의 실제 GREEN 및 committed diff 검수 전에는 PR 준비 완료로 판단하지 않는다. 본인 변경의 static `git diff --check`와 touched marker/import 파일 존재 확인만 수행한다.

### B2 재시도 사례 timeout 진단
- root 첫 GREEN 후보 실행 결과는 22개 중 **21 PASS / 1 FAIL**이다. 실패는 서버 503 뒤 유형 변경·재시도 consumer 사례가 5000ms를 넘긴 5342ms timeout이며, 로그는 test 시작점만 지목해 어떤 await가 걸렸는지 아직 확정하지 못한다. 로그: `F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa148-topic-picker-green22.log`.
- root 단독 실행 관측: **1 PASS / 16 skipped, 해당 사례 1.578s / total5.8s**, 로그 `mdqa148-server-retry-isolated1.log`. 실제 HTTP 503 표시 후 유형 변경·두 번째 문의 POST·접수 성공 계약은 이 실행에서 통과했다. 최초 21/1 timeout 기록은 보존한다. 어떤 최초 await에서 지연됐는지는 미확정이며 production 재시도 결함으로 단정하지 않는다.

### B3 실제 성공 응답 fixture 계약 보정
- root가 독립 리뷰의 fixture/cache drift finding을 수용했다. 기존 고정 `tournament`·`[참가·신청]`·대회 대상 성공 응답은 payment/refund·rules·other·team_match POST를 반영하지 않아 실제 API와 달랐다.
- 승인된 전용 fixture/test만 수정했다. read-only `V1CreateInquiryPayload`·`V1Inquiry`, 실제 `CreateInquiryDto`·`InquiriesService.create`/`serializeInquiry`를 대조하고, unknown JSON을 검증한 뒤 category/title/body/contact/relatedType/id/reportReason을 성공 응답에 반영한다. 생성 응답의 실제 optional replies 형태도 맞춘다. 원본 unknown POST를 그대로 기록하며 무검증 cast와 production topic helper 기반 기대값은 사용하지 않는다.
- 5유형의 기존 독립 literal HTTP assertion을 유지하고 유형별 cache 응답을 같은 literal 요청 계약과 대조한다. 경기 결과 정정·503 후 재시도·응답 대기 성공도 실제 받아들인 payload를 사용하며 성공 후 cache 검사를 보강했다. deferred `try/finally` 및 client cleanup은 유지했다.
- 22사례·production 4파일·기본 timeout은 변경하지 않았다. B3는 root 실제 테스트·타입 확인 및 동일 독립 리뷰어의 재리뷰를 기다리는 후보이며 worker는 tests/Git/runtime를 실행하지 않았다.

- 2026-10-15 root: startup-cleanup snapshot8a80f23bc에서 기존 경로·branch를 복구했다. B3 test/fixture의 LF 정규화 해시는 기존677F6A/7BB7F8과 일치하며 생산4파일은 동일하다. 실제 좁은 회귀22/22 PASS(exit0,22.37초; mdqa148-b3-green22.log), 독립 B3 static review C0/W0. 이전21PASS1timeout 및 isolated1PASS를 역사로 보존하며 이번22PASS로 갱신한다. 새 committed 타입/패턴·최신 dev 통합·PR·alpha/실기기는 아직 pending이다.
