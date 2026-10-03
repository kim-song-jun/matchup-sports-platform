# Individual match wording and title candidates

Three bounded product-copy observations from2026-10-03, based on eight actual safe crops and two separate desktop DOM reads. These are historical observations, not a current-deployment retest.

## Bare value in sampled list metadata

Three sampled placements at789/1183 CSSpx show **10000** after skill/gender text, without a currency unit or comma in that line. Mobile price is unobserved. The scope is three placements, not three distinct fixtures or all cards.

- [Tablet featured metadata](individual-price-tablet.png)
- [Desktop featured metadata](individual-price-desktop-featured.png)
- [Desktop main-row metadata](individual-price-desktop-row.png)

This is a clarity candidate. A free-form cost note is not evidence of a payment error. No stored amount, payment flow, costNote field semantics or formatter implementation was inspected. Any numeric formatting proposal must first respect the field's actual meaning.

## Closed wording on one fixture

One synthetic fixture shows **1/2명** alongside **모집 완료** at405/789/1183 CSSpx. Separate mobile/desktop title crops show **종료**. The wording can be read as recruitment reaching capacity; the evidence does not establish the actual closure reason, incorrect capacity or incorrect business rules. No application or host action was attempted.

- [Mobile count and notice](individual-closed-mobile.png)
- [Tablet count and notice](individual-closed-tablet.png)
- [Desktop count and notice](individual-closed-desktop.png)
- [Mobile title with ended badge](individual-title-mobile.png)

Only the later desktop DOM observation establishes one rendered disabled **신청 불가** button. That control is outside the closed-notice crops. Tablet's ended badge is also outside its selected crop. An earlier empty notice extraction is not evidence that the notice disappeared.

## Desktop title repetition

[Desktop title crop](individual-title-desktop-duplicate.png) visibly repeats the same synthetic title above and below the illustration. A separate desktop DOM read identifies H1 and H2. This is lower-priority hierarchy polish. The mobile title crop shows one title in its bounded area; full mobile/tablet title uniqueness is not established. Two unfiltered DOM buttons/back links include hidden responsive controls and are not two rendered controls.

## Timing and provenance

All-observation window08:45:06.371–08:49:01.785UTC; selected capture window08:45:06.372–08:48:19.190UTC. Desktop title capture ends08:47:50.993; H1/H2 DOM is08:48:18.949. Rendered-controls DOM at08:49:01.785 is separate from the desktop notice crop. Runtime servingSHA is unknown, and this package does not claim after-state for later deployments.

Tablet source raster788×505 differs from CSS viewport789×505. All eight safe PNGs and JSON were inspected for host/member/contact/account data and secrets; only synthetic product text remains. Original-to-crop equality is attributed to the collector.

[Summary](summary.json) · [Desktop DOM proof](individual-detail-copy-proof.json) · [Capture provenance](individual-copy-crops-provenance.json) · [Verification](verification.json) · [Manifest](manifest.json)
