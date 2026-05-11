# SM New Direction Handoff

## Status

```text
Decision status: candidate
Canonical status: not canonical
Implementation status: reference only
Primary plan: docs/reference/handoff-sm-new-direction-plan.md
Pack path: docs/reference/handoff-sm-new-direction/
Source pack: docs/reference/handoff-2026-04-25/
```

이 문서는 `handoff-sm-new-direction` 관련 문서를 읽는 작업자가 바로 현재
방향, 보존해야 할 증거, 분리된 과거 흔적을 이해하도록 만든 통합 handoff다.
세부 디자인 규칙을 새로 정의하지 않는다. `handoff-sm-new-direction-plan.md`와
충돌하면 plan 문서를 우선한다.

## Current Direction Summary

`handoff-sm-new-direction`은 기존 `handoff-2026-04-25`를 보존한 candidate
fork다. 원본 pack은 수정하지 않고, 새 방향에서는 서비스 우선순위와 모듈 배치를
재분류한다.

핵심 방향은 다음과 같다.

- 기존 Toss-like white-first 디자인 문법, 글로벌 shell, QA/state 문서 구조는 유지한다.
- 실제 구현 기준은 아직 `DESIGN.md`, `.impeccable.md`, `apps/web/src/app/globals.css`다.
- candidate pack은 구현 기준이 아니라 다음 기획/디자인 검토용 reference다.
- 기존 모듈을 삭제하지 않고 core/candidate로 분리한다.
- prototype의 canonical id, artboard id, 주요 export 이름은 보존한다.

## Core Modules

```text
01 인증/온보딩
02 홈/추천
03 개인 매치
04 팀/팀매칭
05 팀 둘러보기/탐색
06 커뮤니티/채팅/알림
07 마이/프로필/평판
08 결제/환불/분쟁
09 설정/약관/상태
10 공개/마케팅
11 데스크탑 웹
12 관리자/운영
13 공통 플로우/인터랙션
```

Core는 즉시 제품 방향 검토의 중심이다. 특히 `05 팀 둘러보기/탐색`은 팀매칭
전후로 사용자가 전체 팀을 비교하고 선택할 수 있게 하는 보강 영역이다.

## Candidate Modules

```text
C01 레슨
C02 장터
C03 시설
C04 대회
C05 장비 대여
C06 종목/실력/안전
C07 용병
```

Candidate는 삭제 대상이 아니다. 현재 방향에서 즉시 core 우선순위가 아니므로
별도 평가 대상으로 보존한다. 각 모듈은 기존 화면, 상태, 자산, 거래/예약 패턴을
참고 증거로 유지한다.

## Primary Reading Path

1. `HANDOFF.md` - 현재 통합 handoff.
2. `DIRECTION.md` - candidate 방향과 core/candidate 분류.
3. `0502-design-freeze-brief.md` - 0502 SM 수정 입력의 구조화본.
4. `COMPARISON_WITH_2026_04_25.md` - 기존 2026-04-25 pack과의 차이.
5. `prototype-system/README.md` - prototype system 문서 허브와 archive 기준.
6. `prototype-system/COMPONENT_CATALOG.md` - 개발 후보 primitive/component 목록.
7. `prototype-system/MODULE_MAP.md` - rendered prototype 섹션 순서와 보드 배치.
8. `ARCHIVE.md` - 오래된 fix 로그/상세 증거 문서의 보존 위치와 읽는 기준.

## Related Document Roles

| Document | Role | Keep / Archive |
|---|---|---|
| `INDEX.md` | 폴더 진입점과 읽는 순서 | Keep |
| `DIRECTION.md` | 현재 방향의 우선순위와 non-canonical 상태 | Keep |
| `COMPARISON_WITH_2026_04_25.md` | 원본 pack 대비 keep/reorder/candidate/deferred | Keep |
| `0502-design-freeze-brief.md` | 0502 원문을 구조화한 작업 기준 | Keep |
| `0502 문서화.md` | 0502 원문 | Keep as source |
| `ANALYSIS.md` | 기존 handoff 분석, 강점/리스크 | Keep as evidence |
| `SOURCE_PROTOTYPE_PARITY.md` | source route와 prototype parity 기록 | Keep as evidence |
| `SYSTEM_CANDIDATE.md` | design-system 승격 후보 | Keep as evidence |
| `SECTION_UNIFICATION_MATRIX.md` | 00 reference와 functional section 연결 | Keep as evidence |
| `prototype-system/README.md` | prototype-system 허브 | Keep |
| `prototype-system/DESIGN_QA_FIX*.md` | 과거 QA 라운드 로그 | Archive evidence |
| `prototype-system/PAGE_READINESS_AUDIT_FIX*.md` | 과거 readiness 라운드 로그 | Archive evidence |
| `sports-platform/chats/chat1.md` | 원 대화 기록 | Archive source |
| `sports-platform/project/uploads/DESIGN.md` | prototype bundle 내부 design note | Archive source |

