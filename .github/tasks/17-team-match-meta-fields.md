# 17 — TeamMatch 6 Missing Fields (P0)

> **Parent plan**: `/Users/kimsungjun/.claude/plans/enumerated-scribbling-popcorn.md`
> **Wave**: 1 (P0 critical, task 16 검증 후 시작)
> **Owner**: backend-data-dev (lead) → backend-api-dev → frontend-data-dev → frontend-ui-dev
> **Status**: completed
> **Estimated PRs**: 1 (단일 PR — schema migration이 단독이라 충돌 없음)
> **Blocked by**: task 16 Phase 1.3 (schema drift 매트릭스로 다른 누락 필드 발견 시 scope 합치)

---

## Context

사용자가 제공한 스크린샷에서 팀 매치 상세 페이지의 `경기방식`과 `매치 유형`이 모두 `-`로 표시됨. Phase 0 사전 조사에서 다음 사실 확정:

- **폼**: `apps/web/src/app/(main)/team-matches/new/page.tsx:30, 50-53, 76-79`이 `skillGrade`, `gameFormat`, `matchType`, `proPlayerCount`, `uniformColor`, `isFreeInvitation` 6필드를 사용자에게 입력받음
- **payload 누락**: 같은 파일 `:111-128` `handleSubmit`이 위 6필드를 API 요청 body에 포함하지 않음 (드롭)
- **DTO 누락**: `apps/api/src/team-matches/dto/create-team-match.dto.ts:5-28`이 6필드를 정의하지 않음 (validator 거부 X — 그냥 무시)
- **schema 누락**: `apps/api/prisma/schema.prisma:857-915` `TeamMatch` 모델에 6컬럼 모두 부재
- **상세 페이지 표시**: `apps/web/src/app/(main)/team-matches/[id]/page.tsx:211, 235, 239, 244`이 응답에서 6필드를 읽지만 모두 `undefined` → `-` 폴백

폼 → DB → 응답까지 6필드를 일관되게 통과시키는 것이 목표.

## Goal

`POST /api/v1/team-matches` 요청에 6필드를 포함하면 DB에 영속화되고, `GET /api/v1/team-matches/:id`로 다시 읽었을 때 그대로 반환되어 상세 페이지에 표시된다.

## Original Conditions

- [ ] 팀 매치 작성 시 사용자가 입력한 `skillGrade`(실력등급)이 상세 페이지에 동일하게 표시됨
- [ ] `gameFormat`(경기방식, 예: 11:11) 표시
- [ ] `matchType`(매치 유형, invitation/exchange/away) 한국어 라벨로 표시
- [ ] `proPlayerCount`(선출선수 명수) 표시
- [ ] `uniformColor`(유니폼 색상) 표시 (조건부)
- [ ] `isFreeInvitation`(무료 초청) 배지 표시
- [ ] schema migration이 prod 무중단 적용 가능 (모두 nullable 또는 default 값)
- [ ] 회귀 테스트로 향후 누락 방지

---

## Field Specification

> task 16에서 다른 누락 필드 발견 시 이 표에 추가

| # | 필드 | 타입 | Nullable | Default | Enum 값 (있는 경우) | 출처 |
|---|------|------|----------|---------|---------------------|------|
| 1 | `skillGrade` | String | Y | null | `S, A+, A, B+, B, B-, C+, C, C-, D` (10개) | `apps/web/src/lib/skill-grades.ts:1-12` |
| 2 | `gameFormat` | String | Y | null | `11:11, 8:8, 6:6, 5:5` (4개) | `apps/web/src/app/(main)/team-matches/new/page.tsx:30` |
| 3 | `matchType` | String | Y | null | `invitation, exchange, away` (3개) | `apps/web/src/lib/skill-grades.ts:21-25` |
| 4 | `proPlayerCount` | Int | N | 0 | — | `new/page.tsx:51` |
| 5 | `uniformColor` | String | Y | null | 자유 입력 (예: '빨강') | `new/page.tsx:54` |
| 6 | `isFreeInvitation` | Boolean | N | false | — | `new/page.tsx:55` |

**Enum 결정**: Prisma `enum SkillGrade` / `enum GameFormat` / `enum MatchType`을 만들 수도 있으나, frontend에서 이미 string union으로 관리하고 사용자 정의가 자주 추가될 수 있으니 **String + 컴포넌트 레벨 union으로 통일**. validator는 `@IsIn([...])`으로 처리.

---

## Phase 2.1A — Schema & Migration

> Wave 1, Owner: `backend-data-dev`

### Steps

