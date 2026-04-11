# Global Contract

## Base URL / Prefix

- Local dev API origin: `http://localhost:8111`
- Prefix: `/api/v1`
- Swagger: `http://localhost:8111/docs`

## Content-Type

- JSON API: `application/json`
- 파일 업로드: `multipart/form-data`

## 인증

- 보호 endpoint는 `Authorization: Bearer <accessToken>` 필요
- Access token 만료 시 프론트는 `POST /auth/refresh` 후 원 요청 재시도
- refresh 실패 시 프론트 interceptor가 logout + `/login` 이동

## Success Envelope

모든 정상 응답은 `TransformInterceptor`에 의해 아래 형태로 래핑된다.

```json
{
  "status": "success",
  "data": {},
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

프론트 훅(`use-api.ts`)은 `extractData<T>()`로 `data`만 꺼내서 사용한다.

## Error Envelope

모든 예외 응답은 `AllExceptionsFilter`에서 아래 형태로 내려간다.

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Bad Request",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

`message`는 `string`으로 오는 경우가 가장 많지만, validation 계열에서는 배열 또는 객체에서 추출된 값이 내려올 수 있다.

## ValidationPipe 계약

`main.ts` 전역 설정:

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`
- `enableImplicitConversion: true`

의미:

- DTO에 없는 필드를 보내면 `400` 발생 가능
- query/body number/boolean 변환이 DTO+transform 규칙에 의해 수행
- endpoint마다 DTO 사용 여부가 달라 파싱 결과가 동일하지 않을 수 있음

## 날짜/시간 포맷

- date: `YYYY-MM-DD`
- time: `HH:mm`
- timestamp: ISO 8601

## Pagination 기본 shape

cursor 기반 목록 API는 보통 아래 shape를 반환한다.

```json
{
  "items": [],
  "nextCursor": null
}
```

## Optional / Nullable / Omitted 규칙

- `optional` 필드는 생략 가능
- `nullable` 필드는 `null` 허용
- 일부 필드는 `undefined`와 `null`이 다르게 처리됨
- PUT이 아니라 PATCH/부분 갱신 패턴이므로, "보내지 않은 필드"는 기존 값 유지가 기본

## CAUTION: DTO-less / weakly typed

- 일부 endpoint는 DTO가 느슨하거나 JSON object 필드(`Record<string, unknown>`)를 받는다.
- 이런 endpoint는 프론트에서 UI 전용 필드를 그대로 보내지 않도록 submit payload를 명시적으로 정리해야 한다.

## Source References

- `apps/api/src/main.ts`
- `apps/api/src/common/interceptors/transform.interceptor.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/hooks/use-api.ts`

