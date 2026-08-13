# 팀 라인업 재사용 (Team Lineup Reuse) 설계

- 작성일: 2026-08-13
- 대상 앱: `apps/v1_api`, `apps/v1_web`
- 브랜치: `feat/v1-team-lineup-reuse` (base: `feat/v1-lineup-roster-ssot`)
- 관련 화면: 팀 매치 라인업(`/team-matches/[id]/lineup`), 대회 경기 라인업(`/tournaments/[id]/matches/[fixtureId]/lineup`), 팀원 관리(`/teams/[id]/members`)

## 1. 배경

라인업을 짤 때마다 같은 일을 반복한다. 지난 경기와 사실상 같은 명단인데도 선발을 다시 고르고, 등번호를 다시 넣고, 포메이션과 배치를 처음부터 다시 만든다.

### 1.1 선행 작업 전제 (중요)

이 설계는 **`feat/v1-lineup-roster-ssot`(커밋 `9a8468a9`, dev 미머지) 위에 쌓는다.** 그 브랜치가 이미 해결한 것:

- `V1GameParticipant.userId` (nullable) 컬럼 추가 — 참가자와 사용자를 잇는 열쇠. 마이그레이션 포함
- 대회 경기 라인업이 **등록 명단(`V1TournamentPlayer`)을 유일한 출처**로 사용. 이름 직접 입력 제거
- `GET /tournaments/:id/fixtures/:fixtureId/lineup-roster`, `GET /tournaments/:id/my-fixtures` 신설

따라서 이 스펙은 그 둘을 **다시 만들지 않는다.** 특히 `userId` 마이그레이션을 중복 추가하면 마이그레이션 체인이 깨진다.

### 1.2 두 화면의 서로 다른 구조

| 화면 | 명단의 출처 | 편집이란 |
|---|---|---|
| 팀 매치 | 팀원 로스터 풀 + 게스트 직접 추가 | 누구를 명단에 넣을지 + 선발/후보 + 등번호 + 배치 |
| 대회 경기 | **대회 등록 명단 고정**(선행 브랜치) | 등록 명단 안에서 **누가 선발인지** + 등번호 + 배치 |

이 차이 때문에 "불러오기"의 의미도 화면마다 다르다.

- **대회**: 명단은 이미 고정돼 있으므로 불러오기는 **선발 선택 · 등번호 · 포메이션 · 좌표를 복원**한다. 명단을 갈아끼우지 않는다.
- **팀 매치**: 명단 자체를 채운다. 자격(팀 소속 + 참석 응답)을 통과한 사람만.

## 2. 목표 / 비목표

### 목표

- **F1** 우리 팀이 최근에 낸 라인업을 골라 불러오기 (대회 ↔ 팀 매치 교차)
- **F2** 이름 붙인 프리셋으로 라인업을 저장하고 불러오기
- **F4** 등번호 기억 — 팀 고정 등번호(명시 지정) + 과거 라인업 파생(자동 학습)

> F3(대회 등록 로스터 풀 연동)은 선행 브랜치가 완료했다(§1.1).

### 비목표

- 대회 운영 콘솔(`tournament-ops`)의 스태프 대리 입력 화면
- 상대팀 라인업 열람 (기존 공정성 원칙 유지)
- 포메이션 자동 추천·전술 분석

## 3. 확정된 설계 결정

| # | 결정 | 채택안 | 근거 |
|---|---|---|---|
| D1 | 참가자 ↔ 사용자 연결 | `V1GameParticipant.userId` | **선행 브랜치가 이미 구현.** 이름 매칭은 동명이인·닉네임 변경에서 무너진다 |
| D2 | 불러오기 소스 범위 | 팀의 모든 경기 교차(대회 ↔ 팀 매치) | 대회 첫 경기에서도 직전 팀 매치 라인업을 쓸 수 있어야 값이 산다 |
| D3 | 등번호 기억 | 팀 고정 등번호 + 과거 라인업 파생 **둘 다** | 고정값은 팀 자산(영구 번호), 파생값은 고정값이 없을 때의 자동 학습 |
| D4 | 불러올 때 부적격 선수 | 가능한 사람만 채우고 제외 사유 안내 | 서버 422로 통째 실패하는 대신 빠진 자리를 즉시 알 수 있다 |
| D5 | 라인업에서 등번호 수정 | 그 경기에만 적용(팀 고정값 불변) | 대회 임시 번호가 팀 기본값을 조용히 덮어쓰지 않게 |

