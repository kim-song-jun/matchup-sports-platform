# QA Follow-up — Detailed Task Document

Date: 2026-04-05
Owner: project-director
Status: ready for build phase
Source: `qa-feedback-execution-plan.md` (deferred items) + tech debt audit

---

## 1. Executive Summary

이전 파이프라인은 P0 보안 이슈(Admin Guard, team-match approve/reject 소유권 검증, dev-login production guard, passwordHash 마스킹)와 일부 P1 항목을 처리했지만, 다음 영역이 미해결 상태로 남았다.

**해결 대상 (4개 영역)**

1. **데이터 영속성 부채** — `MercenaryPost`가 100% in-memory mock. 서버 재시작 시 데이터 소실. Prisma 모델로 승격 필요.
2. **권한 모델 부재** — `SportTeam`이 `ownerId` 단일 필드만 가짐. QA가 명시적으로 요청한 "팀 직책 기반 모집글 작성/신청/승인" 요건을 충족할 수 없음. `TeamMembership` + `TeamRole` enum 도입 필요.
3. **상호 확인 UI 부재** — 백엔드는 `approveApplication`/`rejectApplication`이 있으나, 호스트가 신청 목록을 보거나 신청자가 자기 신청 상태를 보는 화면이 없음. QA의 핵심 지적사항.
4. **타입 안정성 / 실시간 부채** — team-matches DTO가 `Record<string, unknown>`. chat/notification은 mock store. Socket.IO gateway는 이미 존재하지만 미연결.

**비-목표 (이 작업에서 다루지 않음)**
- 결제/정산/마켓플레이스 로직 변경
- 새로운 종목 추가
- 디자인 시스템 토큰 변경 (단, 신규 페이지는 기존 토큰 준수)

**성공 기준**
- 서버 재시작 후 용병 모집글이 유지된다.
- "매니저" 역할 사용자가 자기 팀 명의로 모집글을 작성할 수 있고, "멤버"는 차단된다.
- 호스트가 자기 모집글의 신청 팀 목록을 볼 수 있다.
- 신청자가 자기 신청의 상태(pending/approved/rejected)를 볼 수 있다.
- team-matches API 모든 엔드포인트가 class-validator DTO로 검증되며 Swagger 문서에 노출된다.
- chat/notification 신규 메시지가 Socket.IO를 통해 실시간 푸시된다.
- 프론트 인증 보호 페이지는 모두 `useRequireAuth` 훅을 사용한다.

---

## 2. Phase Breakdown

작업은 의존 관계를 따라 6개 단계로 진행한다. 각 단계는 다음 단계의 전제 조건이다.

| Phase | 내용 | 핵심 산출물 | 예상 PR 수 |
|-------|------|------------|----------|
| **Phase 0** | Pre-flight: 현 상태 검증 + 백업 | 환경 점검 보고 | - |
| **Phase 1** | DB Schema & Migration | `schema.prisma` 업데이트, migration SQL, seed 보강 | 1 |
| **Phase 2** | Backend — Mercenary 마이그레이션 | `mercenary.service.ts` Prisma 기반 재작성 + DTO + 컨트롤러 갱신 | 1 |
| **Phase 3** | Backend — Team Membership & Permissions | `teams.service.ts`, `team-matches.service.ts` 권한 게이트, 신규 엔드포인트 | 1 |
| **Phase 4** | Backend — DTO 도입 + 실시간 연결 | team-matches DTO, RealtimeGateway 통합, chat/notification 영속화 | 1 |
| **Phase 5** | Frontend — 상호 확인 UI + 프로필 정리 | 신청 현황 페이지, profile 페이지 재구성, useRequireAuth 적용 | 1-2 |
| **Phase 6** | Cleanup & QA | 테스트 보강, 문서 업데이트, 회귀 QA | 1 |

---

## 3. Schema Design

### 3.1 신규 Enum

```prisma
enum TeamRole {
  owner    // 팀 생성자, 모든 권한
  manager  // 팀 운영진, 모집글/신청/승인 가능
  member   // 일반 멤버, 조회만 가능
}

enum TeamMembershipStatus {
  active
  pending  // 가입 신청 후 승인 대기
  left     // 자진 탈퇴
  removed  // 강퇴
}

enum MercenaryPostStatus {
  open
  closed
  filled
  cancelled
}

enum MercenaryApplicationStatus {
  pending
  accepted
  rejected
  withdrawn
}
```

### 3.2 TeamMembership 모델

```prisma
model TeamMembership {
  id        String               @id @default(uuid())
  teamId    String               @map("team_id")
  userId    String               @map("user_id")
  role      TeamRole             @default(member)
  status    TeamMembershipStatus @default(active)
  joinedAt  DateTime             @default(now()) @map("joined_at")
  leftAt    DateTime?            @map("left_at")
  invitedBy String?              @map("invited_by")
  // Snapshot for audit when role changes
  roleChangedAt DateTime?        @map("role_changed_at")

  team SportTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User      @relation("TeamMemberships", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId, status])
  @@index([teamId, role])
  @@map("team_memberships")
}
```

`SportTeam`에 추가:
```prisma
memberships TeamMembership[]
mercenaryPosts MercenaryPost[]
```

