# Mobile featured-card cost partly covered by create button

This is a separate layout candidate observed during the cost-label after run. At402×606 CSS pixels, the last featured card's **10000** remains in the DOM, but the blue floating create button visibly covers part of its final digit. The other digits remain visible. This does not establish complete loss of the value, payment/data impact, a regression introduced by PR1592, or a defect across all widths.

![Actual partial overlap on the last mobile featured card](mobile-last-photo-cta-overlap.png)

[List DOM row7](proof.json) · [Overlay DOM](mobile-floating-cta-observation.json) · [Calculated bounding boxes](verification.json) · [Capture provenance](provenance.json) · [Cost-label after](README.md)

On2026-10-04, list row7 is **07:27:08.874Z**, the separate overlay read is **07:27:08.890Z**, and the screenshot call is **07:27:08.894–07:27:08.914Z**. Main scroll is0 and horizontal featured-rail scrollLeft is490.399994. The card is the separate synthetic-overlap-1 fixture titled `t`, not the primary numeric fixture used for three-width detail comparison.

The metadata rectangle is x122.400002–364.800011 and y477.200012–493.200012,242.400009×16px. The visible create-link rectangle is x325.600006–381.600006 and y458–514,56×56px, CSS position:absolute and z-index30. Their rectangular intersection is **39.200005×16px**. This is a bounding-box calculation for the full metadata element; it is not a measured glyph-occlusion width or an opaque-circle/shadow calculation. The screenshot separately establishes the partial rightmost-digit overlap. No character-range rectangles were collected.

The second create link has a zero-sized box. The visible button was not activated. No create, registration, payment or value-edit action is part of this observation. The title/card image/host is not needed to interpret the crop; only synthetic title `t`, ended badge, product metadata and the button are included. The actual safe crop274×68 is preserved without repainting or masking. Private-source equality is collector-attested only.

No matched earlier screenshot at this position or causal source experiment is provided. The renderer, nearby cards, typography and label length may affect layout, but a cause is not established here. This single mobile sample is useful for issue triage; it is not a three-width FAB conclusion or a claim about all card values.