## 4. 데이터 모델 (마이그레이션 `20260813200000_v1_team_lineup_reuse`)

### 4.1 `V1TeamMembership.jerseyNumber`

팀이 멤버에게 지정한 고정 등번호. `@@unique([teamId, jerseyNumber])` — Postgres는 `NULL`을 서로 다른 값으로 취급하므로 미지정 멤버가 여럿이어도 충돌하지 않고, "한 팀 안에 같은 번호 두 명"만 막힌다. 값 범위는 DTO에서 `0 ~ 999`.

### 4.2 라인업 프리셋 (신규 테이블 2개)

- `V1TeamLineupPreset` — `teamId` + `name` 유니크, `formation`, `sportName`(표시용), `createdByUserId`
- `V1TeamLineupPresetEntry` — `userId?`, `displayName`, `jerseyNumber?`, `position?`, `positionX/Y?`, `started`, `goalkeeper`, `sortOrder`

경기 스냅샷(`V1GameLineup`/`V1GameParticipant`)과 의도적으로 다른 테이블이다. 스냅샷은 "그날 이렇게 뛰었다"는 기록이라 사후에 바뀌면 안 되지만, 프리셋은 팀이 계속 고쳐 쓰는 템플릿이고 불러올 때마다 **현재의** 이름·자격으로 다시 해석된다.

- 팀당 프리셋 상한 **10개**. 초과 시 `422 LINEUP_PRESET_LIMIT_EXCEEDED`.
- `goalkeeper`를 명시 컬럼으로 둔다. 스냅샷은 종목별 코드(`GK`/`GOLEIRO`)를 `position`에 넣지만, 프리셋은 종목이 다른 화면으로도 불려갈 수 있으므로 코드가 아니라 **의미**로 저장하고 적용 시점에 그 화면의 `goalkeeperCode`로 변환한다.
- `userId`에 FK를 걸지 않는다 — `V1GameParticipant.userId`와 같은 이유로, 사용자 탈퇴가 팀의 템플릿을 막아서는 안 된다.

## 5. API 계약

모든 신규 라우트는 `V1AuthGuard` + **해당 팀의 `owner`/`manager`** 한정(`team-lineup-access.ts#assertTeamLineupManager`). 팀이 없으면 404, 권한이 없으면 언제나 같은 403 — 존재 여부가 새어 나가지 않게.

### 5.1 F1 — 팀 라인업 히스토리

```
GET /teams/:teamId/lineup-history?limit=10
```

응답 `items[]`: `lineupId`, `gameId`, `source`, `sourceLabel`, `opponentName`, `playedAt`, `sportName`, `formation`, `starterCount`, `benchCount`, `participants[]`.

- **팀 스코프**: `V1GameSide.teamId = :teamId` 인 사이드의 라인업 중 사이드별 최신 revision 하나씩. 같은 경기의 옛 revision은 중복되지 않는다. 최근 사이드 200개까지만 훑는다(활동 많은 팀의 쿼리 폭주 방지).
- **`playedAt`**: `V1Game`에는 일시 컬럼이 없다. `V1TeamMatch.startAt` 또는 `V1TournamentFixture.scheduledAt`(nullable)에서 가져오고, 없으면 `null`로 두고 목록 뒤로 정렬한다.
- **`sourceLabel`**: 대회는 `V1Tournament.title` + `V1TournamentFixture.round`. `round`는 자유 문자열 표시 라벨이며 한글·영문이 섞여 저장돼 있다("8강", "Round 1") — 파싱하거나 순서를 추론하지 않고 **그대로 이어 붙이기만** 한다. 팀 매치는 "팀 매치".
- **`sportName`**: 대회는 `tournament.sport.name`, 팀 매치는 `teamMatch.sport.name`. 두 경로 모두 채워야 종목 경고 배지가 의미를 갖는다.
- **`goalkeeper`**: 저장은 종목별 코드로 돼 있다. 그 경기의 `V1CompetitionConfigVersion.lineup.positions`에서 `goalkeeper: true` 항목의 코드를 찾아 비교한 결과를 boolean으로 내려준다(사전이 없으면 `GK` 폴백 — 프론트 `goalkeeperPositionCode`와 동일 규칙).
- 참가자가 0명인 라인업은 제외한다.

