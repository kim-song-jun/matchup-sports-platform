---
'v1_api': patch
'v1_web': patch
---

Break the self-contradiction that kept the release workflow from ever running. `resolve-changeset-version.mjs` asserted that at least one unreleased changeset exists, and `deploy-alpha.yml` calls it without a guard — so consuming the changesets (which is what releasing does) would have broken every subsequent alpha deploy. The resolver now tolerates an empty changeset directory and labels the build against the next patch, so a freshly released 0.1.0 is followed by `0.1.1-alpha.*` and SemVer ordering still holds. The "behavior changes need a changeset" gate is untouched — that lives in `check-changeset-policy.mjs`. The release PR now targets `dev` instead of `main`, matching the branch policy, and refuses to open when there is nothing to release.
