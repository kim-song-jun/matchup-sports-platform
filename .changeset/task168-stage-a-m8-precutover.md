---
"v1_api": patch
---

Stage A now applies the migration that introduces the `V1GameOfficialFactSourceType` enum before
the archived cutover tool runs. The post-cutover migration container also carries M8
alongside M9 and M10 so Prisma sees the complete applied history when it verifies the
post phase.
