# 팀 간 컨택 메시지 Phase 2·3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컨택 남용을 팀이 스스로 막을 수 있게 한다 — 팀 단위 차단, 구조화된 신고, 컨택 수신 설정.

**Architecture:** Phase 1 이 만든 `TeamContactsService` 에 발신 가드를 얹고, 신고는 기존 `V1Inquiry` 파이프라인을 재사용한다. 새 도메인을 만들지 않는다. 차단 테이블(`V1TeamContactBlock`)과 수신정책 컬럼(`V1Team.contactPolicy`)은 **Phase 1 에서 이미 스키마에 들어가 있다** — 이번에 새로 넣는 스키마는 신고 사유 enum 하나뿐이다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Next.js App Router + TanStack Query (apps/v1_web)

**Spec:** `docs/superpowers/specs/2026-08-20-team-contact-message-design.md` (§8(b)(c), §11 — 2026-08-21 갱신본)

---

## Global Constraints

Phase 1 에서 **실제로 CI 를 red 로 만든 것들**이다. 전부 지켜라.

- **대상 스택은 `apps/v1_api` / `apps/v1_web`.** `apps/api` / `apps/web` 은 구버전이며 건드리지 않는다.
- **`prisma generate` 절대 금지.** 생성물이 `node_modules/.pnpm/@prisma+client@*/...` — **모노레포 전체 공유 경로**에 쓰여 다른 세션의 tsc·테스트를 깨뜨린다. worktree 의 node_modules 는 메인 트리 심링크다.
- **`prisma migrate dev` / `migrate reset` 금지.** 전자는 generate 를 돌리고, 후자는 20+ worktree 가 공유하는 `teameet_v1_dev` 를 비운다. 마이그레이션 SQL 은 **스키마-대-스키마 `migrate diff`** 로 만든다(§Task 1).
- **백엔드 `tsc --noEmit` 을 돌리지 마라.** 공유 Prisma 클라이언트가 stale 해서 새 필드가 타입에 없다. 유닛 테스트는 타입 진단을 끈 설정으로 돌린다(§환경). 백엔드 타입 정합은 **CI 가 generate 후 검증**한다.
- **프론트 `tsc --noEmit` 은 실전 게이트다.** 프론트는 Prisma 에 의존하지 않아 로컬에서 통과해야 한다. 깨지면 네 코드 문제다.
- **`.changeset/*.md` 를 반드시 추가한다.** 없으면 Gates job 의 "Verify release changeset" 이 exit 1 로 막는다(Phase 1 실사고). 사용자 관점 **해요체**로 쓴다.
- **`apps/v1_api/jest.config.ts` 의 transform/diagnostics 를 건드리지 마라.** integration `testMatch` 에 `test/team-contacts/**` 글롭은 **Phase 1 에서 이미 등록**돼 있으므로 그 디렉터리에 스펙을 추가하면 자동으로 CI 에 잡힌다.
- **DB 제약이 `schema.prisma` 에 안 보일 수 있다.** Phase 1 에서 `v1_chat_rooms_exactly_one_target_check` 가 raw SQL 이라 안 보였고, 컬럼만 추가했다가 **CI 에서 500** 이 났다. 테이블에 컬럼·값을 추가할 땐 `grep -rn "<table>" prisma/migrations/` 로 raw 제약을 먼저 확인한다.
- 에러는 NestJS 내장 예외 생성자에 `{ code, message, details? }` 를 넘긴다. `stateConflict` / `validationError` 는 **파일 로컬 함수**다(`team-contacts.service.ts` 에 이미 있음).
- 숫자 기본값은 `??`. cursor 페이지네이션은 `take: limit+1` → `{ items, pageInfo }`.
- UI 문구는 **해요체**. `v1-pattern-check.mjs` 가 합니다체를 자동으로 잡는다.
- **v1_web 에 공용 Toast/Modal 이 없다.** 인라인 `role="status"` + 기존 dialog 패턴을 쓴다. `EmptyState`/`ErrorState` 는 있다.
- `git stash` / `git add -A` / `git commit -a` 금지. 커밋은 경로 명시 + 직후 `git show --stat HEAD`.

### 환경 (worktree)

