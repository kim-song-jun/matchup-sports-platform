# Public records and consent contract

<!-- API_CONTRACT_SECTION_BEGIN:Public visibility output matrix -->
### Public visibility output matrix
| Mode | Bracket/status | Lineup | Score | Events | Records |
|---|---|---|---|---|---|
| `hidden` | hidden | hidden | hidden | hidden | hidden |
| `status_only` | lifecycle only | hidden | status without numeric score | hidden | official historical records only |
| `live` | visible | after authoritative `lineupAt` | live numeric | live consent-filtered | official records plus pending-projection marker |
| `official_only` | visible | official snapshot only | official numeric only | official event summary only | official records only |

<!-- API_CONTRACT_SECTION_END:Public visibility output matrix -->

<!-- API_CONTRACT_SECTION_BEGIN:Consent truth table -->
### Consent truth table
| Transition/state | Public career/history | Team aggregates | Cache and immutable snapshot |
|---|---|---|---|
| Unlinked guest | never creates a career page | included under pseudonymous participant ID | name snapshot retained operations/audit only |
| Two-party link attested at T1 without consent | pre/post-T1 hidden | retained | immutable link events record requestor and distinct attestor; null consent version |
| Consent vN granted at T2 | events at/after T2 become eligible; no pre-T2 backfill | retained | future snapshots capture vN; rebuild starts at T2 |
| Consent vN revoked at T3 | all identity-linked career rows, including pre-T3 rows, hide immediately; no future projection | retained and never publicly relinked | public cache purge ≤5s; snapshots/audit retain pseudonymous ID, vN, grant/revoke times |
| Regrant vN+1 at T4 | only events at/after T4 become eligible; hidden older rows stay hidden | retained | future snapshots capture vN+1; no automatic historical relink |
| Linked user later unlinked | public career rows hide immediately and future projection stops | retained | same as revoke; immutable operations snapshot remains pseudonymous |

<!-- API_CONTRACT_SECTION_END:Consent truth table -->

<!-- API_CONTRACT_SECTION_BEGIN:Consent lifecycle and retroactivity -->
### Consent lifecycle and retroactivity
- Consent is versioned per participant snapshot. Grant permits future public player projection; no consent keeps only team aggregates and operations-only identity.
- Revocation immediately hides player-identifying public DTO/HTML/metadata, purges public cache within the 5-second projection SLO, and removes all identity-linked career rows including pre-revocation history; regrant restores eligibility only for events at or after the new grant time.
- Historical team score/event aggregates and an internal pseudonymous participant snapshot remain for integrity and audit; they can never relink publicly. Audit retention preserves consent version, actor, timestamp, and policy basis.

<!-- API_CONTRACT_SECTION_END:Consent lifecycle and retroactivity -->
