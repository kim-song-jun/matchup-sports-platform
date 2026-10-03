# Default team-list pagination retention — post-deployment observations

PR1570 bounded regression evidence, 2026-10-03. **All six paired comparisons preserve count, unique match URLs and complete ordered URL sequence**:
- Mobile app Back:68→68; browser Back:68→68
- Tablet app Back:40→40; browser Back:68→68
- Desktop app Back:40→40; browser Back:68→68

[Product list](https://alpha.teameet.co.kr/team-matches) · [Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/f83dc91ea01123f0fc1472f234eb859189e0211e/docs/qa/2026-10-03-match-sort-pagination/README.md)

## Timing and limits

[Deploy Alpha2357307](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761) completed successfully, updated07:30:13UTC. DOM observations are08:54:37.708–08:59:04.506UTC; capture bounds are08:55:00.923–08:59:04.866UTC. Browser-serving SHA is not exposed. These observations are temporally after that workflow, not attested to its runtime code, and are not06d72/e0ac observations.

Current list count68 differs from the historical69; no reason is inferred. Tablet/desktop app comparisons genuinely contain40 records, not68 or69. Two pending-loading records are retained and excluded from comparisons. Default unfiltered list only. Exact scroll and focus restoration were not measured; header screenshots were intentionally taken at the top.

## Actual safe images

Images show aggregate headers only. The DOM arrays, not screenshots, establish sequence equality. **Mobile browser-before PNG is absent**; both DOM endpoints exist. Its after capture starts7.012seconds after the corresponding DOM read. No mobile app image substitutes for it.

- mobile app: [before](mobile-app-before.png), [after](mobile-app-after.png)
- mobile browser: [after](mobile-browser-after.png)
- tablet app: [before](tablet-app-before.png), [after](tablet-app-after.png)
- tablet browser: [before](tablet-browser-before.png), [after](tablet-browser-after.png)
- desktop app: [before](desktop-app-before.png), [after](desktop-app-after.png)
- desktop browser: [before](desktop-browser-before.png), [after](desktop-browser-after.png)

## Proof and validation

[Summary](summary.json) · [21 DOM observations](pagination-proof.json) · [Six comparisons](back-comparison.json) · [Capture provenance](pagination-crop-provenance.json) · [Independent calculations](verification.json) · [Manifest](manifest.json)

CSS widths405/789/1183 and source raster widths405/788/1183 remain distinct. DPR metadata is1.25/1.5/1. All11 safe PNGs were visually inspected and their bytes, dimensions and crop bounds checked. Full originals were not accessed by the publisher. No app-code or product-state mutation is part of this evidence publication.