### 5.2 F2 — 프리셋 CRUD

```
GET    /teams/:teamId/lineup-presets
POST   /teams/:teamId/lineup-presets            { name, formation?, sportName?, entries[] }
PATCH  /teams/:teamId/lineup-presets/:presetId  { name?, formation?, entries? }
DELETE /teams/:teamId/lineup-presets/:presetId
```

- 이름 중복은 `409 LINEUP_PRESET_NAME_TAKEN` → 프론트가 "덮어쓸까요?"를 물어 `PATCH`로 전환.
- `PATCH`에 `entries`가 오면 **전체 교체**(부분 병합 없음). 화면이 엔트리 식별자를 들고 있지 않아 안전한 병합이 불가능하다.
- `presetId`만으로 조회하지 않고 항상 `teamId`와 함께 좁힌다 — 다른 팀의 preset id를 끼워 넣는 경로 차단.

### 5.3 팀 매치 자격 목록 (D4의 전제)

`GET /team-matches/:teamMatchId/lineup` 응답에 **추가**(순수 additive):

```jsonc
{ "eligibleMembers": [{ "userId": "…", "displayName": "홍길동", "jerseyNumber": 7, "attending": true }] }
```

**왜 필요한가.** 팀 매치 라인업은 서버가 "현재 팀 소속 + 그 일정에 참석(GOING) 응답" 두 조건을 강제한다(`resolveEntry`). 그런데 화면은 `useV1TeamMembers`로 팀원 전체만 가져와 참석 정보를 모른다 — 지금도 미참석 팀원이 로스터 풀에 뜨고, 추가해 저장하면 그때서야 `422`를 맞는다. 판정 규칙을 프론트에 복제하면 서버와 갈라지므로, **규칙을 소유한 서버가 결과만 내려준다**.

`attending`은 이 팀 매치에 연결된 `V1TeamSchedule`이 있을 때만 의미가 있고, 없으면 서버도 참석 검증을 건너뛰므로 전원 `true`다. `jerseyNumber`는 팀 고정 등번호로 F4의 2순위 소스다.

### 5.4 F4 — 팀 고정 등번호

```
PATCH /team-memberships/:membershipId/jersey   { jerseyNumber: number | null }
```

- 관리 권한(owner/manager)을 요구하되 **대상의 역할은 따지지 않는다** — 등번호는 권한 계층이 아니라 팀 살림이라 관리자가 owner의 번호도 정할 수 있어야 한다(역할 변경과 다른 점).
- 중복은 DB 유니크 제약이 최종 방어선이고 `409 TEAM_JERSEY_NUMBER_TAKEN`으로 번역한다 — 사전 조회로 막으면 동시 요청 사이에 틈이 생긴다.
- `GET /teams/:teamId/members` 응답에 `jerseyNumber` + `canEditJersey` 추가(additive).

### 5.5 저장 경로 (D1 반영)

- 팀 매치 `saveLineup`: `resolveEntry`가 검증만 하고 버리던 `userId`를 실제로 저장한다. 정정 요청으로 다시 여는 초안(`requestChange`)의 복사 경로도 함께.
- 팀 매치 `GET .../lineup` 응답의 `starters`/`bench`에 `userId` 추가 — 재수화 시 이름 매칭 휴리스틱 대신 이 값을 쓴다.
- 대회 `saveLineup`은 선행 브랜치가 이미 저장한다.

## 6. 프론트엔드 설계

### 6.1 신규 모듈

