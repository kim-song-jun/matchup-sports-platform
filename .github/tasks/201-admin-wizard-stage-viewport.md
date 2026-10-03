# Task 201: 어드민 대회 위저드 단계 시작의 viewport 가림 보완

Status: Review — alpha verification pending
**Owner**: Codex issue fix session
**Created**: 2026-10-02

## Context
Refs #1437. PR1473의 단계 제목 focus/실제 scroller 초기화 및 PR1493의 날짜 오류 focus는 병합됐다. 현재 alpha stage2→3에서 H2 focus/scroll0은 동작하지만 작은 모바일403×606의 첫 입력과 태블릿788×505의 H2/첫 입력이 fixed footer에 가려진다는 후속 실제 증거가 있다. Tab/scroll 뒤 회복 및 데스크톱1182×758 정상과 구분한다. 기존 수정과 열린 PR 중복을 확인했고 관련 새 wizard 구현은 없다.

## Goal
단계 전환 시 실제 viewport·scroller·sticky header·fixed CTA 범위에 맞춰 제목과 첫 입력을 가능한 범위 내 보이게 하고, 기존 단계/오류 포커스·입력 보존·생성 gate를 유지한다.

## Original Conditions
- [ ] 다음/이전/스테퍼 전환에서 H2 focus를 유지하고 제목·첫 필드를 가능한 범위 내 표시한다.
- [ ] desktop의 이미 충분한 공간, 첫 렌더·입력 변경에는 불필요한 focus/scroll jump가 없다.
- [ ] validation 실패는 실제 첫 오류 control에 focus하며 오류 단계 진입도 제목 focus보다 우선한다.
- [x] reduced-motion·내부 scroller·문서 scroller·짧은 viewport 및 visualViewport 경계를 초점 테스트한다. 실제 가상키보드는 미검증이다.
- [x] 이전 입력값·다음 버튼 type/key·생성/업로드/저장/접수 gate를 변경하지 않는다. 실제 데이터 쓰기는 수행하지 않는다.
- [ ] Ready/base dev/Refs, 정확 committed head CI 및 독립 검토를 기록한다.
- [x] 실제 alpha before·원본 crop 한계를 보존하고 수정 after는 승인된 배포까지 대기한다.

## User Scenarios
1. 아래로 내려간 일정 단계에서 다음을 누르면 참가 조건 제목과 첫 입력을 볼 수 있다.
2. 이전/스테퍼로 돌아가도 해당 제목에 focus하며 입력을 보존한다.
3. 잘못된 필수값으로 이동 실패 시 오류 control이 우선하고 잘못된 단계 자동 제출이 없다.

## Test Scenarios
### Happy path
- [x] 실제 AdminTournamentsNewPage 렌더·단계 액션·H2 focus·브라우저 geometry 경계 fixture·scroll 목표를 검증한다.
### Edge cases
- [x] 모바일→태블릿→데스크톱, nested/document scroll, 이미 보임, 좁은 가용 높이, reduced-motion, 반복/뒤로/스테퍼, 최초 렌더/입력 변경의 무개입을 단위 테스트한다.
### Error paths
- [x] 같은 단계/다른 단계 오류·날짜 오류 control focus 유지 및 create/update/upload/status mutation0을 단위 테스트한다.
### Mock data updates needed
- 측정 없는 JSDOM을 CSS/실제 alpha PASS로 세지 않는다. geometry는 브라우저 API 경계 fixture이며 API/DTO/MSW 저장 계약 변경 없음.

## Parallel Work Breakdown
- Main Owned: `apps/v1_web/src/app/admin/tournaments/new/page.tsx`, 같은 폴더의 stage viewport helper/test 필요 시, 기존 `page.test.tsx`, 이 task, patch Changeset.
- Read-only delegate: 공개 고정 증거/metadata·Git blob/픽셀·시간/폭/crop 한계 확인, 현행 focus/scroll 계약 및 최종 committed scope 검토. 편집·테스트·브라우저·원격 쓰기 없음.
- Forbidden: admin-shell/shared scroll helper·다른 미병합 PR1539/team form 코드·API/DTO/schema·실제 팀/경기/명단/권한·QA179/완료 결과·실제 폼 Save/upload/생성/접수·merge/deploy.
- 사용자 지정 viewport-aware stage focus/scroll 최소 보완을 따른다. 새 UI 레이아웃/스타일/디자인 안으로 확대하지 않는다.

## Acceptance Criteria
- [x] 수정 전 실제 page 테스트 RED 10 FAIL / 3 PASS → 최종 GREEN 2 suites / 82 PASS. geometry fixture 한계를 기록한다.
- [x] scope lint/typecheck·v1 패턴 및 필수 aggregate guardrails6/6 PASS.
- [ ] 정확 committed head CI.
- [ ] 명시 pathspec commit·전용 feature push·Ready dev PR와 새 독립 리뷰.
- [ ] 원본 #1437 수용조건 전체를 실제 alpha에서 확인하기 전 종료하지 않는다.

