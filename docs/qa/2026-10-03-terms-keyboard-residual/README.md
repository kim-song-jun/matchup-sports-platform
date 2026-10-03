# Terms editor exposure-location focus loss

Residual evidence for issue1464. At405/789/1183 CSSpx, ArrowDown on **노출 위치** changes **회원가입 → 대회 신청** and the active element changes **SELECT → BODY**. The next ArrowUp leaves the selection at 대회 신청 and focus on BODY. The normal keyboard sequence therefore requires refocusing the field. The eventual restoration to 회원가입 also ends with BODY active.

The three sequences are independently checked from 35 DOM records. Cause, remount behavior and overall accessibility compliance are not established.

## Comparison and local restoration

- **동의 유형** ArrowDown changes required→optional and ArrowUp restores required while retaining SELECT focus at all three widths
- Tab/ShiftTab endpoints reach the three controls, but are not a complete keyboard-cycle pass
- All sampled order fields are44 CSSpx high. Mobile order bottom606.425 exceeds viewport606 by0.425 CSSpx, so strict full visibility is false. Tablet/desktop sampled order rectangles fit
- Final local defaults are signup/required/order0 with the collector's editable-text nonempty count0. Save0/Enter0/serverWrites0 are collection reports, not independently audited persistence

After the unfocused ArrowUp, field and BODY y positions move32/26.667/40 CSSpx. The collector observed page scrolling, but scrollY was not stored; these are geometry deltas, not directly measured scroll distances. Mobile has a separate refocused SELECT row before restoration. Tablet/desktop contain the restored signup/BODY endpoint; the intervening refocus procedure is collector-reported.

## Six actual safe crops

- [terms-keyboard-mobile-order](terms-keyboard-mobile-order.png)
- [terms-keyboard-mobile-exposure](terms-keyboard-mobile-exposure.png)
- [terms-keyboard-tablet-exposure-changed](terms-keyboard-tablet-exposure-changed.png)
- [terms-keyboard-tablet-order](terms-keyboard-tablet-order.png)
- [terms-keyboard-desktop-exposure-changed](terms-keyboard-desktop-exposure-changed.png)
- [terms-keyboard-desktop-order](terms-keyboard-desktop-order.png)

The mobile exposure crop is a **later restored/refocused state**, not the focus-loss moment. Tablet/desktop changed-value crops correspond to the failure sequence. BODY focus is proven by DOM, not by an absent outline alone. All crops retain only exposure position, consent type and order controls, with no existing terms body, account area or personal data.

Native popup Space/Escape was observed during collection, but popup pixels are not in these selected PNGs. Tablet consent has no dedicated Space/Escape DOM row. Empty BODY labels/value/type are inactive-element metadata, not erased form values.

## Timing and evidence

Records span12:11:48.407–12:24:06.364UTC, after [Deploy Alpha8167aaa](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37118485935) success updated11:22:16UTC. Runtime servingSHA remains unknown. The collection folder's2357307 label is not a runtime attestation. Tablet CSS789×505 and source raster788×505 remain separate.

[Summary](summary.json) · [35 DOM records](terms-keyboard-after-proof.json) · [Final local state](terms-keyboard-final-state.json) · [Capture provenance and frozen safe snapshot](provenance.json) · [Recomputed sequence/geometry checks](verification.json) · [Manifest](manifest.json)

Original screenshot equality is collector-reported; publication review opens safe crops only. This evidence does not claim a repaired issue, server mutation test or complete editor validation.