```bash
cd apps/v1_api && ./node_modules/.bin/jest \
  --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 <path>     # 백엔드 유닛
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json      # 프론트 타입 게이트
cd apps/v1_web && node scripts/v1-pattern-check.mjs                       # 해요체·토큰 검사
cd apps/v1_web && ./node_modules/.bin/vitest run                          # 프론트 전체
```
`pnpm` 은 PATH 에 없다. `timeout` 명령도 없다(macOS). 신규 spec 첫 실행은 ts-jest 콜드 캐시로 3분 이상 걸릴 수 있다 — 재실행하면 5초대다. **느리다고 코드를 의심하지 마라.**

---

## Phase 1 이 만들어 둔 것 (이번에 확장할 대상)

`apps/v1_api/src/team-contacts/team-contacts.service.ts`:
- `create(user, toTeamId, dto)` — advisory lock + 양방향 중복 검사 + 일일 10건(429)
- `accept` / `decline` / `withdraw` → `private respond(user, contactId, actorSide, nextStatus, declineReason?)`
- `private settleExpiry(contact)` / `private assertCanManageTeam(userId, teamId)` / `private assertParticipantSide(userId, contact)`
- `listForTeam(user, teamId, query)` / `detail(user, contactId)`

컨트롤러 6개: `POST|GET /teams/:teamId/contacts`, `GET /team-contacts/:contactId`,
`PATCH .../accept`, `PATCH .../decline`, `POST .../withdraw`

스키마에 **이미 있는 것**: `V1TeamContactBlock`(teamId/blockedTeamId/createdByUserId/reason, `@@unique([teamId, blockedTeamId])`),
`V1Team.contactPolicy`(`V1TeamContactPolicy` = open|recruiting_only|closed, 기본 open),
`V1InquiryRelatedType.team_contact`

---

### Task 1: 신고 사유 스키마 + 마이그레이션 + 재핀

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/<타임스탬프>_v1_inquiry_report_reason/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`

**Interfaces:**
- Produces: `V1InquiryReportReason` enum (`spam`/`harassment`/`impersonation`/`inappropriate`/`other`),
  `V1Inquiry.reportReason` nullable 컬럼, `@@index([reportReason, createdAt])`

- [ ] **Step 1: raw SQL 제약을 먼저 확인한다**

Phase 1 의 500 사고 재발 방지. `v1_inquiries` 에 걸린 CHECK/제약이 있는지 본다:
```bash
grep -rn "v1_inquiries" apps/v1_api/prisma/migrations/ | grep -iE "check|constraint" || echo "(raw 제약 없음)"
```
제약이 있으면 새 컬럼이 그것과 충돌하는지 판단하고, 필요하면 이 마이그레이션에서 함께 갱신한다.

- [ ] **Step 2: 스키마를 수정한다**

스펙 §8(b) 의 Prisma 블록을 그대로 옮긴다. `V1InquiryReportReason` enum 은 기존 `V1InquiryCategory`(schema.prisma:315) 근처에, `reportReason` 필드는 `V1Inquiry`(schema.prisma:2137) 의 `relatedId` 다음에 둔다. 인덱스도 기존 `@@index` 들 옆에 추가한다.

- [ ] **Step 3: 마이그레이션 SQL 을 만든다 — DB 도 Prisma 클라이언트도 건드리지 않고**

```bash
cd apps/v1_api
git show HEAD:apps/v1_api/prisma/schema.prisma > <scratchpad>/base-schema.prisma
MIG=prisma/migrations/$(date +%Y%m%d%H%M%S)_v1_inquiry_report_reason
mkdir -p "$MIG"
./node_modules/.bin/prisma migrate diff \
  --from-schema-datamodel <scratchpad>/base-schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$MIG/migration.sql"
```
생성된 SQL 이 **순수 additive** 인지 확인한다:
```bash
for pat in "DROP " "ALTER COLUMN" "SET NOT NULL" "DELETE FROM" "TRUNCATE"; do
  printf '%-16s %s\n' "$pat" "$(grep -ci "$pat" "$MIG/migration.sql")"
