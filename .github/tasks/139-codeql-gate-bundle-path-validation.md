# Task 139 — CodeQL gate-bundle path validation

## Context

Production promotion PR #471 reported two CodeQL `js/path-injection` findings in the immutable
game-operation gate evidence reader. The top-level bundle was restricted to the canonical gate
directory, but prerequisite and rollout receipt paths embedded in that bundle were opened without
the same root-boundary validation.

## Goal

Keep every filesystem read performed by the operation-flag gate verifier inside the canonical
gate evidence root while preserving nested prerequisite and rollout receipt layouts.

## Original Conditions

- [x] Reject absolute paths outside the canonical gate root.
- [x] Reject `..` traversal that escapes the canonical gate root.
- [x] Continue allowing nested prerequisite and rollout evidence under the root.
- [x] Keep the top-level gate bundle restricted to a direct child of the root.
- [x] Add focused regression coverage.

## Test Scenarios

- Happy: nested receipt under the gate root resolves to its canonical absolute path.
- Edge: top-level bundle is accepted only as a direct child of the gate root.
- Error: sibling traversal and `/etc/passwd` are rejected before any filesystem operation.

## Acceptance Criteria

- No caller-controlled or document-controlled path reaches `lstatSync`/`openSync` outside the
  canonical gate evidence root.
- Focused config unit tests pass.
- PR #471 CodeQL path-injection findings are cleared after the fix reaches `dev`.

## Security Notes

The immutable-mode, symlink, realpath, descriptor-stability, and SHA-256 checks remain in place.
Root containment is an additional boundary and does not replace those checks.

## Ambiguity Log

- Nested evidence must remain supported because gate bundles reference prerequisite, lifecycle,
  deployment, and public-proof receipts below the root; only the bundle itself is a direct child.

## Progress Snapshot

- The first fix added a reusable lexical containment validator, but PR #471 CodeQL still traced
  taint through that helper to `lstatSync` and `openSync`.
- The immutable reader now canonicalizes the requested path with `realpathSync`, applies the
  root-prefix guard inline, and rejects canonical/requested-path mismatches before later reads.
- A second scan showed CodeQL did not treat the shared `gateFailure()` call as an aborting guard.
  The containment check is now an isolated branch with a direct exception before any later sink.
