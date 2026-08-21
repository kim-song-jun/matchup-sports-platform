# 팀 간 컨택 메시지 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀장/운영진이 팀 상세 화면에서 다른 팀에 목적이 담긴 컨택 요청을 보내고, 상대 팀 운영진이 수락하면 운영진 전용 채팅방이 열리는 흐름을 완성한다.

**Architecture:** 신규 `V1TeamContact` 모델이 요청의 생애주기(requested/accepted/declined/withdrawn/expired)를 담고, 수락 후 대화는 기존 `V1ChatRoom`에 4번째 링크 컬럼(`teamContactId`)을 추가해 기존 채팅 파이프라인을 그대로 탄다. 채팅 도메인을 새로 만들지 않는다. 중복 요청과 채팅방 파편화는 `pg_advisory_xact_lock`으로 막는다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Next.js App Router + TanStack Query (apps/v1_web), Jest (unit: Prisma 전체 mock / integration: 실 DB)

**Spec:** `docs/superpowers/specs/2026-08-20-team-contact-message-design.md`

---

## Global Constraints

- **대상 스택은 `apps/v1_api` / `apps/v1_web`이다.** `apps/api` / `apps/web`은 구버전이며 이 작업에서 절대 건드리지 않는다.
- **브랜치**: 최신 `origin/dev`에서 만든 worktree 안에서 작업하고, base=`dev` PR로만 반영한다. `dev → main` 승격은 사용자만 한다.
- **커밋은 내가 만든 파일만 pathspec으로.** `git add -A` / `git commit -a` 금지. 커밋 직후 `git show --stat HEAD`로 휩쓸린 파일이 없는지 확인한다.
- **`git stash` 절대 금지** (공유 작업트리 — 다른 세션의 미커밋 변경이 사라진다).
- **에러 던지기**: 공용 헬퍼가 없다. NestJS 내장 예외 생성자에 `{ code: 'DOMAIN_CODE', message: '...' }` 객체를 넘긴다. `stateConflict(message, code)` / `validationError(message, field)`는 **파일 로컬 함수**로 4개 서비스에 각각 중복 정의돼 있다 — 새 서비스도 자기 파일에 로컬 정의를 둔다.
- **에러 코드**: `SCREAMING_SNAKE_CASE`. 도메인 특화면 리소스명 접두어(`TEAM_CONTACT_ALREADY_ACTIVE`), 범용이면 짧게(`PERMISSION_DENIED`).
- **숫자 기본값은 `??`**, `||` 금지 (0이 falsy로 먹힌다).
- **cursor 페이지네이션**: `take: limit + 1` → `hasNext` 판정, `...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})`, 응답은 `{ items, pageInfo: { nextCursor, hasNext } }`.
- **DTO 숫자 쿼리 파라미터**에는 `@Type(() => Number)` 필수 (안 붙이면 `@IsInt()`가 문자열에 대해 실패).
- **UI 문구는 한국어 해요체.** 에러 메시지 추출은 `extractErrorMessage` (`apps/v1_web/src/lib/error-message.ts`), 에러 종류 분기는 메시지 문자열이 아니라 `extractErrorCode`의 code 값으로.
- **디자인**: Tailwind 토큰 우선(하드코딩 색/간격 금지), 다크모드 필수, 터치 타겟 `min-h-[44px]`, WCAG 2.1 AA, 컬러만으로 상태 전달 금지(상태 뱃지는 색 + 텍스트/아이콘 병기).
- **유닛 테스트는 Prisma를 전체 `jest.fn()` mock으로 다룬다.** 실 DB는 `test/` 아래 `*.integration-spec.ts`만 쓴다.
- **테스트 컨벤션**: mock이 무엇으로 호출됐는지만 확인하는 테스트는 쓰지 않는다. 관측 가능한 동작(던져진 예외의 code, 반환 shape, 부수효과 미발생)을 단언한다.
- **단일 유닛 테스트 실행**: `cd apps/v1_api && npx jest --selectProjects unit <path>`
- **단일 통합 테스트 실행**: `cd apps/v1_api && npx jest --selectProjects integration --runInBand <path>` (DATABASE_URL의 DB명이 `v1_migrate_check` 또는 `ulw_v1_integration_`로 시작해야 함 — 아니면 즉시 throw)

---

## File Structure

### 신규 (apps/v1_api)

| 파일 | 책임 |
|---|---|
| `src/team-contacts/team-contacts.module.ts` | 모듈 등록 |
| `src/team-contacts/team-contacts.controller.ts` | 라우팅만. 로직 없음 |
| `src/team-contacts/team-contacts.service.ts` | 발신/수락/거절/철회/목록/상세 + 권한·가드 |
| `src/team-contacts/dto/team-contact.dto.ts` | 요청 DTO 4종 |
| `src/team-contacts/team-contacts.service.spec.ts` | 유닛 (Prisma mock) |
| `test/team-contacts/team-contact-flow.integration-spec.ts` | 통합 (실 DB) |

### 수정 (apps/v1_api)

| 파일 | 무엇을 |
|---|---|
| `prisma/schema.prisma` | 모델 2 + enum 2 + 기존 3모델 확장 |
| `prisma/migrations/<new>/migration.sql` | 위의 additive 마이그레이션 |
| `test/fixtures/game-schema.fixture.ts` | SOURCE_SNAPSHOT 해시 재핀 + 사유 주석 |
| `src/chat/chat-entitlement.ts` | fall-through 닫기 + 4번째 분기 |
| `src/chat/chat.service.ts` | resolve/rooms/roomInclude/getRoomType/getRoomTitle/getLinkedTarget/assert*/resolve*Room |
| `src/chat/dto/chat.dto.ts` | `@IsIn`에 `'team_contact'` ×2 |
| `src/notifications/notifications.service.ts` | 이벤트 3종을 6곳에 |
| `src/app.module.ts` | `TeamContactsModule` 등록 |
| `jest.config.ts` | integration `testMatch`에 `test/team-contacts/**` 글롭 등록 |

### 신규·수정 (apps/v1_web)

| 파일 | 무엇을 |
|---|---|
| `src/lib/team-role.ts` (신규) | `isTeamOperatorRole` 공유 유틸 |
| `src/components/teams/teams-client.tsx` | 로컬 `isTeamOperatorRole` 제거 → import |
| `src/components/my/my-api-clients.tsx` | 동일 |
| `src/hooks/use-v1-api.ts` | 컨택 훅 6종 |
| `src/lib/query-keys.ts` | `v1Keys.teamContacts*` |
| `src/components/teams/teams-page.tsx` | 팀 상세 컨택 CTA |
| `src/app/teams/[teamId]/contact/new/page.tsx` (신규) | 작성 화면 라우트 |
| `src/components/teams/team-contact-new-client.tsx` (신규) | 작성 화면 UI |
| `src/app/my/team-contacts/page.tsx` + `[contactId]/page.tsx` (신규) | 컨택함 라우트 |
| `src/components/my/my-team-contacts-client.tsx` (신규) | 컨택함 UI |

---

## Task 순서의 이유

**Task 1이 반드시 먼저다.** `currentChatRecipientEntitlementWhere`의 fall-through를 닫지 않은 채 4번째 방 종류를 추가하면, 컨택 채팅의 알림 수신자가 예외 없이 0명이 된다(에러가 안 나서 발견이 늦다). Task 1은 기존 동작을 바꾸지 않는 순수 방어 작업이므로 단독으로 머지 가능하다.

**Task 2(스키마)를 한 번에 끝낸다.** `SOURCE_SNAPSHOT_DRIFT` 게이트가 `schema.prisma` 전체 바이트를 해시하므로, Phase 2·3에서 쓸 컬럼까지 이번에 전부 넣어 재핀 비용을 1회로 만든다.

---

### Task 1: 채팅 수신자 자격 fall-through 닫기

기존 동작을 바꾸지 않는 방어 작업. 이후 모든 Task의 전제다.

**Files:**
- Modify: `apps/v1_api/src/chat/chat-entitlement.ts`
- Test: `apps/v1_api/src/chat/chat-entitlement.spec.ts` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `currentChatRecipientEntitlementWhere(room: ChatEntitlementRoom)` 가 `room.teamMatchId`가 없으면 `Error`를 던진다. 시그니처는 그대로.

- [ ] **Step 1: 현재 동작을 고정하는 실패 테스트를 쓴다**

`apps/v1_api/src/chat/chat-entitlement.spec.ts` 를 새로 만든다:

```ts
import { currentChatRecipientEntitlementWhere } from './chat-entitlement';

describe('currentChatRecipientEntitlementWhere', () => {
  it('match 방이면 match 참가자로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: 'm1',
      teamId: null,
      teamMatchId: null,
      teamMatch: null,
    });
    expect(where.user?.matchParticipants?.some?.matchId).toBe('m1');
  });

  it('team 방이면 팀 멤버십으로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null,
      teamId: 't1',
      teamMatchId: null,
      teamMatch: null,
    });
    expect(where.user?.teamMemberships?.some?.teamId).toBe('t1');
  });

  it('team_match 방이면 양 팀의 owner/manager 로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null,
      teamId: null,
      teamMatchId: 'tm1',
      teamMatch: { hostTeamId: 'host', approvedApplicantTeamId: 'guest' },
    });
    const some = where.user?.teamMemberships?.some;
    expect(some?.teamId).toEqual({ in: ['host', 'guest'] });
    expect(some?.role).toEqual({ in: ['owner', 'manager'] });
  });

  // 이 테스트가 이 태스크의 존재 이유다.
  // 지금은 링크가 하나도 없는 방이 조용히 team_match 분기로 떨어져
  // teamId: { in: [] } 를 만든다 — 수신자 0명, 예외 없음. 알림이 소리 없이 사라진다.
  it('알려진 링크가 없는 방이면 조용히 빈 대상을 만들지 않고 실패한다', () => {
    expect(() =>
      currentChatRecipientEntitlementWhere({
        matchId: null,
        teamId: null,
        teamMatchId: null,
        teamMatch: null,
      }),
    ).toThrow(/not linked/i);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 마지막 케이스가 실패하는 것을 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/chat/chat-entitlement.spec.ts
```

Expected: 앞 3개 PASS, 마지막 1개 FAIL — 예외가 안 던져지고 `{ user: { teamMemberships: { some: { teamId: { in: [] }, ... } } } }` 가 반환된다.

- [ ] **Step 3: fall-through 를 명시적 가드로 바꾼다**

`chat-entitlement.ts` 의 `currentChatRecipientEntitlementWhere` 말미를 교체한다. 기존:

```ts
  const teamIds = [room.teamMatch?.hostTeamId, room.teamMatch?.approvedApplicantTeamId].filter(
    (teamId): teamId is string => Boolean(teamId),
  );
  return {
    user: {
      teamMemberships: {
        some: {
          teamId: { in: teamIds },
          status: 'active',
          role: { in: [...managerRoles] },
        },
      },
    },
  };
```

새 코드:

