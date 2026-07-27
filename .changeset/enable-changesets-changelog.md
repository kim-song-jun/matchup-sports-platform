---
'v1_api': patch
'v1_web': patch
---

Turn Changesets' changelog generator back on. `changelog: false` is not compatible with `changesets/action`: the version command succeeds, but the action then reads each bumped package's `CHANGELOG.md` to build the release PR body and dies with `ENOENT` — which is what killed the first release dispatch after the path was repaired. Enabling it also stops throwing away the summaries: until now every consumed changeset's text was discarded, and there was nowhere to read why a version moved.