done
```
전부 0 이어야 한다. `CREATE TYPE` + `ALTER TABLE ADD COLUMN` + `CREATE INDEX` 만 나와야 정상이다.

> **expand-contract 게이트**: 이 세 statement 는 provably additive 라 통과한다. Phase 1 처럼
> `REVIEWED_NON_ADDITIVE` 허용목록에 손댈 필요가 **없다**. 만약 게이트가 막으면 그건 예상 밖이므로
> 임의로 허용목록에 넣지 말고 **BLOCKED 로 보고해라.**

- [ ] **Step 4: SOURCE_SNAPSHOT 재핀**

```bash
shasum -a 256 apps/v1_api/prisma/schema.prisma
```
출력 해시로 `apps/v1_api/test/fixtures/game-schema.fixture.ts` 의 `gameSchemaSourceManifest.schema` 를 교체한다. `.migration` 은 **건드리지 않는다**(바인딩된 `20260729000100_v1_game_operations` 를 수정하지 않았으므로).

같은 파일 기존 재핀 주석들과 같은 형식으로 사유를 남긴다 — 무엇이 바뀌었는지 / additive 인지 / game domain(V1Game*)을 안 건드렸는지 / 뒷받침 마이그레이션 파일명 / `.migration` 이 안 바뀐 이유.

- [ ] **Step 5: 해시 일치 확인**

```bash
echo "actual: $(shasum -a 256 apps/v1_api/prisma/schema.prisma | cut -d' ' -f1)"
echo "pinned: $(grep -oE "schema: '[0-9a-f]{64}'" apps/v1_api/test/fixtures/game-schema.fixture.ts | grep -oE '[0-9a-f]{64}')"
```
두 값이 같아야 한다. 통합 스펙(`test/games/game-schema.integration-spec.ts`)은 DB 가 필요하므로 **CI 에 맡긴다.**

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations apps/v1_api/test/fixtures/game-schema.fixture.ts
git commit -m "feat(v1-inquiries): 신고 사유 enum 추가 및 소스 스냅샷 재핀"
git show --stat HEAD
```

---

### Task 2: 발신 가드 통합 — 차단 + 수신정책 (스펙 §8(b)(c))

**차단과 수신정책을 한 태스크로 묶는 이유**: 스펙이 셋을 **같은 응답으로 통일**하라고 요구한다 —
차단됨 / `contactPolicy='closed'` / `recruiting_only` 인데 모집 중 아님 → 전부
`403 TEAM_CONTACT_NOT_ACCEPTING` + "이 팀은 지금 컨택을 받지 않고 있어요".
**응답이 갈리면 "우리가 차단당했구나"를 역추론할 수 있다.** 따라서 하나의 코드 경로다.

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts`
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`
- Modify: `apps/v1_api/src/team-contacts/dto/team-contact.dto.ts`

**Interfaces:**
- Produces: `private async assertRecipientAccepting(fromTeamId, toTeamId): Promise<void>` — 세 조건을 하나의 403 으로
- Produces: `createBlock(user, teamId, dto)` / `listBlocks(user, teamId)` / `removeBlock(user, teamId, blockedTeamId)`
- Produces: `updateContactPolicy(user, teamId, dto)`
- Produces: `CreateContactBlockDto { blockedTeamId: uuid; reason?: string(≤200) }`, `UpdateContactPolicyDto { contactPolicy: 'open'|'recruiting_only'|'closed' }`

- [ ] **Step 1: 실패 테스트를 쓴다**

`team-contacts.service.spec.ts` 에 이어 붙인다. `makePrisma()` 에 `v1TeamContactBlock: { findFirst, findMany, create, deleteMany }` 와 `v1Team: { findUnique, update }`, `v1TeamMatch: { findFirst }` 를 추가한다.