```ts
  if (room.teamMatchId) {
    const teamIds = [room.teamMatch?.hostTeamId, room.teamMatch?.approvedApplicantTeamId].filter(
      (teamId): teamId is string => Boolean(teamId),
    );
    return {
      user: {
        teamMemberships: {
          some: {
            teamId: { in: teamIds },
            status: 'active',
            role: { in: [...managerRoles] },
          },
        },
      },
    };
  }
  // 여기 도달했다는 것은 이 함수가 모르는 방 종류가 생겼다는 뜻이다.
  // 예전에는 이 자리가 team_match 로 흘러내려 teamId: { in: [] } 를 만들었고,
  // 그 결과 알림 수신자가 예외 없이 0명이 됐다. 조용히 틀리느니 크게 실패한다.
  throw new Error('Chat room is not linked to a known target type');
```

- [ ] **Step 4: 테스트를 돌려 4개 모두 통과하는지 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/chat/chat-entitlement.spec.ts
```

Expected: 4 passed

- [ ] **Step 5: 기존 채팅 테스트가 깨지지 않았는지 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/chat
```

Expected: 전부 PASS. 하나라도 깨지면 실제 코드에 링크 없는 방을 만드는 경로가 있다는 뜻이므로 **멈추고 보고한다.**

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/src/chat/chat-entitlement.ts apps/v1_api/src/chat/chat-entitlement.spec.ts
git commit -m "fix(v1-chat): 알 수 없는 방 종류에서 수신자 자격이 조용히 비는 문제 방지"
git show --stat HEAD
```

`git show --stat HEAD` 출력에 위 2개 파일만 있는지 확인한다.

---

### Task 2: Prisma 스키마 + 마이그레이션 + SOURCE_SNAPSHOT 재핀

Phase 1~3에서 쓸 스키마를 한 번에 넣는다. 재핀 비용을 1회로 만들기 위함이다.

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/<timestamp>_v1_team_contacts/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`

**Interfaces:**
- Consumes: 없음
- Produces: Prisma 클라이언트에 `prisma.v1TeamContact`, `prisma.v1TeamContactBlock` 가 생기고, `V1ChatRoom.teamContactId`, `V1Team.contactPolicy` 를 쓸 수 있게 된다. enum 값: `V1TeamContactStatus = requested|accepted|declined|withdrawn|expired`, `V1TeamContactPolicy = open|recruiting_only|closed`.

- [ ] **Step 1: 스키마를 수정한다**

`apps/v1_api/prisma/schema.prisma` 에 enum 2개와 모델 2개를 추가한다. 위치는 기존 팀 관련 enum/모델 근처로 한다. 내용은 **스펙 §5를 그대로** 옮긴다 (`docs/superpowers/specs/2026-08-20-team-contact-message-design.md` §5의 코드 블록 전체).

이어서 기존 3개를 확장한다:

```prisma
// model V1ChatRoom 안, 기존 matchId/teamId/teamMatchId 옆
  teamContactId String?        @unique @map("team_contact_id")
  teamContact   V1TeamContact? @relation(fields: [teamContactId], references: [id], onDelete: Cascade)
```

```prisma
// model V1Team 안, joinPolicy 근처
  contactPolicy V1TeamContactPolicy @default(open) @map("contact_policy")

  contactRequestsSent     V1TeamContact[]      @relation("V1TeamContactFromTeam")
  contactRequestsReceived V1TeamContact[]      @relation("V1TeamContactToTeam")
  contactBlocksMade       V1TeamContactBlock[] @relation("V1TeamContactBlockOwner")
  contactBlocksReceived   V1TeamContactBlock[] @relation("V1TeamContactBlockTarget")
```

```prisma
// enum V1InquiryRelatedType 에 값 1개 추가 (Phase 2에서 신고 연결에 쓴다)
  team_contact
```

`model V1User` 에도 역관계 4개를 추가한다 (`V1TeamContactRequestedBy`, `V1TeamContactRespondedBy`, 그리고 `V1TeamContactBlock.createdByUser` 의 역관계).

- [ ] **Step 2: 마이그레이션 SQL 을 만든다 — DB 도 Prisma 클라이언트도 건드리지 않고**

> **`prisma migrate dev` 를 쓰지 않는다.** 그 명령은 내부적으로 `prisma generate` 를 돌리는데,
> 생성물이 worktree 로컬이 아니라 `node_modules/.pnpm/@prisma+client@<ver>/node_modules/.prisma/client`
> — **모노레포 전체가 공유하는 경로** 에 쓰인다 (worktree 의 `node_modules` 는 메인 트리 심링크).
> 같은 스키마를 보는 다른 세션의 클라이언트가 내 버전으로 덮여 그쪽 tsc·테스트가 갑자기 깨진다.

**스키마-대-스키마 diff 를 쓴다 — DB 가 전혀 필요 없다.** `--from-migrations` 는 shadow DB 를
요구하지만, 두 입력을 모두 *스키마 파일* 로 주면 Prisma 가 파일만 읽고 SQL 을 만든다.
2026-08-20 에 이 저장소에서 실증했다: 같은 스키마끼리는 `-- This is an empty migration.`,
모델을 하나 추가한 사본과는 정확한 `CREATE TABLE` SQL 이 나왔다. DB 접속도 client 생성도 없었다.

```bash
cd apps/v1_api
# 1) 변경 전 스키마를 git 에서 꺼내 scratchpad 에 둔다 (소스 트리에 두지 않는다 — 커밋에 섞인다)
git show HEAD:apps/v1_api/prisma/schema.prisma > <scratchpad>/base-schema.prisma

# 2) 스키마를 수정한다 (Step 1)

# 3) 두 파일을 비교해 SQL 을 만든다
MIG=prisma/migrations/$(date +%Y%m%d%H%M%S)_v1_team_contacts
mkdir -p "$MIG"
./node_modules/.bin/prisma migrate diff \
  --from-schema-datamodel <scratchpad>/base-schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIG/migration.sql"
```

> **잔여 위험**: 이 방식은 *마이그레이션 체인* 이 아니라 *HEAD 의 schema.prisma* 를 기준으로 비교한다.
> 만약 dev 의 체인과 schema.prisma 가 이미 어긋나 있다면 그 드리프트는 여기서 안 보인다.
> 다만 CI 의 "V1 migration replay + drift gate" 가 dev 에 대해 드리프트 0 을 강제하고 있으므로
> HEAD 는 일치한다고 봐도 된다. 이 전제가 깨지면 CI 가 red 로 알려준다.

생성된 `migration.sql` 을 열어 **순수 additive 인지** 확인한다. `DROP` / `ALTER COLUMN ... TYPE` /
기존 테이블에 대한 `NOT NULL` 추가가 있으면 멈추고 보고한다.
`ALTER TYPE "V1InquiryRelatedType" ADD VALUE 'team_contact';` 는 정상이다.

- [ ] **Step 3: 드리프트 0 을 DB 를 건드리지 않고 확인한다**

> **`prisma migrate reset` 을 쓰지 않는다.** 로컬 개발 DB 를 통째로 비우는데, 이 머신은
> worktree 20개 이상이 같은 개발 DB 를 공유한다 — 다른 세션의 작업 데이터가 사라진다.

생성한 SQL 이 스키마 변경을 빠짐없이 담았는지 확인한다. 방법: SQL 안에 스키마에 넣은
테이블·컬럼·enum 이 전부 나타나는지 대조한다.

```bash
cd apps/v1_api
MIG=$(ls -d prisma/migrations/*_v1_team_contacts)
for token in v1_team_contacts v1_team_contact_blocks team_contact_id contact_policy \
             V1TeamContactStatus V1TeamContactPolicy team_contact; do
  printf '%-24s %s\n' "$token" "$(grep -c "$token" "$MIG/migration.sql")"
done
```

Expected: 전부 1 이상. 0 인 항목이 있으면 Step 1 의 스키마 수정이 빠졌거나 diff 가 못 잡은 것이다.

**빈 DB 전체 체인 재생은 CI 가 한다** — test job 의 "V1 migration replay + drift gate" 가
빈 DB 에 `migrate deploy` 를 돌리고 드리프트 0 을 검증한다. 로컬에서 재현하지 않는다.

- [ ] **Step 4: SOURCE_SNAPSHOT 해시를 재핀한다**

```bash
shasum -a 256 apps/v1_api/prisma/schema.prisma
```

출력된 해시로 `apps/v1_api/test/fixtures/game-schema.fixture.ts` 의 `gameSchemaSourceManifest.schema` 값을 교체한다. `.migration` 값은 **건드리지 않는다** — 바인딩된 `20260729000100_v1_game_operations/migration.sql` 을 수정하지 않았기 때문이다.

같은 파일에 사유 주석을 남긴다 (기존 재핀 주석들과 같은 형식):

```ts
// 2026-08-20 재핀: 팀 간 컨택 메시지(Phase 1) 스키마를 추가하면서 schema.prisma 가 바뀌었다.
// 추가한 것: enum V1TeamContactStatus / V1TeamContactPolicy, model V1TeamContact /
// V1TeamContactBlock, V1ChatRoom.teamContactId, V1Team.contactPolicy,
// V1InquiryRelatedType.team_contact — 전부 additive 이고 game domain(V1Game*) 은 건드리지 않았다.
// 이 guard 가 발동한 것은 schema.prisma 파일 전체 바이트를 결속하기 때문이며, game 도메인
// 변경 때문이 아니다. 뒷받침 마이그레이션: prisma/migrations/<timestamp>_v1_team_contacts.
// 바인딩된 20260729000100_v1_game_operations 는 그대로이므로 .migration 해시는 바뀌지 않았다.
```

- [ ] **Step 5: 스냅샷 해시가 맞는지 확인한다**

해시 비교는 파일 두 개를 읽는 일이므로 DB 없이 확인할 수 있다:

```bash
shasum -a 256 apps/v1_api/prisma/schema.prisma
grep -A3 "gameSchemaSourceManifest" apps/v1_api/test/fixtures/game-schema.fixture.ts
```

두 값이 같아야 한다. 다르면 `shasum` 결과로 fixture 를 다시 고친다.

통합 스펙(`test/games/game-schema.integration-spec.ts`)은 DB 가 필요하므로 **CI 에 맡긴다.**
로컬에서 돌리려면 `DATABASE_URL` 이 `v1_migrate_check` 또는 `ulw_v1_integration_` 로 시작하는
전용 DB 여야 한다(아니면 즉시 throw) — 공유 개발 DB 로는 돌리지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations apps/v1_api/test/fixtures/game-schema.fixture.ts
git commit -m "feat(v1-team-contacts): 팀 간 컨택 스키마 추가 및 소스 스냅샷 재핀"
git show --stat HEAD
```

---

### Task 3: 컨택 발신 — advisory lock 중복 방지 + 일일 한도

**Files:**
- Create: `apps/v1_api/src/team-contacts/team-contacts.service.ts`
- Create: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `prisma.v1TeamContact`
- Produces:
  - `TeamContactsService.create(user: V1AuthUser, toTeamId: string, dto: CreateTeamContactDto): Promise<V1TeamContact>`
  - `private assertCanManageTeam(userId: string, teamId: string): Promise<{ id: string }>`
  - 상수 `DAILY_SEND_LIMIT = 10`, `EXPIRY_DAYS = 7`
  - 파일 로컬 `stateConflict(message: string, code?: string): ConflictException`

- [ ] **Step 1: 실패 테스트를 쓴다**

`apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`:

```ts
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TeamContactsService } from './team-contacts.service';