## Duplicate / Conflict Resolution

- `INDEX.md`, `DIRECTION.md`, `COMPARISON_WITH_2026_04_25.md`의 중복 상태/우선순위
  설명은 이 문서와 `DIRECTION.md`를 기준으로 읽는다.
- `handoff-sm-new-direction-plan.md`의 Phase 1 원칙은 계속 우선한다.
- 과거 Phase 2 문서가 `05 용병`을 core처럼 다루는 경우 현재 방향에서는
  deprecated priority로 본다. 용병은 `C07` candidate다.
- 기존 bottom nav 문서의 `home / matches / teams / marketplace / more`와
  0502 입력의 `홈 / 매치 / 팀매치 / 팀 / 마이`는 아직 완전히 합의되지 않았다.
  0502 SM 수정 화면에서는 5탭 SM shell을 우선 참고하고, production contract
  변경 여부는 확인 필요로 남긴다.
- `sports/skill/safety`는 기존 plan 1차에서는 core였지만 현재 정리 기준에서는
  candidate `C06`이다. 이 변경은 `DIRECTION.md`의 Current Priority Override를 따른다.

## Cleanup Decisions

이번 정리에서는 파일을 삭제하지 않는다. 이유는 다음과 같다.

- prototype fix 로그가 QA/디자인 증거로 여전히 추적 가치를 가진다.
- 원문 대화와 0502 원문은 추후 해석 충돌 시 source evidence가 된다.
- candidate pack이 아직 canonical이 아니므로 오래된 기획 흔적을 삭제하면 비교 근거가 사라진다.

대신 오래된 문서는 `ARCHIVE.md`에서 archive evidence로 분류한다.

## DB / API Design Notes

이 candidate pack을 DB/API 설계로 넘길 때는 아래 사항을 먼저 고정해야 한다.

- 팀 탐색(`05`)은 팀 검색, 비교, 신뢰 신호, 가입/선택 CTA의 데이터 계약이 필요하다.
- 개인 매치(`03`)는 카드형/콤팩트형, 검색, 종목별 count, 요약 counter,
  상세 참가 sheet, 승인중/승인완료 상태를 API 상태값과 맞춰야 한다.
- 팀매치(`04`)는 팀 정보, 신청, 결제하고 신청하기, 내 매치 관리 상태를 분리해야 한다.
- 채팅/알림(`06`)은 unread/read, 모두 읽음, deep link, late-connect backfill,
  메시지 실패/차단/만료 상태를 API와 websocket 보정 흐름으로 함께 설계해야 한다.
- 결제/환불/분쟁(`08`)은 mock/test 결제와 실제 청구 없음, 실패/보류/환불 주체와
  사유를 응답 모델에 명시해야 한다.
- 관리자(`12`)는 처리 주체, 사유, audit log, partial failure, concurrent processing
  상태를 남길 수 있어야 한다.
- Candidate modules는 즉시 schema로 확정하지 말고 product scope 확정 뒤 core와
  분리된 backlog로 설계한다.

## 확인 필요

- SM bottom nav 5탭이 production bottom nav contract를 대체하는지, 아니면
  candidate prototype 전용인지 결정해야 한다.
- `my team` 바로가기의 이동 대상이 미정이다.
- 레슨, 장터, 시설, 대회, 장비 대여, 종목/실력/안전, 용병의 제품 범위와 출시
  우선순위를 다시 확인해야 한다.
- 후보 pack이 canonical로 승격될 때 `docs/DESIGN_DOCUMENT_MAP.md` 갱신 기준과
  필요한 QA threshold를 정해야 한다.
- prototype HTML/JSX 섹션 재배치를 더 진행할 경우 canonical id map과 QA script
  재검증 범위를 정해야 한다.
