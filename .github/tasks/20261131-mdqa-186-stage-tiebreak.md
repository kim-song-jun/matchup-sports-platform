# Task 20261131: 단계별 동점 순서 · 최소 실점 · 6강 직행 순서 (MD-QA #186)

Status: In Progress
**Owner**: Planning team → backend-data-dev · frontend-ui-dev
**Created**: 2026-11-11

## Context

MD-QA #186: 예선·본선처럼 조별리그 단계가 여럿인 대회는 단계마다 외부에 공지한 동점 규정이 다르다. 지금은 대회 하나에
동점 순서가 하나뿐이고(`V1Tournament.tieBreakOrder`), 후보에 최소 실점이 없으며, 6강 결승 직행 비교 순서
(다득점 → 득실차 → 최소 실점)는 `six-team-state.ts` 에 고정돼 있다. 대회 순서 잠금도 "예선 결과 하나라도"라 넓다.
정본: `docs/design/competition-canonical-flow.md` §5 동점 처리 · §6 결정 이력 "단계별 동점 순서·최소 실점·6강 직행 순서".

## Goal

조별리그 단계마다 동점 순서를 따로 정하고(없으면 대회 설정 상속), 최소 실점을 후보로 고르고, 6강 직행 비교 순서를 대회마다
정할 수 있으며, 어드민은 프리셋 우선(A안) 화면으로, 관전자는 단계별 규정 안내로 그 결과를 본다.

## Original Conditions (must all be satisfied)

- [ ] 조별리그 **단계**(예선/본선 등, 조 A/B 단위 아님)마다 동점 순서를 두고, 없으면 대회 기본값을 상속한다.
- [ ] 모델: `V1TournamentStageTieBreakSetting { id, tournamentId, stageKey, order Json, createdAt, updatedAt } @@unique([tournamentId, stageKey])`, expand-only migration.
- [ ] 해석 순서: 단계 행 → 대회 → 플랫폼 기본값. 표준 순위 계산 4곳(정본 순위 소스·결과 확정 자동 반영·조별 순위 미리보기·12강 교차 비교) + 공개 presenter 가 조의 `stageKey` 로 고른다.
- [ ] 공개 응답에 단계별 해석된 순서를 실어 안내 줄에 쓴다.
- [ ] API `PUT /admin/tournaments/:id/stages/:stageKey/tie-break-order {order|null, expectedRevision}` (null = 대회 설정 따름), owner/ops 만, 서비스 계층 권한 검사.
- [ ] 잠금: 단계 값은 그 단계 공식 결과가 하나라도 생기면 409, 대회 기본값은 그 기본값을 상속하는 단계(또는 단계 없는 조)에 확정 결과가 있을 때만 409(기존 대회 전체 잠금을 좁힌다).
- [ ] 감사: `tournament.stage_tie_break.update` before/after + 상속 여부.
- [ ] 6강 결승 직행 비교 순서를 대회마다 설정(다득점·득실차·최소 실점, 운영자 선택은 언제나 마지막, 기본값 = 현재 순서라 기존 대회 불변). 6강 결과(직행 판정에 쓰는 첫 세 경기)가 확정되면 잠금. 설명 문구가 설정된 순서를 보여 준다.
- [ ] 조별 기준에 '최소 실점'(`fewest_goals_against`) 추가. 저장된 6칸 순서는 추첨 바로 앞에 최소 실점이 들어간 것으로 읽는다(순위 불변). validator·calculator·라벨·편집기 갱신.
- [ ] UI = A안 「프리셋 우선」: 대회 단위 프리셋(맞대결 우선 / 득실차 우선 / 다득점 우선 / 직접 정하기), 단계마다 compact select("대회 설정 따름" 기본), 직접 정하기는 BottomSheet 안의 TieBreakOrderEditor 재사용. 공개 안내는 프리셋과 같으면 프리셋 이름을 보여 준다.
- [ ] 프리셋은 API 검증과 웹 라벨이 공유하는 단일 소스(서버 `tournament-tie-break-presets.ts`, 웹 사본은 서버 소스를 읽는 테스트로 대조).
- [ ] 같은 변경에서: `types/api.ts`, hooks, MSW, fixtures, Jest/Vitest 단위·통합, `docs/api` 도메인 문서, `llms-full-render` 문구, `tournament-flow-section.tsx` 의 낡은 문구("승점과 득실차로…") 수정.
- [ ] migration replay + drift + expand-contract 게이트 통과, 스키마 해시 핀 재고정(Dockerfile.v1-api · alpha-manifest-common.sh · create-alpha-release-manifest.sh · prepare-task168-final-steady-inputs.sh · game-schema.fixture.ts).
- [ ] v1_api·v1_web minor changeset.