`User`에 추가:
```prisma
teamMemberships TeamMembership[] @relation("TeamMemberships")
mercenaryApplications MercenaryApplication[] @relation("UserMercenaryApplications")
```

> 주의: 기존 `ownedTeams` 관계는 유지한다. `ownerId`는 진실의 원천(SoT)으로 남고, owner 멤버십이 추가로 자동 생성된다(데이터 정합성).

### 3.3 MercenaryPost 모델

```prisma
model MercenaryPost {
  id          String              @id @default(uuid())
  teamId      String              @map("team_id")
  authorId    String              @map("author_id") // 작성자(매니저+)
  sportType   SportType           @map("sport_type")
  matchDate   DateTime            @map("match_date") // 시간 포함 (timestamptz)
  venue       String
  position    String
  count       Int                 @default(1) // 모집 인원
  level       Int                 @default(3) // 1-5
  fee         Int                 @default(0)
  notes       String?
  status      MercenaryPostStatus @default(open)
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")

  team         SportTeam              @relation(fields: [teamId], references: [id], onDelete: Cascade)
  author       User                   @relation("MercenaryAuthor", fields: [authorId], references: [id])
  applications MercenaryApplication[]

  @@index([sportType, status])
  @@index([teamId])
  @@index([matchDate])
  @@map("mercenary_posts")
}

model MercenaryApplication {
  id        String                    @id @default(uuid())
  postId    String                    @map("post_id")
  userId    String                    @map("user_id")
  message   String?
  status    MercenaryApplicationStatus @default(pending)
  appliedAt DateTime                  @default(now()) @map("applied_at")
  decidedAt DateTime?                 @map("decided_at")
  decidedBy String?                   @map("decided_by") // 처리자 userId

  post MercenaryPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User          @relation("UserMercenaryApplications", fields: [userId], references: [id])

  @@unique([postId, userId])
  @@index([userId, status])
  @@map("mercenary_applications")
}
```

`User`에 추가:
```prisma
authoredMercenaryPosts MercenaryPost[] @relation("MercenaryAuthor")
```

### 3.4 마이그레이션 전략

데이터 손실이 발생할 수 있는 변경이 없다(in-memory 모킹은 지속성이 없으므로 원래 휘발됨).

```bash
# 1. 스키마 수정 후
cd apps/api
pnpm prisma migrate dev --name add_team_membership_and_mercenary

# 2. SportTeam 기존 row 마다 owner의 TeamMembership(role=owner) 자동 생성
#    -> migration SQL의 추가 부분에서 처리
```

**Migration data backfill SQL** (마이그레이션 파일 끝에 수동 추가):
```sql
INSERT INTO team_memberships (id, team_id, user_id, role, status, joined_at)
SELECT
  gen_random_uuid(),
  id,
  owner_id,
  'owner',
  'active',
  created_at
FROM sport_teams
ON CONFLICT (team_id, user_id) DO NOTHING;
```

**Rollback 전략**: `prisma migrate resolve --rolled-back` + 수동 down SQL. team_memberships/mercenary_posts/mercenary_applications 테이블 DROP. 신규 enum 삭제 시 의존 컬럼이 모두 사라졌는지 확인.

---

## 4. API Design

### 4.1 Mercenary (Prisma 기반 재작성)

| Method | Path | Auth | 권한 | Body / Query | Response |
|--------|------|------|------|--------------|----------|
| GET | `/api/v1/mercenary` | optional | - | `?sportType&status&teamId&cursor&limit` | `{ items: MercenaryPostDto[], nextCursor }` |
| GET | `/api/v1/mercenary/:id` | optional | - | - | `MercenaryPostDetailDto` (applicants 포함, 단 호스트 매니저+만 신청자 식별 정보 노출) |
| POST | `/api/v1/mercenary` | required | `manager`+ of teamId | `CreateMercenaryPostDto` | `MercenaryPostDto` |
| PATCH | `/api/v1/mercenary/:id` | required | author 또는 owner | `UpdateMercenaryPostDto` | `MercenaryPostDto` |
| DELETE | `/api/v1/mercenary/:id` | required | author 또는 owner | - | `{ success: true }` |
| POST | `/api/v1/mercenary/:id/apply` | required | non-member of host team | `ApplyMercenaryDto { message? }` | `MercenaryApplicationDto` |
| PATCH | `/api/v1/mercenary/:id/applications/:appId/accept` | required | `manager`+ of host team | - | `MercenaryApplicationDto` |
| PATCH | `/api/v1/mercenary/:id/applications/:appId/reject` | required | `manager`+ of host team | - | `MercenaryApplicationDto` |
| GET | `/api/v1/mercenary/me/applications` | required | self | `?status` | `{ items: MercenaryApplicationWithPostDto[] }` |

### 4.2 Teams — Membership

| Method | Path | Auth | 권한 | Body | Response |
|--------|------|------|------|------|----------|
| GET | `/api/v1/teams/me` | required | self | - | `{ items: TeamWithMyRoleDto[] }` |
| GET | `/api/v1/teams/:id/members` | required | member+ | - | `{ items: TeamMembershipDto[] }` |
| POST | `/api/v1/teams/:id/members` | required | `manager`+ | `{ userId, role? }` | `TeamMembershipDto` |
| PATCH | `/api/v1/teams/:id/members/:userId` | required | `owner` | `{ role }` | `TeamMembershipDto` |
| DELETE | `/api/v1/teams/:id/members/:userId` | required | `owner` 또는 self | - | `{ success: true }` |
| POST | `/api/v1/teams/:id/leave` | required | self (non-owner) | - | `{ success: true }` |

