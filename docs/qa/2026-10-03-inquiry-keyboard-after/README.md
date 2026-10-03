# Inquiry keyboard comparison and exact-name supplement

DOM-only comparison evidence for issue1464. At405/789/1183 CSSpx, recorded Tab endpoints move **reply textarea → reply-submit button focus → status select**. ArrowDown changes local status received→reviewing; ArrowUp restores received while SELECT focus remains. Space/Escape endpoints remain received/select-focused, and reverse movement ends at the reply textarea.

There are22 records: one initial mobile link observation plus **21 keyboard endpoints,7 per width**. All21 report DOM focusVisible and an empty reply. The submit button was focused, not activated. Two reverse ShiftTab presses are collection procedure; intermediate reverse-button focus is not separately recorded.

## Visibility limits

**19/21 active rectangles fit fully inside the viewport.** Tablet reverse textarea starts14.25 CSSpx above the viewport. Desktop initial textarea ends40.75 CSSpx below viewport758. These limits remain explicit; no all-control visibility or pixel audit is claimed. All sampled submit/status rectangles are44 CSSpx high and fit inside the viewport.

Local status changes do not prove saved status. Submit/Apply/Enter/write0 are collector reports. No reply delivery or server persistence was tested. replyEmpty checks an existing textarea with empty value; it is not inferred from an absent control.

## Separate later desktop exact names

At12:38:15.217UTC, a desktop-only read records exactly one textbox named **답변 내용** and one combobox named **문의 처리 상태**, with matching relevant AX lines. This observation is later than the keyboard sequence and does not retroactively establish all-width AX names. Earlier label strings concatenate option text.

## Timing and privacy

Keyboard records12:25:55.828–12:27:18.107UTC. A distinct content-terms exit observation is12:27:18.969UTC. The final-state file duplicates the last keyboard record. [Deploy Alpha8167aaa](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37118485935) success updated11:22:16UTC provides context; runtime servingSHA is unknown.

No screenshots, inquiry title/body, reply text, personal information or raw inquiry identifier/URL are published. Generic route classes, controls, local values, counts and exact UTC remain. This covers sampled keyboard behavior, not complete accessibility, native popup visuals, all fields or submission.

[Summary](summary.json) · [22 sanitized records](keyboard-proof.json) · [Final local state](final-state.json) · [Separate exit](exit-observation.json) · [Later exact AX](exact-ax-supplement.json) · [Verification](verification.json) · [Source hashes](provenance.json) · [Manifest](manifest.json)
