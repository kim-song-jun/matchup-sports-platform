# QA Follow-up Technical Design Document

> Companion to `qa-feedback-execution-plan.md`. 본 문서는 QA 피드백에서 도출된
> 미완료/이연 항목에 대한 **기술 설계(아키텍처 결정 + 코드/스키마)** 를 정리한다.
> 한국어로 의사결정 배경을 적고, 코드/식별자/필드명은 영어로 통일한다.
>
> Authors: tech-planner (parallel to project-director)
> Status: Draft
> Target stack: NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis 7 + Socket.IO + Next.js 15

---

## Table of Contents

1. [MercenaryPost Prisma Model](#1-mercenarypost-prisma-model-design)
2. [TeamMembership Model & Permission Layer](#2-teammembership-model-design)
3. [team-matches DTO Classes](#3-dto-classes-for-team-matches)
4. [WebSocket Integration (Chat & Notification)](#4-websocket-integration)
5. [Mutual Confirmation API Design](#5-mutual-confirmation-api-design)
6. [useRequireAuth Adoption Plan](#6-userequireauth-adoption-plan)
7. [Profile Page Restructure](#7-profile-page-restructure)

---

## 1. MercenaryPost Prisma Model Design

### ADR-001: 용병 모집글을 별도 모델로 분리

**Context.** 현재 `apps/api/src/mercenary/mercenary.service.ts` 는 220라인의
in-memory mock 으로, 개념적으로는 `TeamMatch` 와 비슷하지만 “팀 vs 팀” 이 아닌
“팀 호스트 + 개인 용병들”의 흐름이다. `TeamMatch` / `TeamMatchApplication` 을
재사용하는 것을 검토했으나 다음 이유로 분리한다.

- `TeamMatchApplication.applicantTeamId` 가 NOT NULL → 개인 신청자 모델에 부적합
- 용병은 개인 단위로 fee 분담, 포지션, 인원이 달라 별도 라이프사이클
- 향후 “팀 매칭 시 부족 인원 자동 용병 모집” 통합은 외부 키 (`linkedTeamMatchId`) 로 충분

**Decision.** `MercenaryPost`, `MercenaryApplication` 두 모델 추가. `TeamMatch`
와는 optional FK 로만 연결한다.

**Consequences.**
- 별도 라우트 (`/api/v1/mercenary/posts`) 유지 가능
- 마이그레이션 시 in-memory mock 데이터는 폐기 (개발 단계)
- 추후 `TeamMatch` ↔ `MercenaryPost` 양방향 동기화 로직은 service layer 에서 처리

### Prisma Schema Additions

```prisma
// ─── 용병 모집 ─────────────────────────────────────────

enum MercenaryStatus {
  recruiting     // 모집중
  full           // 인원 마감
  closed         // 호스트가 직접 마감
  cancelled      // 취소
  completed      // 경기 완료
}

enum MercenaryApplicationStatus {
  pending
  approved
  rejected
  withdrawn
  no_show
  completed
}

model MercenaryPost {
  id              String          @id @default(uuid())
  teamId          String          @map("team_id")          // 모집 호스트 팀
  authorId        String          @map("author_id")        // 글 작성자(팀 멤버)
  sportType       SportType       @map("sport_type")

  // 모집 정보
  title           String
  description     String?
  position        String?                                  // GK / FW 등 (sport-specific)
  requiredCount   Int             @default(1) @map("required_count")
  approvedCount   Int             @default(0) @map("approved_count")

  // 레벨 / 성별 / 나이
  levelMin        Int             @default(1) @map("level_min")
  levelMax        Int             @default(5) @map("level_max")
  genderRequirement String        @default("any") @map("gender_requirement") // any|male|female
  ageMin          Int?            @map("age_min")
  ageMax          Int?            @map("age_max")

  // 일정 / 장소
  matchDate       DateTime        @map("match_date") @db.Date
  startTime       String          @map("start_time")        // HH:mm
  endTime         String          @map("end_time")
  venueName       String          @map("venue_name")
  venueAddress    String          @map("venue_address")
  city            String?
  district        String?

  // 비용
  fee             Int             @default(0)
  paymentNote     String?         @map("payment_note")

  // 상태
  status          MercenaryStatus @default(recruiting)

  // 옵션: 팀매치와 연동되는 용병 모집인 경우
  linkedTeamMatchId String?       @unique @map("linked_team_match_id")

  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  deletedAt       DateTime?       @map("deleted_at")

  team            SportTeam       @relation("MercenaryPostTeam", fields: [teamId], references: [id], onDelete: Cascade)
  author          User            @relation("MercenaryPostAuthor", fields: [authorId], references: [id])
  applications    MercenaryApplication[]

  @@index([sportType, status, matchDate])
  @@index([teamId, status])
  @@index([city, district])
  @@index([deletedAt])
  @@map("mercenary_posts")
}

model MercenaryApplication {
  id              String                     @id @default(uuid())
  postId          String                     @map("post_id")
  applicantId     String                     @map("applicant_id")          // User
  status          MercenaryApplicationStatus @default(pending)
  message         String?
  position        String?
  attendedAt      DateTime?                  @map("attended_at")
  rejectedReason  String?                    @map("rejected_reason")

  createdAt       DateTime                   @default(now()) @map("created_at")
  updatedAt       DateTime                   @updatedAt @map("updated_at")

  post            MercenaryPost              @relation(fields: [postId], references: [id], onDelete: Cascade)
  applicant       User                       @relation("MercenaryApplicant", fields: [applicantId], references: [id])

  @@unique([postId, applicantId])
  @@index([applicantId, status])
  @@index([postId, status])
  @@map("mercenary_applications")
}
```

### User / SportTeam 측 추가 relation

```prisma
// User 모델에 추가
mercenaryPostsAuthored MercenaryPost[]        @relation("MercenaryPostAuthor")
mercenaryApplications  MercenaryApplication[] @relation("MercenaryApplicant")

// SportTeam 모델에 추가
mercenaryPosts         MercenaryPost[]        @relation("MercenaryPostTeam")
```

### 인덱스 근거

| Index | 사용 쿼리 |
|-------|-----------|
| `(sportType, status, matchDate)` | 종목별 모집중인 글을 매치일 가까운 순으로 (메인 피드) |
| `(teamId, status)` | 특정 팀의 모집글 목록 (팀 상세 페이지) |
| `(city, district)` | 지역 필터 |
| `(applicantId, status)` | 사용자 “내 용병 신청 현황” |
| `(postId, status)` | 호스트가 신청자 목록을 status 별로 조회 |

### 마이그레이션 전략

1. `prisma migrate dev --name add_mercenary_post` 로 신규 테이블 생성
2. `mercenary.service.ts` 의 in-memory `Map` 폐기 (dev mock — 보존 데이터 없음)
3. `seed.ts` 에 1~2건 샘플 추가 (smoke test 용)

---

## 2. TeamMembership Model Design

### ADR-002: 멤버십 테이블 도입 + ownerId 유지(backward compat)

**Context.** `SportTeam.ownerId` 만으로는 “직책에 따른 권한” 요구사항을 충족할 수
없다 (QA: 모집글 작성/신청 권한, 멤버 초대 등).

**Decision.**
- `TeamMembership` 모델 신설 (3-단계 role enum)
- `SportTeam.ownerId` 는 **유지** — 다음 이유:
  - 기존 모든 코드가 `team.ownerId === user.id` 패턴에 의존 → 한꺼번에 깨면 위험
  - DB 무결성: 팀 소유자가 항상 1명임을 보장하는 단일 컬럼이 유용
  - 마이그레이션 단계에서 `ownerId` 와 `TeamMembership(role=owner)` 는 동기화 보장
- 멤버십 가입 신청은 별도 `TeamJoinRequest` 모델 — pending 멤버십을 동일 테이블에
  섞으면 권한 체크 쿼리가 매번 status 필터를 강제하게 되므로 분리

### Prisma Schema

```prisma
enum TeamRole {
  owner    // 소유자 (1명 고정)
  manager  // 운영진 (n명) — 모집/신청/승인 가능
  member   // 일반 멤버 — 글 작성/신청 불가
}

enum TeamJoinRequestStatus {
  pending
  approved
  rejected
  cancelled
}

model TeamMembership {
  id        String   @id @default(uuid())
  teamId    String   @map("team_id")
  userId    String   @map("user_id")
  role      TeamRole @default(member)
  joinedAt  DateTime @default(now()) @map("joined_at")

  team SportTeam @relation("TeamMemberships", fields: [teamId], references: [id], onDelete: Cascade)
  user User      @relation("UserTeamMemberships", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId, role])
  @@index([teamId, role])
  @@map("team_memberships")
}

model TeamJoinRequest {
  id          String                @id @default(uuid())
  teamId      String                @map("team_id")
  userId      String                @map("user_id")
  status      TeamJoinRequestStatus @default(pending)
  message     String?
  decidedById String?               @map("decided_by_id")
  decidedAt   DateTime?             @map("decided_at")
  createdAt   DateTime              @default(now()) @map("created_at")
  updatedAt   DateTime              @updatedAt @map("updated_at")

  team SportTeam @relation("TeamJoinRequests", fields: [teamId], references: [id], onDelete: Cascade)
  user User      @relation("UserTeamJoinRequests", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId, status])
  @@index([teamId, status])
  @@index([userId, status])
  @@map("team_join_requests")
}
```

`SportTeam` 모델에 추가:

```prisma
memberships  TeamMembership[]  @relation("TeamMemberships")
joinRequests TeamJoinRequest[] @relation("TeamJoinRequests")
```

`User` 모델에 추가:

```prisma
teamMemberships  TeamMembership[]  @relation("UserTeamMemberships")
teamJoinRequests TeamJoinRequest[] @relation("UserTeamJoinRequests")
```

### 권한 매트릭스 (확정)

| Action                          | owner | manager | member | non-member |
|---------------------------------|:-----:|:-------:|:------:|:----------:|
| Create team-match (post)        |   O   |    O    |   X    |     X      |
| Apply to team-match             |   O   |    O    |   X    |     X      |
| Approve / reject application    |   O   |    O    |   X    |     X      |
| Edit team info                  |   O   |    O    |   X    |     X      |
| Delete team                     |   O   |    X    |   X    |     X      |
| Invite / remove members         |   O   |    O    |   X    |     X      |
| Promote member → manager        |   O   |    X    |   X    |     X      |
| Demote manager → member         |   O   |    X    |   X    |     X      |
| Create mercenary post           |   O   |    O    |   X    |     X      |
| Manage mercenary applications   |   O   |    O    |   X    |     X      |
| Submit join request             |   X   |    X    |   X    |     O      |
| View team members list          |   O   |    O    |   O    |     O*     |

(* non-member 는 public 정보만 노출)

### TeamMembershipService 설계

```ts
// apps/api/src/team-memberships/team-membership.service.ts
@Injectable()
export class TeamMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the user's role in the team, or null if not a member. */
  async getRole(userId: string, teamId: string): Promise<TeamRole | null> {
    const m = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  /** Owner or manager — has write permissions on the team. */
  async canManage(userId: string, teamId: string): Promise<boolean> {
    const role = await this.getRole(userId, teamId);
    return role === 'owner' || role === 'manager';
  }

  /** Owner only — destructive operations. */
  async isOwner(userId: string, teamId: string): Promise<boolean> {
    return (await this.getRole(userId, teamId)) === 'owner';
  }

  /** Any active member. */
  async isMember(userId: string, teamId: string): Promise<boolean> {
    return (await this.getRole(userId, teamId)) !== null;
  }

  /** Asserts canManage; throws ForbiddenException otherwise. */
  async assertCanManage(userId: string, teamId: string): Promise<void> {
    if (!(await this.canManage(userId, teamId))) {
      throw new ForbiddenException({
        code: 'TEAM_PERMISSION_DENIED',
        message: '팀 운영진만 수행할 수 있습니다.',
      });
    }
  }
}
```

NestJS Guard 패턴 (선택):

```ts
// @TeamRoles('owner', 'manager') 데코레이터 + TeamRoleGuard
// param :teamId 또는 :id 를 추출 → service.getRole 호출 → 매칭 여부 판단
```

### 마이그레이션 스크립트 outline

`prisma/migrations/<ts>_add_team_membership/migration.sql` 본문 끝에 data
backfill SQL 추가:

```sql
-- Backfill: every existing team owner becomes an owner-role membership
INSERT INTO team_memberships (id, team_id, user_id, role, joined_at)
SELECT
  gen_random_uuid(),
  st.id,
  st.owner_id,
  'owner',
  st.created_at
FROM sport_teams st
ON CONFLICT (team_id, user_id) DO NOTHING;
```

> `gen_random_uuid()` 가 안 되는 환경이면 `uuid_generate_v4()` 또는 application
> 단 backfill script 사용.

검증: 마이그레이션 후 `count(sport_teams) === count(team_memberships where role='owner')`

---

## 3. DTO Classes for team-matches

현재 `team-matches.controller.ts` 와 `team-matches.service.ts` 가 모두
`Record<string, unknown>` 을 사용. 다음 DTO 를 `apps/api/src/team-matches/dto/`
하위에 생성한다.

### Shared enums import

```ts
import { SportType, TeamMatchStatus, MatchStyle, ParticipationType } from '@prisma/client';
```

### 3.1 CreateTeamMatchDto

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString,
  Length, Matches, Max, Min, IsObject,
} from 'class-validator';
import { SportType, MatchStyle } from '@prisma/client';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTeamMatchDto {
  @ApiProperty() @IsString() hostTeamId!: string;

  @ApiProperty({ enum: SportType }) @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty() @IsString() @Length(2, 80)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000)
  description?: string;

  @ApiProperty({ example: '2026-04-12' })
  @IsString() @Matches(DATE_REGEX)
  matchDate!: string;

  @ApiProperty({ example: '19:00' })
  @IsString() @Matches(TIME_REGEX)
  startTime!: string;

  @ApiProperty({ example: '21:00' })
  @IsString() @Matches(TIME_REGEX)
  endTime!: string;

  @ApiPropertyOptional({ default: 120 })
  @IsOptional() @IsInt() @Min(20) @Max(360)
  totalMinutes?: number;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional() @IsInt() @Min(1) @Max(10)
  quarterCount?: number;

  @ApiProperty() @IsString() venueName!: string;
  @ApiProperty() @IsString() venueAddress!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  venueInfo?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0)
  totalFee?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt() @Min(0)
  opponentFee?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  paymentDeadline?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500)
  cancellationPolicy?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  requiredLevel?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  hasProPlayers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  allowMercenary?: boolean;

  @ApiPropertyOptional({ enum: MatchStyle, default: MatchStyle.friendly })
  @IsOptional() @IsEnum(MatchStyle)
  matchStyle?: MatchStyle;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  hasReferee?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000)
  notes?: string;
}
```

### 3.2 UpdateTeamMatchDto

```ts
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTeamMatchDto } from './create-team-match.dto';

// hostTeamId / sportType 은 변경 불가
export class UpdateTeamMatchDto extends PartialType(
  OmitType(CreateTeamMatchDto, ['hostTeamId', 'sportType'] as const),
) {}
```

### 3.3 ApplyTeamMatchDto

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ParticipationType } from '@prisma/client';

export class ApplyTeamMatchDto {
  @ApiProperty() @IsString()
  applicantTeamId!: string;

  @ApiPropertyOptional({ enum: ParticipationType, default: ParticipationType.team })
  @IsOptional() @IsEnum(ParticipationType)
  participationType?: ParticipationType;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500)
  message?: string;

  @ApiProperty({ description: '상대 팀 정보 확인' })
  @IsBoolean() confirmedInfo!: boolean;

  @ApiProperty({ description: '수준 차이 인지' })
  @IsBoolean() confirmedLevel!: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  proPlayerCheck?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mercenaryCheck?: boolean;
}
```

### 3.4 CheckInTeamMatchDto

```ts
export class CheckInTeamMatchDto {
  @ApiProperty() @IsString() teamId!: string;
  @ApiProperty() @IsBoolean() isHome!: boolean;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180)
  lng?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ enum: ['normal', 'late', 'no_show'] })
  @IsOptional() @IsIn(['normal', 'late', 'no_show'])
  opponentStatus?: 'normal' | 'late' | 'no_show';

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500)
  opponentNote?: string;
}
```

### 3.5 SubmitResultDto

```ts
export class QuarterScoreDto {
  @ApiProperty() @IsInt() @Min(0) home!: number;
  @ApiProperty() @IsInt() @Min(0) away!: number;
}

export class SubmitResultDto {
  @ApiProperty({ type: [QuarterScoreDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuarterScoreDto)
  quarters!: QuarterScoreDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500)
  note?: string;
}
```

`scoreHome` / `scoreAway` / `resultHome` / `resultAway` 는 service 가 계산하여
저장한다.

### 3.6 EvaluateTeamMatchDto

```ts
export class EvaluateTeamMatchDto {
  @ApiProperty() @IsString() evaluatorTeamId!: string;
  @ApiProperty() @IsString() evaluatedTeamId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) levelAccuracy!: number;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) infoAccuracy!: number;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) mannerRating!: number;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) punctuality!: number;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) paymentClarity!: number;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) cooperation!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000)
  comment?: string;
}
```

### 3.7 TeamMatchQueryDto

```ts
import { Transform } from 'class-transformer';

export class TeamMatchQueryDto {
  @ApiPropertyOptional({ enum: SportType }) @IsOptional() @IsEnum(SportType)
  sportType?: SportType;

  @ApiPropertyOptional({ enum: TeamMatchStatus }) @IsOptional() @IsEnum(TeamMatchStatus)
  status?: TeamMatchStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_REGEX)
  fromDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_REGEX)
  toDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @IsInt() @Min(1) @Max(50)
  @Transform(({ value }) => Number(value))
  limit?: number;
}
```

> 모든 컨트롤러 메서드 시그니처는 `Record<string, unknown>` → 위 DTO 로 교체.
> Service 내부 타입은 `Prisma.TeamMatchCreateInput` 로 통일.

---

## 4. WebSocket Integration

### ADR-003: 단일 `RealtimeGateway` + 네임스페이스 분리

**Decision.**
- 기존 `apps/api/src/realtime/realtime.gateway.ts` 를 확장하여 두 네임스페이스 운영
  - `/ws/chat` — 채팅
  - `/ws/notification` — 개인 알림 push
- 인증: Socket.IO handshake `auth: { token: <JWT> }` → `WsJwtGuard` 로 검증
- Redis adapter (`@socket.io/redis-adapter`) 를 통해 horizontal scaling 대비

### 4.1 Chat 스키마 (신규)

```prisma
enum ChatRoomType {
  team_match     // 팀매치 confirmed pair (host vs guest)
  mercenary_post // 용병 호스트 ↔ 신청자
  direct         // 1:1 (선택, 향후)
}

model ChatRoom {
  id           String         @id @default(uuid())
  type         ChatRoomType
  refId        String?        @map("ref_id")        // teamMatchId or mercenaryPostId
  title        String?
  lastMessageAt DateTime?     @map("last_message_at")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")

  participants ChatParticipant[]
  messages     ChatMessage[]

  @@index([type, refId])
  @@index([lastMessageAt])
  @@map("chat_rooms")
}

model ChatParticipant {
  id          String   @id @default(uuid())
  roomId      String   @map("room_id")
  userId      String   @map("user_id")
  joinedAt    DateTime @default(now()) @map("joined_at")
  lastReadAt  DateTime? @map("last_read_at")

  room ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user User     @relation("ChatParticipants", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([roomId, userId])
  @@index([userId])
  @@map("chat_participants")
}

model ChatMessage {
  id        String   @id @default(uuid())
  roomId    String   @map("room_id")
  senderId  String   @map("sender_id")
  body      String
  type      String   @default("text") // text|image|system
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")
  deletedAt DateTime? @map("deleted_at")

  room   ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  sender User     @relation("ChatMessages", fields: [senderId], references: [id])

  @@index([roomId, createdAt])
  @@map("chat_messages")
}
```

### 4.2 Notification 모델 (기존 사용)

기존 `Notification` 모델 그대로 사용. WebSocket 으로 push 시 `NotificationType`
중 동적으로 사용.

### 4.3 WebSocket Event Contract

#### `/ws/chat`

| Event (client → server) | Payload | 응답 |
|---|---|---|
| `chat:join` | `{ roomId: string }` | ack: `{ ok: true, lastMessageId? }` |
| `chat:leave` | `{ roomId: string }` | ack |
| `chat:message` | `{ roomId, body, type?, clientId }` | broadcast `chat:message` |
| `chat:typing` | `{ roomId, isTyping: boolean }` | broadcast `chat:typing` |
| `chat:read` | `{ roomId, messageId }` | broadcast `chat:read` |

| Event (server → client) | Payload |
|---|---|
| `chat:message` | `{ id, roomId, senderId, body, type, createdAt, clientId? }` |
| `chat:typing` | `{ roomId, userId, isTyping }` |
| `chat:read` | `{ roomId, userId, messageId, readAt }` |
| `chat:error` | `{ code, message }` |

#### `/ws/notification`

| Event (server → client) | Payload |
|---|---|
| `notification:new` | `{ id, type, title, body, data, createdAt }` |
| `notification:read` | `{ id, readAt }` |

| Event (client → server) | Payload |
|---|---|
| `notification:read` | `{ id }` |
| `notification:read-all` | `{}` |

### 4.4 Auth (handshake)

```ts
@WebSocketGateway({ namespace: '/ws/chat', cors: true })
export class ChatGateway implements OnGatewayConnection {
  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('NO_TOKEN');
      const payload = await this.jwt.verifyAsync(token);
      (client.data as { userId: string }).userId = payload.sub;
    } catch {
      client.emit('chat:error', { code: 'AUTH_FAILED', message: '인증 실패' });
      client.disconnect();
    }
  }
}
```

### 4.5 Frontend integration (Next.js)

```ts
// apps/web/src/lib/realtime/socket.ts
import { io, Socket } from 'socket.io-client';

let chatSocket: Socket | null = null;

export function getChatSocket(token: string): Socket {
  if (chatSocket?.connected) return chatSocket;
  chatSocket = io(`${process.env.NEXT_PUBLIC_API_URL}/ws/chat`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
  return chatSocket;
}
```

```ts
// apps/web/src/hooks/use-chat-room.ts
export function useChatRoom(roomId: string) {
  const token = useAuthStore((s) => s.token);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!token) return;
    const sock = getChatSocket(token);
    sock.emit('chat:join', { roomId });
    sock.on('chat:message', (msg) => setMessages((prev) => [...prev, msg]));
    return () => {
      sock.emit('chat:leave', { roomId });
      sock.off('chat:message');
    };
  }, [roomId, token]);

  const send = useCallback((body: string) => {
    getChatSocket(token!).emit('chat:message', {
      roomId, body, clientId: crypto.randomUUID(),
    });
  }, [roomId, token]);

  return { messages, send };
}
```

기존 `chat-store.ts` (mock zustand) 는 제거하고 위 hook 사용으로 전환.

### 4.6 단계적 phase-out

| Phase | 작업 | Risk |
|-------|------|------|
| 1 | Notification namespace 만 도입, 기존 REST `GET /notifications` 와 병행 | low — 단방향 push |
| 2 | Notification frontend store mock → WebSocket subscribe 로 교체 | low |
| 3 | Chat schema migration + REST 엔드포인트 (room CRUD) 추가 | medium |
| 4 | Chat WebSocket 도입, frontend mock 제거 | medium |
| 5 | Redis adapter, presence(online/offline) 추가 | low |

> Phase 1~2 만으로 “알림 실시간성” QA 항목은 closed 처리 가능.

---

## 5. Mutual Confirmation API Design

호스트와 신청자가 서로의 신청 현황을 가시화할 수 있어야 한다는 QA 요구.

### Common conventions

- 모든 응답은 `{ status: 'success', data, timestamp }`
- 페이지네이션은 cursor-based (`?cursor=<id>&limit=20`)
- 권한 실패: HTTP 403 + `{ code: 'TEAM_PERMISSION_DENIED' }`

### 5.1 GET /api/v1/team-matches/:id/applications

| | |
|---|---|
| Method | GET |
| Path | `/api/v1/team-matches/:id/applications` |
| Auth | JWT + 호스트 팀 owner/manager |
| Query | `status?: 'pending'\|'approved'\|'rejected'\|'withdrawn'`, `cursor?`, `limit?` |

**Auth check.**
```ts
const match = await prisma.teamMatch.findUnique({ where: { id } });
await teamMembershipService.assertCanManage(req.user.id, match.hostTeamId);
```

**Response.**
```jsonc
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "app_xxx",
        "applicantTeam": {
          "id": "team_yyy",
          "name": "FC SOLO",
          "logoUrl": "...",
          "level": 3,
          "trustScore": { "mannerScore": 4.2, "noShowRate": 0 }
        },
        "status": "pending",
        "participationType": "team",
        "message": "...",
        "confirmedInfo": true,
        "confirmedLevel": true,
        "createdAt": "..."
      }
    ],
    "nextCursor": null
  },
  "timestamp": "..."
}
```

**Prisma query.**
```ts
prisma.teamMatchApplication.findMany({
  where: { teamMatchId: id, ...(status ? { status } : {}) },
  include: { applicantTeam: { include: { /* trust score */ } } },
  orderBy: { createdAt: 'desc' },
  take: limit + 1,
  cursor: cursor ? { id: cursor } : undefined,
  skip: cursor ? 1 : 0,
});
```

### 5.2 GET /api/v1/users/me/team-match-applications

| | |
|---|---|
| Method | GET |
| Path | `/api/v1/users/me/team-match-applications` |
| Auth | JWT |
| Query | `status?`, `cursor?`, `limit?` |

**Logic.** 사용자가 owner/manager 인 모든 팀이 보낸 신청 목록.

```ts
const myTeams = await prisma.teamMembership.findMany({
  where: { userId: req.user.id, role: { in: ['owner', 'manager'] } },
  select: { teamId: true },
});
const teamIds = myTeams.map((m) => m.teamId);

return prisma.teamMatchApplication.findMany({
  where: { applicantTeamId: { in: teamIds }, ...(status ? { status } : {}) },
  include: { teamMatch: { include: { hostTeam: true } } },
  orderBy: { createdAt: 'desc' },
  take: limit + 1,
});
```

**Response shape.** items 각 요소가 `{ application, teamMatch, hostTeam }` 를
포함.

### 5.3 GET /api/v1/teams/:id/team-match-applications

| | |
|---|---|
| Method | GET |
| Path | `/api/v1/teams/:id/team-match-applications` |
| Auth | JWT + 해당 팀의 active member 이상 |
| Query | `status?`, `cursor?`, `limit?` |

**Auth check.** `teamMembershipService.isMember(userId, teamId)` (member 도 조회 가능 — 단순 read)

**Logic.** 특정 팀이 보낸 신청 목록 (`applicantTeamId === :id`).

### 5.4 부수적 변경

- `team-matches.controller.ts` 의 `POST /:id/apply` 응답에 생성된 `application.id`
  포함 (현재 boolean 만 반환).
- 호스트의 `approve / reject` 시 신청자 팀 멤버 전원에게 `Notification` 생성 +
  WebSocket push.

---

## 6. useRequireAuth Adoption Plan

### 대상 파일 (전수)

| File | 현재 상태 | 변경 |
|------|----------|------|
| `apps/web/src/app/(main)/team-matches/new/page.tsx` | inline `useEffect` 게이트 | useRequireAuth 적용 |
| `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/teams/new/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/teams/[id]/edit/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/teams/[id]/members/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/matches/new/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/matches/[id]/edit/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/marketplace/new/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/marketplace/[id]/edit/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/payments/checkout/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/payments/[id]/refund/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/profile/page.tsx` | 일부 | 적용 |
| `apps/web/src/app/(main)/my/listings/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/matches/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/team-matches/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/teams/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/lessons/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/lesson-tickets/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/reviews-received/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/my/mercenary/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/settings/account/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/settings/notifications/page.tsx` | inline | 적용 |
| `apps/web/src/app/(main)/chat/page.tsx` | 미적용 | 적용 |
| `apps/web/src/app/(main)/chat/[id]/page.tsx` | 미적용 | 적용 |
| `apps/web/src/app/(main)/notifications/page.tsx` (있다면) | inline | 적용 |

### Refactoring pattern

**Before:**
```tsx
export default function Page() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);
  if (!isAuthenticated) return null;
  // ...
}
```

**After:**
```tsx
export default function Page() {
  const { isAuthenticated } = useRequireAuth(); // redirect 자동 처리
  if (!isAuthenticated) return null;            // 렌더 가드
  // ...
}
```

### Redirect query 처리

`useRequireAuth` 는 이미 `?redirect=<pathname>` 를 붙여 `/login` 으로 보낸다.
`/login` 페이지 측에서 로그인 성공 후 `searchParams.get('redirect')` 가 있으면
`router.replace(redirect)`. 이 부분이 미구현이면 `apps/web/src/app/login/page.tsx`
도 함께 패치 (Tier 2).

### 검증

- `npx tsc --noEmit` 통과
- E2E: `/team-matches/new` 로그인 안 한 상태로 진입 → `/login?redirect=...` 리다이렉트
- 로그인 성공 시 원래 페이지로 복귀

---

## 7. Profile Page Restructure

### 현재 문제 (QA)

- “매치 히스토리” 와 “내가 만든 매치” 가 동일 페이지로 리다이렉트 (구분 안 됨)
- “내 용병 모집” 페이지에 만들기 버튼 누락
- 과거 / 진행중 구분 없음

### 라우트 설계

```
/(main)/my/
├── matches/                       # 참여한 일반 매치
│   ├── ?status=upcoming           # 진행 예정
│   ├── ?status=ongoing            # 진행중
│   └── ?status=past               # 과거
├── matches/created/               # 내가 만든(host) 매치 (status 탭 동일)
├── team-matches/                  # 참여한 팀매치
│   ├── ?status=upcoming
│   └── ?status=past
├── team-matches/created/          # 내 팀이 만든 팀매치
├── mercenary/                     # 내가 신청한 용병 모집
│   └── ?status=...
└── mercenary/created/             # 내가 만든 용병 모집 (+ "새 모집글" 버튼)
```

### Tab UI 패턴

상단 sticky 탭:

```tsx
<nav className="sticky top-0 z-10 flex border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
  {tabs.map((t) => (
    <Link
      key={t.value}
      href={`?status=${t.value}`}
      replace
      className={cn(
        'flex-1 min-h-[44px] px-4 py-3 text-sm font-medium text-center transition-colors',
        currentStatus === t.value
          ? 'text-blue-500 border-b-2 border-blue-500'
          : 'text-gray-500 dark:text-gray-400'
      )}
    >
      {t.label}
    </Link>
  ))}
</nav>
```

`/my/mercenary/created` 페이지의 헤더 우측에:

```tsx
<Link href="/mercenary/new" className="...">+ 새 모집글</Link>
```

### 백엔드 API 추가

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/users/me/matches?role=participant&status=upcoming\|ongoing\|past` | 사용자가 참가한 매치 |
| GET | `/api/v1/users/me/matches?role=host&status=...` | 사용자가 호스트한 매치 |
| GET | `/api/v1/users/me/team-matches?role=participant\|host&status=...` | 팀매치 |
| GET | `/api/v1/users/me/mercenary-applications?status=...` | 신청한 용병 |
| GET | `/api/v1/users/me/mercenary-posts?status=...` | 작성한 용병 모집 |

**Status 매핑.**
- `upcoming`: `matchDate > today`
- `ongoing`: `matchDate == today` AND status in (`recruiting`, `full`, `in_progress`)
- `past`: `matchDate < today` OR status in (`completed`, `cancelled`)

### 마이그레이션 영향

스키마 변경 없음. 서비스 레이어에 위 5개 메서드만 추가하면 됨.

---

## Appendix A: 작업 의존 그래프

```
[Prisma 스키마 변경]
   ├── MercenaryPost / MercenaryApplication
   ├── TeamMembership / TeamJoinRequest (+ ownerId backfill)
   └── ChatRoom / ChatParticipant / ChatMessage (Phase 3)
        │
        ▼
[Backend 서비스]
   ├── TeamMembershipService + Guard
   ├── team-matches DTO 적용
   ├── MercenaryService → Prisma 전환
   ├── 5개 새 사용자 페이지용 endpoint
   └── ChatGateway / NotificationGateway 확장
        │
        ▼
[Frontend]
   ├── useRequireAuth 전수 적용
   ├── Profile 라우트 재구성 (탭 + 새 라우트)
   ├── Mercenary "새 모집글" 버튼
   ├── chat-store / notification-store mock 제거 → WebSocket hooks
   └── 신청 현황 페이지 (호스트/신청자 양방향)
```

## Appendix B: 검증 게이트

| Layer | Command |
|-------|---------|
| Backend | `cd apps/api && pnpm prisma generate && pnpm build && pnpm test` |
| Frontend | `cd apps/web && npx tsc --noEmit && pnpm lint && pnpm test` |
| E2E | `npx playwright test` (smoke: 로그인 가드, 신청 → 승인 흐름) |

## Appendix C: 향후 고려 사항 (Out of scope)

- 채팅 메시지 검색 / 첨부 파일
- 알림 카테고리별 ON/OFF 설정 (이미 settings/notifications 페이지 존재 — 백엔드 연동 필요)
- TeamMembership 의 audit log (누가 누구를 promote 했는지)
- 용병 모집글에 대한 후기 시스템 (현재는 매치 후기 모델만 존재)
