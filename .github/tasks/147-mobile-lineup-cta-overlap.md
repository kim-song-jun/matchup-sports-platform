# Task 147 — Mobile tournament lineup CTA overlap

Status: implementation complete; headed mobile visual verification pending local runtime
Target: v1 frontend

## Contract

- The fixed save/submit bar must not cover the bottom of the pitch or roster panes.
- The page reserves enough bottom space for the validation message, buttons, and device safe area.
- At 360px and below, where CTA buttons stack, the larger bar receives larger reserved space.
- Formation and slot-picker sheets remain above the CTA and can scroll to their final item.

## Acceptance criteria

- [x] Tournament lineup page uses a dedicated bottom-clearance class.
- [x] Mobile and narrow-mobile CTA heights have matching page clearance.
- [x] Formation sheet supports internal scrolling through its bottom content.

## Validation

- v1 Web TypeScript check: PASS
- Headed mobile screenshot verification pending unavailable Docker QA runtime.
