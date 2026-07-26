# Task 118 — V1 tournament bracket layout

## Scope

- Target: frontend
- Runtime: `apps/v1_web`
- Route: `/tournaments/:id/bracket`
- Branch/deploy: `dev` → Alpha

## Request

- 조별 순위와 결선 대진의 위계를 명확히 하고, 4강 → 결승 → 우승 흐름을 자연스럽게 읽히게 한다.
- 데스크톱의 비어 보이는 상단과 좁은 브래킷 열을 재균형한다.
- 태블릿과 모바일에서 대진 카드·커넥터·3·4위전이 잘리거나 눌리지 않게 한다.

## Owned files

- `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.tsx`
- `apps/v1_web/src/components/tournaments/tournament-bracket.tsx`
- `apps/v1_web/src/components/tournaments/tournament-bracket.test.ts`
- `apps/v1_web/src/app/globals.css`
- `.changeset/*`

## Acceptance criteria

- [x] `groupId` 없는 공개 픽스처도 4강 → 결승 → 3·4위전 순서를 유지한다.
- [x] 페이지 제목과 현재 결과 맥락이 화면에 보인다.
- [x] 데스크톱에서 순위표보다 브래킷에 충분한 폭을 배정한다.
- [x] 우승 카드와 3·4위전이 본 대진 흐름과 시각적으로 연결된다.
- [x] 390px, 768px, 1280px에서 문서 가로 오버플로가 없다.
- [x] 변경 계약을 검증하는 좁은 테스트와 커밋본 CI가 통과한다.
- [x] Alpha 실제 화면의 콘솔 오류와 레이아웃을 확인한다.

## Progress snapshot

- 2026-07-19: Alpha 현재 화면 캡처 완료. `groupId: null` 픽스처의 문자열 정렬 때문에 결승이 4강보다 먼저 보이는 원인을 확인했다.
- Lazyweb report: `https://www.lazyweb.com/report/lazyweb/fe64bddc-0a6a-4d9f-804b-c5a1b3385586/?source=create` (non-degraded). 단계 흐름 강조를 반영하고, 별도 상호작용인 Team Focus Mode는 이번 레이아웃 수정 범위에서 제외했다.
- Host preflight: 12 cores, load 12.74, swap 25.1/26GB, Node 676. 로컬 고부하 검증은 생략하고 최소 정적 검사 후 커밋본 CI를 사용한다.
- 2026-07-19 Alpha recheck: release `0.1.0-alpha.20260719.ga34d2e627f15`, commit `a34d2e627f158c35d81ccbecd12b8a2be9743ea2`에서 390×844, 768×1024, 1280×900을 인앱 브라우저로 재검증했다. 문서 overflow는 세 viewport 모두 `0`; 390px 대진 영역만 의도대로 `350px → 560px` 내부 스크롤이며 실제 가로 스크롤 후 `scrollLeft = maxScroll = 210`에서 우승 슬롯이 viewport 안에 들어왔다. 768px/1280px에서는 대진 내부 overflow가 없고 우승·3·4위전 좌표가 앱 프레임 안에 있었다.
- Screenshot evidence: `output/playwright/visual-audit/2026-07-19-tournament-bracket/after-mobile-390x844.png`, `after-mobile-bracket-end-390x844.png`, `after-tablet-768x1024.png`.
- Console verdict: 첫 history 조회에 이전 navigation 시각의 Server Components 오류 3건이 있었으나, 같은 route를 새로고침하고 reload 시작시각 이후 로그만 재조회했을 때 신규 오류는 `0`건이었다.
- CI / Deploy evidence: [CI / Deploy 29654556718](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29654556718), [Deploy Alpha 29654556713](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29654556713) 모두 같은 SHA `a34d2e627f158c35d81ccbecd12b8a2be9743ea2`에서 성공했다.

## Ambiguity log

- 화면의 “레이아웃 이상”은 CSS 간격뿐 아니라 공개 픽스처 단계 정렬 오류를 포함하는 것으로 판정한다.
- 모바일은 데스크톱 브래킷을 축소하지 않고 단계 순서를 유지하는 수평 대진 뷰를 사용한다.