owner는 leave 불가. 양도 후 leave해야 함 (`PATCH /members/:userId { role: 'owner' }` 후 self를 member로 강등).

### 4.3 Team Matches — 신청 현황 / DTO화

기존 엔드포인트 유지하되 DTO 도입. 신규 엔드포인트:

| Method | Path | Auth | 권한 | Response |
|--------|------|------|------|----------|
| GET | `/api/v1/team-matches/:id/applications` | required | host team `manager`+ | `{ items: TeamMatchApplicationDetailDto[] }` (applicantTeam 정보 포함) |
| GET | `/api/v1/team-matches/me/applications` | required | self (멤버인 모든 팀의 신청들) | `{ items: TeamMatchApplicationWithMatchDto[] }` |

기존 엔드포인트 권한 보강:
- `POST /team-matches`: body의 `hostTeamId`에 대해 요청자가 `manager`+ 인지 검증
- `POST /team-matches/:id/apply`: body의 `applicantTeamId`에 대해 요청자가 `manager`+ 인지 검증
- `PATCH /team-matches/:id/applications/:appId/{approve,reject}`: 호스트 팀 `manager`+ (이전 파이프라인이 owner만 허용했다면 manager까지 확장)

### 4.4 DTO 클래스 (예시 — team-matches)

```typescript
// apps/api/src/team-matches/dto/create-team-match.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsInt, Min, Max, IsOptional, IsEnum, IsBoolean, Matches } from 'class-validator';
import { SportType, MatchStyle } from '@prisma/client';

export class CreateTeamMatchDto {
  @ApiProperty() @IsUUID() hostTeamId!: string;
  @ApiProperty({ enum: SportType }) @IsEnum(SportType) sportType!: SportType;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) matchDate!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @ApiProperty() @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @ApiProperty() @IsString() venueName!: string;
  @ApiProperty() @IsString() venueAddress!: string;
  @ApiProperty() @IsInt() @Min(0) totalFee!: number;
  @ApiProperty() @IsInt() @Min(0) opponentFee!: number;
  @ApiProperty({ enum: MatchStyle }) @IsEnum(MatchStyle) @IsOptional() matchStyle?: MatchStyle;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() allowMercenary?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) @Max(5) requiredLevel?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
```

전체 DTO 목록: `CreateTeamMatchDto`, `UpdateTeamMatchDto`, `ApplyTeamMatchDto`, `CheckInDto`, `SubmitResultDto`, `EvaluateDto`, `TeamMatchResponseDto`, `TeamMatchApplicationResponseDto`.

`main.ts`에 `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))` 가 이미 있는지 확인하고 없으면 추가.

---

## 5. Permission Matrix

### 5.1 Team-level Actions

| Action | non-member | member | manager | owner |
|--------|:----------:|:------:|:-------:|:-----:|
| 팀 정보 조회 | O | O | O | O |
| 팀 멤버 목록 조회 | X | O | O | O |
| 팀 정보 수정 | X | X | O | O |
| 팀 삭제 | X | X | X | O |
| 멤버 초대/추가 | X | X | O | O |
| 멤버 역할 변경 | X | X | X | O |
| 멤버 강퇴 | X | X | X | O |
| 자진 탈퇴 | - | O | O | X (양도 필요) |

### 5.2 Mercenary Post

| Action | non-member | member | manager | owner |
|--------|:----------:|:------:|:-------:|:-----:|
| 모집글 조회 | O | O | O | O |
| 모집글 작성(팀 명의) | X | X | O | O |
| 자기 작성글 수정/삭제 | X | X | O (자기 글) | O (모든 글) |
| 다른 팀 모집글에 지원 | O (auth required) | O (다른 팀의 글) | O (다른 팀의 글) | O (다른 팀의 글) |
| 자기 팀 모집글에 지원 | - | X | X | X |
| 신청자 승인/거절 | X | X | O | O |

### 5.3 Team Match

| Action | non-member | member | manager | owner |
|--------|:----------:|:------:|:-------:|:-----:|
| 매칭 조회 | O | O | O | O |
| 매칭 생성(팀 명의) | X | X | O | O |
| 매칭 수정/취소 | X | X | O (자기 팀 매치) | O |
| 다른 팀 매칭에 신청 | X (팀 소속 필수) | O | O | O |
| 신청 승인/거절 | X | X | O (호스트 팀) | O |
| 도착 인증 | X | O | O | O |
| 결과 입력 | X | X | O | O |
| 평가 작성 | X | O | O | O |

> 권한 검증은 백엔드 가드/서비스 단에서 일괄 처리. 프론트는 UI 숨김만으로 충분히 보호되지 않음을 명심.

---

## 6. Detailed Task Checkboxes

각 태스크는 단일 책임 단위로 분할되었다. `Files`는 수정/생성될 절대 경로 기준이다.

