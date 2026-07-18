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

- [ ] `groupId` 없는 공개 픽스처도 4강 → 결승 → 3·4위전 순서를 유지한다.
- [ ] 페이지 제목과 현재 결과 맥락이 화면에 보인다.
- [ ] 데스크톱에서 순위표보다 브래킷에 충분한 폭을 배정한다.
- [ ] 우승 카드와 3·4위전이 본 대진 흐름과 시각적으로 연결된다.
- [ ] 390px, 768px, 1280px에서 문서 가로 오버플로가 없다.
- [ ] 변경 계약을 검증하는 좁은 테스트와 커밋본 CI가 통과한다.
- [ ] Alpha 실제 화면의 콘솔 오류와 레이아웃을 확인한다.

## Progress snapshot

- 2026-07-19: Alpha 현재 화면 캡처 완료. `groupId: null` 픽스처의 문자열 정렬 때문에 결승이 4강보다 먼저 보이는 원인을 확인했다.
- Lazyweb report: `https://www.lazyweb.com/report/lazyweb/fe64bddc-0a6a-4d9f-804b-c5a1b3385586/?source=create` (non-degraded). 단계 흐름 강조를 반영하고, 별도 상호작용인 Team Focus Mode는 이번 레이아웃 수정 범위에서 제외했다.
- Host preflight: 12 cores, load 12.74, swap 25.1/26GB, Node 676. 로컬 고부하 검증은 생략하고 최소 정적 검사 후 커밋본 CI를 사용한다.

## Ambiguity log

- 화면의 “레이아웃 이상”은 CSS 간격뿐 아니라 공개 픽스처 단계 정렬 오류를 포함하는 것으로 판정한다.
- 모바일은 데스크톱 브래킷을 축소하지 않고 단계 순서를 유지하는 수평 대진 뷰를 사용한다.
