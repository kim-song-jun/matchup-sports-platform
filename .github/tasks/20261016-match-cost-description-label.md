# Task 20261016: 개인 매치 목록의 자유 입력 참가비 설명 (#1586)

Status: Review
**Owner**: Codex bugfix session
**Created**: 2026-10-03

## Context

실제 alpha 개인 매치 행·사진 레일·태블릿 카드의 메타에서 자유 입력 `10000`이 설명 없이 보였다. 비용 카드의 matchId는 공개 증거에 없으며 세 캡처를 세 개의 독립 fixture로 주장하지 않는다. v1 `costNote`는 문자열/null 자유 입력 계약이다.

## Goal

원문과 null 계약을 유지하면서 목록의 현재 메타 위치에 `참가비 설명: 원문`을 표시한다. 숫자에 통화/단위/무료 의미를 추정하지 않는다.

## Original Conditions (must all be satisfied)

- [ ] 주 목록 행·사진 레일·인접 레일에 비용의 의미를 안내한다.
- [ ] raw `10000`, 알려진 단위 문자열, 무료, 자유 메모를 변경 없이 보존한다.
- [ ] null/빈 값은 설명 자체를 표시하지 않고 0원/무료로 바꾸지 않는다.
- [ ] 검색/필터·from 링크·상태/참가수·상세/작성/저장 계약을 유지한다.
- [ ] 실제 alpha after와 3폭 시각·console/network 회귀는 외부 승인 배포 뒤 검증한다.

## User Scenarios

사용자는 종목·레벨·성별과 함께 “참가비 설명: 10000”을 읽고 그 숫자가 비용 메모임을 알 수 있다. “10,000원/1인”, “무료”, “구장비 현장 정산”은 원문을 유지하며 비용 메모가 없으면 표시하지 않는다.

## Test Scenarios

### Happy path

- [x] 실제 SSR 공용 toMatchCard → 실제 MatchListPageView의 행/사진/인접 레일에서 라벨+원문을 확인한다.
- [x] 숫자만/단위 포함/무료/자유 메모/알려지지 않은 단위의 원문을 보존한다.

### Edge cases

- [x] null·빈 값에서 라벨과 빈 구분점이 생기지 않는다.
- [x] 연속 rerender 입력의 최신 비용 원문과 필터 from 링크·상태·제목이 유지된다.

### Error paths

읽기 전용 표시 변경이며 API 호출·실패 fallback·저장/재시도 경로를 추가하지 않는다.

### Mock data updates needed

테스트 내부 typed 합성 V1Match만 사용한다. 실제 cost fixture의 ID를 만들거나 서버/seed/MSW/실제 팀 값을 바꾸지 않는다.

## Parallel Work Breakdown

- Root: 이 전용 worktree에서 소유 경로 구현·초점 테스트·명시 pathspec 커밋·Ready dev PR·정확한 head CI.
- Independent agent: committed diff의 정적 리뷰. 이 제품 코드를 작성한 root와 분리한다.
- Sequential: A/B/C HTML → 사용자 A 승인 → RED/GREEN → lint/gates → PR/CI/review → 별도 배포 뒤 alpha.

### Owned files

- `apps/v1_web/src/components/matches/matches-page.tsx`
- `apps/v1_web/src/components/matches/matches-page.test.tsx`
- `.github/tasks/20261016-match-cost-description-label.md`
- `.changeset/match-cost-description-label.md`

### Forbidden files/actions

API/DTO/schema/mapper/filter/eligibility/작성/편집/저장 계약, #1587/#1588 미병합 코드 혼합, 실제 팀·가입·QA179·완료 QA 결과·다른 세션 변경, merge/automerge/deploy/유료 리뷰 재요청.

## Acceptance Criteria

- [x] source와 실제 before·중복 PR 확인. base `8167aaa86ed3cc787bd82568515ad1f9d21d0ef2`, branch `fix/issue-1586-match-cost-description-label`, worktree `/tmp/teameet-issue-1586-20261003`.
- [x] private HTML A/B/C와 추천 A 제시 → 부모가 전달한 사용자 `ㄱㄱ`로 A 승인. 현재 메타 위치에 참가비 설명 라벨을 붙이는 범위다.
- [x] 초점 RED/GREEN·기존 목록 링크/필터 회귀.
- [x] lint/typecheck·필수 gate·changeset 정책·marker/diff scope 확인.
- [ ] committed exact scope·Ready dev PR·정확한 head CI·독립 정적 리뷰.
- [ ] 실제 3폭 alpha after·긴 메모 줄바꿈/가림·Back/필터/연속 입력·console/network. 초점 PASS를 전체 QA 완료로 표현하지 않는다.

