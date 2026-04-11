# Domain Contract — Team Matches

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/team-matches` | No | 모집글 목록 |
| GET | `/team-matches/me/applications` | Yes | 내가 속한 팀의 신청 내역 |
| GET | `/team-matches/:id` | No | 모집글 상세 |
| POST | `/team-matches` | Yes | 모집글 생성 |
| GET | `/team-matches/:id/applications` | Yes | 신청 목록(호스트팀 manager+) |
| POST | `/team-matches/:id/apply` | Yes | 신청 |
| PATCH | `/team-matches/:id/applications/:appId/approve` | Yes | 신청 승인 |
| PATCH | `/team-matches/:id/applications/:appId/reject` | Yes | 신청 거절 |
| POST | `/team-matches/:id/check-in` | Yes | 도착 인증 |
| POST | `/team-matches/:id/result` | Yes | 결과 제출 |
| POST | `/team-matches/:id/evaluate` | Yes | 평가 제출 |
| GET | `/team-matches/:id/referee-schedule` | No | 심판 배정 조회 |

## GET /team-matches (TeamMatchQueryDto)

Query:

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `sportType` | enum | No | |
| `city` | string | No | hostTeam.city 필터 |
| `status` | string | No | 기본값 recruiting |
| `teamId` | uuid | No | host 또는 applicant 매치 |
| `cursor` | string | No | |
| `limit` | int(1~100) | No | 기본 20 |

핵심 구현 포인트:

- `city`와 `teamId` 조건은 `AND`로 묶여 OR 오염 방지 처리됨

## POST /team-matches (CreateTeamMatchDto)

필수:

| 필드 | 타입 |
|---|---|
| `hostTeamId` | uuid |
| `sportType` | enum |
| `title` | string |
| `matchDate` | `YYYY-MM-DD` |
| `startTime`, `endTime` | `HH:mm` |
| `venueName`, `venueAddress` | string |

주요 optional:

- `totalMinutes`, `quarterCount`, `totalFee`, `opponentFee`
- `requiredLevel`, `hasProPlayers`, `allowMercenary`, `hasReferee`, `notes`
- `skillGrade`, `gameFormat`, `matchType`, `proPlayerCount`, `uniformColor`, `isFreeInvitation`
- `venueInfo` (object)

권한:

- `hostTeamId` 팀의 `manager+` 멤버만 생성 가능

## POST /team-matches/:id/apply

- Body (`ApplyTeamMatchDto`)

| 필드 | 타입 | 필수 |
|---|---|---|
| `applicantTeamId` | uuid | Yes |
| `message` | string | No |
| `confirmedInfo` | boolean | No |
| `confirmedLevel` | boolean | No |
| `proPlayerCheck` | boolean | No |
| `mercenaryCheck` | boolean | No |

조건:

- match status가 `recruiting` 이어야 함
- applicantTeam의 `manager+` 권한 필요

CAUTION:

- 현재 service는 중복 신청 unique 처리(명시적 에러 변환)가 없다. DB unique 제약에 따라 실패 형태가 달라질 수 있다.

## 승인/거절

### PATCH /team-matches/:id/applications/:appId/approve

- hostTeam의 `manager+`만 가능
- match status가 `recruiting`이어야 함
- 승인 시:
  - 해당 신청 `approved`
  - match status `scheduled`
  - `guestTeamId` 설정
  - 나머지 pending 신청은 자동 `rejected`

### PATCH /team-matches/:id/applications/:appId/reject

- hostTeam의 `manager+`만 가능
- 해당 신청만 `rejected`

## POST /team-matches/:id/check-in

- Body

| 필드 | 타입 | 필수 |
|---|---|---|
| `teamId` | uuid | Yes |
| `lat`, `lng` | number | No |
| `photoUrl` | string | No |

조건:

- status가 `scheduled`, `checking_in`, `in_progress` 중 하나
- 참여 팀만 가능 (host/guest)
- 팀의 `member+` 권한 필요
- 같은 팀 중복 check-in 불가

## POST /team-matches/:id/result

- 참여 팀 `manager+`만 가능
- status가 `scheduled`, `checking_in`, `in_progress` 중 하나
- `guestTeamId` 확정된 매치만 가능
- Body

| 필드 | 타입 | 필수 |
|---|---|---|
| `scoreHome` | object (`Q1..Qn`: int>=0) | Yes |
| `scoreAway` | object (`Q1..Qn`: int>=0) | Yes |
| `resultHome` | `win/draw/lose` | Yes |
| `resultAway` | `win/draw/lose` | Yes |

검증:

- quarter 수 일치
- 점수와 승무패 결과 일치

성공 시 status는 `completed`로 전이.

## POST /team-matches/:id/evaluate

- match status `completed`에서만 가능
- evaluator팀 `member+` 권한 필요
- evaluator와 evaluated가 동일하면 실패
- evaluator팀 기준 중복 평가 불가

## GET /team-matches/:id/referee-schedule

응답 data:

```json
{
  "hasReferee": false,
  "quarterCount": 4,
  "schedule": {
    "Q1": "home",
    "Q2": "away"
  }
}
```

## Frontend Mapping Notes

- `useRespondTeamMatchApplication`는 내부적으로 `/approve`, `/reject` suffix route를 호출한다.
- `CreateTeamMatchInput`는 `hostTeamId`를 필수로 가진다.
- `ApplyTeamMatchInput`는 backend canonical field인 `applicantTeamId`를 사용한다.
- `useTeamMatchRefereeSchedule`는 backend object shape(`{ hasReferee, quarterCount, schedule }`)를 그대로 반환하고, 화면에서 행으로 변환한다.

## State Gate 요약

- 모집글 생성: host manager+
- 신청: applicant manager+
- 승인/거절: host manager+
- 체크인: 참여 팀 member+
- 결과 입력: 참여 팀 manager+
- 평가: evaluator 팀 member+

## Source References

- `apps/api/src/team-matches/team-matches.controller.ts`
- `apps/api/src/team-matches/dto/*.ts`
- `apps/api/src/team-matches/team-matches.service.ts`
- `apps/api/test/integration/team-matches.e2e-spec.ts`
- `apps/api/src/team-matches/team-matches.service.spec.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