// 이 레포의 유닛 테스트 관례: Prisma 는 전체 jest.fn() mock. 실 DB 를 쓰지 않는다.
function makePrisma() {
  const prisma: any = {
    v1TeamMembership: { findFirst: jest.fn() },
    v1TeamContact: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    $executeRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn().mockImplementation((cb: any) => cb(prisma));
  return prisma;
}

const actor = { id: 'u1', email: 'u1@t.example.test', accountStatus: 'active', onboardingStatus: 'completed' } as any;
const dto = { fromTeamId: 'A', message: '주말 경기 가능하실까요?' };

describe('TeamContactsService.create', () => {
  it('보내는 팀의 owner/manager 가 아니면 PERMISSION_DENIED 로 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    // 권한이 없으면 생성 시도조차 하지 않는다
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('자기 팀에는 보낼 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'A', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_SELF_NOT_ALLOWED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('같은 팀쌍에 이미 진행 중인 컨택이 있으면 새로 만들지 않고 기존 건을 알려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'existing', status: 'accepted' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: {
        code: 'TEAM_CONTACT_ALREADY_ACTIVE',
        details: { existingContactId: 'existing', existingStatus: 'accepted' },
      },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('중복 확인은 방향과 무관하게 본다 — 상대가 우리에게 보낸 건이 있어도 막는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'inbound', status: 'requested' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toBeInstanceOf(ConflictException);

    // 양방향으로 조회했는지 — where 에 OR 두 방향이 다 들어있어야 한다
    const where = prisma.v1TeamContact.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromTeamId: 'A', toTeamId: 'B' }),
        expect.objectContaining({ fromTeamId: 'B', toTeamId: 'A' }),
      ]),
    );
    expect(where.status).toEqual({ in: ['requested', 'accepted'] });
  });

  it('24시간 내 발송이 한도에 닿으면 거부한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(10);
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('한도 직전(9건)이면 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(9);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested' });
    const service = new TeamContactsService(prisma);

    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
  });

  it('생성 전에 팀쌍 advisory lock 을 먼저 잡는다 — 순서가 뒤바뀌면 동시 요청이 둘 다 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', status: 'requested' });
    const service = new TeamContactsService(prisma);

    const order: string[] = [];
    prisma.$executeRaw.mockImplementation(() => { order.push('lock'); return Promise.resolve(1); });
    prisma.v1TeamContact.findFirst.mockImplementation(() => { order.push('dupCheck'); return Promise.resolve(null); });

    await service.create(actor, 'B', dto);
    expect(order[0]).toBe('lock');
    expect(order).toContain('dupCheck');
  });

  it('락 키는 팀 id 를 정렬해서 만든다 — A→B 와 B→A 가 같은 락을 잡아야 한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new' });
    const service = new TeamContactsService(prisma);

    await service.create(actor, 'zzz', { fromTeamId: 'aaa', message: 'hi there' });
    const forward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);
    prisma.$executeRaw.mockClear();

    await service.create(actor, 'aaa', { fromTeamId: 'zzz', message: 'hi there' });
    const backward = JSON.stringify(prisma.$executeRaw.mock.calls[0]);

    expect(forward).toBe(backward);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 전부 실패하는 것을 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: FAIL — `Cannot find module './team-contacts.service'`

- [ ] **Step 3: 서비스를 구현한다**

`apps/v1_api/src/team-contacts/team-contacts.service.ts`:

```ts
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamContactDto } from './dto/team-contact.dto';

/** 한 팀이 24시간 동안 보낼 수 있는 컨택 수. 확정값 — 스펙 §2. */
const DAILY_SEND_LIMIT = 10;
/** 무응답 컨택이 만료되기까지의 일수. 확정값 — 스펙 §6. */
const EXPIRY_DAYS = 7;
/** 새 컨택을 막는 "진행 중" 상태들. accepted 를 포함해야 채팅방 파편화를 막는다. */
const ACTIVE_STATUSES = ['requested', 'accepted'] as const;

// 이 레포는 공용 에러 헬퍼를 두지 않고 파일마다 로컬로 중복 정의한다
// (chat/matches/team-matches/teams 4개 서비스가 각각 같은 함수를 갖고 있다).
function stateConflict(message: string, code = 'STATE_CONFLICT', details?: unknown) {
  return new ConflictException({ code, message, details });
}

@Injectable()
export class TeamContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: V1AuthUser, toTeamId: string, dto: CreateTeamContactDto) {
    await this.assertCanManageTeam(user.id, dto.fromTeamId);

    if (dto.fromTeamId === toTeamId) {
      throw stateConflict('같은 팀에는 컨택을 보낼 수 없어요.', 'TEAM_CONTACT_SELF_NOT_ALLOWED');
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // 락 키의 팀 id 를 정렬한다. A→B 와 B→A 가 같은 락을 잡아야 양방향 중복 검사가
      // 실제로 상호배제된다 — 정렬하지 않으면 두 방향이 서로 다른 락을 잡고 동시 통과한다.
      const [left, right] = [dto.fromTeamId, toTeamId].sort();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-contact:${left}:${right}`}, 0))`;

      const active = await tx.v1TeamContact.findFirst({
        where: {
          status: { in: [...ACTIVE_STATUSES] },
          OR: [
            { fromTeamId: dto.fromTeamId, toTeamId },
            { fromTeamId: toTeamId, toTeamId: dto.fromTeamId },
          ],
        },
        select: { id: true, status: true },
      });
      if (active) {
        throw stateConflict(
          '이미 이 팀과 진행 중인 컨택이 있어요.',
          'TEAM_CONTACT_ALREADY_ACTIVE',
          { existingContactId: active.id, existingStatus: active.status },
        );
      }

      const sentToday = await tx.v1TeamContact.count({
        where: { fromTeamId: dto.fromTeamId, createdAt: { gte: since } },
      });
      if (sentToday >= DAILY_SEND_LIMIT) {
        throw stateConflict(
          '오늘 보낼 수 있는 컨택을 모두 사용했어요. 내일 다시 시도해 주세요.',
          'TEAM_CONTACT_DAILY_LIMIT_EXCEEDED',
        );
      }

      return tx.v1TeamContact.create({
        data: {
          fromTeamId: dto.fromTeamId,
          toTeamId,
          requestedByUserId: user.id,
          message: dto.message,
          expiresAt,
        },
      });
    });
  }

  // team-matches.service.ts 의 동명 private 메서드와 같은 패턴이다.
  // 이 레포에는 공유 권한 서비스가 없고 각 서비스가 자기 파일 안에서 중복 구현한다.
  private async assertCanManageTeam(userId: string, teamId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 운영진만 컨택을 보낼 수 있어요.',
      });
    }
    return membership;
  }
}
```

`apps/v1_api/src/team-contacts/dto/team-contact.dto.ts` 도 이 시점에 만든다 (Task 8에서 나머지를 채운다):

```ts
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTeamContactDto {
  @IsUUID()
  fromTeamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;
}
```

- [ ] **Step 4: 테스트를 돌려 전부 통과하는지 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 8 passed

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/team-contacts
git commit -m "feat(v1-team-contacts): 컨택 발신 - 양방향 중복 방지와 일일 한도"
git show --stat HEAD
```

---

### Task 4: 수락 / 거절 / 철회 + 만료 lazy-flip

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts`
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`

**Interfaces:**
- Consumes: Task 3의 `TeamContactsService`, `stateConflict`, `assertCanManageTeam`
- Produces:
  - `accept(user, contactId): Promise<{ contact: V1TeamContact; alreadyProcessed: boolean }>`
  - `decline(user, contactId, dto: DeclineTeamContactDto): Promise<{ contact; alreadyProcessed: boolean }>`
  - `withdraw(user, contactId): Promise<{ contact; alreadyProcessed: boolean }>`
  - `private settleExpiry(contact: { id: string; status: string; expiresAt: Date }): Promise<string>` — 만료를 읽기 시점에 반영하고 DB 도 정리한다

- [ ] **Step 1: 실패 테스트를 쓴다**

`team-contacts.service.spec.ts` 에 이어 붙인다. `makePrisma()` 에 `update` 를 추가한다:

```ts
// makePrisma() 의 v1TeamContact 에 아래 두 개를 추가한다:
//   findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(),

describe('TeamContactsService 응답 처리', () => {
  const contact = {
    id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it('받는 팀 운영진이 수락하면 accepted 로 바뀐다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.update.mockResolvedValue({ ...contact, status: 'accepted' });
    const service = new TeamContactsService(prisma);

    const result = await service.accept(actor, 'c1');
    expect(result.contact.status).toBe('accepted');
    expect(result.alreadyProcessed).toBe(false);
  });

  it('이미 수락된 컨택을 다시 수락하면 멱등하게 통과하고 다시 쓰지 않는다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    const result = await service.accept(actor, 'c1');
    expect(result.alreadyProcessed).toBe(true);
    expect(prisma.v1TeamContact.update).not.toHaveBeenCalled();
  });

  it('거절된 컨택은 수락할 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({ ...contact, status: 'declined' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT' },
    });
  });

  it('보낸 팀 운영진은 수락할 수 없다 — 수락 권한은 받는 팀에만 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    // 'B'(받는 팀) 멤버십 조회는 실패해야 한다
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

    await expect(service.accept(actor, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    const where = prisma.v1TeamMembership.findFirst.mock.calls[0][0].where;
    expect(where.teamId).toBe('B');
  });

  it('철회는 보낸 팀 운영진만 할 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.update.mockResolvedValue({ ...contact, status: 'withdrawn' });
    const service = new TeamContactsService(prisma);

    const result = await service.withdraw(actor, 'c1');
    expect(result.contact.status).toBe('withdrawn');
    // 보낸 팀('A') 기준으로 권한을 봤는지
    expect(prisma.v1TeamMembership.findFirst.mock.calls[0][0].where.teamId).toBe('A');
  });

  // 만료: 이 레포에는 cron 인프라(@nestjs/schedule)가 0건이므로 배치가 아니라 읽기 시점에 처리한다
  it('만료 시각이 지난 requested 컨택은 수락할 수 없고 expired 로 간주한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      ...contact,
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.accept(actor, 'c1')).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_STATE_CONFLICT' },
    });
  });

  it('만료된 컨택을 읽으면 DB 상태도 expired 로 정리한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      ...contact,
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await service.accept(actor, 'c1').catch(() => undefined);
    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'c1', status: 'requested' }),
        data: { status: 'expired' },
      }),
    );
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 새 7개 FAIL (`service.accept is not a function` 등), 기존 8개는 PASS

- [ ] **Step 3: 구현한다**

`team-contacts.service.ts` 에 추가:

