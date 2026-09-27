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
- Uploads are serialized per user with a database row lock. The rolling 24-hour limit is 50MB for images and 500MB for videos; the total retained limit is 2GB per user. A rejected quota request removes all temporary files and stores neither files nor asset rows.

Client input failures return `400` with `UPLOAD_FILE_REQUIRED`, `UPLOAD_FILE_TYPE_INVALID`, `UPLOAD_FILE_TOO_LARGE`, or `UPLOAD_STORAGE_QUOTA_EXCEEDED` as the envelope code. Quota errors include `scope`, `kind`, `usedBytes`, `incomingBytes`, and `limitBytes`.

## Current Boundary

The v1 upload store has ownership and bounded-retention accounting, but it does not claim to be a
private-media system. It has no attachment-level authorization, no user delete endpoint, and no
malware scanner, and URLs are intentionally public and unguessable. Callers must not upload private
documents or secrets. MIME allowlisting and actual file-signature checks protect the supported
public image/video slots; private or executable document upload remains out of scope.
