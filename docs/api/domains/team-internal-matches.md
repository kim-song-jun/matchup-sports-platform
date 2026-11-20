# 팀 내 경기(자체전) contract

한 팀의 팀원끼리 N팀(2~4)으로 나눠 뛴 경기와 그 기록. **그 팀의 활성 팀원에게만** 보이고, 대회·팀 매치 경기 엔진(`V1Game`)과 완전히 분리돼 있다 — 공개 경기 기록·팀 전적·신뢰도·알림·검색에 나오지 않는다.

모든 경로는 로그인 필수다(`V1AuthGuard`). 읽기는 팀원 누구나, 쓰기(preview·create·result·delete)는 팀장·매니저만이다.

| Method | Path | 누가 | 설명 |
|---|---|---|---|
| GET | `/teams/:teamId/internal-matches?limit=` | 팀원 | 최근 경기 목록(`playedAt` 내림차순, 기본 20·최대 50). `hasMore` 로 더 있음을 알린다. |
| POST | `/teams/:teamId/internal-matches/preview` | 팀장·매니저 | `{ userIds, teamCount(2~4), seed? }` → 자동 편성 미리보기. 저장하지 않는다. 같은 입력·seed 는 같은 결과. |
| POST | `/teams/:teamId/internal-matches` | 팀장·매니저 | `{ playedAt, sides: [{ userIds }] }` 로 확정. 배열 순서가 1팀·2팀… 이다. |
| GET | `/teams/:teamId/internal-matches/:matchId` | 팀원 | 편성·점수·득점 기록. |
| PUT | `/teams/:teamId/internal-matches/:matchId/result` | 팀장·매니저 | `{ scores: number[], goals?: [{ sideNumber, scorerUserId, assistUserId? }] }`. 몇 번이든 덮어써서 고칠 수 있다. |
| DELETE | `/teams/:teamId/internal-matches/:matchId` | 팀장·매니저 | 경기와 기록을 지운다(복구 없음). |

## 규칙
- 선수는 모두 그 팀의 활성 팀원이어야 한다(아니면 400 `INTERNAL_MATCH_NOT_TEAM_MEMBER`). 한 선수가 두 팀에 들어갈 수 없다.
- 팀 이름은 `1팀`·`2팀`… 으로 고정이다.
- 일정(훈련) 참석자와는 무관하다 — 운영진이 팀원을 직접 골라 만든다.
- 결과: 점수는 0~99, 개수는 팀 수와 같아야 한다. 득점자·어시스트는 그 팀 선수여야 하고 서로 같을 수 없으며, 팀별 득점 기록 수는 그 팀 점수를 넘을 수 없다(점수만 넣고 득점자는 비워도 된다).
- 자동 편성: 인원 차 1명 이내를 보장하고, 같은 포지션 → 실력 합 순으로 균형을 맞춘다. 실력은 선수의 종목 레벨(`V1UserSportPreference.sportLevel.sortOrder`), 포지션은 `preferredPosition` 이다(없으면 평균·제외).
- 팀원이 아니면 목록·상세·쓰기 모두 403 `TEAM_MEMBER_ONLY`, 일반 팀원의 쓰기는 403 `TEAM_MANAGER_ONLY`.

데이터: `v1_team_internal_matches`·`_sides`·`_players`·`_goals`. 사용자 열은 FK 없이 문자열이며, 팀이 삭제되면 함께 지워진다.
