# Errors And Validation

## 공통 에러 형태

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "오류 메시지 또는 메시지 배열",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Validation 실패 패턴

전역 `ValidationPipe` 설정 때문에 아래가 핵심이다.

- DTO에 없는 필드 전송 시 실패 가능 (`forbidNonWhitelisted`)
- 타입 변환 실패 시 실패 가능 (`transform`)
- enum 허용값 외 값 전송 시 실패

예시:

```json
{
  "title": "Sunday Game",
  "sportType": "futsal",
  "uiOnlyPreview": true
}
```

`uiOnlyPreview`가 DTO에 없다면 `400` 가능.

## query 파싱 주의점

endpoint마다 구현이 다르다.

- DTO 기반 query (`@Query() Dto`): class-transformer 규칙 적용
- 수동 parse endpoint (`teams` 목록 등): `parseInt + clamp/default` 로직 사용

즉, 동일한 `"limit=abc"`라도 endpoint별 결과가 달라질 수 있다.

## 권한/상태 gate 에러

서비스 계층에서 자주 발생:

- role 부족: `403`
- 상태 전이 불가: `400`
- 중복 신청/중복 생성: `409` 또는 `400` (도메인별 상이)
- 리소스 없음: `404`

## message normalization 가이드 (프론트)

프론트 오류 처리 시 아래 순서를 권장:

1. `error.response?.data?.message` 추출
2. string이면 그대로 표시
3. string[]이면 join해서 표시
4. 그 외는 fallback 메시지 사용

object 형태 예시:

```json
{
  "status": "error",
  "statusCode": 403,
  "message": {
    "code": "CHAT_FORBIDDEN",
    "message": "채팅방 접근 권한이 없습니다."
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

이 경우 프론트는 `message.message`를 우선 사용하고, 없으면 fallback 문구를 써야 한다.

## 자주 나오는 도메인별 실패 예시

- Auth
  - `400`: 이메일/비밀번호 불일치
  - `409`: 중복 이메일/닉네임
  - `401`: invalid refresh token
- Matches
  - `400`: 모집 상태 아님, 정원 초과, 이미 참가
  - `403`: host 전용 액션을 non-host가 호출
- Teams
  - `403`: owner/manager/member 권한 부족
  - `409`: 이미 멤버, pending 신청/초대 중복
- Team Matches
  - `400`: status gate 불일치, 이미 평가/체크인 완료
  - `404`: team match 또는 팀 없음

## CAUTION

- 일부 endpoint는 도메인 `code` 필드를 message 객체 형태로 던진다.
- 일부 endpoint는 plain string message를 던진다.
- 프론트는 "항상 동일한 스키마"를 가정하지 말고 fallback 처리해야 한다.

## Source References

- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/main.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/matches/matches.service.ts`
- `apps/api/src/teams/teams.service.ts`
- `apps/api/src/team-matches/team-matches.service.ts`
- `apps/web/src/lib/api.ts`
