# autoqa findings

Append-only. Each block starts with `## F-{SC}-{STEP}-{AXIS}-{N}`. Never mutate prior lines; add new lines for state transitions.

## F-SC-MATCH-001-STEP-16-DB-01 — SC-MATCH-001 STEP-16 failed
- Severity: C
- Axis: DB
- Category: truth
- Wave: A
- State: OPEN
- Confidence: n/a
- Detected: 2026-04-20T17:50:13.345Z
- Run: RUN-2026-04-20T17-49-51-194Z-e1c5625
- Case: SC-MATCH-001:STEP-16
- Scenario: SC-MATCH-001 / STEP-16
- Axes observed: viewport=desktop.lg theme=light persona=sinaro
- Evidence:
  - failure_screenshot: .autoqa/runs/RUN-2026-04-20T17-49-51-194Z-e1c5625/steps/SC-MATCH-001/STEP-16/failure.png
- Oracle violation: locator.waitFor: Target page, context or browser has been closed
Call log:
[2m  - waiting for getByText('AUTOQA Match Core').first() to be visible[22m
[2m    19 × locator resolved to hidden <h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">AUTOQA Match Core</h1>[22m

- Root cause hypothesis: pending manual review
- Suggested scope: apps/web/src/app/(main)/matches/new/page.tsx
- Adjacent cases to rerun on fix: (derived from oracle adjacency)
- Paired fix:
- State: OPEN -> CLOSED (operator interruption; the foreground cycle was intentionally killed while validating option parsing, so this is not a confirmed product finding)

## F-SC-MATCH-001-STEP-03-DOM-01 — SC-MATCH-001 STEP-03 failed
- Severity: W
- Axis: DOM
- Category: interaction
- Wave: D
- State: CLOSED
- Confidence: n/a
- Detected: 2026-04-20T17:52:32.585Z
- Run: RUN-2026-04-20T17-51-59-546Z-e1c5625
- Case: SC-MATCH-001:STEP-03
- Scenario: SC-MATCH-001 / STEP-03
- Axes observed: viewport=desktop.lg theme=light persona=sinaro
- Evidence:
  - failure_screenshot: .autoqa/runs/RUN-2026-04-20T17-51-59-546Z-e1c5625/steps/SC-MATCH-001/STEP-03/failure.png
- Oracle violation: locator.click: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('[data-testid=\'match-create-next-sport\']').first()[22m
[2m    - locator resolved to <button disabled data-testid="match-create-next-sport" class="ds-button inline-flex items-center justify-center gap-2 text-center transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:pointer-events-none disabled:opacity-50 ds-button-primary bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 min-h-[48px] rounded-2xl px-5 py-3.5 text-base font-bold w-full mt-2">다음</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not enabled[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not enabled[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    58 × waiting for element to be visible, enabled and stable[22m
[2m       - element is not enabled[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- Root cause hypothesis: pending manual review
- Suggested scope: apps/web/src/app/(main)/matches/new/page.tsx
- Adjacent cases to rerun on fix: (derived from oracle adjacency)
- Paired fix:
- State: OPEN -> CLOSED (false negative; the cycle runner moved to STEP-03 before the preceding sport-selection click had time to flush React state, and the scenario now passes after the post-click settle fix)
