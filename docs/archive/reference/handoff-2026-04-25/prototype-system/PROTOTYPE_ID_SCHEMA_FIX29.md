# Prototype ID Schema Fix29

`fix29`은 prototype의 모든 artboard에 결정적 식별자를 부여하기 위한 ID schema와 모듈별 의무 grid를 한곳에 고정한다. **개발자는 보드 ID 하나로 "어느 모듈, 어느 viewport, 어떤 종류, 어떤 상태"인지 즉시 식별할 수 있다.**

## ID Schema

```
m{NN}-{viewport}-{kind}[-{state|asset|sub}]
```

### Components

| Position | Token | 값 | 설명 |
|---|---|---|---|
| 1 | `m{NN}` | `m01`~`m19` | 모듈 번호. `ROUTE_OWNERSHIP_MANIFEST_FIX27.md`의 1:1 매핑 |
| 2 | `viewport` | `mb` / `tb` / `dt` | 뷰포트 분류 |
| 3 | `kind` | `main` / `list` / `detail` / `create` / `edit` / `state` / `flow` / `components` / `assets` / `motion` | 보드 종류 |
| 4 | `state` 또는 `asset` 또는 `sub` | enum 또는 자유 sub | optional. state는 표준 9, asset은 표준 5, sub는 모듈별 자유 |

### Viewport 규격

| 약어 | 의미 | 폭 (DCArtboard width) | 의도 |
|---|---|---|---|
| `mb` | mobile | `375` | iPhone 13/14/15 base. 모든 functional 모듈의 기본 viewport |
| `tb` | tablet | `768` | iPad Mini portrait. mobile의 wider variant 또는 별도 IA |
| `dt` | desktop | `1280`+ | 데스크탑/admin. 17·18 모듈의 기본 viewport |

### Kind enum

| Kind | 용도 | 예 |
|---|---|---|
| `main` | 모듈의 hero / 진입 화면 | `m02-mb-main` (홈 모바일 메인) |
| `list` | 리스트 뷰 (필터 적용) | `m03-mb-list` (매치 리스트) |
| `detail` | 상세 뷰 | `m03-mb-detail` (매치 상세) |
| `create` | 생성 form | `m04-mb-create` (팀 생성) |
| `edit` | 수정 form | `m05-mb-edit` (레슨 수정) |
| `state` | 상태 화면 (loading/empty/error/...). 4번째 segment 필수 | `m06-mb-state-empty` |
| `flow` | 다단계 플로우 (sub key) | `m04-mb-flow-checkin` |
| `components` | 그 viewport에서 사용되는 컴포넌트 인벤토리 (Button/Chip/Card variant 일람) | `m02-dt-components` |
| `assets` | 그 viewport에서 사용되는 토큰/컬러/아이콘/이미지 일람 | `m02-mb-assets` |
| `motion` | 그 viewport의 motion 계약 (tap/sheet/skeleton 등) | `m04-mb-motion` |

### State enum

| State | 의미 |
|---|---|
| `loading` | 데이터 fetch 중 (skeleton) |
| `empty` | 데이터 0건 |
| `error` | API/네트워크/권한 거부 등 실패 |
| `success` | 액션 완료 직후 toast/redirect |
| `disabled` | CTA 비활성 (필수 조건 미충족) |
| `pending` | 승인/처리 대기 |
| `sold-out` | 정원 초과 / 마감 |
| `permission` | 위치/알림/카메라 등 OS 권한 차단 |
| `deadline` | 마감 임박 / 종료 |

### Asset enum

| Asset | 의미 |
|---|---|
| `tokens` | 그 viewport에서 사용된 var(--*) CSS 토큰 일람 (color/space/radius/motion) |
| `components` | 사용된 ds-*/tm-* 컴포넌트 variant 일람 (Button size/variant, Chip active, Card pad 등) |
| `icons` | 사용된 아이콘 일람 (lucide-react / 인라인 SVG) |
| `colors` | 사용된 컬러 토큰 swatch (sportCardAccent 11종 포함) |
| `type` | 사용된 typography 일람 (tm-text-* 11단계) |

`m02-mb-assets`는 5가지 asset 카테고리의 통합 인벤토리 보드. 더 세분화가 필요하면 `m02-mb-assets-icons` 같은 sub key 사용.

### Sub key

`flow` / `state` 외에도 모듈별 특수 화면이 있을 때 자유 sub key 사용.