```ts
describe('발신 가드 — 차단·수신정책', () => {
  function acceptingPrisma() {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'new', fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue(null);
    prisma.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'open' });
    return prisma;
  }

  it('차단이 없고 정책이 open 이면 발신된다', async () => {
    const prisma = acceptingPrisma();
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
  });

  it('받는 팀이 나를 차단했으면 거부한다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      status: 403,
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
    expect(prisma.v1TeamContact.create).not.toHaveBeenCalled();
  });

  it('차단 검사는 양방향이다 — 내가 상대를 차단한 경우도 막는다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await service.create(actor, 'B', dto).catch(() => undefined);
    const where = prisma.v1TeamContactBlock.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamId: 'B', blockedTeamId: 'A' }),
        expect.objectContaining({ teamId: 'A', blockedTeamId: 'B' }),
      ]),
    );
  });

  it("정책이 closed 면 거부한다 — 차단과 **같은** 코드·메시지여야 한다", async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'closed' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      status: 403,
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
  });

  it('recruiting_only 인데 모집 중인 팀매치가 없으면 거부한다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'recruiting_only' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_NOT_ACCEPTING' },
    });
  });

  it('recruiting_only 이고 host 로 모집 중인 팀매치가 있으면 발신된다', async () => {
    const prisma = acceptingPrisma();
    prisma.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'recruiting_only' });
    prisma.v1TeamMatch.findFirst.mockResolvedValue({ id: 'tm1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.create(actor, 'B', dto)).resolves.toMatchObject({ id: 'new' });
    // '모집 중' = 이 팀이 host 인 recruiting 팀매치 (스펙 §2 확정 결정 5)
    const where = prisma.v1TeamMatch.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ hostTeamId: 'B', status: 'recruiting' });
  });

  it('세 거부 사유가 서로 구분되지 않는다 — 차단 여부를 역추론할 수 없어야 한다', async () => {
    const bodies: unknown[] = [];
    for (const setup of [
      (p: any) => { p.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1' }); },
      (p: any) => { p.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'closed' }); },
      (p: any) => {
        p.v1Team.findUnique.mockResolvedValue({ contactPolicy: 'recruiting_only' });
        p.v1TeamMatch.findFirst.mockResolvedValue(null);
      },
    ]) {
      const prisma = acceptingPrisma();
      setup(prisma);
      const service = new TeamContactsService(prisma, makeNotifications());
      const err: any = await service.create(actor, 'B', dto).catch((e) => e);
      bodies.push({ status: err.status, code: err.response.code, message: err.response.message });
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
  });
});

describe('차단 관리', () => {
  it('차단 목록은 그 팀 운영진만 볼 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.listBlocks(actor, 'B')).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('자기 팀은 차단할 수 없다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.createBlock(actor, 'A', { blockedTeamId: 'A' })).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_SELF_BLOCK_NOT_ALLOWED' },
    });
  });

  it('이미 차단한 팀을 다시 차단하면 멱등하게 통과한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContactBlock.findFirst.mockResolvedValue({ id: 'b1', blockedTeamId: 'B' });
    const service = new TeamContactsService(prisma, makeNotifications());
    const r = await service.createBlock(actor, 'A', { blockedTeamId: 'B' });
    expect(r.alreadyBlocked).toBe(true);
    expect(prisma.v1TeamContactBlock.create).not.toHaveBeenCalled();
  });
});

describe('수신 정책', () => {
  it('그 팀 운영진만 바꿀 수 있다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    const service = new TeamContactsService(prisma, makeNotifications());
    await expect(service.updateContactPolicy(actor, 'A', { contactPolicy: 'closed' }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('정책을 바꾸면 그 값으로 저장한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1Team.update.mockResolvedValue({ id: 'A', contactPolicy: 'recruiting_only' });
    const service = new TeamContactsService(prisma, makeNotifications());
    const r = await service.updateContactPolicy(actor, 'A', { contactPolicy: 'recruiting_only' });
    expect(r.contactPolicy).toBe('recruiting_only');
    expect(prisma.v1Team.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'A' }, data: { contactPolicy: 'recruiting_only' } }),
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest \
  --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/team-contacts/team-contacts.service.spec.ts
```
Expected: 새 테스트 FAIL(`service.listBlocks is not a function` 등), 기존 30개는 PASS.

- [ ] **Step 3: 구현한다**

`team-contacts.service.ts` 에 추가. **`assertRecipientAccepting` 은 `create()` 의 advisory lock 트랜잭션 *앞*에서 부른다** — 락 안에서 부르면 락 유지 시간이 길어지고, 이 검사는 팀쌍 경합과 무관하다.