## User Scenarios

### Scenario 1: 대회 프리셋 고르기
As a 플랫폼 운영자, I want 대회 정보 수정에서 「득실차 우선」을 고르기 so that 공지한 규정대로 순위가 나온다.
1. 어드민 › 대회 › 정보 › 수정 2. 동점일 때 순서에서 「득실차 우선」 라디오 카드 선택 3. 저장
Expected: 정보 화면에 "득실차 우선" 과 순서 한 줄, 공개 순위표 안내 "득실차 우선 규정이에요. …".

### Scenario 2: 본선만 다른 규정
As a 운영자, I want 2단계 본선만 「다득점 우선」 so that 단계별 공지와 맞는다.
1. 단계형 대회 정보 화면의 「단계별 동점 순서」 2. 2단계 select 에서 「다득점 우선」 → 바로 저장
Expected: 2단계 순위표 아래 안내가 다득점 우선, 1단계는 대회 설정.

### Scenario 3: 잠금
1단계 경기 결과가 하나 확정되면 1단계 select 가 잠기고 "이 단계 경기 결과가 확정돼서 바꿀 수 없어요." 가 보인다. 대회 설정은 모든 단계가 따로 정해졌거나 결과가 없는 단계만 상속 중이면 계속 바꿀 수 있다.

### Scenario 4: 6강 직행 순서
6강 방식 대회의 정보 수정에서 「결승 직행팀 고르는 순서」를 득실차 → 다득점 → 최소 실점으로 바꾸고 저장. 공개 6강 대진 설명이 그 순서를 말한다. 첫 세 경기 중 하나가 확정되면 잠긴다.

## Test Scenarios

### Happy path
- [ ] 단계 행이 있으면 그 단계 조의 저장 순위가 단계 순서로 계산된다(정본 소스·자동 반영·미리보기).
- [ ] 단계 행 저장/삭제(null) → 감사 기록, revision 증가, 응답 view 의 tieBreak 블록 갱신.
- [ ] 6칸 레거시 순서 → 7칸 정규화, 같은 순위.
- [ ] 최소 실점이 득실차·다득점 앞에 있으면 실점 적은 팀이 앞선다.
- [ ] 6강 직행: 득실차 우선 순서면 득실차 큰 팀이 직행.
- [ ] 웹: 프리셋 일치 판정·안내 문구(프리셋 이름), 단계 select 저장, 잠금 표시.
### Edge cases
- [ ] 같은 값 재전송은 잠금에 걸리지 않는다(no-op, 감사 없음).
- [ ] 토너먼트 편성만 있는 단계는 select 대신 "동점 순서 없음".
- [ ] 대회 기본값: 상속 단계에 결과 없고 override 단계에만 결과 → 변경 허용.
- [ ] 단계 키가 stagePlan 에 없거나 풀리그 편성이 없는 단계 → 422/400.
### Error paths
- [ ] 단계 결과 확정 후 변경 → 409 `TIE_BREAK_ORDER_LOCKED`.
- [ ] stale revision → 409 `STAGE_PLAN_STALE`.
- [ ] support 어드민·대회 디렉터 → 403.
- [ ] 6강 결과 확정 후 직행 순서 변경 → 409 `SIX_TEAM_ORDER_LOCKED`; 잘못된 순서 → 400 `SIX_TEAM_ORDER_INVALID`.
### Mock data updates needed
- [ ] API spec 의 6칸 기대값 → 7칸, game-schema fixture 해시.
- [ ] 웹 MSW named-finals fixtures, admin demo, 테스트의 tieBreakOrder 7칸.

## Parallel Work Breakdown

