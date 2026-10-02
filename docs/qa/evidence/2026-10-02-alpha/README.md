# Teameet alpha QA screenshot evidence

This evidence-only snapshot contains 27 preserved historical before images and 22 fresh after images from the alpha environment. Account, team, and content records are mocked test fixtures. Images are the original captured bytes: none were redrawn or edited.

## Metadata and use

- See [manifest.csv](manifest.csv) for issue, before/after classification, UTC capture time, CSS viewport, raster dimensions, page URL, and image hashes.
- Historical capture time and CSS viewport are explicitly unknown where no authoritative record exists. Filename widths and pixel dimensions are not substituted for CSS viewport measurements. Filesystem modification time is separately labeled and is not a capture timestamp.
- Fresh after means the currently deployed alpha UI at the recorded time. It does not prove that any particular local PR commit was deployed. Verify commit identity separately.
- The fresh captures use CSS widths 405, 787, and 1180. Full-page images with mismatched raster/CSS width and visible clipping were excluded; they were replaced by normal viewport captures. The cause of the capture mismatch was not established and is not reported as product overflow.
- Screenshot crops show only visible state. They do not independently prove keyboard behavior, accessibility semantics, stored data correctness, or the entire form.

## Issue map

### #1407 — Empty friendly-match roster

The preserved `before/issue-1407/friendly-empty-save-error-876.png` shows the old QA179 fixture, zero participants, and the inline error “명단에 최소 한 명은 있어야 해요.” It does not expose the literal server error code LINEUP_EMPTY or independently prove that Save was enabled before the click. Capture time and CSS viewport are unknown. No fresh reproduction or after image is claimed.

### #1458 — Repeated settings headings

Before images cover record consent, real-name display, and player-card settings. Desktop examples visibly repeat the outer and inner page heading. Mobile images provide responsive context. No after image is included.

### #1461 — Repeated member-detail team lists

Before examples show repeated team lists and raw active status labels. After examples show the single flattened team list, localized status, and role pills. The fresh desktop full-page image and normal mobile/tablet viewport crops were visually inspected. Read-only browser verification reported 13 unique linked teams, 12 team-leader roles plus one member role, without a redundant owner tag or horizontal overflow.

### #1463 — Popup form overflow

Before examples preserve the original mobile overflow crop and desktop/tablet edit views. After examples cover selected tournament and long internal-path form states at three widths. Long text within a single-line input can scroll within that input; this alone is not page overflow. Recorded page scrollWidth equals the CSS viewport width. Test edits were discarded and the draft remained unpublished.

### #1464 — Terms and inquiry labels

Before images preserve terms and inquiry forms. After images show specific terms-field labels and the reply/status labels in inquiry forms at three widths. Mobile and tablet normal-viewport captures replace clipped full-page captures.

### #1483 — Report counts and ranking copy

Before ranking images show the earlier recent-30-day description alongside zero recent counts and nonzero all-time counts. After ranking images state that ordering is by all-time totals and separately show recent counts. After count images show the report-filtered count of four. Read-only browser verification reported this batch passed.

### #1460 — Login evidence unavailable

No original login screenshot was found in the scoped evidence directory. No historical before image has been fabricated.

## Publication scope

Only screenshot evidence and this manifest are added on the evidence branch. No application-code change, pull request, or merge is part of this publication. Prefer commit-pinned image URLs when adding issue or PR evidence.
