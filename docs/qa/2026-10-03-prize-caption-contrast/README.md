# Tournament prize-caption contrast — 2026-10-03

## Finding

On [one completed synthetic tournament detail](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1), **상품 및 상금** is **12 CSS px, weight 700**, with foreground **#6b7684** on solid background **#fff3e0** at **405, 789 and 1183 CSS-pixel widths**.

The recorded CSS color pair independently recalculates to **4.208740854651445:1**, below **4.5:1**. This informational section caption is not large text or an inactive/decorative element. The result is a bounded caption-level contrast finding; it is not an assessment of whole-app conformance. [W3C SC 1.4.3 guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) specifies the normal-text threshold, large-text exception, unrounded comparison, and evaluation using CSS colors rather than antialiased glyph pixels.

## Actual safe images

[Mobile](prize-caption-mobile.png) · [Tablet](prize-caption-tablet.png) · [Desktop](prize-caption-desktop.png)

These three actual product crops show only the synthetic prize notice and rank badges. No roster, personal identity, conversation or account data is included. No earlier unrelated images are republished.

## Evidence and timing

- [Original three-width CSS proof](prize-caption-contrast-proof.json): first-opaque-background chains and caption styles
- [Later full-chain supplement](prize-caption-full-chain-supplement.json): caption through HTML, separately timestamped; these style observations were made with the caption below the fold and do not constitute new visible screenshots
- [Later desktop text-effects supplement](prize-caption-text-effects-supplement.json):08:44:27.795 UTC, shadow none, stroke width0px, fill equal to the caption foreground; this property check is desktop-only
- [Original mobile comparison-control styles](prize-caption-original-control-styles.json): actual body/badge colors, sizes and alpha background
- [Screenshot provenance](prize-caption-provenance.json): exact capture start/end UTC, reported viewports, crop bounds and output hashes
- [Summary and limits](summary.json), [independent calculations and validation](verification.json), [manifest](manifest.json)

Original screenshots were captured 08:21:56.284–08:28:46.715 UTC. Original caption DOM reads were 08:23:02.339,08:25:19.872 and08:29:54.680 UTC. These are separate observations, with no screenshot/DOM positional alignment claim. Supplementary style times remain distinct and are not retroactively assigned to the original screenshots.

CSS viewport sizes were 405×606,789×505 and1183×758. Tablet source raster width is 788, while its CSS width is 789. Published crop sizes are 365×153,561×130 and600×130 image pixels. DPR metadata is 1.25/1.5/1.

## Comparison controls and proposed color

The original **mobile** CSS sample distinguishes the deficient caption from nearby text:
- Main prize description: rgb(150,83,0) on rgb(255,243,224), **5.418226292948953:1**, above 4.5
- Each sampled rank badge 1/2/3: rgb(78,89,104) over rgba(254,152,0,0.1) composited onto the same card. Composite RGB is(254.9,233.9,201.6); ratio **6.046836134941208:1**, above 4.5

These are bounded numeric comparison samples, not a blanket pass for those components at all widths/states. No claim about an unprovided winner-panel measurement is included.

**Hypothetical change only:** #4e5968 on the existing card background calculates to **6.484924628224474:1**. It was not applied or browser-tested. A future fix should recheck actual styles and states; this evidence publication does not change colors, prizes, fees or rules.

## Deployment and verification limits

The [2357307 Deploy Alpha workflow](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761) was independently verified as successful, updated07:30:13 UTC. These observations occur later, but browser-serving SHA was not exposed. No build-specific regression/fix attribution is asserted.

All three safe images were visually inspected; file hashes, PNG decoding, dimensions and stated crop bounds were checked. Source collectors report original/crop inspection; private originals were intentionally not accessed by the publisher. Screenshot pixels are visual context, not the source of the numerical CSS contrast calculation. No hover/focus/disabled-state sweep or whole-app conformance test was performed.