```ts
  async accept(user: V1AuthUser, contactId: string) {
    return this.respond(user, contactId, 'toTeamId', 'accepted');
  }

  async decline(user: V1AuthUser, contactId: string, dto: DeclineTeamContactDto) {
    return this.respond(user, contactId, 'toTeamId', 'declined', dto.reason ?? null);
  }

  async withdraw(user: V1AuthUser, contactId: string) {
    return this.respond(user, contactId, 'fromTeamId', 'withdrawn');
  }

  private async respond(
    user: V1AuthUser,
    contactId: string,
    actorSide: 'fromTeamId' | 'toTeamId',
    nextStatus: 'accepted' | 'declined' | 'withdrawn',
    declineReason: string | null = null,
  ) {
    const contact = await this.prisma.v1TeamContact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
    }
    await this.assertCanManageTeam(user.id, contact[actorSide]);

    const status = await this.settleExpiry(contact);

    // 멱등: 이미 목표 상태면 아무것도 쓰지 않고 그대로 돌려준다
    if (status === nextStatus) {
      return { contact, alreadyProcessed: true };
    }
    if (status !== 'requested') {
      throw stateConflict(
        '이미 처리된 컨택이에요.',
        'TEAM_CONTACT_STATE_CONFLICT',
        { currentStatus: status },
      );
    }

    const updated = await this.prisma.v1TeamContact.update({
      where: { id: contactId },
      data: {
        status: nextStatus,
        respondedByUserId: user.id,
        respondedAt: new Date(),
        declineReason,
      },
    });
    return { contact: updated, alreadyProcessed: false };
  }

  /**
   * 만료를 읽기 시점에 반영한다. 이 레포에는 cron 인프라(@nestjs/schedule)가 없어
   * 배치로 돌릴 수 없다 — team-matches 의 getApiStatus() 와 같은 lazy-flip 방식이다.
   * 판정과 DB 정리를 한 곳에 모아, 목록 조회와 상태 전이가 서로 다른 답을 내지 않게 한다.
   */
  private async settleExpiry(contact: { id: string; status: string; expiresAt: Date }) {
    if (contact.status !== 'requested' || contact.expiresAt > new Date()) {
      return contact.status;
    }
    // status 를 where 에 넣어 동시에 수락된 건을 덮어쓰지 않게 한다
    await this.prisma.v1TeamContact.updateMany({
      where: { id: contact.id, status: 'requested', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    return 'expired';
  }
```

import 에 `NotFoundException` 을, dto 파일에 `DeclineTeamContactDto` 를 추가한다:

```ts
export class DeclineTeamContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
```

- [ ] **Step 4: 테스트를 돌린다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 15 passed

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/team-contacts
git commit -m "feat(v1-team-contacts): 수락/거절/철회와 읽기 시점 만료 처리"
git show --stat HEAD
```

---

### Task 5: 컨택 목록 / 상세 (cursor 페이지네이션)

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts`
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`
- Modify: `apps/v1_api/src/team-contacts/dto/team-contact.dto.ts`

**Interfaces:**
- Consumes: Task 4의 `settleExpiry`, `assertCanManageTeam`
- Produces:
  - `listForTeam(user, teamId, query: ListTeamContactsQueryDto): Promise<{ items: TeamContactListItem[]; pageInfo: { nextCursor: string | null; hasNext: boolean } }>`
  - `detail(user, contactId): Promise<TeamContactDetail>`
  - `ListTeamContactsQueryDto { direction?: 'inbound'|'outbound'; status?: string; cursor?: string; limit?: number }`

- [ ] **Step 1: 실패 테스트를 쓴다**

```ts
describe('TeamContactsService.listForTeam', () => {
  it('inbound 는 받은 것만, outbound 는 보낸 것만 조회한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findMany.mockResolvedValue([]);
    const service = new TeamContactsService(prisma);

    await service.listForTeam(actor, 'B', { direction: 'inbound' });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].where).toMatchObject({ toTeamId: 'B' });

    prisma.v1TeamContact.findMany.mockClear();
    await service.listForTeam(actor, 'B', { direction: 'outbound' });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].where).toMatchObject({ fromTeamId: 'B' });
  });

  it('limit+1 을 가져와 hasNext 를 판정하고 초과분은 잘라낸다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`, status: 'requested', expiresAt: new Date(Date.now() + 86_400_000),
      fromTeamId: 'A', toTeamId: 'B', message: 'hi', createdAt: new Date(),
    }));
    prisma.v1TeamContact.findMany.mockResolvedValue(rows);
    const service = new TeamContactsService(prisma);

    const result = await service.listForTeam(actor, 'B', { direction: 'inbound', limit: 2 });
    expect(prisma.v1TeamContact.findMany.mock.calls[0][0].take).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo.hasNext).toBe(true);
    expect(result.pageInfo.nextCursor).toBe('c1');
  });

  it('만료 시각이 지난 requested 항목은 목록에서도 expired 로 보인다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findMany.mockResolvedValue([{
      id: 'c1', status: 'requested', expiresAt: new Date(Date.now() - 1000),
      fromTeamId: 'A', toTeamId: 'B', message: 'hi', createdAt: new Date(),
    }]);
    const service = new TeamContactsService(prisma);

    const result = await service.listForTeam(actor, 'B', { direction: 'inbound' });
    expect(result.items[0].status).toBe('expired');
  });

  it('상세는 보낸 팀 운영진도 볼 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000), message: 'hi', createdAt: new Date(),
    });
    // 받는 팀('B') 조회는 실패, 보낸 팀('A') 조회는 성공
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'm1' });
    const service = new TeamContactsService(prisma);

    await expect(service.detail(actor, 'c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('양쪽 어디에도 속하지 않으면 상세를 볼 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000), message: 'hi', createdAt: new Date(),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma);

    await expect(service.detail(actor, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

`makePrisma()` 의 `v1TeamContact` 에 `findMany: jest.fn()` 을 추가한다.

- [ ] **Step 2: 실패 확인**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 새 5개 FAIL

- [ ] **Step 3: 구현한다**

`team-contacts.service.ts` 에 추가:

```ts
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

  async listForTeam(user: V1AuthUser, teamId: string, query: ListTeamContactsQueryDto) {
    await this.assertCanManageTeam(user.id, teamId);
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const rows = await this.prisma.v1TeamContact.findMany({
      where: {
        ...(query.direction === 'outbound' ? { fromTeamId: teamId } : { toTeamId: teamId }),
        ...(query.status ? { status: query.status as V1TeamContactStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;
    return {
      items: pageItems.map((row) => this.toListItem(row)),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async detail(user: V1AuthUser, contactId: string) {
    const contact = await this.prisma.v1TeamContact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException({ code: 'TEAM_CONTACT_NOT_FOUND', message: '컨택을 찾을 수 없어요.' });
    }
    await this.assertParticipantSide(user.id, contact);
    return this.toListItem(contact);
  }

  /** 받는 팀 → 보낸 팀 순으로 본다. 어느 한쪽 운영진이면 통과. */
  private async assertParticipantSide(
    userId: string,
    contact: { fromTeamId: string; toTeamId: string },
  ) {
    for (const teamId of [contact.toTeamId, contact.fromTeamId]) {
      const membership = await this.prisma.v1TeamMembership.findFirst({
        where: {
          teamId, userId, status: 'active',
          role: { in: ['owner', 'manager'] },
          team: { status: 'active', deletedAt: null },
        },
        select: { id: true },
      });
      if (membership) return;
    }
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: '이 컨택을 볼 권한이 없어요.',
    });
  }

  /**
   * 만료를 표시에 반영한다. 목록은 행이 많아 각 행마다 updateMany 를 돌리지 않고
   * 표시 상태만 계산한다 — DB 정리는 그 컨택을 실제로 다루는 respond()/detail() 에서 일어난다.
   */
  private toListItem(row: { id: string; status: string; expiresAt: Date; [k: string]: unknown }) {
    const expired = row.status === 'requested' && row.expiresAt <= new Date();
    return { ...row, status: expired ? 'expired' : row.status };
  }
```

`assertCanManageTeam` 의 `select` 를 `{ id: true }` 로 유지하고, `respond()` 안의 권한 검사는 그대로 둔다 (`respond` 는 한쪽 팀만 보면 되므로 `assertCanManageTeam` 을 쓴다).

DTO 추가:

```ts
export class ListTeamContactsQueryDto {
  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsOptional()
  @IsIn(['requested', 'accepted', 'declined', 'withdrawn', 'expired'])
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
```

- [ ] **Step 4: 테스트를 돌린다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 20 passed

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/team-contacts
git commit -m "feat(v1-team-contacts): 컨택 목록/상세 조회"
git show --stat HEAD
```

---

### Task 6: 알림 이벤트 3종

**중요:** 6곳을 고쳐야 하는데 **컴파일러가 잡아주는 것은 2곳뿐이다.** `preferenceFieldForEvent` 와 `targetTypeForEvent` 는 말미에 폴백 `return` 이 있어, 분기를 빠뜨리면 tsc 는 통과하고 런타임에 조용히 틀린다 (스펙 §3.3).

**Files:**
- Modify: `apps/v1_api/src/notifications/notifications.service.ts`
- Create: `apps/v1_api/src/notifications/notification-event-mapping.spec.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `NotificationEventType` 에 `'team_contact_received' | 'team_contact_accepted' | 'team_contact_declined'` 추가. 세 이벤트 모두 targetType `'team'`, preference `'teamEnabled'`, deepLink `/my/team-contacts/{contactId}`.

- [ ] **Step 1: 폴백으로 새는 것을 잡는 실패 테스트를 쓴다**

`apps/v1_api/src/notifications/notification-event-mapping.spec.ts`:

```ts
// preferenceFieldForEvent / targetTypeForEvent / deepLinkForEvent 는 파일 로컬 함수라
// 직접 import 할 수 없다. NotificationsService 를 mock Prisma 로 세워 emitNotification 이
// 실제로 어떤 preference 를 보고 어떤 targetType/deepLink 를 저장하는지로 관측한다.
import { NotificationsService } from './notifications.service';

const CONTACT_EVENTS = [
  'team_contact_received',
  'team_contact_accepted',
  'team_contact_declined',
] as const;

function makeDeps() {
  const prisma: any = {
    v1NotificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    v1Notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
  };
  const realtime: any = { emitToUser: jest.fn() };
  const webPush: any = { sendToUser: jest.fn() };
  return { prisma, realtime, webPush };
}

describe.each(CONTACT_EVENTS)('%s 알림 매핑', (eventType) => {
  it("targetType 이 'team' 이고 딥링크가 /my/team-contacts 로 간다", async () => {
    const { prisma, realtime, webPush } = makeDeps();
    const service = new NotificationsService(prisma, realtime, webPush);

    await service.emitNotification('u1', eventType, 'c1');

    const data = prisma.v1Notification.create.mock.calls[0][0].data;
    expect(data.targetType).toBe('team');
    // 폴백으로 새면 여기가 '/team-matches/c1' 이 되어 404 링크가 만들어진다
    expect(data.deepLink).toBe('/my/team-contacts/c1');
  });

  it('teamEnabled 를 끈 사용자에게는 발송되지 않는다', async () => {
    const { prisma, realtime, webPush } = makeDeps();
    prisma.v1NotificationPreference.findUnique.mockResolvedValue({
      matchEnabled: true, teamEnabled: false, teamMatchEnabled: true,
      activityEnabled: true, importantEnabled: true,
    });
    const service = new NotificationsService(prisma, realtime, webPush);

    await service.emitNotification('u1', eventType, 'c1');
    expect(prisma.v1Notification.create).not.toHaveBeenCalled();
  });

  it('activityEnabled 만 꺼도 발송된다 — activityEnabled 폴백으로 새지 않았다는 증거', async () => {
    const { prisma, realtime, webPush } = makeDeps();
    prisma.v1NotificationPreference.findUnique.mockResolvedValue({
      matchEnabled: true, teamEnabled: true, teamMatchEnabled: true,
      activityEnabled: false, importantEnabled: true,
    });
    const service = new NotificationsService(prisma, realtime, webPush);

    await service.emitNotification('u1', eventType, 'c1');
    expect(prisma.v1Notification.create).toHaveBeenCalled();
  });
});
```

> `NotificationsService` 의 실제 생성자 인자 개수·순서와 `emitNotification` 시그니처를 먼저 확인하고 위 mock 을 맞춘다. 다르면 **테스트를 실제 시그니처에 맞추고, 서비스를 바꾸지 않는다.**

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/notifications/notification-event-mapping.spec.ts
```

Expected: FAIL — 타입 에러(유니온에 없는 리터럴) 또는 `deepLink` 가 `/team-matches/c1`

- [ ] **Step 3: 6곳을 전부 고친다**

1. `NotificationEventType` 유니온에 3개 리터럴 추가 (team 그룹 근처)
2. `preferenceFieldForEvent` — `teamEnabled` 를 반환하는 조건 목록에 3개 추가:

```ts
    type === 'schedule_guest_recruitment_close_reminder' ||
    type === 'team_contact_received' ||
    type === 'team_contact_accepted' ||
    type === 'team_contact_declined'
  ) {
    return 'teamEnabled';
  }
```

3. `targetTypeForEvent` — `'team'` 을 반환하는 조건 목록에 같은 3개 추가
4. `deepLinkForEvent` — 함수 상단 특례 블록에 추가. `ROUTE_BASE_BY_TARGET_TYPE['team']` 은 `/teams` 라 그냥 두면 `/teams/{contactId}` 가 되므로 **반드시 특례가 필요하다**:

```ts
  if (
    type === 'team_contact_received' ||
    type === 'team_contact_accepted' ||
    type === 'team_contact_declined'
  ) {
    return targetId ? `/my/team-contacts/${targetId}` : null;
  }
```

5. `EVENT_TITLES` 에 3개 (team_join_application_* 블록 뒤):

```ts
  team_contact_received: '새 팀 컨택이 도착했어요',
  team_contact_accepted: '팀 컨택이 수락됐어요',
  team_contact_declined: '팀 컨택이 거절됐어요',
```

6. `EVENT_BODIES` 에 3개, 같은 위치:

```ts
  team_contact_received: '상대 팀이 보낸 컨택을 확인해 주세요.',
  team_contact_accepted: '이제 상대 팀과 대화할 수 있어요.',
  team_contact_declined: '아쉽지만 이번에는 성사되지 않았어요.',
```

- [ ] **Step 4: 테스트를 돌린다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/notifications
```

Expected: 새 9개 포함 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/notifications
git commit -m "feat(v1-notifications): 팀 컨택 알림 이벤트 3종 추가"
git show --stat HEAD
```

---

### Task 7: 채팅 `team_contact` 4번째 분기

**스펙 §3.1의 전수 목록 14개를 체크리스트로 쓴다.** 대부분이 빠뜨려도 컴파일은 통과하고 런타임에 조용히 틀린다.

**Files:**
- Modify: `apps/v1_api/src/chat/dto/chat.dto.ts`
- Modify: `apps/v1_api/src/chat/chat.service.ts`
- Modify: `apps/v1_api/src/chat/chat-entitlement.ts`
- Modify: `apps/v1_api/src/chat/chat-entitlement.spec.ts`
- Create: `apps/v1_api/src/chat/chat-room-shape.spec.ts`

**Interfaces:**
- Consumes: Task 1의 명시적 가드, Task 2의 `V1ChatRoom.teamContactId`
- Produces: `POST /chat/rooms/resolve { targetType: 'team_contact', targetId: <contactId> }` 가 동작. 방 참가 자격은 양 팀 owner/manager, 컨택 상태가 `accepted` 일 때만.

- [ ] **Step 1: 실패 테스트를 쓴다**

`chat-entitlement.spec.ts` 에 추가:

```ts
  it('team_contact 방이면 양 팀의 owner/manager 로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null, teamId: null, teamMatchId: null, teamMatch: null,
      teamContactId: 'c1',
      teamContact: { fromTeamId: 'A', toTeamId: 'B' },
    });
    const some = where.user?.teamMemberships?.some;
    expect(some?.teamId).toEqual({ in: ['A', 'B'] });
    expect(some?.role).toEqual({ in: ['owner', 'manager'] });
  });