- [ ] **A.1** `apps/api/prisma/schema.prisma:857-915`의 `TeamMatch` model에 6컬럼 추가:
  ```prisma
  model TeamMatch {
    // ... 기존 필드 ...

    // 매칭 메타 (task 17 추가)
    skillGrade        String?  @map("skill_grade")
    gameFormat        String?  @map("game_format")
    matchType         String?  @map("match_type")
    proPlayerCount    Int      @default(0) @map("pro_player_count")
    uniformColor      String?  @map("uniform_color")
    isFreeInvitation  Boolean  @default(false) @map("is_free_invitation")

    // ... 기존 인덱스/관계 ...
  }
  ```
- [ ] **A.2** `pnpm --filter @teameet/api exec prisma migrate dev --name add_team_match_meta_fields` 실행 → 신규 migration sql 생성 확인
- [ ] **A.3** 생성된 SQL을 read하고 다음 검증:
  - [ ] `ALTER TABLE team_matches ADD COLUMN ...` 6개
  - [ ] DEFAULT 값 명시 (NOT NULL 컬럼은 무중단 반영 가능)
  - [ ] backfill 불필요 (default 또는 nullable)
- [ ] **A.4** `pnpm --filter @teameet/api exec prisma generate` 재실행 → 클라이언트 타입 업데이트 확인
- [ ] **A.5** `apps/api/prisma/seed.ts`에서 `TeamMatch` 시드가 있다면 신규 필드 일부 채워서 검증 데이터로 활용 (있는지 grep 필요)

### Acceptance
- [ ] migration 파일 commit 가능 상태
- [ ] `npx prisma validate` 통과
- [ ] 로컬 DB에 적용 후 `\d team_matches`로 6컬럼 확인 (psql)

---

## Phase 2.1B — DTO & Validator

> Wave 1, Owner: `backend-api-dev`, A 완료 후

### Steps

- [ ] **B.1** `apps/api/src/team-matches/dto/create-team-match.dto.ts`에 import 추가:
  ```ts
  import { IsIn, IsBoolean, IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
  ```
- [ ] **B.2** 클래스 본문에 6필드 추가:
  ```ts
  @ApiProperty({ required: false, enum: ['S','A+','A','B+','B','B-','C+','C','C-','D'] })
  @IsOptional() @IsIn(['S','A+','A','B+','B','B-','C+','C','C-','D'])
  skillGrade?: string;

  @ApiProperty({ required: false, enum: ['11:11','8:8','6:6','5:5'] })
  @IsOptional() @IsIn(['11:11','8:8','6:6','5:5'])
  gameFormat?: string;

  @ApiProperty({ required: false, enum: ['invitation','exchange','away'] })
  @IsOptional() @IsIn(['invitation','exchange','away'])
  matchType?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional() @IsInt() @Min(0)
  proPlayerCount?: number;

  @ApiProperty({ required: false, maxLength: 30 })
  @IsOptional() @IsString() @MaxLength(30)
  uniformColor?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional() @IsBoolean()
  isFreeInvitation?: boolean;
  ```
- [ ] **B.3** `UpdateTeamMatchDto`가 PartialType으로 자동 상속하는지 확인 (`apps/api/src/team-matches/dto/update-team-match.dto.ts`) — 자동 상속이면 변경 불필요

### Acceptance
- [ ] swagger UI에서 `POST /team-matches` schema에 6필드 표시
- [ ] DTO에서 unknown 필드는 거부 (`whitelist: true` 글로벌 설정 가정 — `apps/api/src/main.ts` 확인 필요)

---

## Phase 2.1C — Service Layer

> Wave 1, Owner: `backend-data-dev`, B 완료 후

### Steps

- [ ] **C.1** `apps/api/src/team-matches/team-matches.service.ts`의 `create()` 메서드 read → 현재 `prisma.teamMatch.create({ data: { ... } })` 매핑 부분 식별
- [ ] **C.2** 6필드를 `data` 객체에 추가:
  ```ts
  data: {
    // ... 기존 필드 ...
    skillGrade: dto.skillGrade ?? null,
    gameFormat: dto.gameFormat ?? null,
    matchType: dto.matchType ?? null,
    proPlayerCount: dto.proPlayerCount ?? 0,
    uniformColor: dto.uniformColor ?? null,
    isFreeInvitation: dto.isFreeInvitation ?? false,
  }
  ```
- [ ] **C.3** `findOne()` / `findAll()` / `update()`도 select 또는 include에서 6필드가 누락되지 않는지 확인 (Prisma는 `select` 미지정 시 모두 반환하므로 보통 OK)
- [ ] **C.4** response transformer 또는 mapper가 있다면 해당 부분도 갱신

### Acceptance
- [ ] `prisma.teamMatch.create()` 타입 체크 통과 (`tsc --noEmit`)
- [ ] 신규 필드가 응답에 포함 (수동 curl 또는 supertest)

---

## Phase 2.1D — Frontend Type & Payload

> Wave 1, Owner: `frontend-data-dev`, C 완료 후

