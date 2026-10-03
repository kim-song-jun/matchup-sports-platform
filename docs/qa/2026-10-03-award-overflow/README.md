# Admin individual awards: mobile blank-row overflow

Real alpha QA on **2026-10-03 UTC** at the synthetic tournament [personal awards page](https://alpha.teameet.co.kr/admin/tournaments/aa100000-0000-4000-8000-000000000004/awards). This package concerns a local, unsaved award row.

## Finding

At a **CSS405×606** viewport, adding one empty award row expands document scrollWidth from **405 to 434px**. The 44px-wide **항목 삭제** button lies at x **389.600006–433.600006**, leaving approximately **15.4px visible** and **28.6px beyond the right viewport edge**.

Tab can focus the button, but its horizontal bounds remain unchanged and most of its icon/focus boundary stays clipped. This is partial visual clipping, not a claim that the control is wholly keyboard-inaccessible.

| Viewport CSS | Local rows | Document scrollWidth | Delete x bounds | Visible delete width |
|---|---:|---:|---|---:|
| 405×606 baseline | 0 | 405 | No delete button | N/A |
| 405×606 after Add | 1 | 434 | 389.6–433.6 | 15.4 / 44px |
| 405×606 after Tab focus | 1 | 434 | 389.6–433.6 | 15.4 / 44px |
| 789×505 tablet | 1 | 789 | 692–736 | 44 / 44px |
| 1183×758 desktop | 1 | 1183 | 1078–1122 | 44 / 44px |

Expected: the empty title row and its delete control fit horizontally, including visible keyboard focus, without page-level horizontal overflow.

## Reproduction

1. Open the synthetic tournament personal-awards page at CSS405×606 with zero award rows.
2. Click **+ 항목 추가** once, without entering or saving an award.
3. Observe horizontal overflow and the partially offscreen delete control.
4. Focus the award-title field, then press Tab without activating Delete.
5. Observe that Delete is focused but retains the clipped x bounds.

An initial mobile screenshot was captured at 04:12:35.771–04:12:35.787 UTC. The repeated fresh zero-row flow has exact DOM observations:

- **04:19:07.166**: zero rows, document width405
- **04:19:07.516**: one blank local row, document width434
- **04:19:07.599**: delete button focused, document width434 and unchanged x bounds

Tablet control geometry is from 04:16:36.054; desktop control geometry is from 04:17:44.630. All times are 2026-10-03 UTC. Screenshot start/end bounds are separate from DOM observation times.

## Screenshots

- [Mobile local row](awards-mobile-local-row.png)
- [Mobile clipped delete after keyboard focus](awards-mobile-delete-focus.png)
- [Tablet control](awards-tablet-local-row.png)
- [Desktop control](awards-desktop-local-row.png)

![Mobile delete focus remains partially clipped](awards-mobile-delete-focus.png)

## Evidence and limits

- [Candidate details](candidate.json)
- [Sanitized DOM geometry and focus proof](proof.json)
- [Capture UTC bounds, crop dimensions, and image SHA-256](provenance.json)
- [File manifest](manifest.json)

All visible-width/overflow values were independently recomputed from the recorded rectangles and CSS viewport widths. All four image dimensions and SHA-256 values were checked. Mobile images preserve the full405×606 viewport; tablet/desktop images are pixel-preserving crops. Tablet CSS width789 differs from its788px source raster because of rendering rounding. Crop dimensions are not substituted for CSS measurements.

No Save or Delete was activated and no award recipient was selected. One local team option was staged during separate picker inspection; no award was saved. The QA report records navigation away restoring zero award rows. This package does not test persisted save/delete behavior. Root cause was not determined; no source inspection or deployed-fix claim is made. No physical mobile, touch, or screen-reader validation was performed. Placeholder-label observations were not independently triaged as a separate issue.

Images and sanitized JSON contain no member/host names, recipient identities, phone numbers, birth dates, credentials, or sidebar account information. Original screenshots with account context are excluded.