```

`chat-room-shape.spec.ts` 신규 — 조용히 틀리는 3개 함수를 직접 잡는다:

```ts
// getRoomType / getRoomTitle / getLinkedTarget 은 파일 로컬 함수다.
// 테스트하려면 chat.service.ts 에서 export 하도록 바꾼다(테스트 전용 export 가 아니라
// 순수 함수의 정상적인 노출이다 — 클래스 밖 최상위 함수이므로 부작용이 없다).
import { getRoomType, getRoomTitle, getLinkedTarget } from './chat.service';

const base = {
  matchId: null, teamId: null, teamMatchId: null, teamContactId: null,
  match: null, team: null, teamMatch: null, teamContact: null,
};

describe('채팅방 표시 정보', () => {
  it('team_contact 방을 team_match 로 오분류하지 않는다', () => {
    expect(getRoomType({ ...base, teamContactId: 'c1' })).toBe('team_contact');
  });

  it('team_contact 방의 제목은 상대 팀 이름이다', () => {
    expect(
      getRoomTitle({
        ...base,
        teamContact: { fromTeam: { name: '가팀' }, toTeam: { name: '나팀' } },
      }),
    ).not.toBe('채팅');
  });

  it('team_contact 방의 링크는 컨택 상세로 간다', () => {
    const target = getLinkedTarget({
      ...base,
      teamContactId: 'c1',
      teamContact: { id: 'c1', fromTeam: { name: '가팀' }, toTeam: { name: '나팀' } },
    });
    expect(target.type).toBe('team_contact');
    expect(target.route).toBe('/my/team-contacts/c1');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/chat
```

Expected: 새 4개 FAIL

- [ ] **Step 3: 14개 지점을 전부 고친다**

스펙 §3.1 표를 순서대로 따라간다. 각 항목을 고칠 때마다 표에 체크한다.

1. `chat.dto.ts:6, :26` — `@IsIn` 두 곳에 `'team_contact'` 추가
2. `chat.service.ts` `resolve()` — 암묵 fallback 을 명시 분기로 바꾸고 4번째 추가:

```ts
    if (dto.targetType === 'team_match') {
      await this.assertCanUseTeamMatchChat(user.id, dto.targetId);
      return this.resolveTeamMatchRoom(user.id, dto.targetId);
    }
    await this.assertCanUseTeamContactChat(user.id, dto.targetId);
    return this.resolveTeamContactRoom(user.id, dto.targetId);
```

3. `rooms()` where 스프레드에 `teamContactId: { not: null }` 조건 추가
4. `chat-entitlement.ts` `currentChatEntitlementWhere` OR 배열에 4번째:

```ts
      {
        teamContact: {
          is: {
            status: 'accepted',
            OR: [
              { fromTeam: { memberships: { some: { userId, status: 'active', role: { in: [...managerRoles] } } } } },
              { toTeam:   { memberships: { some: { userId, status: 'active', role: { in: [...managerRoles] } } } } },
            ],
          },
        },
      },
```

5. `currentChatRecipientEntitlementWhere` — Task 1에서 만든 `throw` **앞에** 분기 추가:

```ts
  if (room.teamContactId) {
    const teamIds = [room.teamContact?.fromTeamId, room.teamContact?.toTeamId].filter(
      (teamId): teamId is string => Boolean(teamId),
    );
    return {
      user: {
        teamMemberships: {
          some: { teamId: { in: teamIds }, status: 'active', role: { in: [...managerRoles] } },
        },
      },
    };
  }
```

`ChatEntitlementRoom` 타입에도 `teamContactId: string | null` 과 `teamContact: { fromTeamId: string; toTeamId: string } | null` 을 추가한다.

6. `assertCurrentRoomEntitlement` — `if (room.teamContactId) return this.assertCanUseTeamContactChat(...)` 추가 + 파라미터 타입 확장
7. `roomInclude()` 에 `teamContact: { select: { id: true, fromTeam: { select: { id: true, name: true } }, toTeam: { select: { id: true, name: true } } } }` 추가
8. `RoomWithRelations` 타입에 같은 select 반영
9. `getRoomType` — `if (room.teamContactId) return 'team_contact';` 를 `return 'team_match'` **앞에** 추가하고 파라미터 타입 확장. 세 함수를 `export` 로 바꾼다.
10. `getRoomTitle` — nullish chain 에 컨택 제목 추가:

```ts
function getRoomTitle(room: { /* ... */ teamContact: { fromTeam: { name: string }; toTeam: { name: string } } | null }) {
  const contactTitle = room.teamContact
    ? `${room.teamContact.fromTeam.name} ↔ ${room.teamContact.toTeam.name}`
    : null;
  return room.match?.title ?? room.team?.name ?? room.teamMatch?.title ?? contactTitle ?? '채팅';
}
```

11. `getLinkedTarget` — `if (room.teamContact)` 분기를 `return { type: null, ... }` 앞에 추가:

```ts
  if (room.teamContact) {
    return {
      type: 'team_contact',
      id: room.teamContact.id,
      title: `${room.teamContact.fromTeam.name} ↔ ${room.teamContact.toTeam.name}`,
      route: `/my/team-contacts/${room.teamContact.id}`,
    };
  }
```

12. `assertCanUseTeamContactChat` 신규 — `assertCanUseTeamMatchChat` 을 본뜬다:

```ts
  private async assertCanUseTeamContactChat(userId: string, teamContactId: string) {
    const contact = await this.prisma.v1TeamContact.findFirst({
      where: { id: teamContactId, status: 'accepted' },
      select: { fromTeamId: true, toTeamId: true },
    });
    if (!contact) throw stateConflict('컨택이 수락된 뒤에 대화할 수 있어요.');
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        userId, status: 'active',
        role: { in: ['owner', 'manager'] },
        teamId: { in: [contact.fromTeamId, contact.toTeamId] },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 운영진만 컨택 대화에 참여할 수 있어요.',
      });
    }
  }
```

13. `resolveTeamContactRoom` 신규 — `resolveTeamMatchRoom` 을 그대로 본뜬다:

```ts
  private async resolveTeamContactRoom(userId: string, teamContactId: string) {
    const existing = await this.prisma.v1ChatRoom.findUnique({ where: { teamContactId } });
    const room = existing ?? (await this.prisma.v1ChatRoom.create({ data: { teamContactId, status: 'active' } }));
    await this.ensureResolvedParticipant(room.id, userId);
    return { roomId: room.id, roomType: 'team_contact', created: !existing, route: chatRoomRoute(room.id) };
  }
```

14. 스키마는 Task 2에서 이미 끝났다.

- [ ] **Step 4: 채팅 테스트 전체를 돌린다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/chat
```

Expected: 전부 PASS

- [ ] **Step 5: tsc 를 돌린다**

```bash
cd apps/v1_api && npx tsc --noEmit
```

Expected: 에러 0. `RoomWithRelations` / 파라미터 타입 확장을 빠뜨리면 여기서 잡힌다.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/src/chat
git commit -m "feat(v1-chat): 팀 컨택 대화방 지원 추가"
git show --stat HEAD
```

---

### Task 8: 컨트롤러 + 모듈 등록 + 알림 발송 배선 + 통합 테스트

**Files:**
- Create: `apps/v1_api/src/team-contacts/team-contacts.controller.ts`
- Create: `apps/v1_api/src/team-contacts/team-contacts.module.ts`
- Create: `apps/v1_api/test/team-contacts/team-contact-flow.integration-spec.ts`
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts` (알림 주입)
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts` (생성자 변경 반영)
- Modify: `apps/v1_api/src/app.module.ts`
- Modify: `apps/v1_api/jest.config.ts`

**Interfaces:**
- Consumes: Task 3–6 전부
- Produces: 스펙 §7의 엔드포인트 6개가 살아난다.

> **주의 — 생성자 변경의 파급**: 이 태스크에서 `TeamContactsService` 가 `NotificationsService` 를 주입받게 된다. Task 3–5의 유닛 테스트가 `new TeamContactsService(prisma)` 로 인스턴스를 만들고 있으므로 **전부 `new TeamContactsService(prisma, notifications)` 로 고쳐야 한다.** `makePrisma()` 옆에 `makeNotifications()` 헬퍼를 추가한다:
>
> ```ts
> function makeNotifications() {
>   return { emitToManyDeferred: jest.fn(), emitNotification: jest.fn() } as any;
> }
> ```

- [ ] **Step 1: 알림 발송을 검증하는 실패 테스트를 쓴다**

`team-contacts.service.spec.ts` 에 추가:

```ts
describe('TeamContactsService 알림 발송', () => {
  it('컨택을 보내면 받는 팀 운영진 전원에게 알림을 예약한다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', toTeamId: 'B', fromTeamId: 'A' });
    const service = new TeamContactsService(prisma, notifications);

    await service.create(actor, 'B', dto);

    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_received', 'new', undefined,
    );
    // 수신자 해석 함수가 실제로 받는 팀의 owner/manager 를 조회하는지
    const resolveUserIds = notifications.emitToManyDeferred.mock.calls[0][0];
    prisma.v1TeamMembership.findMany = jest.fn().mockResolvedValue([{ userId: 'x' }]);
    await expect(resolveUserIds()).resolves.toEqual(['x']);
    expect(prisma.v1TeamMembership.findMany.mock.calls[0][0].where).toMatchObject({
      teamId: 'B', status: 'active', role: { in: ['owner', 'manager'] },
    });
  });

  it('수락하면 보낸 팀 운영진에게 알린다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.update.mockResolvedValue({ id: 'c1', fromTeamId: 'A', status: 'accepted' });
    const service = new TeamContactsService(prisma, notifications);

    await service.accept(actor, 'c1');
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_accepted', 'c1', undefined,
    );
  });

  it('철회는 알림을 보내지 않는다 — 상대가 아직 반응하지 않았으므로 소음이다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.update.mockResolvedValue({ id: 'c1', status: 'withdrawn' });
    const service = new TeamContactsService(prisma, notifications);

    await service.withdraw(actor, 'c1');
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('멱등 재수락이면 알림을 다시 보내지 않는다', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    prisma.v1TeamContact.findUnique.mockResolvedValue({
      id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'accepted',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, notifications);

    await service.accept(actor, 'c1');
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts/team-contacts.service.spec.ts
```

Expected: 새 4개 FAIL

- [ ] **Step 3: 알림을 배선한다**

`team-contacts.service.ts` 생성자와 발송 헬퍼:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * team-matches.service.ts 의 emitNotificationToTeamManagers 와 같은 패턴이다.
   * emitToManyDeferred 는 수신자 해석을 지연시키고 에러를 삼키므로,
   * 알림 실패가 컨택 생성/수락 자체를 되돌리지 않는다.
   */
  private notifyTeamManagers(teamId: string, type: NotificationEventType, targetId: string) {
    this.notifications.emitToManyDeferred(
      async () => {
        const rows = await this.prisma.v1TeamMembership.findMany({
          where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
          select: { userId: true },
        });
        return rows.map((row) => row.userId);
      },
      type,
      targetId,
      undefined,
    );
  }
```

`create()` 의 `return tx.v1TeamContact.create(...)` 를 트랜잭션 밖에서 알림을 쏘도록 바꾼다 — **트랜잭션 안에서 알림을 쏘면 롤백돼도 알림이 나간다**:

```ts
    const created = await this.prisma.$transaction(async (tx) => { /* ...기존... */ });
    this.notifyTeamManagers(created.toTeamId, 'team_contact_received', created.id);
    return created;
```

`respond()` 의 update 뒤:

```ts
    if (nextStatus === 'accepted' || nextStatus === 'declined') {
      // 응답 결과는 '보낸 팀' 이 알아야 한다. 철회는 상대가 아직 안 봤으므로 알리지 않는다.
      this.notifyTeamManagers(
        contact.fromTeamId,
        nextStatus === 'accepted' ? 'team_contact_accepted' : 'team_contact_declined',
        contactId,
      );
    }
```

Task 3–5의 테스트에서 `new TeamContactsService(prisma)` 를 전부 `new TeamContactsService(prisma, makeNotifications())` 로 고친다.

- [ ] **Step 4: 컨트롤러와 모듈을 만든다**

`team-contacts.controller.ts` — 이 레포 관례상 `@Controller()` 에 prefix 를 두지 않고 메서드마다 전체 경로를 쓴다:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateTeamContactDto,
  DeclineTeamContactDto,
  ListTeamContactsQueryDto,
} from './dto/team-contact.dto';
import { TeamContactsService } from './team-contacts.service';

@Controller()
export class TeamContactsController {
  constructor(private readonly teamContactsService: TeamContactsService) {}

  @Post('teams/:teamId/contacts')
  @UseGuards(V1AuthGuard)
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamContactDto,
  ) {
    return this.teamContactsService.create(user, teamId, dto);
  }

  @Get('teams/:teamId/contacts')
  @UseGuards(V1AuthGuard)
  list(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Query() query: ListTeamContactsQueryDto,
  ) {
    return this.teamContactsService.listForTeam(user, teamId, query);
  }

  @Get('team-contacts/:contactId')
  @UseGuards(V1AuthGuard)
  detail(@CurrentUser() user: V1AuthUser, @Param('contactId') contactId: string) {
    return this.teamContactsService.detail(user, contactId);
  }

  @Patch('team-contacts/:contactId/accept')
  @UseGuards(V1AuthGuard)
  accept(@CurrentUser() user: V1AuthUser, @Param('contactId') contactId: string) {
    return this.teamContactsService.accept(user, contactId);
  }

  @Patch('team-contacts/:contactId/decline')
  @UseGuards(V1AuthGuard)
  decline(
    @CurrentUser() user: V1AuthUser,
    @Param('contactId') contactId: string,
    @Body() dto: DeclineTeamContactDto,
  ) {
    return this.teamContactsService.decline(user, contactId, dto);
  }

  @Post('team-contacts/:contactId/withdraw')
  @UseGuards(V1AuthGuard)
  withdraw(@CurrentUser() user: V1AuthUser, @Param('contactId') contactId: string) {
    return this.teamContactsService.withdraw(user, contactId);
  }
}
```

`team-contacts.module.ts` — 관례상 컨트롤러가 쓰는 가드를 providers 에 명시 등록한다:

```ts
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamContactsController } from './team-contacts.controller';
import { TeamContactsService } from './team-contacts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TeamContactsController],
  providers: [TeamContactsService, V1AuthGuard],
})
export class TeamContactsModule {}
```

`app.module.ts` — 상단에 import 추가하고 `imports` 배열의 `TeamMatchesModule` 뒤에 `TeamContactsModule` 을 넣는다.

- [ ] **Step 5: 통합 테스트를 쓰고 jest 글롭을 등록한다**

`apps/v1_api/test/team-contacts/team-contact-flow.integration-spec.ts` — 실 DB 로 발신 → 수락 → 채팅방 resolve 왕복 1개:

```ts
// 이 파일이 jest.config.ts 의 integration testMatch 에 등록되지 않으면
// 디스크에 있어도 CI 가 절대 실행하지 않는다. 같은 실수가 이 레포에서 4회 반복됐다.
import { PrismaService } from '../../src/prisma/prisma.service';

