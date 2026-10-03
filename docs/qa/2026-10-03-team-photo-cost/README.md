# Team-match photo and cost-label observations — 2026-10-03

Bounded, read-only alpha product evidence at **405×606, 789×505, and 1183×758 CSS pixels**. This package is not a full-app pass or a post-deployment acceptance test.

## Observed

- **Photo thumbnail:** all three safe crops show the same dark animal photo with no text over the photo. Separate DOM observations report a **96×96 CSS-pixel** thumbnail with `linear-gradient(rgba(17,24,39,0.58), rgba(17,24,39,0.72))`, filter `none`, element opacity `1`. The **58–72% values are spatial gradient alpha endpoints**, not a before/after change or a measured brightness reduction. Empty thumbnail text was explicitly recorded in tablet/desktop DOM only; mobile text absence is a pixel observation.
- **Cost label:** all three safe crops and three separate DOM observations show **상대팀 부담금 25,000원** and **총비용 50,000원** for one detail fixture. Allocation mode and copy intent are unverified. These amounts alone do not establish equal-sharing semantics or justify changing labels across other modes.
- **Four limited color samples:** at 405 CSS pixels on the league list, the recorded foreground/background pairs recalculate to **4.62:1, 4.82:1, 4.87:1, and 6.45:1**. Only those flat-color samples and recorded background-chain assumptions are covered. No numeric accessibility failure or whole-page/site conformance is asserted.

Product URLs:
- [Team-match list](https://alpha.teameet.co.kr/team-matches), photo fixture ID `87328d95-dae5-4548-918f-7954a24b7fcd`
- [Observed cost detail](https://alpha.teameet.co.kr/team-matches/d3b5e862-53dd-4516-b73a-f771e0ef6476)
- [League-list color samples](https://alpha.teameet.co.kr/tournaments?kind=league)

## Timing and deployment limits

- Team-photo/cost DOM: **07:18:51.945–07:27:14.015 UTC**; public screenshot capture bounds: **07:18:52.324–07:26:29.745 UTC**. The earlier league color observation is **07:13:47.106 UTC**.
- DOM and screenshots are **separate observations**. Mobile photo DOM is step08, but the crop is from step09. Mobile/tablet DOM positions differ from the pictured frames; do not use them as same-frame position or occlusion measurements. All exact UTC values and differences are retained in [verification](verification.json).
- The [Deploy Alpha workflow for 6a7bfb2](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105376598) is independently observed as successful, last updated **07:21:38 UTC**. That timestamp lies within this observation sequence. **Browser-serving SHA was not established**; a pre-existing SPA can retain old bundles. Later screenshots do not establish an after-test of that SHA or any integrated batch, and these observations do not establish a failed fix.

## Coverage and exclusions

[Coverage matrix](coverage-matrix.json) has **27 unique surface×width rows: 9 narrow observer-reported rows and 18 unobserved rows**. The six public crops directly support six team-match rows; four color samples add a bounded CSS measurement for the mobile league row. Other matrix claims are expressly observer-reported, not independently established by these crops. Unobserved rows are not passes.

The resize-transition league screenshot05 remains excluded. Original screenshots, conversations, participant identities, source attachments, member data and account details are not published. The synthetic QA team label and ordinary product cost amounts shown in the crops were inspected. No keyboard, empty-state, other allocation-mode, payment, full-page overflow, or original-photo brightness conclusion is drawn from this package. No product save, upload, application, payment, or permission change was performed in the reported visual run.

CSS789 uses a reported source PNG raster width of **788**, not789. Recorded DPR values are **1.25 / 1.5 / 1**. Crop dimensions are image pixels and must not be substituted for viewport dimensions.

## Files

### Actual safe product crops
- Photo: [mobile](team-photo-mobile.png), [tablet](team-photo-tablet.png), [desktop](team-photo-desktop.png)
- Cost label: [mobile](cost-label-mobile.png), [tablet](cost-label-tablet.png), [desktop](cost-label-desktop.png)

### Proof and verification
- [Summary and limits](summary.json)
- [Team-photo/cost DOM proof](team-image-cost-proof.json)
- [League color RGB/background-chain proof](league-list-contrast-proof.json)
- [Screenshot capture bounds, crop metadata and SHA-256](screenshot-provenance.json)
- [Coverage matrix and excluded observation](coverage-matrix.json)
- [Independent calculations, timing and file checks](verification.json)
- [File manifest](manifest.json)

File hashes, decoding, output dimensions and stated crop bounds were checked. All six actual safe images were visually inspected. Pixel identity to the private full screenshots was not independently rechecked because those originals were intentionally excluded. Evidence-only publication; no application-code change.
