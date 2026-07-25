# 팀 가입 신청 — 상태 즉시 반영 + 안내 명확화

- 작성일: 2026-07-26
- 브랜치: `feat/v1-team-join-status-clarity` (base: `dev`)
- 대상: `apps/v1_api` (teams), `apps/v1_web` (teams / my)

## 문제

사용자 보고: "팀에 가입신청을 했을 때 상태가 바로바로 안 바뀌고 안내가 불명확하다."

코드 확인 결과 5가지 원인이 확인됐다.

| # | 증상 | 원인 |
|---|---|---|
| 1 | 신청 직후 버튼·배지가 옛 상태로 남음 | 상태 소스가 둘로 갈림 — 배지는 `useV1TeamDetail(viewer.joinState)`, 버튼 라벨은 `useV1TeamJoinEligibility`. mutation이 `invalidateQueries`를 await하지 않아 버튼 pending이 먼저 풀리고 라벨은 뒤늦게 바뀜 |
| 2 | 신청 후 무엇을 기다리는지 모름 | 성공 토스트가 `'신청을 완료했어요.'` 뿐이고 2초 후 소멸. 승인 대기(`requiresApproval: true`)라는 사실을 알리지 않음 |
| 3 | 신청 상태에 "신청 취소" 버튼만 남음 | 신청자용 영속 상태 안내가 없음. 신청 현황을 확인할 화면도 없음 |
| 4 | 정원 마감 팀에서 영어 문구 노출 | `getJoinReasonMessage`의 `TEAM_FULL` 반환값이 영어(`'Team member capacity has been reached'`)이고, 이 값이 CTA 버튼 라벨로 그대로 렌더됨 |
| 5 | 실패 사유를 모름 | 서버가 준 구체 사유를 버리고 `'잠시 후 다시 시도해 주세요.'`로 뭉갬 |

## 설계

### 백엔드 (`apps/v1_api/src/teams`)

**1. 한국어 문구 교정**
- `getJoinReasonMessage`의 `TEAM_FULL` 분기 제거 → `messages` 맵에 `'정원이 다 찬 팀이에요.'` 편입
- `assertTeamHasCapacity`의 `stateConflict` 메시지도 동일 한국어로 통일

**2. `GET /me/join-applications` 신설**

기존 `GET /me/invitations`(`myInvitations`)를 미러링한다. 신청자 본인이 보낸 가입 신청 목록.

- 정렬: 승인 대기(`requested`) 그룹이 항상 앞. 그룹 내 정렬은 각각
  - 승인 대기: `createdAt desc` (언제 신청했는지가 기준)
  - 처리 완료: `updatedAt desc` (언제 처리됐는지가 기준 — 승인/거절/철회 시각이 반영됨)
- 범위: 전 상태(`requested` / `approved` / `rejected` / `withdrawn` / `expired`). 승인 대기와 처리 완료를 **각각 최대 20건**씩 조회해 합친다(응답 최대 40건). 합쳐서 한 번 더 자르면 대기 건이 처리 완료 건에 밀려 잘릴 수 있어 의도적으로 그룹별 상한을 쓴다.
- 응답 항목: `applicationId`, `teamId`, `status`, `message`, `createdAt`, `reviewedAt`, `withdrawnAt`, `team { teamId, name, sportId, logoUrl, introductionPreview }`

### 프론트 (`apps/v1_web`)

**3. 상태 소스 단일화** — `teams-client.tsx`
`toDetailMode`·`teamDetailCtaLabel` 모두 eligibility의 `joinState`를 우선 기준으로 삼는다. eligibility 미도착 시에만 팀 상세의 `viewer.joinState`로 폴백. 배지와 버튼이 같은 값을 본다.

**4. refetch 완료까지 pending 유지** — `use-v1-api.ts`
`useV1CreateTeamJoinApplication` / `useV1WithdrawTeamJoinApplication`의 `onSuccess`가 `invalidateQueries` 프라미스를 `await`한다. React Query는 onSuccess가 resolve될 때까지 `isPending`을 유지하므로, 버튼이 "처리 중"에서 풀리는 시점엔 이미 새 상태다.

**5. 승인 대기 카드** — `teams-page.tsx`
`mode === 'pending'`일 때 팀 상세에 상시 카드를 노출한다: 신청일 + "관리자가 확인하고 있어요" + 승인 시 알림 안내.
신청 취소 CTA는 기존 위치(모바일 고정 하단 / 데스크톱 사이드바)에 그대로 두되 톤을 주황 → neutral로 낮춘다. 상태 전달은 카드가 맡으므로, 파괴적 액션인 취소가 최강 강조로 남아 권장 행동처럼 읽히지 않게 한다.

**6. 문구 구체화** — `teams-client.tsx`
- 신청 성공: `'가입 신청을 보냈어요. 관리자가 승인하면 알림으로 알려드려요.'`
- 취소 성공: `'가입 신청을 취소했어요.'`
- 실패: `extractErrorMessage(err, ...)`로 서버 사유를 그대로 노출

**7. `/my/join-applications` 화면 신설**
`/my/invitations`와 동일 구조(`MyJoinApplicationsPageView`). 상태 뱃지(승인 대기 / 승인됨 / 거절됨 / 취소함 / 만료됨) + 상태별 다음 행동 안내, `requested` 항목엔 신청 취소 버튼. `my.view-model.ts` 메뉴에 '보낸 가입 신청' 항목 추가.

## 테스트

- `teams.service.spec.ts` — `myJoinApplications`가 본인 신청만·정렬대로 반환하는지, `TEAM_FULL` 메시지가 한국어인지
- `teams-page.test.tsx` — 신청 상태일 때 승인 대기 카드가 렌더되는지
- `my-page.test.tsx` — 신청 목록의 상태별 뱃지·취소 버튼 노출 규칙

## 범위 밖

- 신청 시 자기소개 메시지 입력 (API는 지원하나 현재 UI 미사용 — 별도 요청 시)
- 관리자측 신청 처리 화면 (이미 `/teams/:id/members`에 존재)
