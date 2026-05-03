# Handoff SM New Direction Plan

## Purpose

`handoff-sm-new-direction`은 기존 `handoff-2026-04-25` 디자인 핸드오프를 기반으로 새 기획 방향을 검토하기 위한 candidate reference pack이다.

기존 디자인 원칙, 글로벌 셸, 상태/QA 방식은 최대한 유지하고, 서비스 우선순위와 모듈 배치를 새 방향에 맞게 재정리한다.

## Target Path

```text
docs/reference/handoff-sm-new-direction/
```

## Source Pack

```text1
docs/reference/handoff-2026-04-25/
```

원본 `handoff-2026-04-25`는 수정하지 않는다. 새 pack은 전체 복사 후 별도 candidate로 운용한다.

## Status

```text
Decision status: candidate
Canonical status: not canonical
Implementation status: reference only
```

승인 전까지 실제 구현 기준은 기존 `DESIGN.md`, `.impeccable.md`, `apps/web/src/app/globals.css`를 유지한다.

## 1st Phase Scope

1차 작업은 디자인 HTML을 크게 수정하지 않고, 새 reference pack의 구조와 방향을 고정하는 데 집중한다.

### 1. Copy Existing Handoff

```text
from:
docs/reference/handoff-2026-04-25/

to:
docs/reference/handoff-sm-new-direction/
```

기존 디자인을 거의 전부 가져온다. 일부 모듈을 삭제하지 않고, 새 방향 안에서 core/candidate로 재분류한다.

### 2. Add Direction Documents

새 pack 안에 아래 문서를 둔다.

```text
docs/reference/handoff-sm-new-direction/INDEX.md
docs/reference/handoff-sm-new-direction/DIRECTION.md
docs/reference/handoff-sm-new-direction/COMPARISON_WITH_2026_04_25.md
```

`INDEX.md`:

- 새 pack의 진입점
- 기존 `handoff-2026-04-25`에서 fork되었음을 명시
- 현재 상태가 candidate임을 명시
- 읽는 순서 제공

`DIRECTION.md`:

- 유지할 디자인 원칙
- 유지할 글로벌 셸
- core/candidate 모듈 분류
- 새 방향에서 바뀌는 우선순위 정리

`COMPARISON_WITH_2026_04_25.md`:

- Keep
- Reorder
- Candidate
- Deferred
- Open Questions

### 3. Classify Modules

#### Core Modules

```text
01 인증/온보딩
02 홈/추천
03 개인 매치
04 팀/팀매칭
08 용병
11 종목/실력/안전
12 커뮤니티/채팅/알림
13 마이/프로필/평판
14 결제/환불/분쟁
15 설정/약관/상태
16 공개/마케팅
17 데스크탑 웹
18 관리자/운영
19 공통 플로우/인터랙션
```

#### Candidate Modules

```text
05 레슨
06 장터
07 시설
09 대회
10 장비 대여
```

Candidate 모듈은 삭제하지 않는다. 새 방향에서 필요 여부를 판단할 수 있도록 보존하되, core보다 낮은 우선순위로 분리한다.

### 4. Create Component Catalog

디자인 시스템 컴포넌트는 별도 카탈로그로 분리한다.

```text
docs/reference/handoff-sm-new-direction/prototype-system/COMPONENT_CATALOG.md
```

초기 대상:

```text
NumberDisplay
MoneyRow
MetricStat
StatBar
FilterChip
KPI card
ListItem
EmptyState
Skeleton
Toast
BottomSheet
StickyCTA
```

권장 항목 구조:

```text
Component:
Purpose:
Used in:
Keep/Change:
Notes:
```

### 5. Preserve Prototype Files in Phase 1

1차에서는 아래 파일을 크게 수정하지 않는다.

```text
docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html
docs/reference/handoff-sm-new-direction/sports-platform/project/lib/*.jsx
```

1차 목표는 복사, 방향 문서화, 모듈 분류, 컴포넌트 카탈로그 생성이다.

## 2nd Phase Direction

2차에서 새 pack 안의 `Teameet Design.html` 섹션 배치를 새 방향으로 조정한다.

추천 배치:

```text
00~00n Reference / DNA
01 인증/온보딩
02 홈/추천
03 개인 매치
04 팀/팀매칭
05 용병
06 종목/실력/안전
07 커뮤니티/채팅/알림
08 마이/프로필/평판
09 결제/환불/분쟁
10 설정/약관/상태
11 공개/마케팅
12 데스크탑 웹
13 관리자/운영
14 공통 플로우/인터랙션

Candidate:
C01 레슨
C02 장터
C03 시설
C04 대회
C05 장비 대여
```

권장 방식은 문서와 화면 배치는 새 우선순위로 정리하되, 기존 canonical id와 주요 export 이름은 유지하는 것이다. 그래야 기존 QA 스크립트와 프로토타입 mount 구조가 덜 깨진다.

## Operating Rules

- `handoff-2026-04-25`는 원본 reference로 유지한다.
- `handoff-sm-new-direction`은 새 방향 candidate fork로 둔다.
- 승인 전까지 `DESIGN.md`, `.impeccable.md`, `globals.css`는 변경하지 않는다.
- 기존 디자인 원칙/툴은 그대로 가져간다.
- 글로벌 셸은 그대로 가져간다.
- 기존 상태/QA 방식은 유지한다.
- 후보 모듈은 삭제하지 않고 candidate 영역으로 분리한다.
- 새 pack이 실제 구현 기준으로 승격될 때만 `docs/DESIGN_DOCUMENT_MAP.md`에서 active/canonical 상태를 갱신한다.

## Summary

1차는 다음 네 가지를 완료하면 된다.

```text
1. 기존 handoff 전체 복사
2. 새 방향 문서 추가
3. core/candidate 모듈 분류
4. 컴포넌트 카탈로그 생성
```

이후 2차에서 실제 `Teameet Design.html` 섹션 배치와 화면 우선순위를 새 기획 방향에 맞게 조정한다.
