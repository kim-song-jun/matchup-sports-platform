# Independent verification: My page normal comparison

The14-file public packet is preserved byte-for-byte. [README](README.md), [summary](summary.json) and [publisher-verification.json](publisher-verification.json) support nine normal My endpoints in the existing browser session: actual Home→My link entry, ordinary reload, and a separate same-browser QA tab, at each of402×606,788×505 and1182×757. Four Home endpoints complete the13 DOM records.

This is **normal comparison evidence for #1558**, not proof that an intermittent503 cause, recurrence or fix has been established. No HTTP status/API payload was captured, no fault induced, and no uptime or performance test conducted. A false limited error-text predicate does not prove every request succeeded.

| Width | Initial My DOM | Reload DOM | QA new-tab DOM |
| --- | --- | --- | --- |
| Mobile402 | 08:57:52.902 | 08:58:02.820 | 08:58:18.402, tab6 |
| Tablet788 | 08:59:09.566 | 08:59:17.835 | 08:59:34.198, tab7 |
| Desktop1182 | 08:59:59.073 | 09:00:07.687 | 09:00:27.856, tab8 |

All times are UTC on2026-10-04. All nine My snapshots have `/my`, main content, generic 내 활동/내 팀 headings, no recorded loading indicator or dialog, and the limited error-text predicate false. Home link rectangles are inside their respective viewports; mobile/tablet use the visible 마이 link and desktop the 내 정보 profile-icon link. This is a recorded endpoint comparison; no account identity or exact API state is inferred.

## Actual safe initial-entry images

![Mobile generic My title](mobile-my-generic-crop.png)
![Tablet generic My title](tablet-my-generic-crop.png)
![Desktop generic activity panel](desktop-my-generic-crop.png)

These images belong to initial-entry DOM rows1/5/9, with separate capture calls at08:57:52.905–.978,08:59:09.569–.651 and08:59:59.078–.158. They are **not reload or new-tab screenshots**. Mobile/tablet crop only the generic page title; desktop crops the generic activity panel. Broader rendering outcomes come from sanitized DOM fields, not full-page image proof. Account identity and profile contents are excluded.

## Tab bookkeeping, semantics and limits

There are21 completed selected action records. The first supported new-tab call created tab6 before an assignment-to-undeclared-handle error prevented the collector from adding that completed action. The collector rebound the existing tab6; no second creation is claimed. Its creation start/end remain missing and are not reconstructed from the later DOM timestamp. Tab7/8 creation calls and all three QA-tab close calls have explicit records. Original tab2 remains at Home in final DOM09:00:37.680Z and exit09:00:37.685Z. The close operations are recorded collector actions, not operations performed again for publication.

signInLinkCount=1 on My is a broad substring match for normal account-settings login wording. It is not a login prompt or authentication failure. No reauthentication or authentication-control action was performed; no user role/viewer equivalence is inferred from prior runs. These generic UI observations do not inspect private settings data.

The packet's source-context file remains attributed static read-boundary evidence. It is not a new transitive source/network audit by the publisher, nor proof all surrounding traffic is GET. Shared API error reporting may write. The collector reports no profile/settings/notification/authentication/logout/upload/share/invitation/business-mutation controls activated, but no unconditional server-write-zero assertion is made.

Public workflow readback confirms4c81 success updated08:22:48Z before fresh Home navigation08:56:49.127–08:56:49.482Z. Healthy/version are reported context; the browser's runtime SHA remains unknown. Current normal rendering cannot establish causality for any historical503.

All14 input checksums, JSON/count/chronology relations and three actual PNGs were independently inspected. PNG dimensions/bounds/hash and capture linkage match; source JPEG hash/crop-equality claims remain preparer-attested because private originals were not read. [publisher-manifest.json](publisher-manifest.json) covers the complete delivered set; original manifest/SHA256SUMS retain their14-file scope.
