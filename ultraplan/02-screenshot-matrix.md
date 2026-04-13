# Screenshot Execution Matrix

## Operating Rule

- shared dev stack에서는 broad parallel capture를 하지 않는다.
- 병렬이 필요하면 isolated runner를 lane별로 띄운다.
- lane 내부에서는 반드시 `mobile -> tablet -> desktop` 순차 실행이다.
- current runner는 `fullPage: true`로 저장하므로, 별도 long-scroll crop 계획 없이 full-page artifact를 baseline으로 쓴다.
- `scrolled`는 geometry가 아니라 semantic state다. 즉, full-page screenshot과 별개로 route state로 관리한다.
- 수정된 페이지는 fix 이후 반드시 재캡처한다. 최소 `default`, 필요 시 `scrolled`와 관련 interaction state까지 다시 찍어 pre/post 차이를 검증한다.

## Lane Layout

| Lane | Priority | Scope | Notes |
|---|---|---|---|
| A | Highest | `batch-2-main-discovery`, `batch-1-public-auth` polish | 사용자 체감 영향이 가장 큼 |
| B | Highest | `batch-3-detail-pages`, `batch-4-create-edit-forms` | 신뢰/전환/입력 UX 핵심 |
| C | Medium | `batch-5-account-utility`, `batch-6-admin` | account는 중요, admin은 후순위 |

## Runner Pattern

### 1. Bring up isolated runtime

```bash
make e2e-isolated-up RUN=<lane-run-id>
```

### 2. Inspect runtime env

```bash
node scripts/qa/run-e2e-isolated.mjs env <lane-run-id>
```

이 명령은 `webBase`, `apiBase`를 JSON으로 출력한다.

### 3. Use the isolated bases for visual audit

예시:

```bash
E2E_WEB_BASE=http://localhost:13003 \
E2E_API_BASE=http://localhost:18111 \
make qa-visual-audit-manifest RUN=<visual-run-id> BATCH=<batch-id> EXTRA='--allow-bootstrap-writes'
```

```bash
E2E_WEB_BASE=http://localhost:13003 \
E2E_API_BASE=http://localhost:18111 \
make qa-visual-audit-capture RUN=<visual-run-id> BATCH=<batch-id> VIEWPORTS=mobile-sm,mobile-md,mobile-lg EXTRA='--allow-bootstrap-writes'
```

### 4. Tear down isolated runtime

```bash
make e2e-isolated-down RUN=<lane-run-id>
```

## Batch Order

1. `batch-2-main-discovery`
2. `batch-3-detail-pages`
3. `batch-4-create-edit-forms`
4. `batch-5-account-utility`
5. `batch-1-public-auth`
6. `batch-6-admin`
7. `batch-7-interactions`
8. `batch-8-rerun`

## Viewport Bands

### Mobile

- `mobile-sm`
- `mobile-md`
- `mobile-lg`

### Tablet

- `tablet-sm`
- `tablet-md`
- `tablet-lg`

### Desktop

- `desktop-sm`
- `desktop-md`
- `desktop-lg`

## State Matrix

### Always

- `default`

### Discovery / List

- `scrolled`
- `focus-first-input` when search exists
- `filter-open` when filter sheet/panel exists
- `hover-card-first` on desktop

### Detail

- `scrolled`
- `dialog-open` when media/contact modal exists
- `drawer-open` when bottom sheet exists

### Forms

- `focus-first-input`
- `scrolled`
- `dialog-open` when picker/uploader/modal exists

### Account / Utility

- `scrolled`
- `tab-switch` where tab strip exists

### Public / Marketing

- `scrolled`
- `menu-open`
- `hover-primary-cta` on desktop

## Recommended Run Naming

| Kind | Format | Example |
|---|---|---|
| isolated runtime | `ultra-<lane>-<band>` | `ultra-a-mobile` |
| visual manifest/capture | `va-<batch>-<band>-<date>` | `va-b2-mobile-20260412` |
| rerun | `va-rerun-<batch>-<band>-<reason>` | `va-rerun-b3-tablet-ready` |

## QC Handoff Rule

- mobile band 종료 후 바로 QC 가능
- tablet band 종료 후 바로 QC 갱신
- desktop band 종료 후 batch verdict 잠정 확정
- batch complete 전이라도 blocker rate가 stop rule을 넘으면 bug report 작성 후 중단
- remediation 이후 후속 QA도 같은 파이프라인을 그대로 따른다. ad hoc 브라우저 확인만으로 verdict를 닫지 않는다.

## Component / Asset Note

- current `capture-component-catalog.mjs`는 `12`개 엔트리, `mobile-md/desktop-md`만 지원한다.
- current `capture-asset-inventory.mjs`는 filesystem inventory + representative render `4`개를 제공한다.
- page coverage를 먼저 닫고, 부족한 primitive/overlay state가 확인되면 `__catalog` route 도입을 검토한다.