### Phase 0 — Pre-flight

- [ ] **0.1 환경 점검** (S)
  - Acceptance: `pnpm install`, `docker compose up -d`, `pnpm db:push` 무오류. 기존 테스트 grün(`cd apps/api && pnpm test`, `cd apps/web && pnpm test`).
  - Files: -
  - Deps: -

- [ ] **0.2 현 in-memory 데이터 백업** (S)
  - Acceptance: 현재 mock mercenary/chat/notification 데이터를 seed.ts로 옮길 준비. 시드 데이터 손실 방지.
  - Files: `apps/api/prisma/seed.ts`
  - Deps: -

### Phase 1 — DB Schema & Migration

- [ ] **1.1 Prisma schema에 enum 4개 추가** (S)
  - Acceptance: `TeamRole`, `TeamMembershipStatus`, `MercenaryPostStatus`, `MercenaryApplicationStatus` enum이 schema.prisma에 정의됨.
  - Files: `apps/api/prisma/schema.prisma`
  - Deps: 0.1

- [ ] **1.2 TeamMembership 모델 추가 + SportTeam/User 관계 보강** (S)
  - Acceptance: 섹션 3.2 스키마 그대로 반영. `pnpm prisma format` 통과.
  - Files: `apps/api/prisma/schema.prisma`
  - Deps: 1.1

- [ ] **1.3 MercenaryPost / MercenaryApplication 모델 추가** (S)
  - Acceptance: 섹션 3.3 스키마 반영. 인덱스 포함. 양방향 관계.
  - Files: `apps/api/prisma/schema.prisma`
  - Deps: 1.1

- [ ] **1.4 마이그레이션 생성 + owner backfill SQL 추가** (M)
  - Acceptance: `prisma migrate dev --name add_team_membership_and_mercenary` 성공. 마이그레이션 파일 끝에 섹션 3.4의 backfill INSERT 추가. 로컬 DB에 기존 SportTeam이 있다면 owner membership row가 자동 생성됨.
  - Files: `apps/api/prisma/migrations/<ts>_add_team_membership_and_mercenary/migration.sql`
  - Deps: 1.2, 1.3

- [ ] **1.5 seed.ts 업데이트** (M)
  - Acceptance: seed가 SportTeam 생성 후 owner membership을 함께 생성. 기존 mock mercenary 5건을 MercenaryPost로 시드. seed 재실행 idempotent.
  - Files: `apps/api/prisma/seed.ts`
  - Deps: 1.4

- [ ] **1.6 prisma 클라이언트 재생성 검증** (S)
  - Acceptance: `pnpm prisma generate` 후 `apps/api`에서 `import { TeamRole, MercenaryPost } from '@prisma/client'` 가능.
  - Files: -
  - Deps: 1.5

### Phase 2 — Backend Mercenary

- [ ] **2.1 Mercenary DTO 클래스 작성** (M)
  - Acceptance: `CreateMercenaryPostDto`, `UpdateMercenaryPostDto`, `ApplyMercenaryDto`, `MercenaryPostQueryDto`. 모두 class-validator 데코레이터 + `@ApiProperty`. 날짜는 ISO 8601 검증.
  - Files: `apps/api/src/mercenary/dto/{create,update,apply,query}.dto.ts`
  - Deps: 1.6

- [ ] **2.2 MercenaryService Prisma 기반 재작성** (L)
  - Acceptance: 모든 in-memory `posts` 배열 제거. PrismaService 주입. `findAll`(필터+커서), `findOne`(applicants include), `create`(권한 가드 호출), `update`, `delete`, `apply`, `acceptApplication`, `rejectApplication`, `findMyApplications` 메서드 구현. `NotFoundException`/`ForbiddenException`/`ConflictException` 사용.
  - Files: `apps/api/src/mercenary/mercenary.service.ts`
  - Deps: 2.1, 3.1 (TeamMembershipService)

- [ ] **2.3 MercenaryController 갱신** (M)
  - Acceptance: `Record<string, unknown>` 제거. 모든 엔드포인트가 DTO 사용. JwtAuthGuard 적용. `@CurrentUser('id')` 주입. Swagger 문서화.
  - Files: `apps/api/src/mercenary/mercenary.controller.ts`
  - Deps: 2.2

- [ ] **2.4 Mercenary 서비스 단위 테스트 갱신** (M)
  - Acceptance: 기존 mercenary.service.spec.ts를 PrismaService 모킹으로 재작성. create/apply/accept/reject 권한 케이스 4개 + 정상 경로 4개.
  - Files: `apps/api/src/mercenary/mercenary.service.spec.ts`
  - Deps: 2.3

### Phase 3 — Backend Team Membership & Permissions

- [ ] **3.1 TeamMembershipService + 권한 헬퍼 구현** (M)
  - Acceptance: `getMembership(teamId, userId)`, `assertRole(teamId, userId, minRole)`, `listUserTeams(userId)`, `addMember`, `updateRole`, `removeMember` 메서드. role 위계: owner > manager > member. `assertRole`은 ForbiddenException 던짐.
  - Files: `apps/api/src/teams/team-membership.service.ts` (신규)
  - Deps: 1.6

