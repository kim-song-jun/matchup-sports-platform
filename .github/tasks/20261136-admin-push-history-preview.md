# Task 20261136: 관리자 푸시 발송 이력과 미리보기

Status: Review
**Owner**: Codex (단일 세션)
**Created**: 2026-11-20

## Context
관리자는 수동 발송 후 제목·본문·대상·앱/웹 전송 결과를 전용 화면에서 다시 확인할 수 없다. 기존 감사 로그에는 제목과 인앱 생성/제외/실패 수만 남는다.

## Goal
기존 및 신규 수동 푸시를 관리자에서 조회하고, 실제 저장된 내용과 전송 집계를 구분해 미리본다. 최초 요청은 dev 대상 PR 생성이었고, 2026-11-20 사용자가 "리뷰없이 진행해줘"로 이번 PR의 Copilot 리뷰 생략과 dev 병합·Alpha 배포 진행을 승인했다. 운영 승격·광고 재발송은 포함하지 않는다.

## Original Conditions (must all be satisfied)
- [x] 지금까지 보낸 수동 푸시 이력 조회
- [x] 알림 표시 미리보기와 상세 내용/대상/발송 시각/결과 확인
- [x] 수정 후 dev 대상 PR 생성

## User Scenarios
- 관리자가 최신순 이력을 더 불러오고 한 건을 선택해 본문·이동 경로·발송자·결과를 확인한다.
- 과거 기록은 보존된 회원 알림 내용에서 확인한 경우임을 명시한다. 확인 불가/여러 내용이면 임의로 채우지 않는다.
- 신규 발송은 본문·경로·전송 결과를 감사 로그에 보존하고 이력 캐시를 갱신한다.
- 읽기 권한인 support는 이력을 조회하지만 발송 API는 계속 거부된다.

## Test Scenarios
### Happy path
- [ ] 실제 컨트롤러 경로/인증·권한, 커서 페이지 및 상세 snapshot 계약
- [x] 새 발송의 전체 payload·전송 집계 저장 및 재생 중복 방지 유지
- [x] 이력 상세 선택/로딩/오류/더 보기/미리보기 프론트 시나리오
### Edge cases
- [x] 과거 본문 미보관/다중 후보·동일 제목 반복·삭제된 알림·없는 native 집계는 unknown
- [x] 잘못된 커서·없는 ID·다른 action ID 차단
### Error paths
- [x] 감사 기록 실패를 실제 발송 실패로 오인해 재발송하지 않도록 별도 안내
### Mock data updates needed
- [x] MSW 이력 목록·상세 fixture/handler 및 send 결과 동기화

## Parallel Work Breakdown
서브에이전트 요청 없음. 단일 세션 순차 실행.
- [x] Phase 1: 현행 계약 조사, 최신 dev 격리 worktree
- [x] Phase 2: API/기록 저장/회귀 검증
- [x] Phase 3: UI A·B·C 제시 → 사용자 A안 선택 → UI/preview 구현
- [x] Phase 4: 좁은 테스트·범위 lint, self-review, 문서/changeset, PR
- [ ] Phase 5: PR CI·리뷰 확인 (Alpha 검증은 dev 병합 후 가능)
Owned: admin push service/controller/DTO/tests, push history UI/hooks/types/query keys/MSW, API docs/changeset/task.
Forbidden: 운영 데이터 변경/재발송, main 승격, 다른 작업의 worktree/변경.

## Acceptance Criteria
- [ ] 원본 요청·시나리오 충족, UI 선택 확인 후 구현
- [ ] 인증·권한 및 정렬/페이지네이션을 실제 route 계약으로 검증
- [ ] 미리보기는 기기별 줄바꿈 차이를 명시하고 실제 도착·읽음으로 가장하지 않는다
- [ ] 알림함 생성·웹·앱 전송 통계를 분리하고 보관되지 않은 값은 미보관으로 표시
- [ ] 기록/전송 실패를 가짜 성공으로 숨기지 않는다
- [ ] docs/api 동기화, changeset, diff check, 리뷰 결과 및 PR 링크 기록

## Tech Debt Resolved
- 수동 발송 감사 로그에 본문·이동 경로·전송 결과 누락.
- 웹 전용처럼 표시되는 발송 메뉴/설명과 실제 앱+웹 전송 계약의 차이.

## Security Notes
기존 V1AuthGuard + active admin 읽기, owner/ops 쓰기 유지. 기기 토큰·구독 endpoint·비밀값은 이력 응답에 포함하지 않는다. preview는 inert 콘텐츠이며 저장된 외부/위험 경로를 링크로 렌더하지 않는다.

## Risks & Dependencies
- 기존 감사 로그만으로 본문을 확정할 수 없다. 보관된 회원 알림을 조회하되 출처를 표시하고 모호하면 unavailable로 응답.
- 신규 스키마·마이그레이션 없음. 기존 V1AdminActionLog JSON과 V1Notification을 사용.
- 현재 환경 ego-lite 및 Alpha 인증/feature 배포 가용성을 확인 중. PR 생성 요청이므로 임의 dev/main 병합하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-11-20 | Codex | UI 배치 | A 탭/B 하단 목록/C 별도 메뉴 제시, 사용자 A안 명시 선택 |
| 2026-11-20 | Codex | 과거 데이터 | 원본 미보관 값은 명시하고 확인 가능한 보관 알림만 출처와 함께 표시 |

