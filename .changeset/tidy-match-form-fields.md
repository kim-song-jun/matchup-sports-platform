---
"v1_api": patch
"v1_web": patch
---

Fix a managerCount race in team self-leave (use the role read inside the transaction instead of a stale outer read) and de-duplicate the shared match/team-match creation-wizard fields (DraggableFilterSheet, CreateField, GenderRuleSelector) into `components/v1-ui/create-form-fields.tsx`.