### Steps

- [ ] **D.1** `apps/web/src/types/api.ts`에서 `TeamMatch` 인터페이스 grep → 6필드 추가:
  ```ts
  export interface TeamMatch {
    // ... 기존 ...
    skillGrade?: string | null;
    gameFormat?: string | null;
    matchType?: 'invitation' | 'exchange' | 'away' | null;
    proPlayerCount?: number;
    uniformColor?: string | null;
    isFreeInvitation?: boolean;
  }
  ```
- [ ] **D.2** 같은 파일의 `CreateTeamMatchInput`에도 6필드 추가 (optional로)
- [ ] **D.3** `apps/web/src/app/(main)/team-matches/new/page.tsx:111-128` `handleSubmit`의 payload에 6필드 매핑 추가:
  ```ts
  const payload: CreateTeamMatchInput & { hostTeamId?: string } = {
    // ... 기존 ...
    skillGrade: form.skillGrade,
    gameFormat: form.gameFormat,
    matchType: form.matchType,
    proPlayerCount: form.proPlayerCount,
    uniformColor: form.uniformColor || undefined,
    isFreeInvitation: form.isFreeInvitation,
    ...(hostTeamId ? { hostTeamId } : {}),
  };
  ```
- [ ] **D.4** 상세 페이지 (`apps/web/src/app/(main)/team-matches/[id]/page.tsx`)는 이미 6필드를 읽는 로직 존재 (line 211, 235, 239, 244) — 변경 불필요. 표시 라벨만 검증:
  - [ ] `matchType`이 `invitation` → "초청"으로 표시되는지 (line 244, MATCH_TYPES lookup OK)
  - [ ] `gameFormat`이 raw string으로 표시 — 그대로 OK

### Acceptance
- [ ] `pnpm --filter @teameet/web exec tsc --noEmit` 통과
- [ ] 새 글 작성 → 상세 페이지 진입 → 6필드 모두 표시 (수동 시각 검증)

---

## Phase 2.1E — Tests

> Wave 1, Owner: backend dev + frontend dev 병렬

### Steps

- [ ] **E.1 (backend unit)** `apps/api/src/team-matches/team-matches.service.spec.ts`에 다음 케이스 추가:
  - [ ] `create()` with 6 new fields → mock prisma가 받은 data 객체 검증
  - [ ] `create()` without optional fields → default 값으로 채워짐
  - [ ] `findOne()` 응답에 6필드 포함
- [ ] **E.2 (backend integration)** `apps/api/test/integration/team-matches.e2e-spec.ts` (없으면 신규):
  - [ ] `POST /team-matches` 6필드 포함 → 201 + 응답 body에 6필드 echo
  - [ ] `GET /team-matches/:id` → 동일 6필드 반환
  - [ ] `POST /team-matches`에서 잘못된 enum 값 (`skillGrade: 'X'`) → 400 with validator error
- [ ] **E.3 (frontend test)** `apps/web/src/app/(main)/team-matches/new/page.test.tsx` (없으면 skip):
  - [ ] form 6필드 입력 → handleSubmit이 mutation에 6필드 포함된 payload 전달
- [ ] **E.4 (e2e)** `e2e/tests/team-matches.spec.ts` (있는지 확인) 또는 신규:
  - [ ] persona teamOwner로 새 글 작성 → 상세 페이지에서 입력값과 동일한 6필드 시각 확인

### Acceptance
- [ ] backend unit + integration 통과
- [ ] frontend type check 통과
- [ ] e2e 1개 시나리오 추가/통과 (없던 경우)

---

## Phase 2.1F — Mock & Fixture Update (Mock Data Discipline)

> Wave 1, Owner: backend-data-dev, E와 병렬

CLAUDE.md "Mock Data Discipline" 규칙에 따라 schema 변경 시 영향받는 inline mock도 같은 커밋에서 갱신.

### Steps

- [ ] **F.1** `apps/api/test/fixtures/team-matches.ts` read → 시드 데이터에 6필드 일부 포함 (검증용 데이터로 1~2개 채움)
- [ ] **F.2** `apps/api/src/team-matches/**/*.spec.ts`의 inline mock 객체 grep → 반환 모킹에 6필드 추가
- [ ] **F.3** `apps/web/src/test/msw/handlers.ts` (있는 경우) team-match 핸들러의 응답에도 6필드 포함
- [ ] **F.4** `apps/api/prisma/seed.ts`에서 `TeamMatch` 시드 항목에 데모 값 추가

### Acceptance
- [ ] 모든 spec/test/seed가 6필드 인지 (grep으로 사후 검증)

---

## User Scenarios

