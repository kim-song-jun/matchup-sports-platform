# Teameet Open Design Export Manifest

Captured: 2026-06-05 Asia/Seoul

## Source Priority

Open Design export is the visual parity target for the v1 recovery. The repo `Teameet Design.html` remains the v1 continuity reference for existing product contracts, but this external export drives visual parity for this recovery pass.

Task 2 must build a route/export matrix plus feature implementation audit from this manifest before route-family implementation starts.

## Source Path

`/Users/sungjun/Library/Application Support/Open Design/namespaces/release-stable/data/projects/dc57a253-6a77-4c01-b76b-6a4d1a9037d7`

## Inventory

- Current source inventory: 109 root HTML files.
- Root HTML list: `root-html-files.txt`.
- Full export was not copied into the repo; this manifest pins the external source path and generated inventories.
- `verification-1-1-report.md` absent from the current export root.

## Checksums

SHA-256 checksums are recorded in:

- `checksums.sha256` for `index.html`, `assets/shell.css`, and `assets/shell.html`.
- `zip-checksums.sha256` for current zip artifacts in the export root.

The source report is optional. If `verification-1-1-report.md` is restored later, checksum and copy it as additional evidence without changing this source priority.

## Runtime Guardrails

- Do not modify the external Open Design directory.
- Do not import static Open Design HTML as runtime app code.
- Do not create fake runtime routes for design-only pages.
- Do not mark any page or feature `implemented-well` unless the feature implementation audit cites v1 source evidence and an executable verification command.

## Recovery Scope

This manifest supports `.github/tasks/93-v1-open-design-recovery-from-zero.md`. The recovery must classify every current root Open Design HTML page and every current `apps/v1_web/src/app/**/page.tsx` route before implementation.
