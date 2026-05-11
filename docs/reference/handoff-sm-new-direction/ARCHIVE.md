# Handoff SM New Direction Archive Index

## Purpose

이 문서는 `handoff-sm-new-direction` 안에서 바로 삭제하지 않고 보존하는 과거
문서와 상세 증거의 성격을 정리한다.

Archive는 폐기와 다르다. 현재 방향의 첫 진입점은 아니지만, 판단 근거나 원문
증거로 필요할 수 있는 문서다.

## Archive Evidence

| Files | Reason |
|---|---|
| `prototype-system/DESIGN_QA_FIX11.md` ~ `DESIGN_QA_FIX32.md` | fix 라운드별 QA 결과와 audit 수치 증거 |
| `prototype-system/PAGE_READINESS_AUDIT_FIX13.md` ~ `PAGE_READINESS_AUDIT_FIX21.md` | page readiness 진행 로그 |
| `prototype-system/PROTOTYPE_AUDIT_FIX28.md` | token/spacing/typography audit 기준 |
| `prototype-system/PROTOTYPE_ID_SCHEMA_FIX29.md` | canonical id schema 증거 |
| `prototype-system/PROTOTYPE_INVENTORY_FIX29.md` | module/viewport obligation grid 증거 |
| `prototype-system/CANONICAL_ID_MAP_FIX32.md` | functional artboard alias 매핑 증거 |
| `prototype-system/M_GRID_REWRITE_SPEC_FIX32.md` | m-grid rewrite 작업 지시 증거 |
| `sports-platform/chats/chat1.md` | 원 대화 source evidence |
| `sports-platform/project/uploads/DESIGN.md` | prototype bundle 내부 design note |

## Deprecated Priority Notes

아래 내용은 문서 자체가 잘못됐다는 뜻이 아니라, 현재 `HANDOFF.md`와
`DIRECTION.md` 기준으로 우선순위가 바뀐 흔적이다.

- Mercenary를 core `05`처럼 다루는 과거 설명은 deprecated priority다.
  현재 용병은 candidate `C07`이다.
- Lessons/marketplace/venues/tournaments/equipment rental을 core 진행 순서처럼
  다루는 과거 설명은 현재 candidate evaluation evidence로 읽는다.
- Sports/skill/safety를 core로 전제하는 과거 설명은 현재 candidate `C06`으로 읽는다.
- 과거 module number와 현재 rendered order가 다르면 현재 order는
  `prototype-system/MODULE_MAP.md`와 `HANDOFF.md`를 따른다.

## Deletion Candidates

현재 삭제 대상은 없다.

삭제 후보로 검토하려면 아래 조건을 모두 만족해야 한다.

- `HANDOFF.md`, `DIRECTION.md`, `MODULE_MAP.md`, `COMPONENT_CATALOG.md`에 내용이
  이미 반영되어 있다.
- 원문 증거나 QA 수치로 다시 볼 가능성이 낮다.
- prototype HTML/JSX 또는 QA script가 해당 문서를 참조하지 않는다.
- 삭제 사유와 대체 문서가 이 파일에 먼저 기록된다.

## 확인 필요

- 과거 QA fix 문서를 한 파일로 접을지, 현재처럼 라운드별 증거로 유지할지.
- 0502 원문(`0502 문서화.md`)을 장기적으로 원문 evidence로 계속 둘지.
- `sports-platform/project/uploads/DESIGN.md`가 active design reference인지,
  prototype bundle 내부 snapshot인지.
