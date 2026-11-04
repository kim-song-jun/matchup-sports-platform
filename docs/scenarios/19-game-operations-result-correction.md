# 경기 운영 이벤트·결과 정정

> Status: 기존 결과 정정은 2026-08-19 검증 기록을 따른다. PR #2087 팀 파울 안내는 변경 후 alpha 미검증이다.

## OPS-RESULT-001 라이브 기록 수정

- [x] 골, 자책골, 카드, 파울, 교체 행에 수정·취소 경로가 노출된다.
- [x] 수정은 원본 삭제/덮어쓰기가 아니라 CORRECTION 이벤트를 추가한다.
- [x] 취소 후 동일 콘솔에서 올바른 이벤트를 다시 입력할 수 있다.
- [x] 자책골은 상대 팀 선수를 선택하고 득점 팀 점수만 증가시킨다. 일정·상세·팀 전적에서는 자책골 선수를 실제 소속팀 영역에 표시하며 개인 득점에는 포함하지 않는다.
- [x] 익명 자책골은 자책골을 넣은 팀을 선택하며, 반대편 팀 `sideId`로 기록되어 상대 팀 점수만 증가한다. 버튼은 양쪽 팀을 함께 명시한다.

## OPS-RESULT-002 종료 후 공식 결과 정정

- [x] 득점 팀, 선수, 유형(골/자책골), 분, 순서를 편집한다.
- [x] 득점 타임라인 합계와 전체 점수 및 개인 득점이 다르면 422로 거부한다.
- [x] 승부차기 홈/원정 성공 점수와 선축 팀을 편집한다.
- [x] 승부차기는 기본 3회이며, 역전 불가 시 양 팀 킥 수가 달라도 조기 종료한다.
- [x] 3회 후 동점이면 횟수 제한 없이 서든데스를 진행하고, 양 팀 응답 킥 한 쌍 뒤 판정한다.
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

## OPS-FOUL-189 팀 파울 피리어드 안내

[Task 20261122](../../.github/tasks/20261122-mdqa-189-team-foul-display.md) · PR #2087 · 2026-10-28 사용자 결정: **집계 규칙 유지, 표시만 수정**.
숫자가 바뀐 이유를 설명하는 변경이며 파울 이벤트 삭제·새 누적 방식·대회별 설정을 추가하지 않는다. 공개 관전 화면은 범위 밖이다.

실제 운영 권한을 가진 운영자로 alpha 콘솔에서 아래 흐름을 클릭한다. 현재 실행 0/4, viewport 390/768/1440 각각 0/3이다.

1. 전·후반 경기의 전반에 파울을 기록한다. 전반 팀 파울·현재 숫자·후반에는 0부터 다시 세요를 확인한다.
2. 전반을 끝내 하프타임으로 이동한다. 전반 숫자가 유지되고 후반 안내가 남아야 한다. 후반을 시작하면 후반 팀 파울·0부터 센 숫자를 보여야 하고 마지막 피리어드에는 다음 안내가 없어야 한다.
3. 단판 경기는 경기 팀 파울로 표시하고 다음 피리어드 안내가 없어야 한다.
4. 3피리어드 이상의 행이 있는 경기에서는 3피리어드 팀 파울처럼 표시한다. 다음 행이 있을 때만 다음 피리어드의 0부터 다시 세기 안내를 표시한다.

각 단계 screenshot·실제 파울 이벤트/피리어드·console/network·viewport별 overflow 판정을 기록한다. 검증 중 생성한 데이터의 정리 가능 여부와 소유 브라우저/프로세스 cleanup을 남긴다. 위 2026-08-19 증거는 이 변경의 after 증거가 아니다.

자동 회귀: `apps/v1_web/src/shared/game-operations/team-foul-counter-bar.test.tsx`, `operate-console-core.test.tsx`. 집계 근거는 `deriveFoulCounts`이며 실제 운영 시나리오는 별도 실행한다.
