---
'v1_web': patch
---

Stop a long route from pushing the error log table's own detail button off screen. A path like /tournaments/campaigns/alpha-qa-futsal-recruiting was rendered without wrapping, so it took 354px of a 1130px table and shoved the release column and the 상세 button into horizontal overflow with nothing on screen to suggest they were there. The route is now truncated with the full value on hover, and the message and release columns give back a little width to match.