```ts
/**
 * 받는 팀이 지금 컨택을 받는 상태인지 본다. 세 가지 거부 사유(차단 / closed /
 * recruiting_only 인데 모집 중 아님)를 **하나의 응답으로 통일**한다 — 응답이 갈리면
 * 발신자가 "우리가 차단당했구나" 를 역추론할 수 있다(스펙 §8(b)).
 */
private async assertRecipientAccepting(fromTeamId: string, toTeamId: string) {
  const notAccepting = () =>
    new ForbiddenException({
      code: 'TEAM_CONTACT_NOT_ACCEPTING',
      message: '이 팀은 지금 컨택을 받지 않고 있어요.',
    });

  // 양방향: 상대가 나를 차단했거나, 내가 상대를 차단했거나.
  const block = await this.prisma.v1TeamContactBlock.findFirst({
    where: {
      OR: [
        { teamId: toTeamId, blockedTeamId: fromTeamId },
        { teamId: fromTeamId, blockedTeamId: toTeamId },
      ],
    },
    select: { id: true },
  });
  if (block) throw notAccepting();

  const team = await this.prisma.v1Team.findUnique({
    where: { id: toTeamId },
    select: { contactPolicy: true },
  });
  if (!team) {
    throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
  }
  if (team.contactPolicy === 'closed') throw notAccepting();
  if (team.contactPolicy === 'recruiting_only') {
    // '모집 중' = 이 팀이 host 인 recruiting 팀매치가 하나라도 있음 (스펙 §2 확정 결정 5).
    // 캐시 컬럼을 두지 않는다 — 두면 공고 생성·마감 시 무효화 책임이 새로 생긴다.
    const recruiting = await this.prisma.v1TeamMatch.findFirst({
      where: { hostTeamId: toTeamId, status: 'recruiting' },
      select: { id: true },
    });
    if (!recruiting) throw notAccepting();
  }
}

async createBlock(user: V1AuthUser, teamId: string, dto: CreateContactBlockDto) {
  await this.assertCanManageTeam(user.id, teamId);
  if (dto.blockedTeamId === teamId) {
    throw stateConflict('자기 팀은 차단할 수 없어요.', 'TEAM_CONTACT_SELF_BLOCK_NOT_ALLOWED');
  }
  const existing = await this.prisma.v1TeamContactBlock.findFirst({
    where: { teamId, blockedTeamId: dto.blockedTeamId },
    select: { id: true },
  });
  if (existing) return { block: existing, alreadyBlocked: true };

  const block = await this.prisma.v1TeamContactBlock.create({
    data: {
      teamId,
      blockedTeamId: dto.blockedTeamId,
      createdByUserId: user.id,
      reason: dto.reason ?? null,
    },
  });
  return { block, alreadyBlocked: false };
}

async listBlocks(user: V1AuthUser, teamId: string) {
  await this.assertCanManageTeam(user.id, teamId);
  const items = await this.prisma.v1TeamContactBlock.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    include: { blockedTeam: { select: { id: true, name: true } } },
  });
  return { items };
}

async removeBlock(user: V1AuthUser, teamId: string, blockedTeamId: string) {
  await this.assertCanManageTeam(user.id, teamId);
  const result = await this.prisma.v1TeamContactBlock.deleteMany({ where: { teamId, blockedTeamId } });
  // 멱등: 이미 없으면 그냥 removed:false. 없는 차단을 지우는 건 오류가 아니다.
  return { removed: result.count > 0 };
}

async updateContactPolicy(user: V1AuthUser, teamId: string, dto: UpdateContactPolicyDto) {
  await this.assertCanManageTeam(user.id, teamId);
  const team = await this.prisma.v1Team.update({
    where: { id: teamId },
    data: { contactPolicy: dto.contactPolicy },
    select: { id: true, contactPolicy: true },
  });
  return team;
}
```

`create()` 안에서 `assertCanManageTeam` 직후, 자기팀 검사 다음에 한 줄 추가:
```ts
await this.assertRecipientAccepting(dto.fromTeamId, toTeamId);
```

DTO 두 개 추가:
```ts
export class CreateContactBlockDto {
  @IsUUID()
  blockedTeamId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class UpdateContactPolicyDto {
  @IsIn(['open', 'recruiting_only', 'closed'])
  contactPolicy!: 'open' | 'recruiting_only' | 'closed';
}
```

- [ ] **Step 4: 테스트를 돌린다**

