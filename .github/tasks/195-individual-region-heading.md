# Task 195: 개인 매치 목록의 고정 서울 제목 교정 (#1544)

Status: In Progress
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
실제 alpha에서 부산을 선택·적용한 URL과 필터는 부산을 유지하지만 시각/DOM H2·AX는 ‘서울 전체 · 개인 매치’다. v1 기본 list view-model의 고정 label이 실제 client에서 그대로 쓰인다. 서버 지역 결과 정확성 결함으로 확대하지 않는다.

## Goal
이슈가 허용한 중립 제목 ‘개인 매치’로 지역 모순을 제거하고 별도 Ready/base dev PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] fetch 직후 최신 origin/dev에서 전용 worktree/브랜치를 만든다. #1543/PR1545와 다른 미병합 코드를 섞지 않는다.
- [x] 부산 적용 뒤 실제 목록 H2가 선택 조건과 모순되지 않는다.
- [x] reload/지역 전환/초기화 대조군에서 기존 요청·선택·건수·상세 복귀 링크 계약을 유지한다.
- [ ] 최소 문구 수정·초점 테스트·lint·aggregate·명시 경로 커밋·푸시·정확한 head CI를 기록한다.
- [ ] 원본 실제 alpha 6사진·DOM/AX proof를 공개 PR에 연결하고 3폭 after는 별도 승인된 배포 뒤 확보한다.
- [x] 실제 데이터·권한·QA179 명단·완료 QA 결과·다른 세션 작업을 수정하지 않는다.

## User Scenarios
- 부산 또는 다른 지역을 선택해도 서울 목록이라는 잘못된 안내를 보지 않는다.
- 필터 재개에서 선택 지역을 확인하고 초기화 또는 닫기/적용하기로 돌아와도 제목이 모순되지 않는다.
- 결과 카드의 상세 링크는 현재 필터 URL을 from으로 유지하며 실제 로딩·오류 상태는 구분한다.

## Test Scenarios
### Happy path
- [x] 실제 list client+공용 page의 부산/서울/미선택/unknown 지역 × 빈 결과/카드 대조군: H2 의미·요청·건수·CTA/상세 from.
### Edge cases
- [x] 필터 재개·지역 전환·초기화·컴포넌트 재마운트와 초기 로딩.
### Error paths
- [x] 기존 실패/재시도 안내와 제목 유지 회귀. 서버 실제 응답 정확성/console/network는 alpha after 대기.
### Mock data updates needed
- API/DTO/schema 변경 없음. 테스트에서 query/navigation/shell 경계만 대체하고 실제 H2·list client·page·view-model·필터 UI는 대체하지 않는다.

## Parallel Work Breakdown
### Frontend
- [x] 기본 summary label 한 줄을 중립 ‘개인 매치’로 바꾸고 실제 렌더 회귀를 추가한다.
- 기계적인 고정 문구 교정이며 새 컨트롤/레이아웃/디자인 설계가 없다(CLAUDE UI 착수 예외).
### Read-only evidence
- [x] 독립 에이전트가 고정 원본6사진·proof·중복 범위를 대조한다. 편집/커밋/서버 작업 금지.
### Sequential
- [ ] 좁은 RED→GREEN·단일 worker 회귀·lint/6 aggregate/changeset·명시 경로 커밋·Ready PR·CI/독립 리뷰.
- [ ] 별도 승인된 alpha 배포 뒤 402→787→1180px 실제 필터 적용/재개·reload·초기화·Back/Escape/취소·빈 결과/카드·console/network를 확인한다.
### Owned / Forbidden files
- Owned: `apps/v1_web/src/components/matches/matches.view-model.ts`, `apps/v1_web/src/components/matches/matches-region-heading.test.tsx`, 이 문서, `.changeset/individual-match-region-heading.md`.
- Forbidden: matches-client/page·shared hooks/types/style/API/DTO/schema·다른 worktree·PR1545·실제 QA/운영 데이터·권한·배포.