## Tech Debt Resolved

기존 불명확한 자유 입력 메타에 의미를 추가한다. 새로운 currency parser/공유 계약을 만들지 않는다.

## Security Notes

읽기 전용 공개 합성 증거와 로컬 합성 테스트만 사용한다. 개인 신원·연락처·비밀·`.env*`는 읽거나 게시하지 않는다. 서버 쓰기·실제 데이터 변경 없음.

## Risks & Dependencies

라벨 길이가 늘어 실제 3폭 긴 문자열 줄바꿈을 외부 alpha 배포 뒤 확인해야 한다. 공개 source SHA를 serving SHA로 간주하지 않는다. A 선택은 numeric→KRW 정책 승인이 아니다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | QA | 숫자 `10000`의 통화·단위 | 자유 입력 계약. 추정/포맷 변환 금지. |
| 2026-10-03 | Codex | 표시 위치 | A/B/C HTML 제시 뒤 사용자 A 선택: 현재 메타 줄에 의미 라벨. |

## Progress Snapshot

2026-10-03: fresh origin/dev worktree, source/실제 before 확인과 A 승인을 고정했다. 구현·검증 결과와 정확한 원격 head CI/리뷰를 이어서 기록한다. 실제 after는 외부 승인 배포 대기, 이슈 Refs/Open 유지.

- RED(수정 전 실제 mapper→목록 view 신규 8개): 라벨 누락으로 6 FAIL / 2 PASS, 기존 58 SKIP. Product는 기존 행·사진/인접 카드의 메타 join 두 곳에만 조건부 `참가비 설명: 원문`을 추가했다. 기존 상세·API·mapper·입력/저장/필터 계약을 변경하지 않았다.
- GREEN: page/card-model/client/validation 4 files **123 PASS**(page 66, mapper 10, client 31, validation 16), worker1. 라벨과 null·원문/미변환·from 링크·연속 props 갱신을 실제 view에서 확인했다. 기존 client는 view mock을 사용하므로 그 31 PASS를 새 비용 문구의 실제 client 통합 증명으로 확대하지 않는다.
- Root `pnpm --filter v1_web lint`(tsc+v1-pattern) 1회 PASS. 필수 aggregate gates 6/6, changeset policy PASS. 정확한 4path candidate·diff check·새 marker 0 확인. 의존성 링크 2개를 제거하고 명시 commit/Ready dev PR·정확한 head CI·독립 리뷰로 이어간다.
- Host: 직렬 검증 전 12 cores, load 6.40/5.11/4.82, memory free 67%, swap 5010.94/6144 MB, Node77/browser40; 기존 Docker8서비스 Up/6healthy. 사용자 승인 범위의 좁은 검증만 worker1로 실행했고 다른 프로세스·서비스를 건드리지 않았다.
- 실제 CSS3폭의 긴 원문 줄바꿈/겹침·실제 Back/Forward/연속 필터 입력·console/network·정확한 alpha after는 미검증이다. 실제 비용 fixture의 matchId도 공개 증거에 없어 임의 엔티티/단위를 만들지 않았다. 별도 승인 배포 대기, issue Refs/Open 유지.

## 2026-10-04 latest-dev reconciliation

PR #1592 remains Ready/base dev. Its original exact-head CI and static review passed, but current dev 27a021fc7650672d5af25217108b101dc856c8d5 adds the completed-match notice regression at the same test insertion anchor. Relocate only this issue's unchanged describe group (and #1592's two imports) to avoid that textual conflict, then integrate current dev without dropping either test contract. No runtime correction or new UI choice is introduced. The other unmerged PR's feature is excluded.

The original tests/CI above belong to their recorded SHA. Focused tests, lint and exact new-head CI after integration remain pending; actual alpha after remains with the parent's browser QA.