Expected: 기존 30개 + 신규 11개 = 41개 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/team-contacts
git commit -m "feat(v1-team-contacts): 차단·수신정책 발신 가드와 관리 API"
git show --stat HEAD
```

---

### Task 3: 컨트롤러 + 신고 사유 배선

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.controller.ts`
- Modify: `apps/v1_api/src/inquiries/` (신고 생성 DTO 에 `reportReason` 수용)
- Modify: 각 `*.spec.ts`

**Interfaces:**
- Produces 엔드포인트 4개:

| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | `/teams/:teamId/contact-blocks` | `:teamId` owner/manager |
| GET | `/teams/:teamId/contact-blocks` | 〃 |
| DELETE | `/teams/:teamId/contact-blocks/:blockedTeamId` | 〃 |
| PATCH | `/teams/:teamId/contact-policy` | 〃 |

- [ ] **Step 1: 기존 문의 생성 경로를 먼저 읽는다**

```bash
grep -rn "category" apps/v1_api/src/inquiries/dto/*.ts | head
grep -n "async create" -A 20 apps/v1_api/src/inquiries/inquiries.service.ts | head -25
```
**추측하지 마라.** DTO 필드명·검증 데코레이터·서비스 시그니처를 실제로 읽고, 거기에 `reportReason` 을 optional 로 얹는다. `@IsOptional() @IsIn([...])` 형태가 이 저장소 관례다.

- [ ] **Step 2: 신고 사유 검증 테스트를 쓴다**

```ts
it('신고(category=report)에 사유를 붙여 저장한다', async () => { /* reportReason 이 create data 에 실린다 */ });
it('신고가 아닌 문의에 사유를 넣으면 무시하거나 거부한다', async () => { /* 어느 쪽인지 정해서 단언 */ });
```
두 번째는 **네가 정해서 일관되게 구현하고 그대로 단언해라** — 조용히 저장해 버리면 나중에 집계가 오염된다.

- [ ] **Step 3: 컨트롤러 4개를 추가한다**

`@Controller()` 에 prefix 없이 메서드마다 전체 경로. `@UseGuards(V1AuthGuard)`, `@CurrentUser() user: V1AuthUser`.
DELETE 는 `@Param('blockedTeamId')` 를 받는다. **컨트롤러에 로직을 넣지 마라 — 순수 라우팅이다.**

- [ ] **Step 4: 게이트**

```bash
cd apps/v1_api && ./node_modules/.bin/jest \
  --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/team-contacts src/inquiries
```

- [ ] **Step 5: 커밋** (경로 명시 + `git show --stat HEAD`)

---

### Task 4: 프론트 훅 + 쿼리키

**Files:**
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts`, `apps/v1_web/src/lib/query-keys.ts`

**Interfaces:**
- `useV1TeamContactBlocks(teamId)` / `useV1CreateTeamContactBlock(teamId)` / `useV1RemoveTeamContactBlock(teamId)`
- `useV1UpdateContactPolicy(teamId)`
- 쿼리키: `v1Keys.teamContactBlocks(teamId)`

- [ ] **Step 1: 기존 관용구를 확인한다**

`useV1TeamContacts` 바로 옆에 둔다. invalidate 스코프에 주의 — **차단을 추가·해제하면 차단 목록만이 아니라 팀 상세도 무효화해야 한다**(컨택 CTA 노출 조건이 바뀔 수 있다). Phase 1 리뷰에서 정확히 이 유형(단건만 무효화)이 Critical 로 잡혔다.

- [ ] **Step 2: `enabled` 가드를 붙인다** — `enabled: Boolean(teamId)`. 같은 파일 다른 단건 훅과 일관되게.

- [ ] **Step 3: 게이트**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json   # exit 0 필수
```

- [ ] **Step 4: 커밋**

---

### Task 5: 팀 관리 화면 — 차단 목록 + 수신 설정

**Files:**
- Create/Modify: `apps/v1_web/src/app/teams/[id]/contact/` 하위 관리 라우트 또는 기존 팀 관리 화면 확장
- Create: 해당 클라이언트 컴포넌트 + `*.test.tsx`

- [ ] **Step 1: 어디에 붙일지 먼저 정한다**