## Acceptance Criteria
- [x] 선택 지역과 모순되지 않는 실제 H2 이름을 초점 테스트로 증명한다.
- [x] 지역 query·필터 선택/초기화/닫기·숫자 요약·상세 복귀 링크는 기존 계약 유지.
- [ ] 테스트·lint·필수 검사와 committed-tree 범위를 기록한다.
- [ ] 실제 3폭 alpha after 및 원래 전체 수용 조건을 충족하기 전 이슈를 종료하지 않는다(Refs #1544).

## Tech Debt Resolved
- 실제 목록에 남아 있던 목업 서울 제목을 지역에 독립적인 중립 이름으로 교정한다.

## Security Notes
문구만 수정한다. 지역 필터링/가입/권한/저장 계약이나 서버 데이터는 변경하지 않는다. 환경 파일·자격증명은 읽거나 공개하지 않는다. 서버 저장0회.

## Risks & Dependencies
- 원본6사진과 DOM/AX proof는 실제 alpha before이며 수정 after가 아니다. 페이지 serving SHA·브라우저 제품/버전은 미기록이다.
- 태블릿 목록 사진의 빈 안내는 프레임 밖이고 AX 근거로만 관찰됐다. 실제 스크린리더 실청취·물리기기·서버 필터/건수 정확성·전체 console/network는 미검증이다.
- 테스트는 실제 컴포넌트 계약이며 실제 Next 서버/브라우저/지역 DB 정합성 검증을 대체하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 동적 지역명 또는 중립 제목 | 이슈가 허용한 중립 ‘개인 매치’로 최소 교정. 지역 master 로딩/unknown의 표시 계약을 새로 만들지 않음 |

## Progress Snapshot
- base `be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d`; worktree `/tmp/teameet-issue-1544-20261002`; branch `fix/issue-1544-individual-region-heading`.
- 실제 alpha before commit `e317ac1845ea488ca62b3ffbc208720e3a784d83`, `docs/qa/2026-10-02-individual-region-heading/`. CSS402×606/787×505/1180×757, UTC 2026-10-02 10:38:19.796–10:41:04.319. 모바일JPEG402×605.
- 제목·선택·URL 불일치로 범위 고정. 실제 서버 필터 결과의 정확성은 이 수정의 PASS 근거로 주장하지 않는다.
- 신규12계약 RED11 FAIL/1 오류 대조군PASS → 관련5suites GREEN117 PASS(신규12+기존105), 1worker/직렬. 실제 H2/list client/page/filter/view-model을 렌더하며 API/Next navigation/shell hook만 fixture다. query snapshot 전환/재마운트는 실제 Next 브라우저 reload·Back 검증으로 주장하지 않는다.
- 기존 matches-wave3 테스트의 Next Link mock에서 prefetch=true DOM warning1건이 발생했다. 새 테스트에는 해당 warning이 없고 제품 동작/CI PASS 근거로 숨기지 않는다.
- 독립 사진6/6 byte/SHA256/Gitblob/raster/픽셀 PASS, proof19,491B/blob `ba0dc8c2…`. tablet 빈 안내는 AX 근거만, reload/reset은 작업/DOM 기록만 있다. 실제 region query/선택/건수 계약은 제목 값과 독립이다.
- 필수 aggregate6/6와 changeset patch 정책 accepted, diff check PASS. frontend lint·커밋·원격 CI 결과는 확인 뒤 기록한다.
- lint preflight: load149.38/114.05/105.33, 12cores, swap11860.06/12288MB, Node149/browser52. 사용자 재개 지시에 따라 로컬1회 최소 직렬 lint만 실행. Docker read-only 조회4초 timeout(자체 subprocess만 종료), alpha HEAD200.
- frontend lint(typecheck+패턴) PASS. touched-path debt marker0, 새 외부 의존성/미추적 import없음. 명시4파일 committed scope와 원격 CI·리뷰는 PR에 기록한다.