### Backend
- [ ] 기준·프리셋·validator·calculator, 단계 모델·마이그레이션, 4개 계산 경로 + presenter, 단계 PUT, 잠금 축소, 6강 순서(열 + 업데이트 DTO + 잠금), 테스트.
### Frontend (A안은 2026-11-11 사용자 선택 완료 — 목업 `option-a.html`)
- [ ] 라벨·프리셋 사본·포맷터, 프리셋 피커 + BottomSheet 편집기, 단계별 설정 카드, 6강 순서 편집기, 공개 안내(프리셋 이름·단계별), 6강 설명 문구, llms 문구, flow-section 문구, 타입·훅·MSW·테스트.
### Infra
- [ ] 스키마 해시 핀 재고정.
### Sequential
- [ ] 통합 · PR · Copilot · 머지 · alpha 실측 · 3폭 갤러리.

## Acceptance Criteria

- [ ] 3안 제시 → 사용자 선택(A안, 2026-11-11 완료) 뒤 구현
- [ ] Original conditions 전부 충족, 테스트 green, lint 0
- [ ] 마이그레이션 동반, 드리프트 0
- [ ] 다크모드 4.5:1·44px·라벨 연결

## Tech Debt Resolved

- 6강 직행 비교 순서 하드코딩 제거(대회 설정 + 단일 기본값 상수).
- `tournament-flow-section.tsx` 의 낡은 "승점과 득실차로" 문구 제거.
- 대회 전체를 잠그던 과잉 잠금을 실제 영향 범위로 축소.

## Security Notes

- 단계 PUT 은 `V1AuthGuard` + `AdminContextService.getMutationAdmin`(owner·ops) 서비스 계층 검사. 대회 존재·종류·단계 키(stagePlan 에 있는 키만)·순서 값은 서버가 검증한다.
- 동시성: 대회 잠금 + 경기 행 잠금 뒤 잠금 사유를 다시 확인, stagePlanRevision CAS.
- 공개 응답에는 해석된 순서만 실린다(운영자 정보 없음).

## Risks & Dependencies

- 순서 배열 길이가 6 → 7 로 바뀌어 옛 웹 번들이 7칸을 받는다 — 웹 라벨은 모르는 값을 버리므로 안내 줄만 짧아진다. 옛 웹이 6칸을 보내도 서버가 정규화한다.
- 공유 경기 규정 판(`V1CompetitionConfigVersion.tieBreak.order`)의 6칸 고정(DB 트리거)은 그대로 둔다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-11-11 | builder | 최소 실점을 레거시 순서의 어디에 넣나 | 사용자 지시대로 추첨 바로 앞. 득실차·다득점이 같으면 실점도 같아 순위 불변. |
| 2026-11-11 | builder | 목업의 맞대결 우선 문구엔 최소 실점이 없고 다득점 우선엔 있다 | 앞에 득실차·다득점이 모두 있으면 최소 실점은 결과를 바꾸지 못하므로 안내 문구에서 생략한다(편집기·저장 배열에는 그대로 7칸). 보수적으로 "결과에 영향 있는 기준만" 보여 준다. |
| 2026-11-11 | builder | 단계 PUT 의 expectedRevision 은 무엇인가 | 단계 구성 화면과 같은 `stagePlanRevision` 을 쓰고 저장 시 1 올린다(STAGE_PLAN_STALE). |
| 2026-11-11 | builder | 단계 PUT 권한(대회 디렉터 포함 여부) | 지시대로 owner·ops 만(`getMutationAdmin`). 대회 기본값·6강 순서는 기존 정보 수정 경로라 기존 권한(디렉터 포함)을 유지한다. |
| 2026-11-11 | builder | 6강 직행 순서는 어디서 정하나 | 기존 6강 방식 켜기와 같은 정보 수정 화면(업데이트 DTO `sixTeamDirectFinalOrder`). 대회 생성 화면에는 추가하지 않는다(기본값으로 생성). |
| 2026-11-11 | builder | 6강 잠금 기준(세 경기 모두 vs 하나라도) | 보수적으로 첫 세 경기 중 하나라도 공식 결과가 생기면 잠근다. |
| 2026-11-11 | builder | 단계별 설정을 어느 화면에 두나 | 목업 데스크톱(정보 탭)대로 정보 화면의 동점 카드 아래 「단계별 동점 순서」 카드. 단계마다 바로 저장(대회 정보 저장과 별개 요청). |
