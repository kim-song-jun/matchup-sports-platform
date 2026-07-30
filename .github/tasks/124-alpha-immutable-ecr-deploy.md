# Task 124 — Alpha immutable ECR deployment

## Decision

- Selected: **B — ECR digest + release manifest**
- Target: `dev` → `alpha`
- Excluded: `main` merge, stable tag/release, production workflow or production deploy
- Tier: HEAVY — changes an external registry integration, AWS permissions, release provenance, and rollback state.

## Problem

The current alpha workflow uploads a source archive and builds mutable local
images on the 2 GB EC2 host. The release state records only version and commit;
it does not bind source artifact identity to image digests, and rollback is not
executable.

## Required contract

1. GitHub Actions waits for the matching dev CI, builds each v1 image once on
   the runner, and pushes to tag-immutable alpha ECR repositories.
2. A versioned release manifest binds full commit SHA, Changesets prerelease,
   source object key/version/checksum, API/Web repository digests, build time,
   the expand/contract database rollback policy, and the exact previous SHA
   proven compatible by the migration SQL gate.
3. EC2 downloads and validates the manifest before pull, migration, or service
   mutation. Compose receives exact `repository@sha256:...` references.
4. Candidate becomes active only after container digest checks, API DB health,
   public health, legacy `/v1` 404, and release header checks pass. The former
   active manifest becomes previous atomically.
5. Rollback swaps active/previous container manifests without reversing DB
   migrations. A previous application image is eligible only under the
   documented expand/contract compatibility contract.
6. Re-running the same SHA reuses the existing immutable images and manifest;
   it never attempts to overwrite an ECR tag or rewrite provenance.

## Failing-first scenarios

### IMM-RED-001 — immutable build/provenance guardrail

Command:

```bash
node scripts/qa/check-alpha-immutable-deploy.mjs
```

RED observable: current workflow/compose/deploy script lacks ECR digest,
manifest validation, and active/previous state; command exits non-zero.

GREEN observable: the same command exits zero and rejects a temporary mutation
that restores EC2 `docker build`, tag-only images, or missing manifest checks.

### IMM-SURFACE-001 — deployed release identity

Commands:

```bash
aws ecr describe-images --repository-name teameet-alpha-v1-api --image-ids imageTag=sha-<40-char-sha>
aws ecr describe-images --repository-name teameet-alpha-v1-web --image-ids imageTag=sha-<40-char-sha>
aws s3api get-object --bucket "$ALPHA_DEPLOY_BUCKET" --key "manifests/<sha>.json" /tmp/manifest.json
curl -fsSI https://alpha.teameet.co.kr/landing
curl -fsS https://alpha.teameet.co.kr/api/v1/health
```

PASS observable: both ECR digests equal the manifest, active EC2 manifest and
running container digests equal it, public version/SHA headers match, and DB
health is true.

### IMM-SURFACE-002 — rollback and idempotent redeploy

Action: after immutable release A and subsequent release B exist, invoke the
alpha rollback script through SSM, verify A headers/digests, then re-run Deploy
Alpha for B and verify B headers/digests.

PASS observable: `active` and `previous` swap once per successful transition,
no image rebuild occurs on B redeploy, DB remains healthy, and production is
untouched.

### IMM-ADVERSARIAL-001 — tampered manifest

Action: run the manifest validator against a fixture whose SHA, source
checksum, or image URI/digest is malformed or cross-account.

PASS observable: validation fails before `docker pull`, migration, or Compose
mutation.

## Owned files

- `.github/workflows/deploy-alpha.yml`
- `.github/workflows/deploy.yml` (focused immutable alpha guardrail step only)
- `deploy/docker-compose.alpha.yml`
- `deploy/deploy-alpha.sh`
- alpha release/rollback helpers under `deploy/`
- `scripts/qa/check-alpha-immutable-deploy.mjs`
- `scripts/qa/test-alpha-release-state.sh`
- `docs/ops/v1-alpha-environment.md`
- `deploy/DEPLOY_GUIDE.md`
- this task and its Changeset

## Progress snapshot

- 2026-07-19: Decision B approved. Existing workflow and EC2 build path audited.
  AWS CLI session is expired, so repository/IAM provisioning is gated on
  reauthentication; local implementation and failing-first proof proceed
  without mutating AWS.
- 2026-07-19: Implemented runner-side immutable SHA images, deterministic
  source object reuse, versioned release manifest, exact-digest Compose,
  candidate/active/previous state, fail-closed restore, manual rollback, and
  idempotent AWS provisioning.
- 2026-07-19: Closed independent review blockers with exact account/target
  verification, protected `alpha` rollback environment, conservative additive
  migration parsing, canonical SSM rollback-base resolution, and versioned
  source directories that atomically switch and restore with image state.
- 2026-07-19: Final review additionally required runtime release metadata to
  live outside immutable source and the first conversion to gate migrations
  from the legacy receipt SHA. Both are now enforced; source reuse also rejects
  checksum or directory drift, and legacy recovery verifies exact images,
  running state, DB health, and public legacy headers.
- 2026-07-19: User explicitly deferred all AWS mutation, alpha deployment, and
  `dev` push. This wave is limited to local code, documentation, static
  guardrails, functional shell tests, and exact-path local commits. Live ECR,
  S3, IAM, SSM, same-SHA redeploy, and rollback evidence remain intentionally
  pending until separate authorization.
- 2026-07-19: Final local static gate passed: 15 shell syntax checks, three
  workflow YAML/run-block parses, immutable negative controls, release/source
  state and checksum tests, A→B→B manifest provenance reuse, migration parser
  negative controls, real local SHA compatibility, and diff check. Independent
  code and infra reviews both APPROVE with Critical 0 / High 0. The remaining
  non-blocking limitation is that full EC2 failure recovery and GitHub `alpha`
  environment reviewer/dev-only settings require later authorized live proof.
- 2026-07-31: Deploy Alpha run `30554189093` proved CI/OIDC success but failed
  before build at `head-bucket` with 403. The target verifier unnecessarily
  required `s3:ListBucket`; deployment only needs pinned object operations and
  bucket versioning metadata. Replaced the redundant probe with
  `get-bucket-versioning --expected-bucket-owner`, retained fail-closed owner
  and versioning checks, removed `ListBucket` from the converged role policy,
  and added static regression coverage.