예:
- `m04-mb-flow-checkin` (도착 인증)
- `m04-mb-flow-evaluate` (6항목 평가)
- `m06-mb-flow-dispute` (분쟁 신청)
- `m14-mb-detail-refund` (환불 상세)

## Obligation Grid

각 module × viewport마다 의무/조건부 보드.

| Kind | mobile (mb) | tablet (tb) | desktop (dt) |
|---|---|---|---|
| `main` | 의무 | 의무 | 의무 |
| `list` / `detail` / `create` / `edit` | 모듈에 해당 시 의무 | 의무 | 의무 |
| `state-loading` | 의무 | conditional* | conditional* |
| `state-empty` | 의무 | conditional* | conditional* |
| `state-error` | 의무 | conditional* | conditional* |
| `state-success` | 의무 (해당 시) | conditional* | conditional* |
| `state-disabled` | 의무 (해당 시) | conditional* | conditional* |
| `state-pending` | 의무 (해당 시) | conditional* | conditional* |
| `state-sold-out` | 의무 (해당 시) | conditional* | conditional* |
| `state-permission` | 의무 (해당 시) | conditional* | conditional* |
| `state-deadline` | 의무 (해당 시) | conditional* | conditional* |
| `components` | 의무 | 의무 | 의무 |
| `assets` | 의무 | 의무 | 의무 |
| `motion` | 의무 | conditional | conditional |

\* conditional: tablet/desktop에서 mobile state와 시각적으로 동일하면 별도 보드 생략 가능. 단 `m{NN}-{viewport}-state-{x}-ref` alias로 mobile 보드를 가리켜야 함.

## 기존 보드 매핑 규칙

사용자 제약 "기존 variant 살려라" 준수:

1. **삭제 0건**. 기존 보드는 그대로 유지.
2. **alias 추가**: 기존 보드의 `data-dc-slot`은 그대로, 새 ID schema 라벨을 `data-dc-id-aliases` 또는 caption에 표기.
3. **inventory 보드 (`m{NN}-mb-inventory`)**: 그 모듈의 모든 보드 ID 매핑 표.
4. **신규 보드만 새 ID로 작성**. POC인 M01·M02부터 적용.

기존 보드 → 새 ID 예시 (M02 홈·추천):

| 기존 ID | 새 ID alias | 비고 |
|---|---|---|
| `home` | `m02-mb-main` | 모바일 메인 |
| `home-state-loading-mobile` | `m02-mb-state-loading` | rename 가능 |
| `home-tablet` | `m02-tb-main` | -- |
| `home-desktop` | `m02-dt-main` | -- |
| `home-recommendation-edge` | `m02-mb-flow-rec-edge` | sub key 적용 |
| `home-button-states` | `m02-mb-components` | controls 통합 |
| `home-motion-contract` | `m02-mb-motion` | -- |
| `home-responsive-comparison` | `m02-tb-main-responsive` | tablet 보드와 합본 |

`PROTOTYPE_INVENTORY_FIX29.md`에 19 모듈 × 기존 보드 → 새 ID 매핑 표가 있다.

## Naming 규칙 (실수 방지)

1. **소문자 + 하이픈** 만 사용. 언더스코어/카멜케이스 금지.
2. `m{NN}` 두 자리 숫자 패딩 필수 (`m01`, `m02`, ..., `m19`).
3. viewport는 정확히 `mb` / `tb` / `dt`. `mobile` / `tablet` / `desktop` 풀워드 금지.
4. state/asset enum 외 자유 단어 금지. 새 카테고리 필요 시 본 문서 enum 추가.
5. 4번째 segment 이상은 `-` 한 번만 추가. 깊이 4까지 (예: `m04-mb-flow-checkin-success`).

## Linter 권고

`scripts/qa/teameet-design-prototype-audit.mjs`에 ID schema 검증 추가:

```js
const ID_REGEX = /^m(0[1-9]|1[0-9])-(mb|tb|dt)-(main|list|detail|create|edit|state|flow|components|assets|motion)(-([a-z][a-z0-9-]*))?$/;
```

위반 보드는 audit JSON의 `idSchemaViolations` 배열에 적재.

## Acceptance

- [ ] M01·M02에 새 ID schema 보드 풀 grid 생성
- [ ] `00o · 모듈 인벤토리 IA` 섹션이 schema/grid를 시각화
- [ ] `PROTOTYPE_INVENTORY_FIX29.md`에 19 모듈 매핑 표
- [ ] audit script가 ID schema 검증 가능
- [ ] M03~M19은 후속 wave (1차 POC 검증 후)
