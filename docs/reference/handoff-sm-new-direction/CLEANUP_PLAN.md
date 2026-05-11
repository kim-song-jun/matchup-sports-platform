# Handoff SM New Direction Cleanup Plan

## 기준

정리 기준 문서는 `docs/reference/handoff-sm-new-direction-plan.md`다.

우선순위는 다음 순서로 판단한다.

1. `handoff-sm-new-direction-plan.md`
2. `HANDOFF.md`
3. `DIRECTION.md`
4. `0502-design-freeze-brief.md`
5. `COMPARISON_WITH_2026_04_25.md`
6. 세부 prototype-system 문서와 원문 evidence

## 확인한 문서 범위

- `docs/reference` 전체 파일 목록.
- `docs/reference/handoff-sm-new-direction-plan.md`.
- `docs/reference/handoff-sm-new-direction/` 아래 모든 `.md`.
- `docs/reference/handoff-sm-new-direction/prototype-system/` 아래 모든 `.md`.
- `docs/reference/handoff-sm-new-direction/sports-platform/README.md`.
- `docs/reference/handoff-sm-new-direction/sports-platform/chats/chat1.md`.
- `docs/reference/handoff-sm-new-direction/sports-platform/project/uploads/DESIGN.md`.
- `handoff-2026-04-25` 문서는 원본 reference로만 확인하고 수정하지 않는다.

## 문서 역할 요약

| Group | Files | Role |
|---|---|---|
| Entry | `INDEX.md`, `HANDOFF.md` | 작업자 진입점과 현재 읽는 순서 |
| Direction | `DIRECTION.md`, `COMPARISON_WITH_2026_04_25.md` | 현재 candidate 방향과 원본 대비 차이 |
| SM input | `0502-design-freeze-brief.md`, `0502 문서화.md` | SM 수정 원문과 구조화본 |
| Analysis | `ANALYSIS.md`, `SYSTEM_CANDIDATE.md`, `SECTION_UNIFICATION_MATRIX.md`, `SOURCE_PROTOTYPE_PARITY.md` | 기존 handoff 분석, 시스템 후보, source/prototype parity |
| Prototype hub | `prototype-system/README.md`, `MODULE_MAP.md`, `COMPONENT_CATALOG.md` | prototype system에서 실제로 먼저 읽을 문서 |
| Historical QA | `DESIGN_QA_FIX*.md`, `PAGE_READINESS_AUDIT_FIX*.md`, `PROTOTYPE_*`, `*_FIX*.md` | 과거 라운드 증거, archive evidence |
| Source bundle | `sports-platform/*` markdown | 원 대화와 prototype bundle 내부 문서 |

## 중복 / 충돌

- `INDEX.md`, `DIRECTION.md`, `COMPARISON_WITH_2026_04_25.md`가 candidate 상태,
  core/candidate 분류, non-canonical 상태를 반복한다.
- `prototype-system/README.md`는 최신 허브 역할과 과거 fix 로그 색인 역할이 섞여 있다.
- `SOURCE_PROTOTYPE_PARITY.md`의 과거 module numbering은 현재 `DIRECTION.md`의
  core/candidate override와 충돌할 수 있다.
- `BOTTOM_NAV_CONTRACT_FIX27.md`의 production-aligned nav와 0502 SM nav가 다르다.
- 과거 문서 중 `05 레슨`, `08 용병`, `11 종목/실력/안전`처럼 기존 번호를 그대로
  말하는 부분은 현재 우선순위와 다를 수 있다.

## 정리 계획

1. `HANDOFF.md`를 추가해 현재 방향, 읽는 순서, 유지/통합/archive 기준을 한 곳에 둔다.
2. `CLEANUP_PLAN.md`를 추가해 이번 정리의 판단 기준과 수정 내역을 남긴다.
3. `ARCHIVE.md`를 추가해 삭제하지 않은 과거 문서의 성격과 읽는 기준을 분리한다.
4. `INDEX.md`의 읽는 순서를 `HANDOFF.md` 중심으로 갱신한다.
5. `DIRECTION.md`에 `HANDOFF.md`와 `CLEANUP_PLAN.md`를 현재 운영 기준으로 연결한다.
6. `prototype-system/README.md` 상단에 current/archived evidence 구분을 추가한다.
7. 삭제는 하지 않는다. 삭제가 필요한 경우에도 먼저 `ARCHIVE.md`에 사유를 남긴다.

## 이번 정리에서 삭제하지 않는 이유

- 사용자 요청상 확실하지 않은 내용은 삭제하지 않고 `확인 필요`로 남겨야 한다.
- `handoff-sm-new-direction`은 아직 canonical이 아닌 candidate reference다.
- 과거 fix 로그와 원문 대화는 디자인 판단 경위를 복원하는 데 필요하다.

## 적용 결과

- 추가: `HANDOFF.md`
- 추가: `CLEANUP_PLAN.md`
- 추가: `ARCHIVE.md`
- 수정: `INDEX.md`
- 수정: `DIRECTION.md`
- 수정: `prototype-system/README.md`
- 삭제: 없음

## 확인 필요

- SM 5탭 shell을 production bottom nav contract로 승격할지 여부.
- `my team` 바로가기의 실제 route.
- Candidate module의 출시 우선순위와 DB/API 범위.
- candidate pack을 canonical로 승격하기 위한 QA threshold.
