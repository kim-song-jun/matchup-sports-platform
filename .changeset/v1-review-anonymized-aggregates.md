---
"v1_api": minor
"v1_web": minor
---

Add anonymized, aggregated review visibility for match/team-match mutual reviews: individual reviews are no longer shown to the reviewed party — only per-sport rating averages and tag frequencies (all-time or a selected month), revealed once both sides have submitted or after 72 hours. Team trust score now only aggregates team_match reviews (tournament fixture reviews are calculated separately). Follow-up: team trust scores on list screens (team list/detail, team-match list/applicants/detail, admin team detail) are now recomputed live from revealed reviews in a single batched query, instead of reading a stale cached value — fixing display lag right after a review reveal.
