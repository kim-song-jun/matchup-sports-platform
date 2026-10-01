# Uploads & Media Contract

## Source Of Truth Priority

1. `apps/v1_api/src/uploads/uploads.controller.ts`, `uploads.service.ts`
2. `apps/v1_api/src/tournaments/videos/tournament-fixture-videos.controller.ts`,
   `apps/v1_api/src/league-matches/league-fixture-videos.controller.ts`
3. `apps/v1_web/src/lib/api-client.ts`, `apps/v1_web/src/hooks/use-v1-api.ts`

## Endpoints

| Method | Path | Auth | Contract |
|---|---|---|---|
| `POST` | `/api/v1/uploads` | user | multipart field `files`, 1–5 JPEG/PNG/WebP images, 5MB each |
| `POST` | `/api/v1/uploads/files` | user | chat file (Task 181 ③): multipart field `file`, exactly one document, 10MB; returns `{ fileId, name, size, mimeType }` — **no URL** |

Video upload is **not** a general `/uploads` route. It is
`POST /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/videos/upload` (and the
equivalent league-fixture route), multipart field `files`, exactly one MP4/WebM/MOV video, 200MB,
which stores the file through the same `UploadsService` and registers the fixture video in the same
request. There is no login-only `POST /api/v1/uploads/videos` route — the only product surface
consuming uploaded video is tournament/league fixture video, which is staff-authorized.

The image endpoint's successful response uses the global envelope and returns `{ urls: string[] }`
(the fixture-video route returns the registered video row instead). Each URL is a server-generated
root-relative `/uploads/YYYY/MM/<uuid>.<ext>` path. Uploaded media is served outside the API prefix
at `/uploads/*`; the v1 Web rewrite proxies that path to the API origin.

There is no `GET /api/v1/uploads/:id` or `DELETE /api/v1/uploads/:id` route, no GIF upload, and no
server-side WebP conversion or thumbnail generation — the client uploads exactly the file it wants
served.

## Validation And Storage

- Multer applies a hard request backstop of 10MB per image, 220MB per video, and the endpoint file-count limit.
- `UploadsService` applies the precise product size limits before moving files.
- The declared MIME type must be allowlisted and the actual leading bytes must match JPEG, PNG, WebP, WebM, or ISO base-media (`ftyp`) signatures. A MIME-only spoof is rejected and every temporary file from that request is deleted.
- Original filenames are never used as served filenames. The server assigns a UUID and an extension derived from the validated MIME type.
- A partial move failure removes both already-moved files and remaining temporary files before returning `500`.
- Every stored file has a `V1UploadAsset` row containing its owner, kind, validated MIME type, actual filesystem byte size, root-relative URL, and relative storage path.
- Uploads are serialized per user with a database row lock. The rolling 24-hour limit is 50MB for images, 500MB for videos and 50MB for chat files; the total retained limit is 2GB per user. A rejected quota request removes all temporary files and stores neither files nor asset rows.

## Chat Files (Task 181 ③)

- Allowed by **extension** (browser MIME is unreliable, e.g. `.hwp` arrives as octet-stream) and confirmed by **content
  signature**: `pdf` (`%PDF-`), `docx`/`xlsx`/`pptx`/`hwpx`/`zip` (ZIP `PK\x03\x04`), `doc`/`xls`/`ppt`/`hwp` (OLE
  `D0CF11E0A1B11AE1`), `txt`/`csv` (no NUL byte in the first 8KB). Executables, HTML and SVG are rejected. Empty files are
  rejected. The stored/served MIME comes from this table, not the request.
- The original name is kept (`V1UploadAsset.originalName`) after cleaning: path segments, control characters and leading
  dots are removed, NFD Korean is normalized to NFC, length ≤ 120 keeping the extension. Multer runs with
  `defParamCharset: 'utf8'` so Korean names are not mis-decoded as latin1.
- Files are stored under `uploads/.private/YYYY/MM/<uuid>.<ext>` — the same persistent volume as public uploads, but
  `main.ts` serves `/uploads` with `dotfiles: 'deny'` so `.private/` is never served publicly (404). The only way to
  read a chat file is `GET /api/v1/chat/rooms/:roomId/messages/:messageId/file` (participants only, see chat contract).
  Multer's temp file for this route is also written under `uploads/.private/` (not the public root), so a crash mid-upload
  never leaves a served file behind.
- `V1UploadAsset.url` is still filled (`/uploads/.private/...`) only to satisfy its unique column; it is not returned by
  any API.

Client input failures return `400` with `UPLOAD_FILE_REQUIRED`, `UPLOAD_FILE_TYPE_INVALID`, `UPLOAD_FILE_TOO_LARGE`, or `UPLOAD_STORAGE_QUOTA_EXCEEDED` as the envelope code. Quota errors include `scope`, `kind`, `usedBytes`, `incomingBytes`, and `limitBytes`.

## Current Boundary

The v1 upload store has ownership and bounded-retention accounting. Image and video URLs are
intentionally public and unguessable — there is no attachment-level authorization for them. Chat files
(above) are the one private kind: no public URL, participant-only download. There is no user delete
endpoint and no malware scanner for any kind; executable upload remains out of scope.
