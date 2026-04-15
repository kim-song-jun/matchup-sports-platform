# Ultraplan Playwright Layer

This folder is a machine-readable planning layer for a future orchestration wrapper.
It does not define new audit rules. It only encodes the Teameet visual-audit contract in structured files.

## What lives here

- `config/audit-plan.json`
  - global schema version
  - canonical viewport bands
  - lane metadata
  - batch metadata
  - default state profiles
  - run naming templates
- `bands/*.json`
  - one file per viewport band
  - ordered viewport ids and recommended execution policy
- `lanes/*.json`
  - one file per lane
  - lane priority and batch ordering
- `batches/*.json`
  - one file per batch
  - batch priority, band policy, state profile, rerun rule
- `examples/*.json`
  - example case manifests for wrapper integration tests

## Wrapper contract

1. Read `config/audit-plan.json` first.
2. Load `bands/*.json` to expand the viewport matrix.
3. Load `lanes/*.json` to choose batch order.
4. Load `batches/*.json` to derive state profiles and rerun policy.
5. Consume `examples/*.json` as reference manifests for case expansion.

## Execution assumptions

- Shared dev stack is not the default for broad parallel capture.
- Isolated runners are the intended unit of parallelism.
- Lane execution order inside a runner is always `mobile -> tablet -> desktop`.
- Modified routes should be recaptured after a fix, at minimum with `default`.
- `scrolled` is a semantic state, not a separate geometry band.