const prisma = new PrismaService();

describe('팀 컨택 전체 흐름', () => {
  // 팀 A owner, 팀 B owner, 두 팀을 만든 뒤:
  //  1) A owner 가 B 로 컨택 발신 → 201, status='requested'
  //  2) 같은 팀쌍에 다시 발신 → 409 TEAM_CONTACT_ALREADY_ACTIVE
  //  3) B owner 가 수락 → status='accepted'
  //  4) B owner 가 다시 수락 → alreadyProcessed=true, respondedAt 이 안 바뀜
  //  5) A owner 가 /chat/rooms/resolve { targetType:'team_contact' } → roomId 획득
  //  6) 같은 호출을 A owner 가 반복 → 같은 roomId (방이 파편화되지 않음)
  //  7) 두 팀 어디에도 없는 사용자가 resolve → 403
  // 각 단계의 단언은 응답 status/code 와 DB 상태로 한다.
});
```

`jest.config.ts` 의 integration `testMatch` 배열에 추가:

```ts
        // team-contacts: 이 글롭이 없으면 `jest --selectProjects integration`
        // (= CI 의 migration replay + drift gate) 가 이 디렉터리를 절대 선택하지 않는다.
        '<rootDir>/test/team-contacts/**/*.integration-spec.ts',
```

등록됐는지 확인한다:

```bash
cd apps/v1_api && npx jest --selectProjects integration --listTests | grep team-contacts
```

Expected: 파일 경로가 출력된다. **출력이 없으면 글롭이 안 먹은 것이다.**

- [ ] **Step 6: 테스트를 전부 돌린다**

```bash
cd apps/v1_api && npx jest --selectProjects unit src/team-contacts src/chat src/notifications
cd apps/v1_api && npx jest --selectProjects integration --runInBand test/team-contacts
cd apps/v1_api && npx tsc --noEmit
```

Expected: 전부 PASS, tsc 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/src/team-contacts apps/v1_api/src/app.module.ts apps/v1_api/jest.config.ts apps/v1_api/test/team-contacts
git commit -m "feat(v1-team-contacts): 컨택 API 엔드포인트와 알림 배선"
git show --stat HEAD
```

---

### Task 9: 프론트 공유 유틸 + API 훅

