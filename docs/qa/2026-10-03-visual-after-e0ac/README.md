# Photo, cost explanation and prize-caption observations after e0ac

Bounded evidence for related fixes **1580 /1583 /1584**, at405×606,789×505 and1183×758 CSS pixels. Nine actual safe product crops only.

[Deploy Alpha run37115477778](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37115477778) independently reads successful for **e0ac9c6e5501b99bff9765532adec4c907f1b51e**, updated **10:37:05UTC**. Original selected DOM/capture evidence spans **10:44:58.369–10:49:56.348UTC**; original photo DOM also retains earlier10:43:52.192UTC. Fresh entry/reload is reported, but **browser-serving SHA remains unknown**. These are not the earlier2357307/06d72 observations.

## Photo

[Mobile](photo-mobile-visible.png) · [Tablet](photo-tablet-visible.png) · [Desktop](photo-desktop.png)

All three crops show the cow photo. Original DOM records96×96 CSS, opacity1, filter none and no pseudo content/image. Two ancestor entries duplicate the same anchor sample; no full photo ancestor-chain claim.

A separate **11:11:26.130–11:11:41.461UTC** [function supplement](photo-functions-supplement.json) at three widths explicitly records **two url() functions, no gradient function,96×96 CSS and textLength0**. Only URL arguments were redacted. This later observation is not assigned to the original screenshot times. It corroborates removal of the recorded dark gradient without claiming original-image brightness equivalence.

[Photo proof](photo-proof.json) · [Before photo/cost evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/22775cdf98f175dad3a5b40c0fba1ab46b0190e6/docs/qa/2026-10-03-team-photo-cost/README.md)

## Cost explanation

[Mobile](cost-mobile-visible.png) · [Tablet](cost-tablet-visible.png) · [Desktop](cost-desktop.png)

All three show retained **상대팀 부담금**, new **신청하는 팀의 비용이에요**, **25,000원** and **총비용50,000원**. The amounts do not certify allocation semantics, payment or persistence. [Cost DOM proof](cost-proof.json)

**Input aria-describedby remains unverified.** The detail has no cost input. The [10:51:41.245 intermediate observation](cost-input-association-limit.json) is explicitly excluded as unsettled navigation. The [10:52:37.713 info-step observation](cost-input-association-blocked.json) shows empty title/required copy but no exposed cost input. Native required=false is recorded; no native-validation or cost-association failure is inferred.

## Prize caption

[Mobile](caption-mobile.png) · [Tablet](caption-tablet.png) · [Desktop](caption-desktop.png)

At all three widths, **상품 및 상금** is12px/700, **#4e5968 on#fff3e0**. The independently recomputed **CSS contrast6.484924628224474:1** exceeds the normal-text4.5 threshold described by [W3C1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). This is caption-only coverage, not full-page certification.

Each [caption chain](caption-proof.json) has13 nodes through HTML: opacity1, no filter/backdrop/image, normal blend. [Separate property reads](caption-effects-proof.json) establish text fill/color78,89,104, stroke width0px, shadow none; blank earlier camelCase fields are incomplete evidence. Mobile effects were read18.565seconds after capture, while tablet/desktop effects precede their captures.

PNG dominant background is(255,242,223), slightly different from computed CSS(255,243,224); no exact screenshot-pixel ratio or cause is asserted. **Mobile panel top/corners are clipped but caption/trophy/rank text are visible.**

[Contrast calculation](caption-contrast-calculation.json) · [Before caption evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/07477376d9efadc38883c28509bc648b9200aebc/docs/qa/2026-10-03-prize-caption-contrast/README.md)

## Integrity and limits

[Summary](summary.json) · [Deployment context](deployment-context.json) · [Exact capture provenance](visual-after-provenance.json) · [Independent verification](verification.json) · [Manifest](manifest.json)

All9 safe PNGs were visually inspected; hashes, dimensions, crop bounds and DOM mappings were checked. DOM and raster coordinates are not treated as identical across smooth scroll. Tablet CSS789 differs from sourcePNG788. Full original images were intentionally not read by the publisher. Only synthetic/neutral product pixels are public; no account, host/member identity, contact or credential data. No app code or product-state change is part of publication.