## Progress Snapshot
- Base: origin/dev 8950d7b29c. Branch feat/admin-push-history-20261120.
- 실제 운영 계정·토큰·광고 발송 식별자는 이 공개 문서에 기록하지 않는다.
- 현재: [Draft PR #2461](https://github.com/kim-song-jun/matchup-sports-platform/pull/2461), base=dev, source commit 0e4f4f23e5. CI 진행 중; Copilot 요청은 CLI/REST 모두 2xx지만 requested_reviewers·timeline·reviews가 비어 있어 실제 실행 미확인. 변경 화면 Alpha 검증 전이므로 Draft 유지.

## Validation & Review Evidence
- Backend: 4 suites / 54 unit+HTTP tests PASS (single worker). Auth guard override is only the HTTP test boundary; controller active-admin gate and support read-only vs mutation permission are exercised.
- Backend typecheck PASS after generating an isolated, current-schema Prisma client (shared preinstalled generated client was stale; shared dependencies were not rewritten). Surface policy PASS.
- Frontend: form 13 + shell 13 + history 6 + tab navigation 2 = 34 tests PASS. History tests use real query hooks + MSW HTTP and cover cursor append, filters, unavailable/ambiguous content, retry, modal Escape and focus return. Final focused history run also PASS with explicit telemetry MSW handler (no unhandled requests).
- Frontend typecheck PASS. Pattern policy PASS (undefined tokens/font/radius/spacing/scrim 0).
- Added 3 persisted-data integration scenarios using approved integration DB guard/app helper; not run locally because this work has no isolated local integration DB. CI owns DB execution.
- Self-review: payload snapshot and read path, existing dedupe/replay, active-admin read/owner+ops write, no token leak, no live preview send, external route inert, stable cursor, old content uncertainty, support UI gate, portal/focus/scroll/phone layout considered. No new debt marker; diff whitespace clean.
- Alpha before: ego-lite authenticated administrator session, /admin/ops/push-send, 390/768/1440 × 900. Baseline captures under operator-local tmp/qa/push-history-20261120 (not committed). No notification sent. Existing mobile screenshot visually inspected.
- Alpha after and changed-screen console/network verification: **pending dev merge/deployment**. User scope is PR creation; no dev/main merge or deployment is executed here. PR remains Draft until the visual gate is complete. No test pass is presented as visual QA completion.

### UI choice trade-offs
| Option | Strength | Trade-off | Reuse |
|---|---|---|---|
| A: same-menu tabs (chosen) | Sending and review share one entry; form draft remains across tabs | One extra tab click | SegmentedTabs, AdminDataTable, AdminEmpty, AdminInlineError, useModalA11y, SectionTitle |
| B: history below form | Everything in one scroll | Long form pushes history below fold | Same primitives |
| C: separate menu | Independent bookmark/navigation | Additional admin navigation entry and context switch | Same primitives |

## PR handoff
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2461 (Draft, dev 대상)
- CI: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44659728783 (API/Web/Gates 진행 중, 완료로 표시하지 않음).
- 후속: CI DB 통합 결과·Copilot 최신 head 리뷰 확인 → dev 병합이 승인/요청되면 배포 후 ego-lite로 발송 이력·상세·작성 미리보기/권한/390·768·1440·console/network 검증. 실제 전체 푸시 발송은 QA로 실행하지 않는다.
- Copilot: `gh pr edit --add-reviewer @copilot`와 공식 requested_reviewers REST 모두 성공 응답이나 reviewer 목록/요청 이벤트/리뷰는 비어 있음. clean 리뷰로 취급하지 않으며 Draft 해제·후속 승인 시 재확인이 필요하다. 반복 요청은 하지 않는다.
- Cleanup 계획: 원격에 커밋이 보존됨을 대조한 뒤 이번 작업의 의존성 symlink·격리 생성 client·로컬 worktree만 정리한다. 미병합 작업 브랜치는 보존하고 baseline 스크린샷은 after 비교를 위한 로컬 QA 증거로 유지한다.

## Deployment continuation — 2026-11-20
- 사용자 승인: "리뷰없이 진행해줘". 이번 PR #2461의 Copilot gate만 생략하며 CI/배포/Alpha 화면 검증은 유지한다.
- 최초 최종 head b1a240d56e: CI 44659988562의 API/Web/Gates PASS. 발송 이력 persisted-data 통합 스위트도 실제 CI PASS.
- 최신 dev 동기화 중 admin.module.ts 및 API 문서 2곳이 충돌했다. MemberAccess/AdminEntityOperations 등록과 PushHistory 등록, 양쪽 API 계약을 모두 보존해 해결했다.
- [ ] 동기화 head CI 통과 및 dev 대상/미해결 스레드 0 재확인 후 병합
- [ ] Alpha 배포 성공·서빙 SHA가 머지를 포함하는지 검증
- [ ] ego-lite 로그인 상태에서 이력·상세·필터·작성 미리보기·탭 입력 보존·390/768/1440·console/network 검증
- [ ] 소유 worktree/브랜치/프로세스 정리. 공유 루트의 다른 세션 대량 WIP는 보존.
