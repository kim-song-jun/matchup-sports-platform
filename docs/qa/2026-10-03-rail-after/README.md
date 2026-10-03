# Featured rail focus reveal — post-deployment observations

PR1572, original latest+sport filter state, 2026-10-03. **14 focused DOM measurements** show complete horizontal card rectangles: **276/276 CSSpx** at mobile/tablet and **320/320 CSSpx** at desktop. Each width records forward Tab1→2→3 and reverse Shift+Tab3→2; desktop also reverses to1.

Enter activates the exact intended URL in **3/3 cases**: mobile card2, tablet card3, desktop card1. Each in-app Back returns to the exact filter URL and the same six ordered main-list URLs. Rail duplicates are not added to that count. **Return focus is BODY**; no focus-restoration repair is claimed.

[Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/8a460f9c03fbd5b5d9ecb13a96c4bc9163bcc296/docs/qa/2026-10-03-individual-rail-focus/README.md) reported mobile middle-card76.8/276 and tablet272/276. This package does not remeasure that historical state.

## Actual safe crops

- [rail-mobile-forward-middle](rail-mobile-forward-middle.png)
- [rail-mobile-reverse-middle](rail-mobile-reverse-middle.png)
- [rail-tablet-forward-middle](rail-tablet-forward-middle.png)
- [rail-tablet-reverse-middle](rail-tablet-reverse-middle.png)
- [rail-desktop-third](rail-desktop-third.png)
- [rail-desktop-reverse-middle](rail-desktop-reverse-middle.png)

Crops deliberately stop before host rows. They do not prove bottom-border or full vertical content visibility. Mobile forward-middle capture begins14.319seconds after its linked DOM observation; timestamps are not simultaneous.

## Timing and scope

DOM observation window09:01:34.068–09:04:20.100UTC follows the successful [Deploy Alpha2357307 workflow](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761), updated07:30:13UTC. Browser-serving SHA is not exposed. Do not attribute these to later06d72/e0ac deployments. CSS viewport405/789/1183 differs from source raster405/788/1183; no physical-device test.

[Summary](summary.json) · [20 DOM observations](rail-proof.json) · [3 Enter destinations](rail-destinations.json) · [Capture provenance](rail-crop-provenance.json) · [Independent rectangle/sequence calculations](verification.json) · [Manifest](manifest.json)

This is rail-specific keyboard coverage, not whole-page order, full modal trapping, form submission, or application/payment behavior. All6 actual safe PNGs and metadata were checked. No raw original image, host identity or account detail is published. No app-code, product-state or deployment change is part of publication.
