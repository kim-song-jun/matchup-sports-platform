# Task 181 — 채팅 + 패널 (사진 · 일정·매치 공유 · 파일)

Status: In Progress — ① + 패널 · 사진 보내기 구현 중. ② 일정·매치 공유 · ③ 파일 보내기는 후속 PR.
**Owner**: Claude (사용자 요청 2026-10-01)
**Created**: 2026-10-01

## Context

- 모든 채팅방(매치·팀·팀 매치·컨택)이 같은 화면(`components/community/community-page.tsx` `ChatRoomPageView`)을 쓴다.
  입력창의 + 버튼은 "이미지 첨부 (준비 중)"으로 **비활성**이었다.
- 서버 채팅 메시지는 **텍스트만** 지원했다 — `V1ChatMessageType = text | system`, 전송 DTO 는 `content` 하나.
  그래서 + 기능은 화면만이 아니라 DB·API·목록/미리보기·알림까지 함께 바뀐다.
- 업로드는 이미 있다 — `POST /uploads`(jpeg/png/webp, 5MB, `V1UploadAsset` 에 소유자 기록, `/uploads/...` 공개 서빙).
  웹 훅 `useV1UploadImages` 가 큰 사진을 자동 축소한다.
- 선행: #1384(입력칸 여러 줄 · Enter 전송). 이 태스크의 브랜치는 그 위에서 시작한다.

## Goal

카카오톡처럼 + 를 누르면 입력창 아래로 기능 패널이 펼쳐지고, 거기서 사진을 보내고(①), 일정·매치를 카드로
공유하고(②), 파일을 보낼 수 있게(③) 한다. 모바일 웹·앱도 같은 화면이다.

## Original Conditions

- [x] 화면 방식 = A안 카카오톡식 패널(2026-10-01 사용자 선택 — B 바텀시트 · C 팝오버와 비교 후)
- [x] 기능 = 사진 보내기 · 일정·매치 공유 · 파일 보내기(2026-10-01 사용자 선택, 구장 위치 공유는 제외)
- [ ] ① + 패널 + 사진 보내기(앨범 · 카메라)
- [ ] ② 일정·매치 공유
- [ ] ③ 파일 보내기

## ① 설계 — + 패널 · 사진 보내기

- **DB**: `V1ChatMessageType` 에 `image` 추가, `V1ChatMessage.attachmentAssetId`(→ `V1UploadAsset`, `ON DELETE SET NULL`).
  추가만 하는 마이그레이션 1개.
- **API** `POST /chat/rooms/:roomId/messages` body `{ content } | { imageUrl }`(둘 중 하나만).
  `imageUrl` 은 **보내는 사람이 올린 이미지 업로드**여야 한다(`V1UploadAsset` url·소유자·kind 확인) — 남의 업로드나
  임의 URL 을 채팅에 싣지 못하게. 사진 메시지의 `body` 는 `'사진'` — 목록 미리보기·신고 스냅샷·옛 경로가 그대로
  읽히게. 알림·푸시 본문은 "사진을 보냈어요".
- 메시지 목록·실시간 페이로드에 `messageType`·`imageUrl`(숨김/삭제면 `null`). 읽지 않은 수·신고 대상은
  `system` 만 빼고 센다(예전엔 `text` 만).
- **웹**: + ↔ × 토글로 입력창 아래 패널(`aria-expanded`/`aria-controls`, ESC 로 닫힘). 칸: **앨범**(여러 장, 최대 5)
  · **카메라**(터치 기기만 — PC 는 카메라가 없고, 안드로이드 앱은 네이티브 선택기가 `capture` 를 무시해 앨범과 같아서 숨김).
  고른 사진은 업로드 1회 → 사진마다 메시지 1개. 말풍선은 사진 썸네일, 누르면 전체 화면 보기.

## User Scenarios

