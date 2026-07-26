# V1 Uploads And Media API

## Endpoints

| Method | Path | Auth | Contract |
|---|---|---|---|
| `POST` | `/api/v1/uploads` | user | multipart field `files`, 1–5 JPEG/PNG/WebP images, 5MB each |
| `POST` | `/api/v1/uploads/videos` | user | multipart field `files`, exactly one MP4/WebM/MOV video, 200MB |

Successful responses use the global envelope and return `{ urls: string[] }`. Each URL is a server-generated root-relative `/uploads/YYYY/MM/<uuid>.<ext>` path. Uploaded media is served outside the API prefix at `/uploads/*`; the v1 Web rewrite proxies that path to the API origin.

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

The v1 upload store has ownership and bounded-retention accounting, but it does not claim to be a private-media system. It has no attachment-level authorization, user delete endpoint, or malware scanner, and URLs are intentionally public and unguessable. Callers must not upload private documents or secrets. MIME allowlisting and actual file-signature checks protect the supported public image/video slots; private or executable document upload remains out of scope.