- [ ] **3.2 TeamsModule에 등록 + 다른 모듈로 export** (S)
  - Acceptance: TeamMembershipService가 TeamsModule에서 provider로 등록되고 export됨. MercenaryModule, TeamMatchesModule이 TeamsModule을 import.
  - Files: `apps/api/src/teams/teams.module.ts`, `apps/api/src/mercenary/mercenary.module.ts`, `apps/api/src/team-matches/team-matches.module.ts`
  - Deps: 3.1

- [ ] **3.3 Team Membership 컨트롤러 엔드포인트** (M)
  - Acceptance: 섹션 4.2의 6개 엔드포인트 구현. `GET /teams/me`, `GET /teams/:id/members`, `POST/PATCH/DELETE /members/...`, `POST /:id/leave`. owner self-leave 차단 로직.
  - Files: `apps/api/src/teams/teams.controller.ts`, `apps/api/src/teams/teams.service.ts`, `apps/api/src/teams/dto/membership.dto.ts`
  - Deps: 3.1

- [ ] **3.4 SportTeam 생성 시 owner membership 자동 생성** (S)
  - Acceptance: `teams.service.ts`의 `create` 메서드가 트랜잭션 내에서 SportTeam + TeamMembership(role=owner) 함께 생성. 실패 시 롤백.
  - Files: `apps/api/src/teams/teams.service.ts`
  - Deps: 3.1

- [ ] **3.5 TeamMatchesService 권한 보강** (M)
  - Acceptance: `create`, `apply`, `approveApplication`, `rejectApplication`, `submitResult`, `evaluate` 모두 `TeamMembershipService.assertRole` 호출. 호스트 팀/신청 팀 식별은 입력 DTO 또는 row lookup으로.
  - Files: `apps/api/src/team-matches/team-matches.service.ts`
  - Deps: 3.2

- [ ] **3.6 Team Membership 단위 테스트** (M)
  - Acceptance: assertRole 위계 검증, owner self-leave 차단, owner 자동 membership 생성 케이스.
  - Files: `apps/api/src/teams/team-membership.service.spec.ts` (신규), 기존 teams.service.spec.ts 갱신
  - Deps: 3.4, 3.5

### Phase 4 — Backend DTO + Realtime

- [ ] **4.1 Team Matches DTO 일괄 작성** (L)
  - Acceptance: 섹션 4.4의 8개 DTO 작성. 컨트롤러 파라미터 타입 모두 교체. `Record<string, unknown>` zero.
  - Files: `apps/api/src/team-matches/dto/*.dto.ts`, `apps/api/src/team-matches/team-matches.controller.ts`
  - Deps: 3.5

- [ ] **4.2 GET /team-matches/:id/applications + /me/applications 구현** (M)
  - Acceptance: 섹션 4.3의 두 신규 엔드포인트. host-only 가드, self-only 가드. applicantTeam/teamMatch include.
  - Files: `apps/api/src/team-matches/team-matches.controller.ts`, `team-matches.service.ts`
  - Deps: 4.1

- [ ] **4.3 ValidationPipe 글로벌 등록 검증** (S)
  - Acceptance: `main.ts`에 `ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } })` 등록. 누락 시 추가.
  - Files: `apps/api/src/main.ts`
  - Deps: -

- [ ] **4.4 RealtimeGateway에 chat/notification room 통합** (L)
  - Acceptance: 기존 `realtime.gateway.ts`를 확장해서 `chat:join`, `chat:leave`, `chat:message`, `notification:subscribe` 이벤트 처리. 인증된 user만 자기 room(`user:{id}`) join. JWT 검증은 handshake에서 수행.
  - Files: `apps/api/src/realtime/realtime.gateway.ts`
  - Deps: -

- [ ] **4.5 NotificationService — DB 영속화 + Realtime emit** (M)
  - Acceptance: 기존 in-memory store 제거. Notification 모델은 이미 schema에 존재. `create()`가 DB에 insert + RealtimeGateway로 `user:{id}` room에 emit. `findAll`/`markRead`/`markAllRead` Prisma로 변환.
  - Files: `apps/api/src/notifications/notifications.service.ts`, `notifications.module.ts`
  - Deps: 4.4

- [ ] **4.6 ChatService — DB 영속화 + Realtime emit** (L)
  - Acceptance: 채팅 메시지/방 모델이 schema에 없다면 추가(`ChatRoom`, `ChatMessage`). 기존 mock store 제거. message create 시 RealtimeGateway emit. (스코프가 너무 크면 서브 태스크로 분리 가능.)
  - Files: `apps/api/prisma/schema.prisma` (필요 시), `apps/api/src/chat/chat.service.ts`, `chat.module.ts`
  - Deps: 4.4
  - **Open question**: 기존 schema에 ChatRoom/ChatMessage 모델이 없음. 이 작업이 확정되면 별도 마이그레이션 1건 추가 필요. 일단 minimum viable 모델 정의 후 진행.

### Phase 5 — Frontend