`apps/v1_web/src/app/teams/[id]/` 아래에 `edit` / `members` / `records` / `schedules` / `contact` 가 이미 있다.
**기존 팀 관리 진입점(`TeamDetailViewModel.operations`)이 어떤 항목들을 갖고 있는지 읽고**, 거기에 "컨택 설정" 을 추가하는 것이 자연스러운지 판단해라. 새 최상위 라우트를 임의로 만들지 마라.

- [ ] **Step 2: 요구사항**

- **수신 설정**: 3지선다 칩/라디오 (`open` / `recruiting_only` / `closed`). 각 옵션에 **무슨 뜻인지 한 줄 설명**을 붙인다 — `recruiting_only` 는 "왜 안 오지?" 를 유발하기 쉬우므로 "경기 상대를 구하는 중일 때만 받아요" 처럼 풀어 쓴다.
- **차단 목록**: 팀 이름 + 차단 시각 + 해제 버튼. 비었으면 빈 상태 안내. `EmptyState` 사용.
- 모든 인터랙티브 요소 `min-h-[44px]`, 아이콘 버튼 `aria-label`, 상태를 색만으로 전달 금지.
- 다크모드 대응, Tailwind 토큰/`tm-*` 클래스 (하드코딩 색·`text-[Npx]` 금지).
- 에러는 인라인 `role="status"` (공용 Toast 없음).

- [ ] **Step 3: 테스트 (최소 4개)**

1. 현재 정책이 선택된 상태로 렌더된다
2. 다른 정책을 고르면 mutation 이 그 값으로 호출된다
3. 차단 목록이 비었을 때 빈 상태가 보인다
4. 해제 버튼이 `blockedTeamId` 로 mutation 을 부른다

**테스트를 먼저 쓰고 실행해 red 를 확인해라.** 파일 리네임으로 red 를 만들지 마라 — 그건 모듈 부재 확인이지 동작 확인이 아니다(Phase 1 지적 사항).

- [ ] **Step 4: 게이트** — tsc 0 / pattern-check / vitest 회귀 0
- [ ] **Step 5: 커밋**

---

### Task 6: 컨택 상세 — 신고하기

**Files:**
- Modify: `apps/v1_web/src/components/my/my-team-contacts-client.tsx` + 테스트

- [ ] **Step 1: 신고 UI**

컨택 상세에 "신고하기". 클릭하면 **사유 선택**(5지선다: 스팸/괴롭힘/사칭·허위팀/부적절한 내용/기타) + 선택적 상세 설명을 받아 문의를 생성한다. 기존 dialog 패턴(`components/teams/jersey-number-dialog.tsx`)을 본뜬다 — 공용 Modal 이 없다.

전송은 기존 문의 생성 경로에 `category='report'`, `relatedType='team_contact'`, `relatedId=contactId`, `reportReason=<선택값>` 을 실어 보낸다.

- [ ] **Step 2: 노출 조건**

컨택 **참가자(양 팀 운영진)** 에게만 보인다. 이미 상세 페이지가 참가자 전제이므로(`assertParticipantSide` 가 비참가자를 403 처리) 추가 게이트는 불필요하지만, **버튼을 상태와 무관하게 항상 노출할지**는 정해서 일관되게 구현해라 — 만료·거절된 컨택도 신고할 수 있어야 하는가? (권장: 예. 부적절한 메시지는 상태와 무관하다.)

- [ ] **Step 3: 테스트 (최소 3개)**

1. 신고 버튼이 보이고 누르면 사유 선택이 뜬다
2. 사유를 고르고 보내면 mutation 이 `reportReason` 을 포함해 호출된다
3. 사유를 안 고르면 보내기가 비활성이다

- [ ] **Step 4: 게이트 + 커밋**

---

### Task 7: 통합 테스트 + changeset

**Files:**
- Create: `apps/v1_api/test/team-contacts/team-contact-guards.integration-spec.ts`
- Create: `.changeset/team-contact-blocks-and-policy.md`

- [ ] **Step 1: 통합 스펙**

`test/team-contacts/**` 글롭은 **Phase 1 에서 이미 `jest.config.ts` 에 등록**돼 있으므로 파일만 추가하면 CI 가 잡는다. 확인:
```bash
cd apps/v1_api && ./node_modules/.bin/jest --selectProjects integration --listTests | grep "test/team-contacts/"
```

