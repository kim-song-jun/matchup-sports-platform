# Uploads & Media Contract

## 목적

이 문서는 프론트엔드가 업로드 API를 안전하게 연동하고, 업로드된 미디어 URL을 일관되게 처리하기 위한 실행 계약이다.

기준 우선순위:

1. `apps/api/src/uploads/uploads.controller.ts`
2. `apps/api/src/uploads/uploads.service.ts`
3. `apps/api/src/uploads/uploads.service.spec.ts`
4. `apps/api/src/main.ts` (정적 파일 서빙)
5. `apps/web/src/hooks/use-api.ts` + `apps/web/src/lib/uploads.ts`
6. Swagger (`/docs`)

## 엔드포인트 매트릭스

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/v1/uploads` | Required (`Bearer`) | 이미지 1~5개 업로드 |
| `GET` | `/api/v1/uploads/:id` | Required (`Bearer`) | 업로드 메타데이터 조회 |
| `DELETE` | `/api/v1/uploads/:id` | Required (`Bearer`) | 업로드 및 썸네일 삭제(소유자만) |

성공 응답은 항상 envelope로 감싸진다.

```json
{
  "status": "success",
  "data": {},
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

에러 응답도 공통 envelope를 따른다.

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Bad Request",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## POST `/uploads`

### 요청 규칙

- `Content-Type`: `multipart/form-data`
- 필드명: `files`
- 최대 파일 수: `5`
- 파일당 최대 크기: `10MB`
- 허용 MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- 인증 필수: `Authorization: Bearer <accessToken>`

예시(cURL):

```bash
curl -X POST http://localhost:8111/api/v1/uploads \
  -H "Authorization: Bearer <token>" \
  -F "files=@/tmp/photo-a.jpg" \
  -F "files=@/tmp/photo-b.png"
```

### 응답 데이터

`data`는 배열이며 각 원소는 다음 구조를 가진다.

- `id`
- `userId`
- `filename`
- `originalName`
- `mimetype` (`image/webp`로 저장)
- `size`
- `path` (예: `uploads/2026/04/<uuid>.webp`)
- `width`, `height`
- `createdAt`
- `thumbPath` (예: `uploads/2026/04/<uuid>_thumb.webp`)

서비스는 업로드 시 원본을 WebP로 변환하고, 300px 썸네일을 함께 생성한다.

## GET `/uploads/:id`

업로드 메타데이터를 반환한다. 파일 바이너리 자체를 반환하지는 않는다.

- 존재하지 않으면 `404` (`Upload not found`)
- 인증은 필요하지만 소유자 제한은 걸려 있지 않다(현재 코드 기준).

## DELETE `/uploads/:id`

업로드 레코드와 파일(원본 + 썸네일)을 삭제한다.

- 소유자만 삭제 가능 (`403`, `You do not own this upload`)
- 대상이 없으면 `404`
- 파일 삭제 중 `ENOENT`는 무시하지만, 그 외 파일 시스템 오류는 `500`

### 프론트 구현 메모

- `useUploadImages()`는 `FormData`에 `files`를 append해서 전송한다.
- `useDeleteUpload()`는 응답 body를 실질적으로 사용하지 않는다.
- 서버의 실제 delete 성공 payload는 `{ deleted: true }`이므로, 프론트에서 `{ id: string }`을 기대해 로직 분기하지 않는다.

## 미디어 URL 런타임 규칙

- API 서버는 `main.ts`에서 `/uploads/*`를 정적 파일로 서빙한다.
- 업로드 API는 `path`를 `uploads/...` 형태(슬래시 없는 상대경로)로 돌려준다.
- 프론트는 렌더 시 `/` prefix를 보정해야 한다.
  - 예: `uploads/2026/04/a.webp` -> `/uploads/2026/04/a.webp`
- 절대 URL로 저장된 기존 데이터와 혼재될 수 있으므로, 렌더 레이어에서 경로 정규화 유틸(`normalizeUploadAssetUrl`)을 유지한다.

## 엣지 케이스 / 안티패턴

- UI 전용 필드(예: `previewUrl`)를 multipart와 함께 JSON body로 섞어 보내지 않는다.
- 허용되지 않은 MIME을 브라우저 accept 속성만으로 신뢰하지 않는다(서버에서 최종 거부됨).
- 업로드 응답의 `path`를 그대로 `<img src>`에 넣어 상대경로 404를 만들지 않는다.
- 업로드 성공 직후 엔티티 저장 API에서 `imageUrls`를 보낼 때 `thumbPath`를 원본 대체로 쓰지 않는다.

## CAUTION

- `GET /uploads/:id`는 현재 소유권 제한 없이 메타데이터 조회가 가능하다. 프론트에서 타인 업로드 id를 추측해 접근하는 UX를 제공하지 않는다.
- 업로드는 파일 저장과 DB 저장을 포함하는 I/O 작업이므로 네트워크 재시도 시 중복 업로드가 생길 수 있다. 자동 재시도는 idempotency key 없이 무제한으로 두지 않는다.