- [ ] **5.1 useRequireAuth 훅 적용 — 보호 페이지 일괄 마이그레이션** (M)
  - Acceptance: 다음 페이지의 인라인 `useAuthStore` 인증 가드를 `useRequireAuth()` 호출로 교체:
    - `/(main)/my/matches/page.tsx`
    - `/(main)/my/team-matches/page.tsx`
    - `/(main)/my/teams/page.tsx`
    - `/(main)/my/mercenary/page.tsx`
    - `/(main)/my/listings/page.tsx`
    - `/(main)/my/lessons/page.tsx`
    - `/(main)/my/lesson-tickets/page.tsx`
    - `/(main)/my/reviews-received/page.tsx`
    - `/(main)/profile/page.tsx`
    - `/(main)/settings/...`
    - `/(main)/teams/new/page.tsx`
    - `/(main)/teams/[id]/edit/page.tsx`
    - `/(main)/team-matches/new/page.tsx` (있다면)
  - Files: 위 페이지들
  - Deps: -

- [ ] **5.2 호스트 신청 현황 페이지** (L)
  - Acceptance: `/team-matches/[id]` 페이지에 호스트(`manager+ of hostTeamId`)일 때만 노출되는 "신청 현황" 섹션. 신청 팀 카드 리스트 + 승인/거절 버튼. 또는 `/my/team-matches/[id]/applications` 별도 페이지로 분리. 빈 상태는 `<EmptyState />` 사용. 토스트로 결과 피드백.
  - Files: `apps/web/src/app/(main)/team-matches/[id]/page.tsx`, 신규 컴포넌트 `apps/web/src/components/team-matches/applications-section.tsx`
  - Deps: 4.2

- [ ] **5.3 신청자 신청 현황 페이지** (M)
  - Acceptance: `/(main)/my/team-matches/page.tsx`에 탭 추가 — "내가 만든 매치" / "내가 신청한 매치". 신청 탭은 `GET /team-matches/me/applications` 호출. 상태 뱃지(pending/approved/rejected) 표시.
  - Files: `apps/web/src/app/(main)/my/team-matches/page.tsx`
  - Deps: 4.2

- [ ] **5.4 Profile 페이지 재구성** (L)
  - Acceptance: 다음 QA 지적사항 해결:
    - "매치 히스토리" 와 "내가 만든 매치" 라벨/링크 분리. 내가 만든 매치 클릭 시 `/my/matches?tab=hosted`로, 히스토리는 `/my/matches?tab=history`로 분기.
    - "내 용병 모집" 섹션에 "+ 모집글 등록" 버튼 추가 — `/mercenary/new?teamId=...` 로 라우팅.
    - 진행중 / 과거 내역 분리 표시 (탭 또는 섹션). 백엔드 응답의 `status` 필드 기반.
  - Files: `apps/web/src/app/(main)/profile/page.tsx`, `/(main)/my/matches/page.tsx`, `/(main)/my/mercenary/page.tsx`
  - Deps: -

- [ ] **5.5 Mercenary 등록 페이지 신규 작성** (M)
  - Acceptance: `/(main)/mercenary/new/page.tsx` 신규. teamId 쿼리 또는 셀렉트로 입력. 매니저+ 권한 검증(API가 거부하면 토스트). 폼 필드: sportType, matchDate, venue, position, count, level, fee, notes.
  - Files: `apps/web/src/app/(main)/mercenary/new/page.tsx` (신규), `mercenary/new/loading.tsx`
  - Deps: 2.3

- [ ] **5.6 Teams [id] edit 페이지 검증/완성** (M)
  - Acceptance: 기존 파일 존재 확인 완료(`/(main)/teams/[id]/edit/page.tsx`). 실제로 동작하는지 확인 — 폼 필드 존재, save 핸들러, 권한 가드(owner+). 누락분 보충.
  - Files: `apps/web/src/app/(main)/teams/[id]/edit/page.tsx`
  - Deps: 3.3

- [ ] **5.7 팀 멤버 관리 페이지 검증/완성** (M)
  - Acceptance: `/(main)/teams/[id]/members/page.tsx` 가 새 API(`GET /teams/:id/members`)를 호출. owner는 역할 변경/강퇴 버튼 노출. member는 자진 탈퇴 버튼.
  - Files: `apps/web/src/app/(main)/teams/[id]/members/page.tsx`
  - Deps: 3.3

- [ ] **5.8 Realtime 클라이언트 통합** (L)
  - Acceptance: `apps/web/src/lib/realtime.ts` (또는 hook) 작성. Socket.IO client로 `notification:new` 이벤트 구독 → notification-store 업데이트. chat 페이지는 `chat:message` 구독.
  - Files: `apps/web/src/lib/realtime-client.ts` (신규), `notification-store.ts`, `chat-store.ts`, 채팅 페이지
  - Deps: 4.4, 4.5, 4.6

- [ ] **5.9 Mock unread badge 제거** (S)
  - Acceptance: 사이드바/하단 네비의 unread count가 실제 API 응답 또는 0 기반. 하드코딩된 mock 숫자 제거.
  - Files: `apps/web/src/stores/chat-store.ts`, `notification-store.ts`, 사이드바 컴포넌트
  - Deps: 4.5

### Phase 6 — Cleanup & QA

- [ ] **6.1 백엔드 e2e/단위 테스트 풀세트 통과** (M)
  - Acceptance: `cd apps/api && pnpm test` 그리고 (있다면) `pnpm test:e2e` 그린.
  - Files: -
  - Deps: 모든 백엔드 작업

