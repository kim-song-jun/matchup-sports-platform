# Production image OpenSSL scan hotfix

## Context

- Production promotion of the match discovery live-stat hotfix was merged as PR #945.
- The production API image build was then blocked by the ECR critical-finding gate.
- After the API image was patched, the same finding remained in the Web image.
- ECR reported `CVE-2026-63073` in Alpine `openssl 3.5.7-r0`; Alpine v3.24 now publishes the fixed `3.5.8-r0` libraries.

## Goal

- Keep the production security gate fail-closed.
- Build both v1 production images with the patched Alpine OpenSSL runtime libraries.
- Resume the normal `main` production deployment without bypassing scan or approval gates.

## Scope

Owned: `deploy/Dockerfile.v1-api`, `deploy/Dockerfile.v1-web`, this task document, and matching changesets.

Forbidden: application behavior, Prisma schema/migrations, deployment gate thresholds, and unrelated work.

## Acceptance Criteria

- [x] The v1 API image contains `libcrypto3` and `libssl3` newer than vulnerable `3.5.7-r0`.
- [x] The v1 API Dockerfile base stage builds successfully from a fresh base and package index.
- [x] ECR reports zero critical findings for the promoted API image.
- [x] The v1 Web Dockerfile base stage contains patched `libcrypto3` and `libssl3`.
- [ ] ECR reports zero critical findings for both promoted images.
- [ ] The production deployment completes through the existing approval gate.
- [ ] Production health and match discovery surfaces are verified after deployment.

## Validation

- Build each v1 image base stage with a fresh base/package index.
- Inspect installed Alpine OpenSSL library versions in both built images.
- Run the existing GitHub Actions production scan and deployment gates.
- Verify production release headers, API health, and headed match-discovery views.

## Security Notes

- Do not suppress, downgrade, or bypass ECR findings.
- Each package refresh is shared by builder and runtime stages so build-time and shipped layers use the same patched base.

## Progress Snapshot

- Base: `origin/main` at merge commit `ced88b415` (PR #945).
- Failed production run: `33574538199`.
- API-remediation PR: #950, merged as `9889d9e82`.
- Follow-up production run `33576135876`: API `critical=0 high=0`; Web `critical=1 high=7`.
- Finding: `CVE-2026-63073`, package `openssl`, detected version `3.5.7-r0`.
- Alpine v3.24 repository candidate observed locally: `3.5.8-r0`.

## Ambiguity Log

- ECR names the source package `openssl`; the installed runtime packages in both Node Alpine images are `libcrypto3` and `libssl3`.
