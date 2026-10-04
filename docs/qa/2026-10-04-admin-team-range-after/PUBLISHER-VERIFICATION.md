# Independent verification: administrator skill range and gender

The administrator creation form supports the selected range and gender conditions at **402×606 / 788×505 / 1182×757 CSS pixels**. The supplied public evidence contains **40 form DOM snapshots, 46 timestamped collector action records, three full AX excerpts and nine safe PNGs**. This new administrator run supplements the [consumer creation range evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/4cd55ff80096a1f3ec38b1f025730aa8cfd0707b/docs/qa/2026-10-04-team-skill-range-after/README.md); its state contract and observations remain separate.

## Values and focus

At each width the observed sequence is both **미설정 → 입문/입문 → 입문/초보 → 고수/고수 → 입문/입문 → both 미설정**. The first equal/partial changes follow recorded ArrowDown actions. Setting the minimum above the maximum and the maximum below the minimum uses selectOption and updates both endpoints. Mobile and desktop clear the maximum; tablet clears the minimum. These are three selected crossing/reset sequences, not every possible range combination or a malformed-value test.

Baseline Tab reaches the maximum; ShiftTab returns to the minimum. Three recorded Tabs from maximum traverse format/uniform to gender, with the final gender endpoint saved; there are no separate DOM endpoints for the intermediate two fields. The return ShiftTab endpoint is the uniform input. All **36 selected focus endpoints** (proof1–12,14–25,27–38) have focusVisible=true and their control rectangles inside the viewport. The two grade selects are48px high and162 /309.3333435 /309px wide; gender is44px high. All120 repeated select snapshots have equal clientWidth and scrollWidth. Rectangle arithmetic was independently checked for178 rectangles. These checks do not establish arbitrary text, overlay occlusion, physical-device or whole-form accessibility coverage.

Displayed **혼성** has DOM option value **성별 무관**. At each width, after Space/menu/Escape, ArrowDown changes it to 남 and ArrowUp restores 혼성. This is an observed DOM value, not a captured saved API payload. Female selection was displayed as an available choice but was not activated.

## Photos and time

All times are UTC on4 October2026. Fresh list navigation is **10:54:33.016–.575**; the observed creation link is recorded at10:54:46.225 and clicked at10:54:46.249–.362. The six page-capture rasters match their CSS viewport dimensions. The three native menu captures come from a **1364×1024 desktop surface**, not402/788/1182-wide page images. Crop sizes are therefore not substitute viewport measurements.

| Width | Unset range and maximum focus | Partial range | Native menu |
|---|---|---|---|
| Mobile | ![](mobile-range-unset.png) | ![](mobile-range-partial.png) | ![](mobile-gender-native.png) |
| Tablet | ![](tablet-range-unset.png) | ![](tablet-range-partial.png) | ![](tablet-gender-native.png) |
| Desktop | ![](desktop-range-unset.png) | ![](desktop-range-partial.png) | ![](desktop-gender-native.png) |

The native photos are linked to **pre-Space** DOM endpoints, not simultaneous expanded-popup DOM snapshots. Mobile DOM10:56:07.952 precedes Space10:56:07.955–08.024 and native capture10:56:22.764–.804; Escape starts10:56:22.808. Tablet DOM10:57:06.201 precedes Space.204–.281, capture.381–.422 and Escape10:57:14.765. Desktop DOM10:57:38.288 precedes Space.292–.362, capture.493–.540 and Escape.543. The three full AX excerpts at10:56:30.644 /10:57:15.707 /10:57:39.589 show collapsed controls after restoration. The earlier empty AX diff is retained and excluded. Popup pixels establish the visible menu choices; these AX records do not establish expanded-menu semantics or screen-reader speech.

Initial proof0 and reentry proof39 have below-viewport grade controls and BODY focus. Tablet resize proof13 has active uniform input y−296.8333 to−252.8333; the next focused condition14 brings it into view. Mobile gender ArrowDown coincides with scrollY1509.599976→1766.400024; locator focus may contribute. No spontaneous scroll defect, exact scroll restoration or unrestricted resize PASS is claimed.

## Restoration, source and validation

Explicit range/gender restoration precedes Back10:57:57.201–.223, list endpoint10:57:57.562, observed-link reentry10:57:57.566–.651 and proof39 at10:57:57.947. That reentry has blank grades, 혼성, and the same12 field-length records as initial proof0: text/textarea/datetime values have length0; the two numeric values have length1. It does not show that every field is blank. The final button is disabled in all40 recorded snapshots. Final Back10:57:57.953–.971 leaves **/admin/team-matches at10:57:58.248**, with the form heading absent. This is one reentry after explicit restoration; it is not a dirty-edit discard or browser-reload persistence test.

The publisher fetched the immutable951 source and matched all three source-contract Git blobs, plus the administrator list, mutation hook and API client. The page binds the range to **useState/setGrade** and gender to **useState/setGenderRule**. Its own source contains no localStorage draft/autosave or form element. The final type=button invokes a separate create mutation, whose hook calls v1Post('/admin/team-matches'); the API client uses the/api/v1 base. Image upload is a separate mutation. This source-level form boundary does not establish global storage/network behavior, permissions, or actual HTTP/DB outcomes. The consumer draft TTL/storage contract does not apply as proof of this administrator run.

[Workflow37192728828](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37192728828) was independently read as successful951a67e3423dec502697f8bab2d78696d9374cc5, updated09:49:29Z before navigation. Version/healthy time are reported deployment context; serving runtime SHA remains unknown.

All23 supplied files remain byte-for-byte unchanged. All21 payload-manifest entries,22 checksum entries and six original-JSON snapshot hashes match. All nine public PNGs were directly inspected and decoded; dimensions, bounds, capture chronology, DOM index and output SHA256 agree. They show product controls, blank fields and generic option labels without names, contacts, private images or identifying image metadata. Original screenshot hashes and exact source-to-crop equality remain collector attestations; private originals were not read. Action timestamps and endpoint ordering are independently checked; successful execution is attributed to the collector ledger, which does not embed raw method/result transcripts and sometimes groups multiple keys in one record.

No creation, upload, edit, final submit or new role was tested. Input Enter, dirty-draft discard, actual saved payload/DB persistence, complete screen-reader speech and physical devices remain outside this packet. See [publisher-verification.json](publisher-verification.json) and [publisher-manifest.json](publisher-manifest.json) for the delivered checks and hashes.