- [ ] **6.2 프론트엔드 lint + tsc + vitest** (S)
  - Acceptance: `cd apps/web && pnpm lint && npx tsc --noEmit && pnpm test` 그린.
  - Files: -
  - Deps: 모든 프론트 작업

- [ ] **6.3 시드 데이터 수동 검증** (S)
  - Acceptance: `pnpm db:push && pnpm prisma db seed` 후 mercenary 5건, owner membership 자동 생성 확인. Prisma Studio로 검증.
  - Files: -
  - Deps: 1.5

- [ ] **6.4 Swagger 문서 검수** (S)
  - Acceptance: `http://localhost:8100/api/docs`에서 mercenary, teams/members, team-matches 모든 엔드포인트가 DTO 스키마로 노출. 어떤 엔드포인트도 `Record<string, unknown>` body 가 보이지 않음.
  - Files: -
  - Deps: 4.1

- [ ] **6.5 회귀 QA 시나리오 (manual)** (M)
  - Acceptance: 섹션 9의 시나리오 9개 모두 통과.
  - Files: -
  - Deps: 모든 작업

- [ ] **6.6 CLAUDE.md / README 업데이트** (S)
  - Acceptance: 새 권한 모델, 새 엔드포인트 목록을 CLAUDE.md "유틸 함수" 아래 새 섹션 또는 별도 docs 위치에 기록. README 변경은 사용자 요청 시에만.
  - Files: `CLAUDE.md`
  - Deps: 모든 작업

---

## 7. Migration Strategy

### 7.1 단계별 적용 순서

1. **Phase 1 머지** → 즉시 staging DB에 `prisma migrate deploy`. owner backfill SQL이 동일 트랜잭션에 포함됨.
2. **Phase 2-4 머지** → 백엔드 단독 배포. 프론트는 아직 구버전이어도 OK (새 엔드포인트는 단순 추가, 기존 응답 형식은 호환 유지).
3. **Phase 5 머지** → 프론트 배포. 백엔드 신규 엔드포인트가 이미 staging에 있어야 함.
4. **Phase 6** → 검증 후 production 승급.

### 7.2 호환성 가드레일

- 기존 `team-matches` GET 엔드포인트의 응답 필드는 유지(추가만 허용). DTO 도입 시 `whitelist: true`는 input에만 적용, 응답에는 영향 없음.
- `SportTeam.ownerId` 필드 유지. `TeamMembership(role=owner)`는 추가 정보일 뿐 SoT는 ownerId.
- in-memory mercenary 데이터는 이미 휘발성이므로 손실 없음. 단, demo 시드에서 개수 감소하지 않도록 1.5에서 5건 시드 유지.

### 7.3 롤백 절차

- DB: `prisma migrate resolve --rolled-back <migration>` + 수동 DROP TABLE (team_memberships, mercenary_posts, mercenary_applications) + DROP TYPE (4개 enum).
- 백엔드: 이전 커밋으로 롤백. mercenary 컨트롤러가 다시 in-memory 사용.
- 프론트: 신규 페이지/훅은 dead code가 되지만 기존 페이지에 영향 없음.

---

## 8. Risks & Open Questions

### 8.1 Risks

| # | Risk | Severity | Mitigation |
|---|------|:--------:|------------|
| R1 | TeamMembership 도입 후 owner 권한 검증 누락 페이지 발생 | High | 권한 가드를 서비스 레이어에 강제. 컨트롤러 가드만으로는 부족. 모든 mutation 메서드 시작에 `assertRole` 호출. |
| R2 | Chat 모델이 schema에 없음 → Phase 4.6 스코프 폭증 | Med | Phase 4.6을 별도 PR로 분리하거나, 최소 모델만 정의(ChatRoom/Message 2개 테이블)하고 풍부한 기능은 후속 작업으로 이연. |
| R3 | Realtime gateway가 production 환경에서 인증 미적용 | High | handshake.auth.token 검증 + JWT verify 필수. 익명 연결 거부. |
| R4 | DTO whitelist=true로 인한 기존 프론트 페이로드 호환 깨짐 | Med | Phase 4.1 머지 전 staging에서 모든 mutation 페이로드 회귀 테스트. forbidNonWhitelisted를 일단 false로 두고 점진 활성화. |
| R5 | Profile 페이지 재구성이 디자인 시스템 일관성 깨뜨릴 수 있음 | Low | `<EmptyState />`, design tokens 강제. design 에이전트 리뷰 1회 통과 필수. |
| R6 | useRequireAuth 일괄 적용 시 라우터 race condition (페이지 첫 렌더 시 store hydration 전 redirect) | Med | 훅 내부에서 hydration 완료 플래그 체크. zustand persist `onRehydrateStorage` 활용. |

### 8.2 Open Questions (착수 전 확인 필요)

