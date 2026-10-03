# Administrator roster: local selector and dismissal validation

Read-only/local-selection QA on2026-10-03 at CSS405×606,789×505,1183×758. Scope: existing league/tournament roster review. No actual member was added or removed.

## Actual evidence denominator

-6 combinations:2 roster surfaces×3 widths
-22 recorded observations: **20 usable,2 explicitly excluded**
-5 inspected screenshot crops; there is no new tournament-mobile screenshot in this package
-2 duplicate-member restriction observations

Each of the6 combinations records placeholder→local selection→dismiss/reopen reset. Add is disabled→enabled→disabled. League empty roster has7 eligible choices; tournament one-member roster has2. Member identities and values are stripped; only selector indexes/counts remain.

The separate duplicate checks show6 existing league members disabled and1 existing tournament member disabled, with2 tournament alternatives eligible. This supports duplicate-member availability, not duplicate jersey-number validation.

League dismissal: mobile Escape, tablet footer Close, desktop X. Tournament dismissal: mobile footer Close, tablet Escape, desktop X. Review-trigger focus restoration is retained where observed; known initial background focus is not presented as a new independent defect.

## Exclusions and limits

The two excluded records remain in proof.json with their reasons: a wrong offscreen navigation dialog and a row-loading snapshot. They do not count as passing evidence. Later settled records supply the relevant observations.

No Add, Exclude, Save, qualification, lock, deadline exception, result, permission or notification mutation was activated. Qualification controls were not changed because they might write immediately. Native required is absent on the selector; the observed requirement is an Add-button gate. Jersey bounds/duplicate-jersey behavior and personal-contact inputs cannot be validated through these forms. No persisted-save, physical-device or screen-reader claim is made.

## Files

- [Summary](summary.json)
- [All22 observations, including2 exclusions](proof.json)
- [League duplicate restriction](duplicate-member-restriction.json)
- [Tournament duplicate restriction](tournament-duplicate-member-restriction.json)
- [Independent6-combination check](verification.json)
- [Console sample](console-summary.json)
- [Capture UTC/crop provenance](screenshot-provenance.json) and [SHA-256 manifest](manifest.json)

Images: [league mobile](league-mobile-empty-reset.png), [tablet](league-tablet-empty-reset.png), [desktop](league-desktop-empty-reset.png), [tournament tablet](tournament-tablet-reset.png), [tournament desktop](tournament-desktop-reset.png).

No names of individual members, photos, phones, dates of birth, financial fields, credentials or full rosters are published. This is bounded observed behavior, not an application-wide PASS.
