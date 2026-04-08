# 08. Fix EC2 Deploy Pipeline

## Context

- User requested a live deployment audit using the repository `ec2-info` entry.
- Live checks on 2026-04-08 showed the production EC2 host at `52.78.228.77` accepts `ec2-user`, not `ubuntu`.
- The latest `CI / Deploy` runs on `main` failed before deploy, so production stayed on the last successful deployment from 2026-04-05.

## Goal

- Restore the current GitHub Actions deploy pipeline on `main`.
- Align EC2 access info and deployment documentation with the audited production host.

## Original Conditions

- `ec2-info` pointed to `User ubuntu`.
- `.github/workflows/deploy.yml` specified pnpm in both the action input and root `package.json`.
- The deploy job assumed `sudo docker compose`, but the audited EC2 host only has `sudo docker-compose`.
- Deployment docs still described `git pull` on the server even though the production checkout behaves as an `rsync` mirror and may not contain `.git`.

## User Scenarios

- Operator reads `ec2-info` and connects to the real EC2 host without trial-and-error.
- A push to `main` completes `CI / Deploy` and redeploys the latest code.
- An operator can understand manual recovery steps without assuming unsupported Docker Compose commands or a Git worktree on the host.

## Test Scenarios

- Confirm the workflow YAML parses after the change.
- Confirm the deploy workflow no longer pins a second pnpm version in the action setup step.
- Confirm deploy documentation references `ec2-user` and compose-command compatibility.

## Parallel Work Breakdown

- Infra: fix GitHub Actions deploy workflow and EC2 access entry.
- Docs: update deployment guide, README, and agent runtime notes.

## Acceptance Criteria

- `ec2-info` uses the working SSH user from the audited host.
- `CI / Deploy` test job does not fail on pnpm version duplication.
- Deploy job supports both `docker compose` and `docker-compose` on the EC2 target.
- Docs no longer instruct operators to `git pull` from a host checkout that may not be a Git repository.

## Tech Debt Resolved

- Removed drift between bootstrap/runtime assumptions and the deploy workflow.
- Removed drift between actual EC2 access and repository operator docs.

## Security Notes

- No secret values are copied into the repository.
- Deployment docs continue to reference secret names only, not contents.

## Risks

- The workflow change is static until it is pushed and exercised by GitHub Actions.
- The EC2 host is still on standalone `docker-compose`; a future host image change should be re-verified before assuming plugin availability.

## Ambiguity Log

- 2026-04-08: Verified whether the production host should use `ubuntu` or `ec2-user`; live SSH authentication confirmed `ec2-user`.