1. 팀장이 팀 채팅에서 + → 앨범 → 사진 3장 선택 → 사진 말풍선 3개가 차례로 올라간다. 팀원 채팅 목록 미리보기는 "사진".
2. 모바일 브라우저·iOS 앱에서 + → 카메라 → 찍은 사진이 바로 전송된다.
3. 받은 사진을 누르면 전체 화면으로 보고, ESC·뒤로가기·닫기로 돌아온다.
4. 컨택 수락 전·종료된 방처럼 입력이 잠긴 방에서는 + 도 눌리지 않는다.

## Test Scenarios

- happy: 사진 메시지 저장(type·asset·body) · 목록에 `imageUrl` · 패널 열고 앨범 선택 → 업로드 → 사진마다 전송.
- edge: 숨김 메시지는 `imageUrl` null · 5장 초과 선택은 앞 5장만 · 입력 잠긴 방은 + 비활성.
- error: 남의 업로드/없는 URL → 400 · `content`+`imageUrl` 동시 → 400 · 둘 다 없음 → 400 · 업로드 실패 → 안내 문구.
- mock updates: `chat.service.spec.ts` prisma mock 에 `v1UploadAsset.findFirst` · 웹 `V1ChatMessage` 타입·MSW 영향 확인.

## Parallel Work Breakdown

- Backend: 스키마·마이그레이션 → DTO·서비스(전송·목록·미리보기·읽지 않은 수·신고) → 스펙.
- Frontend: 타입·훅 → 패널·사진 선택·업로드·전송 → 사진 말풍선·전체 화면 보기 → 테스트.
- 순차: Backend 계약(`imageUrl`) 확정 후 Frontend.

## Acceptance Criteria

- UI 는 "3안 제시 → 선택"(A안 선택 완료) 후 구현.
- 위 테스트 시나리오 통과 · `v1_api`/`v1_web` lint(tsc) · 마이그레이션 재생·드리프트 게이트(CI) 통과.
- 머지 후 alpha 에서 PC·모바일 웹으로 사진 전송·수신·전체 화면 확인 + 3폭 갤러리.

## Tech Debt Resolved

- "텍스트만" 전제로 흩어져 있던 `messageType: 'text'` 필터(읽지 않은 수 두 곳 · 신고)를 `system` 제외로 정리.

## Security Notes

- 사진 메시지는 **자기 업로드만** 참조(서버에서 url + 소유자 + kind 검증). 업로드는 기존 검증(MIME·시그니처·용량·일일 한도)을 그대로 탄다.
- 업로드 파일은 추측 불가능한 UUID 경로로 **공개 서빙**된다 — 기존 프로필·팀 사진과 같은 모델. 사진에는 허용하되,
  ③ 파일(문서)은 참여자만 받을 수 있는 경로를 따로 설계한다.
- 사진 메시지도 신고 대상이다. 신고 스냅샷에 사진 경로를 남긴다.

## Risks & Dependencies

- #1384 가 먼저 머지돼야 이 PR diff 가 깔끔해진다(그 전엔 #1384 커밋이 함께 보인다).
- 안드로이드 앱 카메라 촬영은 네이티브 셸(카메라 intent · FileProvider · 권한) 작업과 앱 배포가 필요하다 — 후속.

## Ambiguity Log

| 날짜 | 질문 | 결정 |
|---|---|---|
| 2026-10-01 | + 화면 방식 | A안 카카오톡식 패널(사용자) |
| 2026-10-01 | 넣을 기능 | 사진 · 일정·매치 공유 · 파일(사용자) |
| 2026-10-01 | 한 PR vs 나눠서 | 기능별 3개 PR(마이그레이션·리뷰 단위 분리) — 사용자에게 알림 |
| 2026-10-01 | 한 번에 보낼 사진 수 | 최대 5장(업로드 API 한도와 같게), 사진마다 메시지 1개 |
| 2026-10-01 | 사진 메시지 `body` | `'사진'` — 미리보기·신고·옛 경로 호환 |
