# Public league player profile return after PR1607

Fresh public navigation after the reported f614096 alpha release reached the same synthetic league, fixture and player as the earlier #1418 reproduction. The route was discovered through the current public tournament list, league card, bracket link and fixture card. No historical fixture URL was guessed or directly injected.

Actual player profile → page Back returned to the same fixture at all three tested widths. The outgoing profile link and profile Back link retained the complete naturally generated fixture URL, including its nested parent from. Source and returned scroll values match exactly in the recorded observations:

| Width | CSS viewport | Source and returned scroll |
|---|---|---|
| Mobile |402×606| main108.800003px, window0 |
| Tablet |788×505| main133.333328px, window0 |
| Desktop |1182×757| main0, window96px |

`return-comparison.json` binds the actual href, visited profile, page Back href and returned URL with exact equality results and original URL hashes. Runtime serving identity and current viewer role remain unknown. The historical run used guest mode and different viewport dimensions.

## Safe screen evidence

Pictures deliberately exclude the roster and profile identity card. Their names/destinations are validated by the sanitized DOM route chain rather than publishing member details. Screenshot times and paired DOM times are separate in crop-provenance.json.

| Width | Profile Back control | Returned fixture context |
|---|---|---|
| Mobile | ![](mobile-profile-back-control.png) | ![](mobile-return-fixture.png) |
| Tablet | ![](tablet-profile-back-control.png) | ![](tablet-return-fixture.png) |
| Desktop | ![](desktop-profile-back-control.png) | ![](desktop-return-fixture.png) |

Additional fixture-source crops are retained. The mobile entry crop is at initial scroll0; mobile departure108.8 is DOM-only and is not relabeled as that picture.

## Separate schedule-tab residual

After one more page Back from the fixture to its bracket, a prior 정규 라운드 selection becomes 전체 on tablet and desktop. The main 경기 일정 tab remains selected. This is distinct from the successful player-to-fixture return. Only one fixture exists in either selected mode, so additional result loss is not established. Existing issue mapping and change causality are not determined here.

![Desktop schedule selection before](desktop-schedule-tab-before.png)

![Desktop schedule selection after the extra Back](desktop-schedule-tab-after.png)

The desktop bracket scroll103→213 may include automatic scrolling during the prior fixture-link click, so it is not claimed as a scroll-restoration defect. Tablet bracket scroll133.333 remains unchanged. Tablet before is DOM-only; tablet-schedule-return-tab.png shows its returned state.

## Limits

The natural URL has no hash and the fixture exposes no normal hash-navigation control. Arbitrary query parameters, query order and event hash retention remain untested. Event anchor IDs alone are not navigation evidence. Source fixture has no tabs; profile activity tabs were not changed. Tournament, team-roster, direct/cold profile paths and whole-issue closure are outside this batch.

No data editing or submission was performed. Final state is the public tournament list at15:09:42.156 UTC. This packet does not claim an HTTP/DB audit or zero incidental server activity.