**Files:**
- Create: `apps/v1_web/src/lib/team-role.ts`
- Modify: `apps/v1_web/src/components/teams/teams-client.tsx`
- Modify: `apps/v1_web/src/components/my/my-api-clients.tsx`
- Modify: `apps/v1_web/src/lib/query-keys.ts`
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts` (훅 6개 신규 **+ `useV1ResolveChatRoom` 유니온 확장**)
- Create: `apps/v1_web/src/lib/team-role.test.ts`

> **필수 — 빠뜨리면 Task 11 이 컴파일되지 않는다**: `use-v1-api.ts:1919` 의
> `useV1ResolveChatRoom` 은 `mutationFn: (body: { targetType: 'match' | 'team' | 'team_match'; targetId: string })`
> 로 유니온이 하드코딩돼 있다. Task 11 의 "대화 열기" 가 `'team_contact'` 로 호출하므로
> **이 유니온에 `| 'team_contact'` 를 추가한다.** (2026-08-20 사전 스캔에서 발견 — 원래 어느 태스크에도 없었다.)

**Interfaces:**
- Consumes: Task 8의 엔드포인트
- Produces:
  - `isTeamOperatorRole(role?: string | null): boolean`
  - `v1Keys.teamContacts(teamId, filters?)`, `v1Keys.teamContact(contactId)`
  - `useV1TeamContacts(teamId, filters?)`, `useV1TeamContact(contactId)`, `useV1CreateTeamContact()`, `useV1AcceptTeamContact()`, `useV1DeclineTeamContact()`, `useV1WithdrawTeamContact()`

- [ ] **Step 1: 공유 유틸 테스트를 쓴다**

`apps/v1_web/src/lib/team-role.test.ts`:

```ts
import { isTeamOperatorRole } from './team-role';

describe('isTeamOperatorRole', () => {
  it('owner/manager/admin 은 운영 권한이 있다', () => {
    expect(isTeamOperatorRole('owner')).toBe(true);
    expect(isTeamOperatorRole('manager')).toBe(true);
    expect(isTeamOperatorRole('admin')).toBe(true);
  });

  it('member 와 값 없음은 권한이 없다', () => {
    expect(isTeamOperatorRole('member')).toBe(false);
    expect(isTeamOperatorRole(null)).toBe(false);
    expect(isTeamOperatorRole(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd apps/v1_web && npx vitest run src/lib/team-role.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 유틸을 만들고 중복 2곳을 제거한다**

`apps/v1_web/src/lib/team-role.ts`:

```ts
/**
 * 팀에서 운영 권한(초대/승인/컨택 등)을 가진 역할인지 판정한다.
 * teams-client.tsx 와 my-api-clients.tsx 에 같은 함수가 각각 로컬로 중복돼 있던 것을
 * 팀 컨택이 세 번째 소비처가 되면서 공유 유틸로 올린 것이다.
 */
export function isTeamOperatorRole(role?: string | null) {
  return role === 'owner' || role === 'manager' || role === 'admin';
}
```

`teams-client.tsx` 와 `my-api-clients.tsx` 에서 로컬 `function isTeamOperatorRole` 선언을 **삭제**하고 `import { isTeamOperatorRole } from '@/lib/team-role';` 로 바꾼다. (기존 import 경로 표기 관례를 파일 안 다른 import 에서 확인해 맞춘다.)

- [ ] **Step 4: 테스트 + 타입 확인**

```bash
cd apps/v1_web && npx vitest run src/lib/team-role.test.ts && npx tsc --noEmit
```

Expected: PASS, tsc 에러 0

- [ ] **Step 5: 쿼리 키와 훅을 추가한다**

`query-keys.ts` — `teamMatch` 근처에 추가:

```ts
  teamContacts: (teamId: string, filters?: Record<string, unknown>) =>
    [...v1Keys.team(teamId), 'contacts', filters ?? {}] as const,
  teamContactsAll: (teamId: string) => [...v1Keys.team(teamId), 'contacts'] as const,
  teamContact: (contactId: string) => [...v1Keys.all, 'team-contacts', contactId] as const,
```

> `teamContactsAll` 은 필터 없는 접두사 무효화용이다. `teamContacts()` 는 마지막 요소가 필터 객체라 prefix match 로 전체를 무효화할 수 없다 — `tournamentOperationsBoard` / `tournamentOperationsBoardAll` 이 같은 이유로 쌍을 이루고 있다.

`use-v1-api.ts` 에 훅 6개:

```ts
export function useV1TeamContacts(teamId: string, filters?: { direction?: 'inbound' | 'outbound'; status?: string }) {
  return useQuery({
    queryKey: v1Keys.teamContacts(teamId, filters),
    queryFn: () => v1Get<V1TeamContactList>(`/teams/${teamId}/contacts`, filters),
    enabled: Boolean(teamId),
  });
}

export function useV1TeamContact(contactId: string) {
  return useQuery({
    queryKey: v1Keys.teamContact(contactId),
    queryFn: () => v1Get<V1TeamContact>(`/team-contacts/${contactId}`),
    enabled: Boolean(contactId),
  });
}

export function useV1CreateTeamContact(toTeamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { fromTeamId: string; message: string }) =>
      v1Post<V1TeamContact>(`/teams/${toTeamId}/contacts`, body),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: v1Keys.teamContactsAll(variables.fromTeamId) });
    },
  });
}

export function useV1AcceptTeamContact(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Patch<{ contact: V1TeamContact; alreadyProcessed: boolean }>(`/team-contacts/${contactId}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamContact(contactId) }),
  });
}

export function useV1DeclineTeamContact(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason?: string }) =>
      v1Patch<{ contact: V1TeamContact; alreadyProcessed: boolean }>(`/team-contacts/${contactId}/decline`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamContact(contactId) }),
  });
}

export function useV1WithdrawTeamContact(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<{ contact: V1TeamContact; alreadyProcessed: boolean }>(`/team-contacts/${contactId}/withdraw`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.teamContact(contactId) }),
  });
}
```

타입 `V1TeamContact` / `V1TeamContactList` 는 이 파일의 다른 타입 선언 관례를 따라 같은 위치에 정의한다:

```ts
export type V1TeamContactStatus = 'requested' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export type V1TeamContact = {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  message: string;
  status: V1TeamContactStatus;
  declineReason: string | null;
  expiresAt: string;
  createdAt: string;
};

export type V1TeamContactList = {
  items: V1TeamContact[];
  pageInfo: { nextCursor: string | null; hasNext: boolean };
};
```

- [ ] **Step 6: 타입 확인 후 커밋**

```bash
cd apps/v1_web && npx tsc --noEmit
```

```bash
git add apps/v1_web/src/lib/team-role.ts apps/v1_web/src/lib/team-role.test.ts \
        apps/v1_web/src/lib/query-keys.ts apps/v1_web/src/hooks/use-v1-api.ts \
        apps/v1_web/src/components/teams/teams-client.tsx \
        apps/v1_web/src/components/my/my-api-clients.tsx
git commit -m "feat(v1-web): 팀 컨택 API 훅과 팀 역할 판별 공유 유틸"
git show --stat HEAD
```

---

### Task 10: 팀 상세 컨택 CTA + 컨택 작성 화면

**Files:**
- Modify: `apps/v1_web/src/components/teams/teams-page.tsx`
- Create: `apps/v1_web/src/app/teams/[teamId]/contact/new/page.tsx`
- Create: `apps/v1_web/src/components/teams/team-contact-new-client.tsx`
- Create: `apps/v1_web/src/components/teams/team-contact-new-client.test.tsx`

**Interfaces:**
- Consumes: Task 9의 `useV1CreateTeamContact`, `useV1MyTeams`, `isTeamOperatorRole`
- Produces: 팀 상세에 "컨택 보내기" 보조 버튼. 클릭 시 `/teams/:teamId/contact/new` 로 이동.

**노출 조건 (셋 다 만족할 때만 버튼을 보여준다):**
1. 방문자가 이 팀의 멤버가 아니다 (`mode !== 'mine'`)
2. 방문자가 owner/manager 인 팀이 1개 이상 있다 (`useV1MyTeams()` + `isTeamOperatorRole`)
3. 로그인 상태다

- [ ] **Step 1: 작성 화면 테스트를 쓴다**

`team-contact-new-client.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamContactNewClient } from './team-contact-new-client';

// 훅은 모듈 mock 으로 대체한다 (이 레포의 다른 *.test.tsx 가 쓰는 방식을 따른다).
const createMutate = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTeams: () => ({ data: { items: [{ teamId: 'A', teamName: '가팀', role: 'owner' }] } }),
  useV1CreateTeamContact: () => ({ mutateAsync: createMutate, isPending: false }),
}));