1. **Q1**: ChatRoom/ChatMessage 모델을 이번 작업에 포함할지, 별도 작업으로 이연할지? → 권장: **이연**. Phase 4.6은 "Realtime emit만 연결, 영속화는 후속" 으로 축소.
2. **Q2**: 모집글 작성 권한을 manager+로 할지, member까지 허용할지? → QA 문구는 "직책에 따라"이므로 manager+ 가 안전한 기본값. 추후 팀 설정에서 토글 가능하게 확장 가능.
3. **Q3**: owner 양도 UI를 이번 라운드에 포함할지? → 권장: **포함하지 않음**. API만 제공(`PATCH /members/:userId { role: owner }`). UI는 follow-up.
4. **Q4**: 신청자가 자기 신청을 "withdraw"할 수 있어야 하는가? → 권장: **포함**. `MercenaryApplicationStatus.withdrawn`이미 정의됨. 엔드포인트 `DELETE /mercenary/:id/applications/me` 추가 (Phase 2에 squash).
5. **Q5**: profile 페이지의 "과거 내역" 분리 기준은 시간(matchDate < today)인가, status(completed)인가? → 권장: **status 우선, 동률이면 시간**. completed/cancelled = 과거, 그 외 = 진행중.

---

## 9. Testing Strategy

### 9.1 Phase별 테스트

| Phase | 자동화 테스트 | 수동 테스트 |
|-------|--------------|------------|
| 1 | prisma generate 무오류, migration up/down | Studio로 row 확인 |
| 2 | mercenary.service.spec (Prisma 모킹) | Postman으로 5개 엔드포인트 호출 |
| 3 | team-membership.service.spec, teams.service.spec | 두 사용자 계정으로 권한 매트릭스 검증 |
| 4 | team-matches.service.spec, DTO validation 통합 테스트 | Swagger UI에서 모든 엔드포인트 호출 |
| 5 | vitest + RTL 컴포넌트 테스트, useRequireAuth 훅 테스트 | 9.2 시나리오 |
| 6 | e2e (Playwright 있으면) | full regression |

### 9.2 회귀 시나리오 (manual, Phase 6.5)

| # | 시나리오 | 기대 결과 |
|---|---------|---------|
| S1 | 비로그인 → /my/matches 접근 | /login?redirect=/my/matches로 이동 |
| S2 | userA(owner) → 팀 생성 → 멤버 페이지 진입 | 자기 자신이 owner role로 표시 |
| S3 | userA → userB를 manager로 추가 → userB로 로그인 → 모집글 작성 | 성공 |
| S4 | userA → userB를 member로 강등 → userB가 모집글 작성 시도 | 403 + 토스트 |
| S5 | userA → 용병 모집글 작성 → 서버 재시작 → 다시 조회 | 데이터 유지됨 (Prisma 영속) |
| S6 | userC → userA의 모집글에 지원 → userA가 /my/team-matches에서 신청 확인 → 승인 | userC의 /my/team-matches 신청 탭에서 approved 표시 |
| S7 | userC → 상대 팀 매칭에 신청 → userC가 신청 현황 페이지에서 status 확인 | pending 표시 |
| S8 | userA가 자기 매칭에 다른 팀 신청을 거절 | 신청자에게 notification 도착, 실시간 emit 확인 |
| S9 | profile 페이지 → "내가 만든 매치" 클릭 | hosted matches 탭으로 이동, 진행중/과거 분리 확인 |

### 9.3 권한 매트릭스 자동화 테스트 (3.6에 포함)

```typescript
describe('TeamMembershipService.assertRole', () => {
  it.each([
    ['owner', 'owner', true],
    ['owner', 'manager', true],
    ['owner', 'member', true],
    ['manager', 'owner', false],
    ['manager', 'manager', true],
    ['manager', 'member', true],
    ['member', 'manager', false],
    ['member', 'member', true],
  ])('actual=%s required=%s -> %s', async (actual, required, expected) => {
    // ...
  });
});
```

---

## 10. Definition of Done

이 작업이 "완료"로 인정되려면 다음을 모두 충족해야 한다:

- [ ] Phase 0-6의 모든 체크박스 완료
- [ ] `cd apps/api && pnpm test` 통과
- [ ] `cd apps/web && pnpm lint && npx tsc --noEmit && pnpm test` 통과
- [ ] 회귀 시나리오 S1-S9 모두 통과
- [ ] Swagger 문서에 `Record<string, unknown>` 0건
- [ ] In-memory mercenary 데이터 의존 코드 0건 (`grep -r "private posts:" apps/api/src` 무결과)
- [ ] inline `useAuthStore` 인증 가드 0건 (`grep -rn "useAuthStore" apps/web/src/app/\(main\)/my` 결과는 useRequireAuth 호출만)
- [ ] CLAUDE.md에 신규 권한 모델 1단락 추가
- [ ] 디자인 에이전트 1회 패스(Phase 5 산출물)
- [ ] QA 에이전트 4 페르소나 통과

---

## 11. Out of Scope (명시적 제외)

다음은 이 작업에서 다루지 않는다. 별도 follow-up 작업으로 분리한다.

- ChatRoom/ChatMessage 풍부한 모델링(이미지, 멀티 룸, 읽음 표시 등)
- 팀 owner 양도 UI
- 권한 변경 audit log 페이지
- Mercenary 모집글 검색/필터 고도화
- 실시간 gateway 부하 테스트
- TeamMatch 결과 입력 UI 개편
- Push notification (FCM) 전송 채널
- 알림 카테고리별 필터 UI

---

End of document.