시나리오(실 DB, 실제 HTTP):
1. A→B 컨택이 정상 발신된다 (기준선)
2. B 가 A 를 차단하면 A→B 발신이 403 `TEAM_CONTACT_NOT_ACCEPTING`
3. 차단을 해제하면 다시 발신된다
4. B 의 정책을 `closed` 로 바꾸면 403 — **2번과 응답 본문이 바이트 동일**한지 단언
5. 정책 `recruiting_only` + 모집 중 팀매치 없음 → 403 (역시 동일 응답)
6. 신고를 생성하면 `V1Inquiry` 에 `category='report'` + `relatedId=contactId` + `reportReason` 이 저장된다

**4·5 의 "응답 동일" 단언이 이 태스크의 핵심이다** — 스펙이 요구한 프라이버시 성질을 실제 HTTP 응답으로 증명한다.

- [ ] **Step 2: 통합 테스트를 로컬에서 실행하지 마라**

전용 DB(`v1_migrate_check` / `ulw_v1_integration_` 접두사)가 이 환경에 없다. `--listTests` 로 선택 여부만 확인하고 **CI 에 맡긴다.** Phase 1 에서 이 결정의 비용(CI red 1회)이 실제로 발생했지만, 그 덕에 진짜 버그를 잡았다.

- [ ] **Step 3: changeset**

`.changeset/team-contact-blocks-and-policy.md` — `"v1_api": minor` + `"v1_web": minor`, 사용자 관점 **해요체**.
**빠뜨리면 Gates 가 exit 1 로 막는다.**

- [ ] **Step 4: 전체 게이트 + 커밋 + PR**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/team-contacts src/inquiries
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs && ./node_modules/.bin/vitest run
```
PR 은 `--base dev`. 머지 직전 `gh pr view <N> --json baseRefName` 로 `dev` 확인.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 담당 Task |
|---|---|
| §8(b) 차단 — 양방향 체크 | Task 2 |
| §8(b) 실패 사유 통일 (403 동일 응답) | Task 2 + Task 7(통합 증명) |
| §8(b) 신고 — `V1Inquiry` 재사용 | Task 3 + Task 6 |
| §8(b) 신고 사유 구조화 (2026-08-21 결정) | Task 1(스키마) + Task 3(배선) + Task 6(UI) |
| §8(c) 수신 설정 3지 | Task 2(서비스) + Task 3(엔드포인트) + Task 5(UI) |
| §8(c) `recruiting_only` 판정 = host recruiting 팀매치 | Task 2 |
| §11 재핀 | Task 1 |

빠진 항목 없음. **어드민 원클릭 조치는 스펙이 명시적으로 제외**했으므로 태스크 없음.

**2. 플레이스홀더**

Task 3 Step 1 과 Task 5 Step 1 이 "먼저 읽고 판단하라" 로 돼 있는 것은 의도적이다 — 기존 문의 DTO 형태와 팀 관리 진입점 구조를 **추측으로 쓰면 Phase 1 에서처럼 브리프가 틀린다**(생성자 인자 수, fire-and-forget, 라우트 세그먼트명 등 4회 발생). 무엇을 확인해야 하는지는 명시했다.

**3. 타입 일관성**

- `assertRecipientAccepting`(발신 가드) vs `assertCanManageTeam`(권한) vs `assertParticipantSide`(양쪽 중 하나) — 셋의 용도를 각 태스크에서 구분해 명시했다.
- `TEAM_CONTACT_NOT_ACCEPTING` 은 Task 2·7 에서 같은 철자를 쓴다.
- `createBlock` 반환 `{ block, alreadyBlocked }` / `removeBlock` 반환 `{ removed }` — Task 2 에서 정의, Task 4 훅이 소비.

**4. 모호함**

두 곳을 구현자 판단에 맡겼고 그 사실을 명시했다: ① 신고가 아닌 문의에 `reportReason` 이 오면 무시할지 거부할지 ② 만료·거절된 컨택도 신고 가능하게 할지(권장안 제시). 둘 다 "정해서 일관되게 구현하고 그대로 단언하라"고 적었다.
