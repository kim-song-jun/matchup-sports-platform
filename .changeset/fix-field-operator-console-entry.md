---
"v1_web": minor
---

필드 담당자(FIELD_OPERATOR)가 자기 담당 경기 콘솔에 도달할 수 있게 진입 동선을 고친다.

**증상 (2026-08-13 alpha 실측)**: 필드 담당자로 로그인하면 마이페이지에 "담당 대회 운영"이 정상 노출되고 담당 대회 카드도 다 보이는데, 카드를 누르면 403 "담당 범위 밖의 화면이에요"로 막히고 그 안내의 CTA를 누르면 404가 떴다. 결국 **담당 경기 운영 화면에 도달할 UI 경로가 존재하지 않았다.**

**인과 사슬 (3단)**:
1. `my-tournament-staff-client.tsx`가 역할과 무관하게 `/tournament-ops/tournaments/:id/operations`로 하드코딩 링크했다. 목적지를 역할별로 계산하는 `myStaffEntryHref` 헬퍼가 이미 있었지만 **어디서도 import되지 않는 죽은 코드**였다.
2. `/operations` 라우트에는 `:tournamentId` 뿐이라 `TournamentStaffGuard`가 만드는 리소스가 `{tournamentId}` 하나뿐이다. 필드 담당자 배정은 `grantStaff`의 `STAFF_SCOPE_REQUIRED` 불변식 때문에 반드시 경기 또는 필드 스코프를 갖고, 정책은 그때 리소스에 해당 스코프가 없으면 `FIXTURE_SCOPE_REQUIRED`/`FIELD_SCOPE_REQUIRED`로 거부한다 — 즉 **구조적으로 예외 없이 403**이다.
3. 그 거부 화면의 CTA가 `/tournament-ops`를 가리키는데 그 경로엔 `layout.tsx`만 있고 `page.tsx`가 없어 **404**였다.

**수정**:
- `myStaffEntryHref`를 되살려 실제로 호출한다. 셸 역할(대회 디렉터·플랫폼 운영자·조회 전용)은 운영 보드로, 필드 담당자만 있는 배정은 새 담당 경기 목록으로 보낸다. 예전 구현은 `fixtureIds[0]`으로 임의의 한 경기에 직행하고 필드 단위 배정이면 `null`을 반환해, 담당 경기가 여럿일 때 말없이 하나를 고르고 필드 단위는 갈 곳이 없었다.
- **새 화면 `/my/tournament-staff/[tournamentId]`** — 담당 경기 목록. 담당 범위는 `GET /me/tournament-staff`(본인 스코프라 필드 담당자도 읽을 수 있다), 경기 상세는 공개 일정(`GET /tournaments/:id/schedule`)에서 읽는다. 둘 다 이 사용자가 이미 읽을 수 있는 것이라 **새 권한 표면이 생기지 않는다**(백엔드 변경 없음). 경기 스코프 배정은 `fixtureIds`로, 필드 단위 배정은 `fieldName` 일치로 고른다.
- 막다른 CTA를 `/my/tournament-staff`로 돌린다.

**경기 콘솔 자체는 이미 정상이었다** — alpha에서 fixture-scoped 배정을 만들어 `.../fixtures/:fixtureId/operate`로 직접 진입해보니 `FieldOperatorConsoleFrame`이 정상 렌더되고 실시간 연결·이벤트 버튼까지 전부 살아 있었다(버튼 비활성은 라인업 미제출이라는 정상 전제조건). 빠져 있던 건 **그 URL로 가는 링크 하나**였다.

**테스트 드리프트도 함께 고쳤다**: `my-tournament-staff-client.test.tsx`는 필드 담당자 카드의 href가 `/operations`라고, `_gate.test.tsx`는 CTA가 `/tournament-ops`라고 **버그를 계약으로 못박고 있었다.** 두 계약을 뒤집고, 역할별 목적지 분기와 새 화면의 선택 로직·빈 상태를 덮는 회귀 테스트를 추가했다.

**알려진 데이터 공백**: alpha의 모든 픽스처에 `fieldId`가 비어 있어(운영 보드 API로 확인) 필드 단위 배정만으로는 담당 경기가 0건이 된다. 이 화면은 그 경우를 "아직 담당 경기가 배정되지 않았어요"로 정직하게 알린다 — 예전처럼 403으로 튕기지 않는다.
