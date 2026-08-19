# 경기 운영 이벤트·결과 정정

> Status: implementation and headed browser verification complete

## OPS-RESULT-001 라이브 기록 수정

- [x] 골, 자책골, 카드, 파울, 교체 행에 수정·취소 경로가 노출된다.
- [x] 수정은 원본 삭제/덮어쓰기가 아니라 CORRECTION 이벤트를 추가한다.
- [x] 취소 후 동일 콘솔에서 올바른 이벤트를 다시 입력할 수 있다.
- [x] 자책골은 상대 팀 선수를 선택하고 득점 팀 점수만 증가시킨다.

## OPS-RESULT-002 종료 후 공식 결과 정정

- [x] 득점 팀, 선수, 유형(골/자책골), 분, 순서를 편집한다.
- [x] 득점 타임라인 합계와 전체 점수 및 개인 득점이 다르면 422로 거부한다.
- [x] 승부차기 홈/원정 성공 점수와 선축 팀을 편집한다.
- [x] 정정 초안은 공식화 전까지 기존 공식 결과를 대체하지 않는다.
- [x] 공식화 후 공개 일정·상세·팀 전적은 정정 리비전 타임라인을 사용한다.

## OPS-RESULT-003 세션·라인업·표시 회귀

- [x] 장시간 세션의 reconnect/full-resync/takeover 갱신 회귀 테스트가 있다.
- [x] 저장 라인업 → 팀 고정 → 최근 경기 순으로 등번호를 복원한다.
- [x] 공개 기록의 2:04 이벤트는 3′로 표시한다.
- [x] 데스크톱·모바일 headed 브라우저 캡처와 console/network 확인.

## QA evidence (2026-08-19)

- Desktop result correction modal: `output/playwright/task150/desktop-result-edit-modal.png`
- Mobile result correction modal: `output/playwright/task150/mobile-result-edit-modal.png`
- Live operations console with own-goal action and goal/card correction controls:
  `output/playwright/task150/desktop-operate-console-live-events.png`
- Desktop 1440×900 and mobile 390×844 both had no horizontal overflow.
- Final headed runs recorded zero console errors and zero HTTP responses with status 400 or higher.
- The correction modal exposed goal order/type/minute controls, own-goal attribution,
  penalty score and first-kick controls, plus submitted-lineup player options with jersey numbers.
