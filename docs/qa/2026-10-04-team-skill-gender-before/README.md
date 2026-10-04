# Team-match creation: skill and gender controls before change

At402×606,788×505 and1182×757 CSS pixels, the creation **condition** screen shows four skill chips, **입문 / 초보 / 중수 / 고수**, with none selected. Gender shows **성별 무관 / 남 / 여**, with 성별 무관 selected. The six actual crops below preserve this baseline for the requested skill-range and mixed-gender UI change. No skill or gender choice was activated; actual exclusive-selection behavior was not tested. No edit form was visited.

[Condition DOM/AX excerpts](proof.json) · [Actions](actions.json) · [Summary](summary.json) · [Verification](verification.json) · [Capture provenance](provenance.json) · [Entry](entry.json) · [Title restoration](restore.json) · [Fresh info load](reentry.json) · [Exit attempt](exit-attempt.json) · [Actual exit](exit.json) · [Deployment context](deployment-context.json) · [Source comparison](source-comparison.json) · [Source scope](source-safety-context.json) · [Public manifest](manifest.json) · [Original source hashes](source-manifest.json)

## Actual three-width baseline

All times are UTC on2026-10-04. Grade and gender images are separate scroll positions, not simultaneously visible sections.

| CSS viewport / DPR | Skill DOM | Gender DOM | Scroll to gender |
| --- | --- | --- | --- |
| 402×606 /1.25 | 07:49:30.485 | 07:50:04.154 | Main0→576 |
| 788×505 /1.5 | 07:50:51.813 | 07:51:03.467 | Main0→400 |
| 1182×757 /1 | 07:51:04.426 | 07:51:14.691 | Window0→600 |

Mobile:

![Mobile skill choices before](mobile-skill-before.png)
![Mobile gender choices before](mobile-gender-before.png)

Tablet:

![Tablet skill choices before](tablet-skill-before.png)
![Tablet gender choices before](tablet-gender-before.png)

Desktop:

![Desktop skill choices before](desktop-skill-before.png)
![Desktop gender choices before](desktop-gender-before.png)

Each DOM sample records the same seven target controls, all `type=button`,44px high. Their explicit role and aria-checked attributes are null; aria-pressed is false for all four grades and true only for 성별 무관. The paired screenshot independently shows the blue selected gender chip and unselected skill chips. The target controls are inside the viewport in their respective crop's observation; the other section may be offscreen at that time. No claim is made that all seven controls are simultaneously visible.

The captured full-state AX reads were reduced to **filtered choice excerpts**. Each excerpt includes seven target lines plus an unrelated 초보 환영 style choice matched by the collector's text filter. The tool renders these as checkbox lines with0/1 values. That tool representation does not establish HTML checkbox roles, radio semantics, a tested single-choice interaction, or screen-reader speech. DOM/AX and screenshot times are separate: screenshot calls start37–53ms after their linked DOM, after the corresponding AX excerpt timestamp.

Recorded checks report `mixedTextPresent:false`, no matching range inputs and native select count0. The collector searched input/select/button aria-label, placeholder and textContent for five phrases: 최소 실력, 최대 실력, 실력 범위, 범위로, 범위 선택. This does not exclude differently named custom controls. The mixed check was a literal 혼성 search in body.innerText; select count queried native select elements. Exact extraction definitions are attributed to the collector in verification.json. The two section crops also show no mixed option or minimum/maximum controls within their bounds. These are bounded observations of this mounted creation screen, not a claim about every application form or backend field. Neither range interaction nor save normalization was tested.

## Temporary title and actual exit

Initial title and description are blank at07:46:27.332Z. Only the synthetic **QA 실력 성별 1004**,13characters including spaces, is temporarily entered at07:47:07.379–07:47:07.414Z to advance from info to condition. Neither grade nor gender is selected; the initial empty skill value has no observed UI clear path, so a choice was not made. Other form edits are collector-reported0.

Previous returns to info at07:51:14.757–07:51:15.033Z. Before restoration at07:51:44.703Z, the exact synthetic title remains and description is empty. Explicitly clearing the title at07:51:44.706–07:51:44.726Z produces blank title and description at07:51:44.771Z.

The first Back action at07:51:44.773–07:51:44.831Z does **not** establish an exit. The later `firstExit` sample at07:52:20.826Z still records `/team-matches/new/info` and a present title field; the collector reports a keep-draft confirmation. That file key and the original action label reflect an intended exit, not a successful one.

A fresh document navigation at **07:52:20.828–07:52:21.359Z** goes to that same info URL. At07:52:22.149Z the title and description are both blank. This confirms those two fields on a fresh info load; it is not a return from an already reached list or a new condition-screen after test.

The next Back at07:52:22.152–07:52:22.223Z again requests exit. At **07:53:35.746Z**, the info route/title field remain with one visible dialog saying the draft is kept temporarily on this device. Only the later **나가기** confirmation at07:54:13.231–07:54:13.296Z is followed by the actual list observation: **07:54:28.375Z**, `/team-matches`, title field absent, dialog count0. The interval is not a measured navigation latency. Public action labels clarify these endpoints and preserve the original labels.

Leaving is **not draft deletion**. The bounded source contract writes draft changes to local persistence with a24hour expiry and a refreshed savedAt timestamp; storage failures are caught. Restoring visible blank values does not prove byte-for-byte storage rollback, unchanged expiry, removal of the whole draft or restoration of unmeasured fields. No local storage contents were read for this publication.

## Deployment and source attribution

Initial document navigation is **07:44:32.434–07:44:41.295Z**, after the reported5372 deployment and before the later45b9 success. The later [Deploy Alpha run37185889857](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37185889857) independently reports success for45b9f0756b70d3b80801d5f5f2b43c692e007d1a, updated07:45:40Z. Healthy07:44:46.703 and version are parent-reported metadata. All six condition DOM observations occur after that success report, but they follow a SPA transition from the initially loaded document. **No browser serving SHA is directly observed**, and the late deployment must not be assigned retroactively to the document or every observation.

Independent reads at5372ea9c3640621eb270d15c54c70a822b97d536 and45b9f0756b70d3b80801d5f5f2b43c692e007d1a confirm identical full contents and Git blobs for the creation client, team-match page, shared create-form fields and expiring-draft helper. Source comparison records exact links and hashes. In that source, a scalar grade is passed to a preset selector, and a click replaces that value; the gender selector contains the three labels above. This supports the static contract, while the current QA deliberately leaves those choices untouched. Shared source usage is not evidence that an edit form was opened.

This is a before baseline, not evidence of the new mixed-label/range implementation or the separate team-selection image fix. There are6 condition DOM samples,42 repeated target-control records,48 filtered AX lines,19 selected completed action calls and6 PNGs. Initial navigation is recorded separately. Repeated records are not additional test executions.

All6 safe PNGs were inspected for account/team/member/contact data; they contain only the product control sections. Source raster dimensions402×606,788×505 and1182×757 match the CSS dimensions for this batch. Crop dimensions, hashes, bounds and chronology were independently checked. Private originals were not read; original-to-crop pixel equality and source hashes remain collector attestations. Original safe files are preserved.

No final create, field Enter, image selection/upload, application, result/roster/permission change or notification is reported. This does not establish global server-write-zero or an HTTP/DB audit. Edit UI, keyboard selection behavior, physical devices, screen-reader speech and range persistence remain untested.