## Tech Debt Resolved
- 단계가 바뀌었을 때 viewport 위치 대신 scroller0만 기대하는 부분을 보완한다.

## Security Notes
- 실제 Save/upload/생성·경기/권한/가입/결과 쓰기 없음. 공개된 합성 QA 증거만 사용한다.
- 토큰/비밀번호/env/비공개 브라우저 transcript는 읽거나 노출하지 않는다.

## Risks & Dependencies
- 기존 PR1473/1493의 오류 focus와 마지막 입력 단계의 button/submit key를 유지한다.
- 실제 alpha 증거: commit `c2b45f3e68d95e1cdcaa3db3e829c0044ed822cd`, `docs/qa/2026-10-02-admin-wizard-local/wizard-local` 및 [원 이슈 후속 회귀](https://github.com/kim-song-jun/matchup-sports-platform/issues/1437#issuecomment-5961438354). PR1473/1493 이후 사진은 이번 잔여 수정의 before이며 2026-10-01 원래 문제의 before/새 수정 after가 아니다.
- 이미지05는 모바일4→3 이전 후 20:31:27.277 UTC,08은 태블릿2→3 다음 후 20:32:40.924 UTC,10은 데스크톱2→3 다음 후 20:33:18.754 UTC다(2026-10-02). CSS403×606/788×505/1182×758과 PNG403×606/788×505/910×743을 구분한다. 개별 페이지 serving SHA는 미관측이다.
- 원본6PNG+summary/provenance 8파일의 공개 HTTP200·Git blob·바이트 일치,6PNG의 SHA256/raster/decode 및 직접 픽셀을 독립 검토했다. 최초3장 픽셀은 구현 담당도 직접 확인했다. 모바일06/태블릿09는 Tab 회복,07은 별도2단계 날짜의 수동 scroll 회복이며 새 수정 after가 아니다.
- 태블릿 원본3장의 오른쪽1px 검정은 crop 부산물이라는 QA 설명이며 제품 결함으로 수정하지 않는다.
- 승인된 alpha 배포 뒤 같은 데이터/viewport/조건에서 title/first input bounds·focus/keyboard·scroll/console/network·중단/반복 검증이 필요하다. local geometry 테스트는 실제 브라우저 레이아웃/keyboard 증거가 아니다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-02 | Parent | 기존 scroll0/H2 focus와 남은 가림은 중복인가 | 기존 수정은 유지하고 작은 viewport의 stage 위치만 추가 보완한다. 이미지 오른쪽 crop1px 제외, 실제 Save/upload/생성0. |

## Progress Snapshot
- Fetch 직후 base `a105f40a1490ccf228568084a43610822d7a18da`, 전용 worktree `/tmp/teameet-issue-1437-20261002`, branch `fix/issue-1437-wizard-stage-viewport`.
- 원 #1437 OPEN, PR1473/1493 merged. 열린 dev PR 목록에 같은 wizard 수정 없음. 다른 worktree/미병합 코드는 가져오지 않는다.
- 제품 변경: 단계 이동 시 실제 visual viewport/scroller/header/footer를 측정하고 제목과 첫 control이 scroll0에서 보이면 기존 위치를 유지한다. 가리면 제목을 가용 영역 시작으로 이동하고 scroll 가능한 범위로 제한한다. 오류 이동은 기존 control focus를 우선하며 첫 렌더·같은 단계 입력에는 개입하지 않는다.
- 최종 local 초점 검증은 page63+model19=82 PASS다. 신규14개는3폭/문서·내부scroller/visualViewport/짧은 높이/clamp/reduced-motion/무개입/반복/오류 우선/Enter·Tab/서로 다른 control 위치를 다룬다. 실제 page와 Providers는 렌더하고 API hook 경계만 mock한다. CSS·실제 스크롤 애니메이션·기기 keyboard PASS가 아니다.
- frontend lint/typecheck·v1 패턴1회 PASS, 필수 aggregate guardrails6/6 PASS, Changeset 정책 PASS(behavior2/Changeset1), touched-path debt grep·diff check PASS. 전체 웹/API 단위·통합·빌드는 정확 committed head의 CI에 맡긴다.
- 독립 정적 검토5/5에서 제품 actionable 미발견, 첫 control 선정의 테스트 빈틈1건은 desktop에서 후속 control의 좌표를 달리한 회귀로 보강했다. 수정 after/실저장/실브라우저3폭 검증은 별도 승인된 배포 뒤 대기한다. 최종 committed head 리뷰·CI 결과는 PR에 기록한다.
