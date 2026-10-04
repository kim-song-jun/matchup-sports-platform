# Individual-match title after: responsive hierarchy and navigation

**Safety-scope correction:** the actual nonempty Search submission at06:41:05.227–06:41:05.511Z has a search-history POST path in both relevant source revisions. The general server-mutation-zero count is withdrawn; actual HTTP/DB success remains unobserved. See the [correction and immutable source links](SEARCH-SIDE-EFFECT-CORRECTION.md). All original screenshots, DOM and action records are preserved.

After the reported PR1591 deployment, the same synthetic match renders **one title at each tested width**: H2 at 402×606 and 788×505 CSS px, H1 at 1182×757. The desktop hero H2 has `display:none` and a zero box, while its page H1 remains. Back, Share, completed-state badges and the rendered disabled CTA remain present. This supports the observed responsive-title result for [#1588](https://github.com/kim-song-jun/matchup-sports-platform/issues/1588); it is not an entire-app or WCAG conformance verdict.

[DOM](proof.json) · [Actions](actions.json) · [Original AX excerpts](ax-excerpts.json) · [Separate later full-AX-derived supplement](full-ax-supplement.json) · [Filtered list proof](list-return-proof.json) · [List AX](list-ax-excerpts.json) · [Summary](summary.json) · [Before context](before-context.json) · [Deployment context](deployment-context.json) · [Console sample](console-summary.json) · [Initial-batch exit](exit.json) · [Provenance](provenance.json) · [Verification](verification.json) · [Public hashes](manifest.json) · [Original source hashes](source-manifest.json)

## Before and current title evidence

The [historical desktop screenshot](https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/877d4a4c0b4a495df88003ea78112981bcce1869/docs/qa/2026-10-03-individual-copy-candidates/individual-title-desktop-duplicate.png) visibly repeats the title above and below the illustration. It was captured on Oct3 at 08:47:50.974–08:47:50.993Z, CSS1183×758. The separately timestamped DOM is 08:48:18.949Z; its unfiltered heading list alone does not establish visibility, so the screenshot is the visual repetition evidence. Both public historical title crops and their hashes were re-read and viewed for this comparison.

Current desktop, Oct4 DOM **06:39:22.778Z**, capture **06:39:22.813–06:39:22.855Z**, CSS1182×757:

![Desktop has a page title and no repeated hero title](desktop-title-after.png)

Current mobile, DOM **06:36:45.513Z**, capture **06:36:45.548–06:36:45.566Z**, CSS402×606:

![Mobile retains the hero title and badges](mobile-title-after.png)

Current tablet, DOM **06:38:57.323Z**, capture **06:38:57.370–06:38:57.422Z**, CSS788×505:

![Tablet retains the hero title and badges](tablet-title-after.png)

The [historical mobile crop](https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/877d4a4c0b4a495df88003ea78112981bcce1869/docs/qa/2026-10-03-individual-copy-candidates/individual-title-mobile.png) only establishes one title within that limited crop at CSS405×606. **There is no tablet title-before screenshot**. These are three current after widths, not three exactly matched historical pairs. Current widths402/788/1182 differ from historical405/789/1183, and no historical host geometry is available for a numerical spacing delta.

## Current geometry and keyboard controls

| Initial proof row | CSS viewport | Rendered title | Hero height | Host margin-top | Badge-bottom to host-top | Hero-title to host gap |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 0 | 402×606 | H2 | 320px | 8px | 48px | 8px |
| 10 | 788×505 | H2 | 320px | 8px | 48px | 8px |
| 19 | 1182×757 | H1 | 320px | 0px | 8px | N/A |

All three initial records are at main/window scroll0 with document width equal to viewport width. Host text is deliberately absent from public crops and safe DOM; spacing is recomputed from stored rectangles. The 48px mobile/tablet badge-to-host span includes the intervening title and spacing. Desktop host margin0 does not mean a zero badge-to-host gap. The collector's `visible` flag means rendered with a nonzero box; it does not universally mean inside the viewport. These initial title rectangles are inside the viewport, whereas later scrolled title rectangles can be above it.

Mobile/tablet native Tab moves BODY→Back→Share and native Shift+Tab returns to Back (proof1/2/3 and11/12/13). Desktop's supported locator press focuses the visible Back and sends Tab to Share, then native Shift+Tab returns to Back (proof20/21). This is not a full desktop Tab traversal from the page start. All eight recorded focus endpoints have `focusVisible:true` and fit inside the viewport. Share is44×44px at each width; Back is44×44 on mobile/tablet and40×40 on desktop.

![Mobile Share focus](mobile-share-focus.png)
![Tablet Share focus](tablet-share-focus.png)
![Desktop Share focus](desktop-share-focus.png)
![Desktop Back focus](desktop-back-focus.png)

Captures are paired to their exact DOM and UTC in provenance; the four images show visible focus rings. Mobile/tablet Back endpoints have DOM/AX evidence but no dedicated Back crop. Share was focused without activation. Each initial DOM has two responsive CTA instances, one rendered and both disabled, labelled “신청 불가”; no registration, sharing, result or permission behavior is inferred.

## AX evidence and its separate time window

The original 30 AX detail records contain diff excerpts; initial rows0/10/19 have no heading line. An empty diff cannot establish absence or presence of a title in the full tree. Original desktop heading evidence appears later at rows25/27; focus excerpts independently name Back/Share.

To address that gap, a **separate fresh navigation at06:49:53.279–06:49:53.676Z** precedes new full-snapshot-derived AX excerpts. Mobile AX is06:50:08.647–.675, adjacent DOM06:50:08.688; tablet AX06:50:28.260–.290, DOM.303; desktop AX06:50:28.488–.535, DOM.553. Each retained excerpt contains one fixture-title heading at level2/2/1, matching the adjacent nonzero DOM box H2/H2/H1 and the402/788/1182 widths. These are **3 later AX/DOM observations and5 selected actions, with no new screenshots**, not a replacement or backdated interpretation of the original samples. Safe excerpts are retained rather than full raw trees, so exhaustive extraction cannot be independently reconstructed. Screen-reader speech was not tested.

## Back, filters and scroll: actual outcomes

Keyboard Enter on each rendered Back reaches unfiltered `/matches` at proof4/14/22. Rapid mobile/tablet browser Back/Forward endpoints record detail/list/detail routes, without establishing loaded-list completeness. At desktop proof23, browser Back after app Back actually reaches the prior admin overview. The action's original “returns detail” intent label is preserved with an explicit actual-destination correction. It is not counted as a successful detail return. Forward then reaches the unfiltered list at row24.

The later settled desktop test selects Seoul through the filter UI and enters synthetic search “QA 수명주기”. List proof0 at06:41:22.333 has exactly one main match anchor. Clicking that exact card reaches detail25 with an encoded `from`; its decoded value exactly equals the list path/query, and both responsive Back hrefs point there. App Back restores list1 at06:41:43.683. A subsequent browser Back reaches the **unfiltered** list at proof26; Forward restores filtered list2. Reopening the card reaches detail27, direct browser Back restores filtered list3 at06:42:16.278, and Forward restores detail28.

All seven dedicated list observations preserve the same exact filtered URL, search input and sole fixture anchor. Final list snapshots at402/788/1182 retain “개인 매치” H2; desktop also has the page H1 “매치”. This is one-result preservation and separate responsive list sampling, not a three-width filtered roundtrip or general pagination/order guarantee.

Mobile wheel row8 is an immediate in-flight snapshot. Control+Home row9 leaves nested main scroll384, so no successful scroll-to-top claim is made. A later wheel-up plus resize yields top0 at tablet row10. Settled tablet row18 records main scroll320; desktop row29 records window scrollY360. Those scrolled samples retain the responsive heading state even when the heading is outside the viewport. The manual actions and discrete observations do not prove continuous scroll behavior or measure scroll latency.

## Timing, privacy and limits

Original selected actions begin with a resize at06:35:23.405Z; fresh page navigation is06:35:28.002–.397Z. The initial batch contains30 detail/route DOM records (22 detail,8 route-only),7 list DOM records,30 detail AX excerpts,3 list AX excerpts,47 selected actions and7 PNGs. Initial exit is observed at06:45:22.220Z. The later AX supplement's exit call runs06:50:28.557–06:50:29.118Z and its final observation is06:50:42.980Z, with zero visible inputs/dialogs on the admin overview. Observation gaps are not page-load durations.

[Deploy Alpha run37182306774](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37182306774) independently reports success for606977780cd758b20b23cd78614a9693098153fa, updated06:29:46Z, before both fresh navigations. Version and healthy-time fields are parent-reported context. **Browser runtime serving SHA remains unknown**; no earlier QA or unrelated fix is credited to this deployment. PR1592 and PR1596 are outside this test.

The console query at06:43:56.932Z returned45 entries with44 in the original run window, classified by the collector as the same extension-metadata error. Raw messages are omitted; no application-cause, clean-console, network or API-response conclusion follows. It does not cover the later AX run or the remainder after that console observation.

Initial tablet CtrlPlus is timestamped in the47 actions. Additional mobile zoom keys and the later list-tablet CtrlPlus are collector-reported outside that ledger; the supplement separately discloses its own zoom keys. Actual DOM viewport values are authoritative. This is cloud Chromium resize/zoom testing, not physical devices. Only the illustration variant and this completed synthetic fixture were exercised. No Share/CTA activation, fixture edit, upload or account/role change was reported. The actual synthetic search submission has a search-history POST path; general server-write zero is withdrawn. Selected UI actions do not establish whether that request or any database write succeeded.

All7 safe crops were independently viewed and contain only synthetic title, generic badges/illustration and controls. No host/account/roster identities are published. This batch's source rasters are402×606,788×505 and1182×757, matching its CSS dimensions; the prior unrelated402×605 raster is not substituted. Private raw screenshots/console/AX trees were not opened. Original-to-crop equality remains collector attestation. In provenance, `sha256` and `sourceSHA256` identify the private source capture; **outputSHA256** identifies the delivered crop.

Original safe files remain unchanged. Public JSON consistently pseudonymizes match, tournament and region UUIDs, retaining original source hashes and original-string hashes in verification. Source manifest and current public manifest have distinct scopes. The historical images are linked, not uploaded again. Issue closure is a separate review decision; this commit contains documentation and evidence only.