```
src/components/lineup/lineup-source.ts          ← 순수 로직: 정체성 매칭 · 자격 필터 · 등번호 결정
src/components/lineup/load-lineup-sheet.tsx     ← 불러오기 시트(두 화면 공유, 데이터는 주입받음)
src/components/lineup/save-preset-dialog.tsx    ← 프리셋 저장 다이얼로그
```

시트는 데이터를 스스로 가져오지 않는다. 두 화면의 상태 타입이 다르므로(`LineupEditorState` vs `FixtureLineupState`) **선택 결과만** 콜백으로 올려보내고 각 화면이 자기 리듀서로 적용한다.

### 6.2 화면별 적용 방식

| 화면 | 불러오기가 하는 일 | 뷰모델 함수 |
|---|---|---|
| 대회 경기 | 등록 명단은 그대로 두고 **선발 선택 · 등번호 · 포메이션 · 좌표만 복원**. 명단에 없는 사람은 제외 | `applyLoadedSelection` |
| 팀 매치 | 자격을 통과한 사람으로 **명단 자체를 교체** | `replaceEntries` |

두 함수 모두 기존 편집 액션과 같은 계약을 지킨다(`dirty: true`, 바뀔 게 없으면 참조 동일성 유지).

### 6.3 진입점

- "명단" 영역 상단에 **"이전 라인업 불러오기"** 버튼.
- 현재 편집 내용이 비어 있지 않으면 적용 전 확인.
- 프리셋 저장은 같은 영역의 보조 액션.
- 하단 고정 CTA(저장/제출)는 건드리지 않는다.

## 7. 정체성 해석 · 자격 필터 · 등번호

### 7.1 정체성 매칭 순서

1. `entry.userId`가 있고 `eligible`에 같은 `userId`가 있으면 → **매칭**. 표시 이름은 `eligible`의 **현재 이름**을 쓴다.
2. `entry.userId`가 null(게스트 또는 컬럼 도입 이전 과거 행)이면 → 이름 완전일치로 찾는다. 같은 이름이 여럿이면 앞선 사람이 먼저 가져간다.
3. 못 찾았고 `allowGuests`면 → 게스트 엔트리로 유지.
4. 아니면 → `skipped`.

### 7.2 제외 사유

| `SkipReason` | 조건 | 문구 |
|---|---|---|
| `not_attending` | 팀 매치: 참석(GOING) 응답 없음 | "참석 응답이 없어요" |
| `not_in_team` | 팀 매치: 현재 팀 소속 아님 | "지금은 팀에 없어요" |
| `not_registered` | 대회: 등록 명단에 없음 | "이 대회에 등록되지 않았어요" |

`eligible`의 출처: 팀 매치는 `eligibleMembers`(§5.3) 중 `attending: true`, 대회는 `useV1FixtureLineupRoster`(선행 브랜치)의 등록 명단.

결과는 배너로 알린다: **"13명 중 10명을 불러왔어요 · 홍길동·김철수(참석 응답 없음)"**. 제외가 0명이면 배너를 띄우지 않는다.

### 7.3 등번호 결정 순서 (F4)

앞에서 값이 나오면 뒤는 보지 않는다.

1. 불러온 라인업/프리셋의 등번호
2. 팀 고정 등번호(`V1TeamMembership.jerseyNumber`)
3. 그 선수가 직전에 달았던 등번호 — 히스토리(§5.1)에서 `userId` 기준 최신
4. 없으면 빈칸

로스터 풀에서 새로 한 명을 추가할 때도 2 → 3 → 4가 그대로 적용된다. 3번은 F1 히스토리 응답을 재활용하므로 추가 API가 필요 없다.

## 8. 권한·보안

- 신규 라우트 전부 팀 `owner`/`manager` 한정. `member`는 403.
- 히스토리는 **팀 권한을 먼저 검증한 뒤에만** 데이터를 만진다.
- 쿼리를 `V1GameSide.teamId = :teamId`로 좁혀 **구조적으로** 상대팀 사이드가 결과에 들어올 수 없게 한다.
- 프리셋 응답의 `userId`는 이미 `GET /teams/:teamId/members`로 볼 수 있는 같은 팀 정보다(권한 경계 확장 없음).
- 불러오기가 등록되지 않은 사람의 `userId`를 서버로 보내지 않도록 §7의 자격 필터가 프론트 방어선이다(§11 참조).