### Happy
1. teamOwner persona 로그인
2. `/team-matches/new` 진입
3. 5단계 폼 입력 (종목 → 일시 → 경기조건 → 비용 → 확인)
   - 경기조건 단계에서 실력등급 'B+', 경기방식 '6:6', 매치유형 '초청', 선출선수 2명, 유니폼 색상 '파랑', 무료초청 체크
4. 등록
5. 상세 페이지 자동 진입
6. 입력한 6필드가 정확히 화면에 표시됨

### Edge
- skillGrade 미선택 → schema에 null 저장 → 상세 페이지는 `match.requiredLevel` 폴백 표시 (line 230)
- proPlayerCount 0 → "0명" 표시
- isFreeInvitation true → "무료초청" 배지 (line 219-223)
- uniformColor 미입력 → 해당 row 숨김 (line 259 조건부)

### Error
- skillGrade에 'X'(미정의) 전달 → DTO validator 400
- proPlayerCount = -1 → 400
- gameFormat에 '999:999' → 400

---

## Test Scenarios

| 종류 | 케이스 | 위치 |
|------|--------|------|
| Happy | 6필드 모두 채워서 create → fetch → echo | integration |
| Happy | optional 누락 → default 값 적용 | unit |
| Edge | nullable 필드만 null로 저장 | unit |
| Error | invalid enum value | integration (validator) |
| Mock update | spec mock + msw + fixture + seed | (Phase 2.1F) |

---

## Parallel Work Breakdown

| Wave | Phase | Owner | 병렬 가능 | 의존성 |
|------|-------|-------|-----------|--------|
| 1 | A (schema) | backend-data-dev | 단독 | 없음 |
| 1 | B (DTO) | backend-api-dev | A 완료 후 | A |
| 1 | C (service) | backend-data-dev | B 완료 후 | B |
| 1 | D (frontend) | frontend-data-dev | C 완료 후 | C |
| 1 | E (tests) | 양 dev 병렬 | D 진행 중 가능 | C |
| 1 | F (mocks) | backend-data-dev | E와 병렬 | A |

총 sequential A→B→C→D, E/F는 병렬 끼워넣기.

**Do NOT touch (다른 task 영역)**:
- `apps/web/src/app/**/*` 중 `team-matches/**` 외 페이지 (task 18에서 hooks fix)
- `apps/api/src/admin/**` (task 19)
- `deploy/`, `.github/workflows/**` (task 20)

---

## Acceptance Criteria

- [ ] DB 컬럼 6개 신규 (`\d team_matches` 확인)
- [ ] DTO에 6필드, validator 동작
- [ ] service create/find가 6필드 통과
- [ ] frontend payload에 6필드 포함, 응답 type에 6필드 정의
- [ ] 상세 페이지 시각 검증 통과
- [ ] backend unit + integration 신규 케이스 통과
- [ ] e2e 1개 시나리오 통과
- [ ] mock/fixture/seed 갱신
- [ ] `tsc --noEmit` 양 앱 통과
- [ ] task 18~20에 영향 없음 (file diff scope 검증)

## Tech Debt Resolved

- TeamMatch schema/DTO/payload drift (C1 from plan)
- Mock data ↔ schema sync 위반 1건 (Phase 2.1F로 예방)

## Security Notes

- 6필드 모두 사용자 입력 → validator에서 enum/length 제한
- `uniformColor` String free input → MaxLength 30 + frontend escape (XSS 방지)
- ownership 변경 없음 (기존 `assertRole('manager')`이 그대로 적용)
- migration은 nullable/default → 무중단 가능

## Risks & Dependencies

- **R1**: prod DB에 무중단 migration 적용 가능한지 → Phase 1.1 deploy job이 자동 migrate하면 OK. task 20에서 migrate를 분리할 수도 있는데, 그 전에 이 task가 머지되면 기존 boot CMD migrate 사용. 양립 가능
- **R2**: task 16 결과 다른 모델에서도 drift 발견 시 scope 확장 (예: Match 모델에 누락 필드) → 같은 PR에 묶을지 별도 task 만들지 결정 필요
- **D1**: blocked by task 16 Phase 1.3 결과
- **D2**: task 18, 19, 20과 file overlap 없음 → 병렬 안전

## Ambiguity Log

- **Q1 (해소)**: matchType enum 값 → `invitation/exchange/away` 확정 (`skill-grades.ts:21-25`)
- **Q2 (해소)**: skillGrade enum 값 → 10개 grade 확정 (`skill-grades.ts:1-12`)
- **Q3**: Prisma enum 사용 vs String + IsIn → **String 채택** (frontend가 union으로 관리, 사용자 추가 가능성)
- **Q4**: `requiredLevel`(기존 Int 필드)와 `skillGrade` 관계는? → 둘 다 보존, 상세 페이지 폴백 로직(line 230)이 둘을 모두 처리. requiredLevel deprecate 여부는 별도 결정
