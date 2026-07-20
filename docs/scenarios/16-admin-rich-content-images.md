# Admin Rich-Content Image Scenarios

Date: 2026-07-19
Scope: V1 admin notice and popup rich-content image lifecycle

## Result

- Focused automated tests: **71/71 passed**
- Full API regression: **578/578 passed** across 48 suites
- Full Web regression: **139/139 passed** across 39 files
- Browser image matrix: **14/14 passed** with no console, page, network, or HTTP errors
- Live API/DB lifecycle: **6/6 passed**, including cleanup
- V1 Web production build: **76/76 routes passed**

## Test Matrix

### Rich-content contract - 24/24

- Accepts JPEG, JPG, PNG, and WebP managed image URLs.
- Accepts image-only documents and up to 10 images.
- Canonicalizes Tiptap 3.28 defaults: null alignment/dimensions/title, missing empty-block content, and default Link attributes.
- Rejects external, base64, unsafe, malformed, mismatched, duplicate, blank-alt, unknown-attribute, and over-limit images.
- Continues to reject unsupported alignment, custom link presentation, and non-null image dimensions.

### Asset and entity lifecycle - 20/20

- Claims a temporary image when a notice or popup is saved.
- Rejects URL/ID mismatches, unavailable assets, and assets owned by another entity or admin.
- Handles claim races without a false successful save.
- Keeps referenced images and deletes images removed from saved content only after the update succeeds.
- Blocks direct deletion of attached images.
- Rolls stored files back when DB creation fails.
- Removes stale temporary uploads while preserving claimed assets.

### Upload storage boundary - 10/10

- Requires a file and accepts JPEG, PNG, and WebP.
- Rejects unsupported MIME and files over 5 MB, cleaning temporary files.
- Supports cross-device move fallback and rolls partial moves back on failure.
- Rejects path traversal, external paths, and backslash escape attempts.
- Treats an already-missing managed file as idempotent cleanup.

### HTTP and DTO boundary - 3/3

- Actual Nest ValidationPipe accepts raw Tiptap image JSON for popup and notice creation.
- Unknown top-level fields remain rejected by whitelist/forbid rules.

### Web editor and session cleanup - 14/14

- Uses multipart field files and consumes the direct asset response.
- Renders asset URLs correctly under NEXT_PUBLIC_BASE_PATH=/v1.
- Handles actual Tiptap image defaults.
- Inserts multiple selected images once, in selection order.
- Ignores unsupported types and exposes upload failures without inserting broken images.
- On save, deletes only uploads absent from the submitted document.
- On cancel or editor switch, deletes all uploads from that editing session.
- Retains referenced uploads and surfaces failed cleanup without accidental repeat deletion.

## Browser Verification - 14/14

An isolated /v1 production build verified three uploads, notice/popup web and mobile real-surface previews, POST payload image retention, saved-image retention, canceled-image DELETE cleanup, /v1/uploads paths, and zero console/page/network/HTTP/overflow failures.

Evidence: output/playwright/visual-audit/rich-content-image-matrix-2026-07-19/report.json

## Live API/DB Verification - 6/6

Against http://localhost:8121/api/v1:

1. Uploaded a real WebP image.
2. Created a popup containing raw Tiptap defaults, an empty paragraph, a default link, and the image.
3. Confirmed the image URL returned 200.
4. Updated the popup to remove the image.
5. Confirmed the removed image URL returned 404.
6. Deleted the popup and completed cleanup.

## Commands

- pnpm --filter v1_api test
- pnpm --filter v1_web test
- pnpm --filter v1_api build
- pnpm --filter v1_web exec tsc --noEmit
- pnpm --filter v1_web build
- node scripts/qa/v1-rich-content-editor-qa.mjs