## 9. 테스트 계획

### 백엔드 (Jest + Supertest)

| 대상 | 검증 |
|---|---|
| `GET /teams/:teamId/lineup-history` | ① 남의 팀 403 ② 자기 팀 사이드만(상대팀 라인업 부재) ③ 같은 경기 옛 revision 중복 없음 ④ 골키퍼가 종목 코드와 무관하게 boolean |
| 프리셋 CRUD | ① 이름 중복 409 ② 11번째 422 ③ 남의 팀 프리셋 403/404 ④ PATCH entries 전체 교체 |
| `PATCH /team-memberships/:id/jersey` | ① 같은 팀 중복 409 ② member 403 ③ null 해제 |
| 팀 매치 `GET .../lineup` | `eligibleMembers.attending`이 서버 저장 검증과 일치(미참석자 false) |

### 프론트엔드 (Vitest)

| 대상 | 검증 |
|---|---|
| `resolveLoadableEntries` | ① userId 매칭 우선, 이름 바뀐 사람도 매칭 ② userId 없는 과거 엔트리 이름 폴백 ③ 부적격자가 사유와 함께 `skipped` ④ `allowGuests` 분기 |
| 등번호 결정 순서 | 4단계 우선순위가 순서대로 적용되고 앞 단계 값이 뒤로 덮이지 않음 |
| `applyLoadedSelection` | 대회: 명단 크기 불변, 선발 선택·좌표만 복원 |
| `replaceEntries` | 팀 매치: 적용 후 `dirty: true`, 좌표가 자동배치에 뭉개지지 않음 |

## 10. 구현 단계

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 마이그레이션 + 히스토리/프리셋/등번호 API + 자격 목록 | 완료 |
| 2 | `lineup-source.ts` + 불러오기 시트 + 두 화면 연결 (F1) | |
| 3 | 프리셋 저장 UI (F2) + 등번호 자동 채움 · 팀원 관리 등번호 편집 (F4) | |
| 4 | 테스트 + alpha 배포 · 실기기 검증 · 스크린샷 갤러리 · PR | |

dev 머지 = alpha 즉시 배포이므로 머지 전 검증(tsc·테스트·lint)을 실배포 게이트로 취급한다. v1 기능 변경이므로 `.changeset/*.md`를 포함한다.

**의존성**: base가 `feat/v1-lineup-roster-ssot`이다. 그 브랜치가 dev에 머지되기 전에는 이 PR의 base도 그 브랜치여야 한다.

## 11. 리스크 · 열린 항목

| 항목 | 판단 |
|---|---|
| 과거 참가자 행의 `userId`가 null이라 초기엔 이름 폴백 의존 | 폴백 경로를 유지하고 테스트로 고정. 새 라인업이 쌓일수록 정확해진다 |
| 종목이 다른 라인업을 불러와 인원·포지션이 안 맞음 | 목록에 종목·선발 인원을 표시하고 다르면 경고 배지(차단하지 않음 — D2가 교차 불러오기를 의도) |
| 팀 고정 등번호 유니크 제약과 기존 데이터 충돌 | 신규 컬럼이라 기존 행은 전부 null → 충돌 불가 |
| 프리셋에 담긴 사람이 팀을 떠남 | `displayName`을 함께 보관 → 목록엔 이름이 보이고 불러올 때 `not_in_team`으로 안내 |
| **서버가 대회 `saveLineup`의 `userId`를 등록 명단과 대조하지 않음** | 선행 브랜치 소유 영역이라 이 스펙에서 건드리지 않는다. 프론트 자격 필터가 부적격 userId를 보내지 않게 막는다 |
| 로스터 풀의 미참석 팀원 표시 | §5.3의 `attending`이 생기면 거의 공짜로 가능하지만 요청 범위 밖이라 별도 판단에 맡긴다 |