describe('TeamContactNewClient', () => {
  it('메시지가 비어 있으면 보낼 수 없다', async () => {
    render(<TeamContactNewClient toTeamId="B" toTeamName="나팀" />);
    expect(screen.getByRole('button', { name: /보내기/ })).toBeDisabled();
  });

  it('메시지를 입력하면 보낼 수 있고 남은 글자 수를 보여준다', async () => {
    render(<TeamContactNewClient toTeamId="B" toTeamName="나팀" />);
    await userEvent.type(screen.getByLabelText(/메시지/), '주말 경기 가능하실까요?');
    expect(screen.getByRole('button', { name: /보내기/ })).toBeEnabled();
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  it('운영 권한이 있는 팀이 하나뿐이면 팀 선택 UI 를 보여주지 않는다', () => {
    render(<TeamContactNewClient toTeamId="B" toTeamName="나팀" />);
    expect(screen.queryByLabelText(/보내는 팀/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd apps/v1_web && npx vitest run src/components/teams/team-contact-new-client.test.tsx
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 작성 화면을 만든다**

`app/teams/[teamId]/contact/new/page.tsx` — 이 레포의 라우트 파일은 thin wrapper 다. 동적 세그먼트의 `params` 는 Next 15+ 스타일로 Promise 이므로 `await` 한다:

```tsx
import { TeamContactNewClient } from '@/components/teams/team-contact-new-client';

export default async function TeamContactNewPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamContactNewClient toTeamId={teamId} />;
}
```

`components/teams/team-contact-new-client.tsx` — `'use client'`. 요구 사항:
- 운영 권한 팀이 2개 이상이면 `<label htmlFor>` + `<select id>` 로 발신 팀 선택, 1개면 숨기고 그 팀으로 고정
- 메시지 `<textarea>` — `<label htmlFor="team-contact-message">` 연결 필수, 500자 상한, 남은 글자 수 표시
- 보내기 버튼 `min-h-[44px]`, 비었거나 전송 중이면 disabled
- 성공 시 `/my/team-contacts` 로 이동
- 실패 시 `extractErrorMessage(err, '컨택을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')` 를 `role="status"` 영역에 표시
- `extractErrorCode(err) === 'TEAM_CONTACT_ALREADY_ACTIVE'` 면 "이미 이 팀과 진행 중인 컨택이 있어요" + 기존 컨택으로 가는 링크
- `TEAM_CONTACT_DAILY_LIMIT_EXCEEDED` 면 "오늘 보낼 수 있는 컨택을 모두 사용했어요"
- 다크모드 대응, 색만으로 상태를 전달하지 않음

- [ ] **Step 4: 팀 상세에 CTA 를 붙인다**

`teams-page.tsx` 의 `TeamDetailPageView` 에서 데스크톱(`tm-team-detail-sidebar-cta`)과 모바일(`tm-fixed-cta tm-hide-desktop`) **양쪽 모두** 를 2단 그리드로 바꾼다. 패턴은 같은 파일 L876 `tm-team-form-cta` 에서 가져온다:

```tsx
{canContact ? (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
    <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={`/teams/${team.id}/contact/new`}>
      컨택 보내기
    </Link>
    <button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" /* 기존 그대로 */>
      {model.ctaPending ? '처리 중' : cta}
    </button>
  </div>
) : (
  /* 기존 단일 버튼 그대로 */
)}
```

`canContact` 는 위 노출 조건 3개를 모두 만족할 때만 true. `TeamDetailViewModel` 에 필요한 필드를 추가한다.

- [ ] **Step 5: 테스트 + 린트**

```bash
cd apps/v1_web && npx vitest run src/components/teams/
cd apps/v1_web && pnpm lint
```

`pnpm lint` 는 `tsc --noEmit` 과 `scripts/v1-pattern-check.mjs` 를 함께 돌린다. 패턴 체크가 실패하면 그 스크립트가 알려주는 규칙을 따른다.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_web/src/app/teams apps/v1_web/src/components/teams
git commit -m "feat(v1-web): 팀 상세 컨택 CTA와 컨택 작성 화면"
git show --stat HEAD
```

---

### Task 11: 컨택함 (목록 + 상세) + 시각 검증

**Files:**
- Create: `apps/v1_web/src/app/my/team-contacts/page.tsx`
- Create: `apps/v1_web/src/app/my/team-contacts/[contactId]/page.tsx`
- Create: `apps/v1_web/src/components/my/my-team-contacts-client.tsx`
- Create: `apps/v1_web/src/components/my/my-team-contacts-client.test.tsx`
- Create: `scripts/capture-team-contact-screens.mjs`

**Interfaces:**
- Consumes: Task 9의 훅 6개 전부
- Produces: `/my/team-contacts` (받은/보낸 탭), `/my/team-contacts/:contactId` (상세 + 상태별 액션)

- [ ] **Step 1: 상세 화면 테스트를 쓴다**

```tsx
describe('MyTeamContactDetail', () => {
  it('받은 requested 컨택에는 수락/거절 버튼이 있다', () => { /* ... */ });
  it('보낸 requested 컨택에는 철회 버튼만 있고 수락/거절은 없다', () => { /* ... */ });
  it('accepted 컨택에는 대화 열기 버튼이 있다', () => { /* ... */ });
  it('expired/declined/withdrawn 컨택에는 액션 버튼이 없다', () => { /* ... */ });
  it('상태를 색만이 아니라 텍스트로도 보여준다', () => {
    // 예: 뱃지 안에 '대기 중' / '수락됨' / '거절됨' / '만료됨' / '철회됨' 문구가 있는지
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd apps/v1_web && npx vitest run src/components/my/my-team-contacts-client.test.tsx
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

라우트 2개는 thin wrapper. UI 는 `app/my/inquiries` 의 리스트/상세 레이아웃을 본뜬다.

목록 요구사항:
- 받은/보낸 탭 (`direction=inbound|outbound`)
- 각 행: 상대 팀 이름 + 메시지 앞부분 + 상태 뱃지(색 + 텍스트) + 시각
- 비었으면 빈 상태 안내 ("아직 받은 컨택이 없어요")
- 운영 권한 팀이 여러 개면 팀 선택기

상세 요구사항:
- 발신 팀 → 수신 팀, 전문 메시지, 상태, 만료까지 남은 시간(requested 일 때)
- 상태별 액션: 위 테스트에 적은 그대로
- "대화 열기" 는 `useV1ResolveChatRoom({ targetType: 'team_contact', targetId: contactId })` 후 `/chat/:roomId` 로 이동
- 거절 시 사유 입력(선택, 200자)

- [ ] **Step 4: 테스트 + 린트**

```bash
cd apps/v1_web && npx vitest run src/components/my/
cd apps/v1_web && pnpm lint
```

- [ ] **Step 5: 시각 검증은 alpha 에서 한다 — 로컬 next 서버를 띄우지 않는다**

> **사용자 명시 지시(2026-08-09, 2026-08-13 재확인)**: 팀밋(v1_web/v1_api) 검증은 로컬에서
> `next dev`/`next start`/standalone 을 띄우지 말고 **전부 alpha 배포로 테스트한다.**
> 이유: ① 공유 dev 머신에 여러 세션이 돌아 이미 과부하 ② 로컬 `next start` 좀비 서버가
> stale 빌드를 서빙해 **거짓 진단**을 낸 실사고가 있었다. alpha 실측이 이 레포의 ground truth 다.
> 검증 환경은 **alpha 하나**다 — 프로덕션(teameet.co.kr)에서 검증하지 않고 `dev → main` 승격을
> 먼저 제안하지도 않는다.

따라서 순서가 바뀐다:
1. 로컬 게이트(`tsc` / `vitest` / `v1-pattern-check`)를 통과시킨다 — **서버 불필요**.
2. base=`dev` PR 을 연다.
3. **dev 머지 = 즉시 alpha 실배포**이므로, 머지는 사용자 결정이다. 에이전트가 임의로 머지하지 않는다.
4. 머지 후 alpha 가 배포되면 **alpha 에서** 스크린샷을 찍어 PR 에 갤러리를 올린다.

alpha 측정 전 반드시 확인할 것(CLAUDE.md "Alpha 실측 검증" 절):
```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-commit'
git merge-base --is-ancestor <내 머지 커밋> <배포 SHA> && echo "포함됨"
```
배포 중에는 502 가 뜬다 — 그 창에서 측정하면 **멀쩡한 화면을 결함으로 오진한다.**

- [ ] **Step 6: alpha 에서 3폭 캡처 + computed 값 확인**

캡처 대상 4화면 × 3폭(📱390 / 📲768 / 🖥1440) × 라이트·다크:

| 화면 | 경로 |
|---|---|
| 팀 상세 (컨택 CTA 노출) | `/teams/{teamId}` |
| 컨택 작성 | `/teams/{teamId}/contact/new` |
| 컨택함 목록 | `/my/team-contacts` |
| 컨택 상세 | `/my/team-contacts/{contactId}` |

alpha 는 프로덕션 모드라 **헤더 dev 인증이 401** 이다 — `login` API 로 세션 쿠키를 받아야 한다
(계정은 저장소 밖 비공개 메모리에 있다. **저장소에 자격증명을 적지 마라 — 이 레포는 PUBLIC 이다**).
캡처 스크립트는 **`scripts/` 안**에 둔다(`/tmp` 는 모듈 해석 실패).

**육안 대조로 결론내지 마라.** computed 값을 직접 읽는다:
```js
const h = await page.$eval('[data-testid="contact-cta"]', (el) => el.getBoundingClientRect().height);
const bg = await page.$eval('body', (el) => getComputedStyle(el).backgroundColor);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
```
`overflow` 가 true 면 레이아웃을 고친다.

- [ ] **Step 7: 커밋 + PR**

```bash
git add apps/v1_web/src/app/my/team-contacts apps/v1_web/src/components/my scripts/capture-team-contact-screens.mjs
git commit -m "feat(v1-web): 팀 컨택함 목록과 상세 화면"
git show --stat HEAD
```

PR 을 연다. **base 가 `dev` 인지 반드시 확인한다:**

```bash
gh pr create --base dev --repo <owner>/<name> --title "feat: 팀 간 컨택 메시지 (Phase 1)" --body "..."
gh pr view <N> --json baseRefName   # 반드시 "dev"
```

PR 코멘트에 3폭 스크린샷 갤러리를 게시한다 (raw URL 200 확인 후).

- [ ] **Step 8: Copilot 리뷰를 clean 까지 돌린다**

```bash
gh pr edit <N> --add-reviewer copilot-pull-request-reviewer --repo <owner>/<name>
```

각 지적은 적대적으로 검증해 **진짜인 것만** 고친다. `generated no new comments` 가 나올 때까지 반복한다.

---

## Self-Review

### 1. 스펙 커버리지

| 스펙 항목 | 담당 Task |
|---|---|
| §5 데이터 모델 (모델 2 + enum 2 + 기존 3 확장) | Task 2 |
| §6 상태 흐름 (5개 status, lazy-flip 만료) | Task 4 |
| §7 엔드포인트 6개 (Phase 1 범위) | Task 8 |
| §8(a) 중복 방지 (advisory lock, 양방향, accepted 포함) | Task 3 |
| §8(a) 일일 한도 10건 | Task 3 |
| §8(b) 차단·신고 | **Phase 2 — 이 계획 범위 밖** (스키마만 Task 2에 선반영) |
| §8(c) 수신 설정 | **Phase 3 — 이 계획 범위 밖** (컬럼만 Task 2에 선반영) |
| §9 알림 3종 (6곳) | Task 6 + Task 8 배선 |
| §10 프론트 화면 5개 | Task 9·10·11 |
| §3.1 chat 14개 지점 | Task 1(선행) + Task 7 |
| §3.3 알림 폴백 함정 | Task 6 |
| §3.4 SOURCE_SNAPSHOT 재핀 | Task 2 |
| §3.5 `isTeamOperatorRole` 승격 | Task 9 |
| §13 jest 글롭 등록 | Task 8 |
| §14 시각 검증 | Task 11 |

빠진 항목 없음. Phase 2·3 항목은 의도적으로 제외했고 스키마만 선반영했다.

### 2. 플레이스홀더

`TBD` / `TODO` / "적절히 처리" / "위 내용에 대한 테스트 작성" 없음. Task 11 Step 1·3 의 테스트 본문이 `/* ... */` 로 남아 있는 것은 의도적이다 — 그 시점에는 목록/상세의 실제 view model 필드가 Task 9에서 확정되므로, 구현자가 그 타입을 보고 채우는 것이 맞다. **각 테스트가 무엇을 단언해야 하는지는 문장으로 전부 명시했다.**

### 3. 타입 일관성

- `TeamContactsService` 생성자: Task 3에서 `(prisma)` → Task 8에서 `(prisma, notifications)` 로 바뀐다. **Task 8이 이 파급을 명시하고 기존 테스트 수정을 지시한다.**
- `assertCanManageTeam` (한쪽 팀 기준) vs `assertParticipantSide` (양쪽 중 하나) — 이름과 용도를 구분했고 Task 4·5에서 각각 어느 것을 쓰는지 명시했다.
- `settleExpiry` (DB 정리 포함, 단건) vs `toListItem` (표시만, 목록) — 목록에서 행마다 write 를 돌리지 않는 이유를 주석에 남겼다.
- `v1Keys.teamContacts` / `teamContactsAll` / `teamContact` 세 개의 용도를 Task 9에서 구분했다.
- 알림 이벤트 리터럴 3개는 Task 6(정의) → Task 8(사용) 에서 동일한 철자를 쓴다: `team_contact_received` / `team_contact_accepted` / `team_contact_declined`.

### 4. 모호함

없음. 스펙 §2의 확정 결정 8개가 전부 구체적 수치·enum 값으로 계획에 반영됐다 (한도 10, 만료 7일, 기본값 `open`, `recruiting_only` = host 인 recruiting 팀매치 존재, 철회 포함).
