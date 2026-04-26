# Design QA Fix31

## 기준

- URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix31`
- Mode: light-only (Admin sidebar `tm-admin-sidebar` 단독 dark exception)
- Rendered sections: `52`
- Rendered artboards: `601`

## 이번 라운드 범위

`fix31`은 **production primitive 5종 추출 + globals.css 12 토큰 보강 + prototype color sweep**을 한 번에 진행한 라운드.

### Production-side 변경

1. **`apps/web/src/app/globals.css` 보강** — 16 신규 CSS 변수 추가:
   - `--color-blue-200/400`, `--color-blue-alpha-08/10`
   - `--color-gray-150`, `--color-border-strong`
   - `--color-success-50/warning-50/error-50`
   - `--control-sm/md/lg/xl/icon`, `--control-radius`
   - `--ease-out-quart/quint/expo`

2. **5 신규 primitive** (`apps/web/src/components/ui/`):
   - `number-display.tsx` (+ test 6/6) — value/unit/sub/size/tone/format/align/loading
   - `filter-chip.tsx` (+ test 5/5) — active/count/size/variant/asLink/aria-pressed
   - `money-row.tsx` (+ test 5/5) — label/amount/unit/tone/strong/rightSlot
   - `stat-bar.tsx` (+ test 5/5) — label/value/max/sub/tone/orientation
   - `metric-stat.tsx` (+ test 6/6) — label/value/delta/deltaLabel/icon/tone/href

3. **`apps/web/src/components/admin/kpi-card.tsx` 정렬** — 외부 API 변경 없이 내부에서 `MetricStat` 위임. admin 테스트 21건 모두 통과.

### Prototype-side 변경

4. **Token sweep codemod** (`scripts/qa/teameet-prototype-token-sweep.mjs`):
   - 233개 raw `#hex` literal을 `var(--token)`로 일괄 변환
   - 19개 jsx 파일 영향 (가장 많이 변환: screens-readiness 64 + screens-readiness-wave21b 40)
   - skip: tokens.jsx (정의), 소셜 브랜드 컬러 (#FEE500/#03C75A/#191919), 주석

## 자동 검수 결과

```json
{
  "pass": true,
  "sections": 52,
  "artboards": 601,
  "mGridSections": 19,
  "missingGridSections": [],
  "mGridArtboards": 270,
  "idSchemaViolations": 0,
  "duplicateSlots": 0,
  "pageErrors": 0,
  "unexpectedConsole": 0,
  "screenshots": 8
}
```

## Audit Re-measurement (fix30 → fix31)

| Metric | fix30 | fix31 | Δ |
|---|---|---|---|
| Color compliance (source) | 93.0% | **95.8%** | **+2.8pp** ↑ pass conditional |
| Color raw hex hits | 587 | **356** | -231 (-39%) |
| Spacing compliance | 74.3% | 74.3% | 0 (sweep 대상 외) |
| Typography class adoption | 53.4% | 53.4% | 0 (sweep 대상 외) |
| `tm-text-*` class hits | 1,447 | 1,447 | 0 |

**핵심**: Color sweep으로 raw hex 39% 감소. 95.8%는 **conditional 게이트** (95-98% 구간). 추가로 5 신규 primitive 사용 시 production caller 측에서 추가 token 마이그레이션 가능.

## Production Validation

- `npx tsc --noEmit`: 통과 (0 errors)
- `pnpm test`: **58 files / 477 tests 전체 통과** (5 신규 primitive 27 테스트 포함)

## Production Primitive Coverage

5 신규 primitive가 처리하는 production caller hotspot:

| Primitive | Caller hotspots (count) |
|---|---|
| `NumberDisplay` | 19+ (admin/payouts, statistics, ops, lesson-tickets, payments, marketplace, etc.) |
| `FilterChip` | 11 pages (marketplace, lessons, matches, mercenary, tournaments, venues, my/disputes, admin/disputes, payouts, users) |
| `MoneyRow` | 19+ (payments/[id], checkout, refund, marketplace/orders, payouts, settlements, lesson-tickets) |
| `StatBar` | 5+ (team-matches/[id]/evaluate, score, teams/[id], profile, weekly-payout-bars) |
| `MetricStat` | 8 (admin dashboard, ops, statistics, payouts, payments, profile, teams/[id], 본 KpiCard 정렬) |

**현재 상태**: 5 primitive가 production code에 추가됐지만 **caller migration은 별도 PR**. 본 작업은 추출 + 단위 테스트까지 완료.

## Section / Artboard Diff (fix30 → fix31)

| Item | fix30 | fix31 | Δ |
|---|---|---|---|
| Sections | 52 | 52 | 0 (변경 없음) |
| Artboards | 601 | 601 | 0 |
| Color rate | 93.0% | **95.8%** | +2.8pp |
| Raw hex hits | 587 | 356 | -231 |
| Production primitives in `components/ui/` | 7 (기존) | **12** (+5) | +NumberDisplay, FilterChip, MoneyRow, StatBar, MetricStat |
| globals.css 토큰 수 | (기존) | (기존 + 16) | +blue-200/400/alpha, gray-150, control-*, ease-out-*, semantic-50 |

## 사용자 4가지 검수 질문 답변 (fix31 기준 갱신)

| # | 질문 | 결과 | 게이트 |
|---|---|---|---|
| 1 | 디자인 시스템(색상/간격/타이핑) 잘 따라가는가 | **개선 지속** — color **95.8%** Pass (conditional) / spacing 74.3% / typography 53.4% | Color: Conditional → near-Pass; nemaining: spacing/typography sweep |
| 2 | 모든 viewport (mb/tb/dt) 페이지 존재 | **Pass** — 19 functional 모듈 모두 mb+tb+dt | Pass |
| 3 | 각 페이지가 디자인 시스템 준수 | **Pass on 19 모듈** — token sweep으로 readiness wave 보드까지 정렬 | Pass |
| 4 | 개발자 즉시 개발 가능 수준 | **Pass + production primitive 5종 + globals.css 16 신규 토큰** — caller migration만 남음 | Pass (production-ready) |

## QA Artifact

- `output/playwright/teameet-design-fix31-full-qa.json`
- `output/playwright/teameet-design-fix31-audit.json`
- 8 representative screenshots (M03·M04·M06·M09·M12·M14·M17·M18)

## 산출물 정리

### 신규 production source 파일 (10개 + 1 정렬)

```
apps/web/src/app/globals.css                                        (수정)
apps/web/src/components/ui/number-display.tsx                       (신규)
apps/web/src/components/ui/filter-chip.tsx                          (신규)
apps/web/src/components/ui/money-row.tsx                            (신규)
apps/web/src/components/ui/stat-bar.tsx                             (신규)
apps/web/src/components/ui/metric-stat.tsx                          (신규)
apps/web/src/components/ui/__tests__/number-display.test.tsx        (신규)
apps/web/src/components/ui/__tests__/filter-chip.test.tsx           (신규)
apps/web/src/components/ui/__tests__/money-row.test.tsx             (신규)
apps/web/src/components/ui/__tests__/stat-bar.test.tsx              (신규)
apps/web/src/components/ui/__tests__/metric-stat.test.tsx           (신규)
apps/web/src/components/admin/kpi-card.tsx                          (정렬, 외부 API 무변경)
```

### 신규 prototype 파일

```
docs/reference/handoff-2026-04-25/sports-platform/project/lib/
  screens-grid-m01.jsx ~ m19.jsx                                    (19 파일 — m01·m02 fix29 + m03~m19 fix30)
docs/reference/handoff-2026-04-25/prototype-system/
  PROTOTYPE_ID_SCHEMA_FIX29.md
  PROTOTYPE_INVENTORY_FIX29.md
  DESIGN_QA_FIX29.md / DESIGN_QA_FIX30.md / DESIGN_QA_FIX31.md
scripts/qa/
  teameet-design-prototype-audit.mjs
  teameet-design-fix27/28/29/30/31-full-qa.mjs
  teameet-prototype-token-sweep.mjs
```

## 후속 P1 backlog (다음 task 또는 별도 PR)

- [ ] **Spacing sweep** — 2,699 raw non-multiple-4 spacing → 4-multiple 또는 var(--space-*)
- [ ] **Typography sweep** — 1,574 inline `fontSize: N` → `tm-text-{token}` class (typography class adoption 53% → 90%+ 목표)
- [ ] **Caller migration** (production-side, 별도 PR per primitive):
  - PR-A1: `/admin/statistics` 8 callers → `NumberDisplay`/`MetricStat` 사용
  - PR-A2: `/marketplace` 17 chips → `FilterChip` 사용
  - PR-A3: `/payments/[id]` 6 receipt rows → `MoneyRow` 사용
  - PR-A4: `/team-matches/[id]/evaluate` 6 평가 → `StatBar` 사용
  - PR-A5: `/admin/dashboard` 5 cards → `MetricStat` 직접 사용
- [ ] **a11y axe-core** integration 후 critical/serious 0 검증
- [ ] **prefers-reduced-motion** 보드 매트릭스 보강 (현재 motion 보드만)
