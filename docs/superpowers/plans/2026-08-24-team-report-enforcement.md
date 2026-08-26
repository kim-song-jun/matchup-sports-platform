# 팀 컨택 신고 운영 조치 + 팀별 롤업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접수된 팀 컨택 신고를 운영자가 판단(팀별 누적 근거)하고 조치(팀 정지 · 대리 차단)할 수 있게 한다.

**Architecture:** `V1Inquiry` 에 `reportedTeamId` 를 저장하고 기존분은 백필해, 롤업 집계를 인덱스 하나로 끝낸다. 조치는 기존 `changeTeamStatus` 를 재사용하고 대리 차단만 신규로 만든다. 감사는 기존 `writeAdminStatusLogs` 를 그대로 쓴다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (`apps/v1_api`) · Next.js App Router + TanStack Query + Vitest (`apps/v1_web`)

**Spec:** `docs/superpowers/specs/2026-08-24-team-report-enforcement-design.md`

## Global Constraints

- **`prisma generate` 실행 금지.** 모노레포 공유 클라이언트라 다른 세션의 tsc 를 깨뜨린다. 백엔드 유닛 테스트는 타입 진단을 끈 scratchpad jest config 로 돌린다.
- **공유 개발 DB(`teameet_v1_dev`) 쓰기 금지.** `prisma migrate dev` / `migrate reset` 금지. 마이그레이션 SQL 은 손으로 쓰거나 `migrate diff` 로 만든다.
- **`git stash` 금지.** `git add -A` / `git commit -a` / `git reset --hard` / `git clean -fd` 금지. 커밋은 내가 만든 경로만 pathspec 으로.
- **`schema.prisma` 를 건드리면 `gameSchemaSourceManifest.schema` 재핀이 필요하다** (`apps/v1_api/test/fixtures/game-schema.fixture.ts`). 값은 병합된 `schema.prisma` 의 `shasum -a 256` 이고, 왜 바뀌었는지 주석을 남긴다.
- **백필 `UPDATE` 는 expand-contract 게이트에 막힌다.** `scripts/qa/check-expand-contract-migrations.mjs` 의 `REVIEWED_NON_ADDITIVE` 에 `{ file, statement, reason }` 을 한 문장씩 등록한다.
- **에러 코드는 `DOMAIN_CODE` 형태.** 사용자 대면 문구는 **해요체**. 단, `inquiries` 서비스의 기존 메시지는 영어이나 **프론트 `extractErrorMessage` 가 서버 message 를 fallback 보다 먼저 반환하므로**, 사용자에게 노출되는 새 메시지는 한국어로 쓴다.
- **`apps/v1_web` 은 `tm-*` 클래스 + CSS 변수** 토큰 체계다(Tailwind `dark:` 아님). 단 **어드민 화면은 Tailwind 유틸을 함께 쓴다** — 이웃 줄을 복사해 맞춘다.
- **공용 `EmptyState` 는 `@/components/v1-ui/primitives` 에 있다.** 파일명으로 검색하면 안 나온다 — export 심볼로 grep 할 것.
- 인터랙티브 요소 최소 44px, 아이콘 버튼 `aria-label`, 색만으로 정보 전달 금지.
- **로컬 next dev/build 서버를 띄우지 마라.** 시각 검증은 alpha 배포 후 수행한다.
- 기존 테스트의 단언을 지우거나 약화시키지 마라 — mock 보강만 허용.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `apps/v1_api/prisma/schema.prisma` | `V1Inquiry.reportedTeamId` + 관계 + 인덱스 |
| `apps/v1_api/prisma/migrations/2026…_v1_inquiry_reported_team/migration.sql` | 컬럼·인덱스·FK (additive) |
| `apps/v1_api/prisma/migrations/2026…_v1_inquiry_reported_team_backfill/migration.sql` | 기존 신고 백필 (UPDATE) |
| `apps/v1_api/test/fixtures/game-schema.fixture.ts` | 소스 스냅샷 재핀 |
| `scripts/qa/check-expand-contract-migrations.mjs` | 백필 허용목록 등록 |
| `apps/v1_api/src/inquiries/inquiries.service.ts` | 신고 시점 대상 계산·저장 |
| `apps/v1_api/src/admin/admin.service.ts` | 롤업 집계 · 문의 목록 `reportedTeamId` 필터 · 대리 차단 |
| `apps/v1_api/src/admin/admin.controller.ts` | 신규 엔드포인트 2개 |
| `apps/v1_api/src/admin/dto/admin.dto.ts` | 쿼리·바디 DTO |
| `apps/v1_web/src/app/admin/inquiries/[id]/page.tsx` | 롤업 요약 + 조치 버튼 |
| `apps/v1_web/src/app/admin/inquiries/page.tsx` | `reportedTeamId` 필터(딥링크 수신) |
| `apps/v1_web/src/app/admin/reports/teams/page.tsx` | 신고 누적 팀 목록 (신규) |
| `apps/v1_web/src/app/teams/[id]/contact/settings/team-contact-settings-client.tsx` | 차단 사유 표시 |
| `apps/v1_web/src/hooks/use-v1-api.ts` | 신규 훅 3종 |
| `apps/v1_api/test/team-contacts/report-enforcement.integration-spec.ts` | 통합 |

---

## Task 1: 스키마 · 백필 · 재핀

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/20260824100000_v1_inquiry_reported_team/migration.sql`
- Create: `apps/v1_api/prisma/migrations/20260824100100_v1_inquiry_reported_team_backfill/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`
- Modify: `scripts/qa/check-expand-contract-migrations.mjs`

**Interfaces:**
- Produces: `V1Inquiry.reportedTeamId: String?`, 관계 `reportedTeam`, 인덱스 `@@index([reportedTeamId, createdAt])`

- [ ] **Step 1: `schema.prisma` 의 `V1Inquiry` 에 필드·관계·인덱스를 넣는다**

`reportReason` 줄 바로 아래에 필드를 넣고, `user` 관계 아래에 관계를, 인덱스는 `@@index([reportReason, createdAt])` 아래에 넣는다.

```prisma
  reportedTeamId String?                @map("reported_team_id")
```

```prisma
  reportedTeam V1Team? @relation("V1InquiryReportedTeam", fields: [reportedTeamId], references: [id], onDelete: SetNull)
```

```prisma
  @@index([reportedTeamId, createdAt])
```

`V1Team` 모델에도 역방향 관계를 추가한다(Prisma 가 요구한다). `V1Team` 의 관계 목록 아무 곳에나:

```prisma
  reportedInquiries V1Inquiry[] @relation("V1InquiryReportedTeam")
```

- [ ] **Step 2: additive 마이그레이션을 쓴다**

`apps/v1_api/prisma/migrations/20260824100000_v1_inquiry_reported_team/migration.sql`:

```sql
-- 신고 대상 팀. 신고가 아닌 문의는 NULL 이다.
ALTER TABLE "v1_inquiries" ADD COLUMN     "reported_team_id" TEXT;

-- 팀이 사라져도 신고 기록은 남아야 한다 — Cascade 면 팀 삭제가 감사 이력에 구멍을 낸다.
ALTER TABLE "v1_inquiries" ADD CONSTRAINT "v1_inquiries_reported_team_id_fkey"
  FOREIGN KEY ("reported_team_id") REFERENCES "v1_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "v1_inquiries_reported_team_id_created_at_idx" ON "v1_inquiries"("reported_team_id", "created_at");
```

- [ ] **Step 3: 백필 마이그레이션을 쓴다**

`apps/v1_api/prisma/migrations/20260824100100_v1_inquiry_reported_team_backfill/migration.sql`:

```sql
-- 기존 신고의 대상 팀을 한 번 계산해 채운다. 대상은 "컨택의 두 팀 중 신고자가 속하지 않은 쪽"이다.
-- active 멤버십만 인정한다 — 이미 떠난(left/removed) 소속으로 대상을 정하면 엉뚱한 팀에 신고가 쌓인다.
-- 판정이 안 되는 행(양쪽 다 아니거나 양쪽 다 운영진)은 NULL 로 남긴다: 억지로 한쪽을 고르면
-- 잘못된 팀에 누적된다.
UPDATE "v1_inquiries" i
SET "reported_team_id" = sub.reported_team_id
FROM (
  SELECT i2."id" AS id,
         CASE
           WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m
                        WHERE m."team_id" = c."from_team_id" AND m."user_id" = i2."user_id" AND m."status" = 'active')
             THEN c."to_team_id"
           WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m
                        WHERE m."team_id" = c."to_team_id" AND m."user_id" = i2."user_id" AND m."status" = 'active')
             THEN c."from_team_id"
           ELSE NULL
         END AS reported_team_id
  FROM "v1_inquiries" i2
  JOIN "v1_team_contacts" c ON c."id" = i2."related_id"
  WHERE i2."related_type" = 'team_contact'
    AND i2."category" = 'report'
    AND i2."user_id" IS NOT NULL
) sub
WHERE i."id" = sub.id AND sub.reported_team_id IS NOT NULL;
```

- [ ] **Step 4: expand-contract 허용목록에 등록한다**

`scripts/qa/check-expand-contract-migrations.mjs` 의 `REVIEWED_NON_ADDITIVE` 배열 **끝**에 추가한다. `statement` 는 게이트가 출력하는 정규화 문자열과 정확히 일치해야 하므로, 먼저 게이트를 돌려 실패 메시지에 찍히는 문자열을 그대로 복사한다.

```js
  {
    file: 'apps/v1_api/prisma/migrations/20260824100100_v1_inquiry_reported_team_backfill/migration.sql',
    statement: '<게이트 실패 출력에 찍힌 문자열을 그대로>',
    reason:
      'Backfills only the newly introduced nullable reported_team_id. It reads existing rows but writes no pre-existing column, so a rolling deploy running the old code sees an unchanged schema surface. Rollback is DROP COLUMN, which the preceding additive migration owns. Rows whose reporter has no active membership on either side are intentionally left NULL rather than guessed.',
  },
```

**배열 끝을 찾을 때 `rindex('];')` 를 쓰지 마라** — 파일 아래쪽 `selfTest` 안의 배열에 잘못 들어간다(Phase 1 에서 실제로 그랬다). `REVIEWED_NON_ADDITIVE` 선언 위치에서 아래로 읽어 그 배열의 닫는 괄호를 찾아라.

- [ ] **Step 5: 게이트를 돌려 통과를 확인한다**

```bash
cd <repo-root>
node scripts/qa/check-expand-contract-migrations.mjs "$(git rev-parse origin/dev)" "$(git rev-parse HEAD)"
```
Expected: `... passed`

- [ ] **Step 6: 소스 스냅샷을 재핀한다**

```bash
shasum -a 256 apps/v1_api/prisma/schema.prisma
```
그 값을 `apps/v1_api/test/fixtures/game-schema.fixture.ts` 의 `gameSchemaSourceManifest.schema` 에 넣고, **왜 바뀌었는지** 주석을 남긴다: `V1Inquiry.reportedTeamId` nullable 컬럼 + FK + 인덱스 추가이며 game domain(`V1Game*`)은 한 줄도 건드리지 않았다는 것, 뒷받침 마이그레이션 이름.

- [ ] **Step 7: 스냅샷 테스트가 통과하는지 확인한다**

```bash
node -e "const {createHash}=require('crypto'),{readFileSync}=require('fs');
const a=createHash('sha256').update(readFileSync('apps/v1_api/prisma/schema.prisma')).digest('hex');
const p=readFileSync('apps/v1_api/test/fixtures/game-schema.fixture.ts','utf8').match(/schema: '([a-f0-9]{64})'/)[1];
console.log(a===p?'MATCH':'MISMATCH');"
```
Expected: `MATCH`

- [ ] **Step 8: 커밋**

```bash
git add apps/v1_api/prisma apps/v1_api/test/fixtures/game-schema.fixture.ts scripts/qa/check-expand-contract-migrations.mjs
git commit -m "feat(v1-inquiries): 신고 대상 팀 컬럼 추가와 백필"
git show --stat HEAD
```

---

## Task 2: 신고 시점에 대상 팀을 기록한다

**Files:**
- Modify: `apps/v1_api/src/inquiries/inquiries.service.ts`
- Test: `apps/v1_api/src/inquiries/inquiries.service.spec.ts`

**Interfaces:**
- Consumes: `V1Inquiry.reportedTeamId` (Task 1)
- Produces: `InquiriesService.create()` 가 `category='report' && relatedType='team_contact'` 일 때 `reportedTeamId` 를 채운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`inquiries.service.spec.ts` 의 기존 mock 구조를 먼저 읽고 그 관용구를 따른다. `prisma.v1TeamContact.findUnique` 와 `prisma.v1TeamMembership.findFirst` mock 이 필요하다.

```ts
describe('신고 대상 팀 기록', () => {
  it('신고자가 fromTeam 소속이면 대상은 toTeam 이다', async () => {
    prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamMembership.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.teamId === 'A' ? { id: 'm1' } : null),
    );

    await service.create(user, {
      category: 'report', relatedType: 'team_contact', relatedId: 'c1',
      reportReason: 'spam', title: '신고', body: '내용',
    } as any);

    expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: 'B' }) }),
    );
  });

  it('신고자가 toTeam 소속이면 대상은 fromTeam 이다', async () => {
    prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamMembership.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.teamId === 'B' ? { id: 'm1' } : null),
    );

    await service.create(user, {
      category: 'report', relatedType: 'team_contact', relatedId: 'c1',
      reportReason: 'spam', title: '신고', body: '내용',
    } as any);

    expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: 'A' }) }),
    );
  });

  // 남의 컨택 id 를 넣어 신고해도 대상이 정해지지 않는다 — 별도 권한 검사 없이 이것이 방어가 된다.
  it('어느 팀에도 속하지 않으면 대상은 null 이고 접수는 성공한다', async () => {
    prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);

    await service.create(user, {
      category: 'report', relatedType: 'team_contact', relatedId: 'c1',
      reportReason: 'spam', title: '신고', body: '내용',
    } as any);

    expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: null }) }),
    );
  });

  it('신고가 아닌 문의는 컨택을 조회하지 않는다', async () => {
    await service.create(user, { category: 'account', title: '문의', body: '내용' } as any);

    expect(prisma.v1TeamContact.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: red 를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/inquiries
```
Expected: 위 4개 중 최소 3개 FAIL (`reportedTeamId` 가 아직 안 실린다)

- [ ] **Step 3: 구현한다**

`create()` 안, 기존 `reportReason` 가드 **뒤**, `prisma.v1Inquiry.create()` **앞**에 넣는다.

```ts
    // 신고 대상 팀을 신고 시점에 확정한다. 조회 때 추론하면 신고자가 팀을 옮겼을 때 답이 달라진다.
    // 대상을 못 정해도 신고 접수는 실패시키지 않는다 — 신고를 막는 것보다 대상 미상으로 받는 편이 낫다.
    // 부수 효과로 권한 검사가 된다: 남의 컨택 id 를 넣어도 신고자가 그 컨택의 어느 팀에도 속하지
    // 않으면 대상이 null 이 되어 그 팀에 신고가 누적되지 않는다.
    const reportedTeamId = await this.resolveReportedTeamId(user.id, dto);
```

같은 클래스에 private 메서드를 추가한다.

```ts
  private async resolveReportedTeamId(userId: string, dto: CreateInquiryDto): Promise<string | null> {
    if (dto.category !== 'report' || dto.relatedType !== 'team_contact' || !dto.relatedId) return null;

    const contact = await this.prisma.v1TeamContact.findUnique({
      where: { id: dto.relatedId.trim() },
      select: { fromTeamId: true, toTeamId: true },
    });
    if (!contact) return null;

    const isMemberOf = async (teamId: string) =>
      Boolean(
        await this.prisma.v1TeamMembership.findFirst({
          where: { teamId, userId, status: 'active' },
          select: { id: true },
        }),
      );

    if (await isMemberOf(contact.fromTeamId)) return contact.toTeamId;
    if (await isMemberOf(contact.toTeamId)) return contact.fromTeamId;
    return null;
  }
```

`create()` 의 `data` 에 `reportedTeamId` 를 싣는다(`reportReason` 옆).

```ts
        reportedTeamId,
```

- [ ] **Step 4: green 을 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/inquiries
```
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1-inquiries): 신고 시점에 대상 팀을 확정해 저장한다" -- apps/v1_api/src/inquiries
git show --stat HEAD
```

---

## Task 3: 롤업 집계와 문의 목록 필터 (백엔드)

**Files:**
- Modify: `apps/v1_api/src/admin/admin.service.ts`
- Modify: `apps/v1_api/src/admin/dto/admin.dto.ts`
- Modify: `apps/v1_api/src/admin/admin.controller.ts`
- Test: `apps/v1_api/src/admin/admin-list.service.spec.ts`

**Interfaces:**
- Consumes: `V1Inquiry.reportedTeamId` (Task 1)
- Produces:
  - `AdminInquiryListQueryDto.reportedTeamId?: string`
  - `getInquiry()` 응답에 `reportedTeam: { teamId, name, status, recentReportCount, reasonBreakdown } | null`
  - `listReportedTeams(user, query)` → `{ items: Array<{ teamId, name, status, recentCount, totalCount, topReason, lastReportedAt }> }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`admin-list.service.spec.ts` 의 기존 관용구(`prisma` mock 객체, `activeAdminRecord`)를 그대로 따른다.

```ts
describe('신고 롤업', () => {
  it('신고 상세에 대상 팀의 최근 30일 신고 요약이 붙는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findUnique.mockResolvedValue({
      ...makeInquiryDetailRow(),
      category: 'report',
      reportedTeamId: 'team-x',
      reportedTeam: { id: 'team-x', name: '문제팀', status: 'active' },
    });
    prisma.v1Inquiry.count.mockResolvedValue(3);
    prisma.v1Inquiry.groupBy.mockResolvedValue([
      { reportReason: 'spam', _count: { _all: 2 } },
      { reportReason: 'harassment', _count: { _all: 1 } },
    ]);

    const result = await service.getInquiry(adminAuthUser, 'inq-1');

    expect(result.reportedTeam).toMatchObject({
      teamId: 'team-x', name: '문제팀', status: 'active', recentReportCount: 3,
    });
    expect(result.reportedTeam.reasonBreakdown).toEqual({ spam: 2, harassment: 1 });
  });

  it('대상 팀이 없는 문의는 요약이 null 이다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findUnique.mockResolvedValue({
      ...makeInquiryDetailRow(), category: 'account', reportedTeamId: null, reportedTeam: null,
    });

    const result = await service.getInquiry(adminAuthUser, 'inq-1');

    expect(result.reportedTeam).toBeNull();
    // 대상이 없으면 집계 쿼리를 아예 돌리지 않는다 — 모든 문의 상세가 비용을 치르면 안 된다.
    expect(prisma.v1Inquiry.count).not.toHaveBeenCalled();
  });

  it('reportedTeamId 필터가 목록 조회에 걸린다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findMany.mockResolvedValue([makeInquiryRow()]);
    prisma.v1Inquiry.groupBy.mockResolvedValue([]);

    await service.listInquiries(adminAuthUser, { reportedTeamId: 'team-x' } as any);

    expect(prisma.v1Inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reportedTeamId: 'team-x' }) }),
    );
  });

  it('신고 누적 팀 목록은 건수 내림차순으로 돌려준다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.groupBy.mockResolvedValue([
      { reportedTeamId: 'team-a', _count: { _all: 5 }, _max: { createdAt: new Date('2026-08-20') } },
      { reportedTeamId: 'team-b', _count: { _all: 2 }, _max: { createdAt: new Date('2026-08-22') } },
    ]);
    prisma.v1Team.findMany.mockResolvedValue([
      { id: 'team-a', name: 'A팀', status: 'active' },
      { id: 'team-b', name: 'B팀', status: 'suspended' },
    ]);

    const result = await service.listReportedTeams(adminAuthUser, {} as any);

    expect(result.items.map((i: any) => i.teamId)).toEqual(['team-a', 'team-b']);
    expect(result.items[0]).toMatchObject({ name: 'A팀', status: 'active', totalCount: 5 });
  });
});
```

- [ ] **Step 2: red 를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/admin
```
Expected: 위 4개 FAIL

- [ ] **Step 3: DTO 를 추가한다**

`admin.dto.ts` 의 `AdminInquiryListQueryDto` 에 필드를 넣는다(기존 `reportReason` 아래).

```ts
  @IsOptional()
  @IsString()
  reportedTeamId?: string;
```

같은 파일에 목록 쿼리 DTO 를 추가한다.

```ts
export class AdminReportedTeamListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
```

- [ ] **Step 4: `listInquiries` 에 필터를 건다**

`admin.service.ts` 의 facet where 조립부에 넣는다. **세 facet 모두에 걸어야 한다** — 그래야 사유 칩 건수가 "이 팀 안에서" 의 숫자가 된다.

```ts
    const reportedTeamWhere: Prisma.V1InquiryWhereInput = query.reportedTeamId
      ? { reportedTeamId: query.reportedTeamId }
      : {};
```

`statusFacetWhere` / `categoryFacetWhere` / `reportReasonFacetWhere` 각각에 `...reportedTeamWhere,` 를 추가한다.

- [ ] **Step 5: 상세에 롤업 요약을 붙인다**

`getInquiry` 의 `findUnique` select 에 `reportedTeamId: true` 와 관계를 추가한다.

```ts
        reportedTeamId: true,
        reportedTeam: { select: { id: true, name: true, status: true } },
```

`toAdminInquiryDetail(row)` 를 부르기 전에 요약을 계산해 함께 넘긴다.

```ts
    // 대상 팀이 없으면 집계 쿼리를 돌리지 않는다 — 신고가 아닌 문의 상세가 비용을 치를 이유가 없다.
    const reportedTeam = row.reportedTeam
      ? await this.buildReportedTeamSummary(row.reportedTeam)
      : null;
```

private 메서드를 추가한다.

```ts
  /** 신고 대상 팀의 최근 30일 누적. 조치를 판단하는 자리에 맥락을 놓는 것이 목적이다. */
  private async buildReportedTeamSummary(team: { id: string; name: string; status: string }) {
    const since = new Date(Date.now() - REPORT_ROLLUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const where: Prisma.V1InquiryWhereInput = {
      reportedTeamId: team.id,
      category: 'report',
      createdAt: { gte: since },
    };
    const [recentReportCount, reasonGroups] = await Promise.all([
      this.prisma.v1Inquiry.count({ where }),
      this.prisma.v1Inquiry.groupBy({ by: ['reportReason'], where, _count: { _all: true } }),
    ]);
    return {
      teamId: team.id,
      name: team.name,
      status: team.status,
      windowDays: REPORT_ROLLUP_WINDOW_DAYS,
      recentReportCount,
      reasonBreakdown: Object.fromEntries(
        reasonGroups
          .filter((g) => g.reportReason !== null)
          .map((g) => [g.reportReason as string, g._count._all]),
      ),
    };
  }
```

파일 상단 상수 구역에 추가한다.

```ts
const REPORT_ROLLUP_WINDOW_DAYS = 30;
```

`toAdminInquiryDetail` 의 파라미터 타입과 반환 객체에 `reportedTeam` 을 추가한다(두 번째 인자로 받는 편이 타입이 단순하다).

- [ ] **Step 6: 신고 누적 팀 목록을 만든다**

```ts
  async listReportedTeams(user: V1AuthUser, query: AdminReportedTeamListQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const since = new Date(Date.now() - REPORT_ROLLUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // 전체 누적으로 순위를 매긴다. 최근 30일만으로 세우면 과거에 반복 신고된 팀이 목록에서 사라진다.
    const groups = await this.prisma.v1Inquiry.groupBy({
      by: ['reportedTeamId'],
      where: { category: 'report', reportedTeamId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { reportedTeamId: 'desc' } },
      take: limit,
    });
    const teamIds = groups.map((g) => g.reportedTeamId as string);
    if (teamIds.length === 0) return { items: [] };

    const [teams, recentGroups, reasonGroups] = await Promise.all([
      this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, status: true } }),
      this.prisma.v1Inquiry.groupBy({
        by: ['reportedTeamId'],
        where: { category: 'report', reportedTeamId: { in: teamIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.v1Inquiry.groupBy({
        by: ['reportedTeamId', 'reportReason'],
        where: { category: 'report', reportedTeamId: { in: teamIds } },
        _count: { _all: true },
      }),
    ]);

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const recentById = new Map(recentGroups.map((g) => [g.reportedTeamId as string, g._count._all]));
    const topReasonById = new Map<string, string | null>();
    for (const teamId of teamIds) {
      const rows = reasonGroups
        .filter((g) => g.reportedTeamId === teamId && g.reportReason !== null)
        .sort((a, b) => b._count._all - a._count._all);
      topReasonById.set(teamId, (rows[0]?.reportReason as string) ?? null);
    }

    return {
      items: groups.map((g) => {
        const teamId = g.reportedTeamId as string;
        const team = teamById.get(teamId);
        return {
          teamId,
          name: team?.name ?? null,
          status: team?.status ?? null,
          totalCount: g._count._all,
          recentCount: recentById.get(teamId) ?? 0,
          topReason: topReasonById.get(teamId) ?? null,
          lastReportedAt: g._max.createdAt,
        };
      }),
      windowDays: REPORT_ROLLUP_WINDOW_DAYS,
    };
  }
```

- [ ] **Step 7: 컨트롤러에 엔드포인트를 추가한다**

`admin.controller.ts` 의 기존 관용구(`@Get('inquiries')` 등)를 그대로 따른다.

```ts
  @Get('reports/teams')
  listReportedTeams(@CurrentUser() user: V1AuthUser, @Query() query: AdminReportedTeamListQueryDto) {
    return this.adminService.listReportedTeams(user, query);
  }
```

- [ ] **Step 8: green 을 확인하고 커밋**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/admin
git commit -m "feat(v1-admin): 신고 팀별 롤업 집계와 대상 팀 필터" -- apps/v1_api/src/admin
git show --stat HEAD
```

---

## Task 4: 대리 차단 API

**Files:**
- Modify: `apps/v1_api/src/admin/admin.service.ts`
- Modify: `apps/v1_api/src/admin/admin.controller.ts`
- Test: `apps/v1_api/src/admin/admin-list.service.spec.ts` (또는 이웃 admin spec)

**Interfaces:**
- Consumes: `V1Inquiry.reportedTeamId` (Task 1), `getMutationAdmin` / `writeAdminStatusLogs` (기존)
- Produces: `blockReportedTeam(user, inquiryId)` → `{ blocked: true, alreadyBlocked: boolean, teamId, blockedTeamId }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe('대리 차단', () => {
  function reportRow() {
    return {
      id: 'inq-1', userId: 'reporter', category: 'report',
      relatedType: 'team_contact', relatedId: 'c1', reportedTeamId: 'B',
    };
  }

  it('신고자 팀 명의로 대상 팀을 차단하고 사유를 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findUnique.mockResolvedValue(reportRow());
    prisma.v1TeamContact.findUnique.mockResolvedValue({ fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamContactBlock.create.mockResolvedValue({ id: 'b1' });

    const result = await service.blockReportedTeam(adminAuthUser, 'inq-1');

    expect(prisma.v1TeamContactBlock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: 'A', blockedTeamId: 'B',
          reason: expect.stringContaining('inq-1'),
        }),
      }),
    );
    expect(result).toMatchObject({ alreadyBlocked: false, teamId: 'A', blockedTeamId: 'B' });
  });

  // Phase 2·3 과 같은 함정: 이 저장소엔 전역 P2002 필터가 없다.
  it('이미 차단돼 있으면 500 이 아니라 멱등하게 통과한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findUnique.mockResolvedValue(reportRow());
    prisma.v1TeamContact.findUnique.mockResolvedValue({ fromTeamId: 'A', toTeamId: 'B' });
    prisma.v1TeamContactBlock.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );

    const result = await service.blockReportedTeam(adminAuthUser, 'inq-1');

    expect(result).toMatchObject({ alreadyBlocked: true });
  });

  it('대상 팀이 없는 신고는 409 로 거부한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    prisma.v1Inquiry.findUnique.mockResolvedValue({ ...reportRow(), reportedTeamId: null });

    await expect(service.blockReportedTeam(adminAuthUser, 'inq-1')).rejects.toMatchObject({
      response: { code: 'REPORT_TARGET_UNKNOWN' },
    });
  });

  it('support 관리자는 403 이다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue({ ...activeAdminRecord, adminRole: 'support' });

    await expect(service.blockReportedTeam(adminAuthUser, 'inq-1')).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });
});
```

- [ ] **Step 2: red 를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/admin
```
Expected: 4개 FAIL

- [ ] **Step 3: 구현한다**

```ts
  /**
   * 신고를 근거로 **신고자 팀 명의** 로 대상 팀을 차단한다.
   *
   * 이 조치는 운영자가 남의 팀 설정을 대신 바꾸는 것이다. 그래서 reason 에 근거를 남기고(팀
   * 설정 화면이 이 사유를 보여준다), 팀이 직접 해제할 수 있게 잠그지 않는다 — 신고한 것은 그
   * 팀이고 나중에 화해하면 풀 수 있어야 한다.
   */
  async blockReportedTeam(user: V1AuthUser, inquiryId: string) {
    const admin = await this.getMutationAdmin(user.id);

    const inquiry = await this.prisma.v1Inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true, category: true, relatedType: true, relatedId: true, reportedTeamId: true },
    });
    if (!inquiry) throw new NotFoundException({ code: 'NOT_FOUND', message: '문의를 찾을 수 없어요.' });
    if (inquiry.category !== 'report' || !inquiry.reportedTeamId) {
      throw new ConflictException({
        code: 'REPORT_TARGET_UNKNOWN',
        message: '신고 대상 팀을 알 수 없어 차단할 수 없어요.',
      });
    }

    const contact = inquiry.relatedId
      ? await this.prisma.v1TeamContact.findUnique({
          where: { id: inquiry.relatedId },
          select: { fromTeamId: true, toTeamId: true },
        })
      : null;
    if (!contact) {
      throw new ConflictException({
        code: 'REPORT_TARGET_UNKNOWN',
        message: '신고된 컨택을 찾을 수 없어 차단할 수 없어요.',
      });
    }

    // 신고자 팀 = 컨택의 두 팀 중 대상이 아닌 쪽.
    const reporterTeamId =
      contact.fromTeamId === inquiry.reportedTeamId ? contact.toTeamId : contact.fromTeamId;

    const reason = `운영자 조치 (신고 ${inquiry.id})`;
    let alreadyBlocked = false;
    try {
      await this.prisma.v1TeamContactBlock.create({
        data: {
          teamId: reporterTeamId,
          blockedTeamId: inquiry.reportedTeamId,
          createdByUserId: user.id,
          reason,
        },
      });
    } catch (error) {
      // @@unique([teamId, blockedTeamId]) — 두 번 눌러도 500 이 되면 안 된다.
      // 이 저장소엔 전역 P2002 필터가 없어 여기서 직접 잡는다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        alreadyBlocked = true;
      } else {
        throw error;
      }
    }

    await this.writeAdminStatusLogs(admin, {
      action: 'inquiry.block_reported_team',
      targetType: 'inquiry',
      targetId: inquiry.id,
      previousStatus: alreadyBlocked ? 'blocked' : 'not_blocked',
      status: 'blocked',
      reason,
      beforeState: { blocked: alreadyBlocked ? 'true' : 'false' },
      afterState: { blocked: 'true' },
      responseIdKey: 'inquiryId',
    });

    return { blocked: true, alreadyBlocked, teamId: reporterTeamId, blockedTeamId: inquiry.reportedTeamId };
  }
```

- [ ] **Step 4: 컨트롤러에 추가한다**

```ts
  @Post('inquiries/:inquiryId/block-reported-team')
  @HttpCode(200)
  blockReportedTeam(@CurrentUser() user: V1AuthUser, @Param('inquiryId') inquiryId: string) {
    return this.adminService.blockReportedTeam(user, inquiryId);
  }
```

`@HttpCode(200)` 인 이유: 아무것도 생성하지 않는 경우(멱등 통과)가 있으므로 201 은 거짓말이다. `@HttpCode` 를 안 붙이면 NestJS 가 POST 에 201 을 준다(Phase 1 의 `withdraw` 가 그래서 201 이다).

- [ ] **Step 5: green 을 확인하고 커밋**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=1 src/admin
git commit -m "feat(v1-admin): 신고 근거로 대상 팀을 신고자 팀 명의로 차단" -- apps/v1_api/src/admin
git show --stat HEAD
```

---

## Task 5: 프론트 훅과 타입

**Files:**
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts`
- Modify: `apps/v1_web/src/types/api.ts`
- Modify: `apps/v1_web/src/lib/query-keys.ts`
- Modify: `apps/v1_web/src/test/msw/handlers.ts`, `apps/v1_web/src/test/msw/fixtures.ts`

**Interfaces:**
- Consumes: Task 3·4 의 엔드포인트
- Produces:
  - `useV1AdminReportedTeams(limit?)` → `{ items: V1AdminReportedTeamRow[]; windowDays: number }`
  - `useV1BlockReportedTeam()` → mutation, 인자 `inquiryId: string`
  - `V1AdminInquiryDetail.reportedTeam: V1AdminReportedTeamSummary | null`
  - `AdminListFilters.reportedTeamId?: string`

- [ ] **Step 1: 타입을 추가한다**

`types/api.ts`:

```ts
export type V1AdminReportedTeamSummary = {
  teamId: string;
  name: string;
  status: string;
  windowDays: number;
  recentReportCount: number;
  reasonBreakdown: Partial<Record<V1InquiryReportReason, number>>;
};

export type V1AdminReportedTeamRow = {
  teamId: string;
  name: string | null;
  status: string | null;
  totalCount: number;
  recentCount: number;
  topReason: V1InquiryReportReason | null;
  lastReportedAt: string | null;
};
```

`V1AdminInquiryDetail` 에 `reportedTeam: V1AdminReportedTeamSummary | null;` 을 추가하고, `AdminListFilters` 에 `reportedTeamId?: string;` 을 추가한다.

**타입을 고치면 tsc 가 MSW 목의 드리프트를 잡는다.** 잡히면 필드를 optional 로 도망가지 말고 목을 실제 응답에 맞춘다.

- [ ] **Step 2: 쿼리키를 추가한다**

`query-keys.ts` 의 어드민 키 구역에 넣는다(이웃 관용구를 그대로 따른다).

```ts
  adminReportedTeams: (limit?: number) => ['admin', 'reported-teams', limit ?? null] as const,
```

- [ ] **Step 3: 훅을 추가한다**

`use-v1-api.ts` 의 어드민 문의 훅 옆에 둔다.

```ts
export function useV1AdminReportedTeams(limit?: number) {
  return useQuery({
    queryKey: v1Keys.adminReportedTeams(limit),
    queryFn: () => v1Get<{ items: V1AdminReportedTeamRow[]; windowDays: number }>(
      '/admin/reports/teams',
      limit ? { limit } : undefined,
    ),
  });
}

export function useV1BlockReportedTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inquiryId: string) =>
      v1Post<{ blocked: boolean; alreadyBlocked: boolean; teamId: string; blockedTeamId: string }>(
        `/admin/inquiries/${inquiryId}/block-reported-team`,
      ),
    onSuccess: () => {
      // 차단은 문의 상세의 조치 이력과 누적 목록 양쪽에 영향을 준다.
      queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reported-teams'] });
    },
  });
}
```

- [ ] **Step 4: 게이트**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json   # exit 0 필수
./node_modules/.bin/vitest run src/app/admin
```

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1-web): 신고 롤업·대리 차단 훅과 타입" -- apps/v1_web/src/hooks apps/v1_web/src/types apps/v1_web/src/lib/query-keys.ts apps/v1_web/src/test/msw
```

---

## Task 6: 어드민 신고 상세 — 롤업 요약과 조치 버튼

**Files:**
- Modify: `apps/v1_web/src/app/admin/inquiries/[id]/page.tsx`
- Test: `apps/v1_web/src/app/admin/inquiries/[id]/page.test.tsx` (없으면 생성)

**Interfaces:**
- Consumes: Task 5 의 `useV1BlockReportedTeam`, `V1AdminInquiryDetail.reportedTeam`, 기존 `useV1ChangeTeamStatus`(있으면 재사용, 없으면 훅 추가)

- [ ] **Step 1: 상세 화면의 기존 구조를 읽는다**

`apps/v1_web/src/app/admin/inquiries/[id]/page.tsx` 가 값을 어떻게 렌더하는지(공용 DetailRow 류가 있는지), 권한 capability 를 어디서 읽는지(`useV1AdminMe().data.capabilities`)를 먼저 확인하고 그 관용구를 따른다. **추측하지 마라.**

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```tsx
it('신고 상세에 대상 팀의 누적 요약이 보인다', () => {
  inquiryMock.mockReturnValue({ data: detailWithReportedTeam(), isPending: false });
  render(<AdminInquiryDetailPage params={Promise.resolve({ id: 'inq-1' })} />);
  expect(screen.getByText(/최근 30일/)).toBeInTheDocument();
  expect(screen.getByText(/3건/)).toBeInTheDocument();
});

it('status:write 가 없으면 조치 버튼이 보이지 않는다', () => {
  adminMeMock.mockReturnValue({ data: { capabilities: ['overview:read'] } });
  inquiryMock.mockReturnValue({ data: detailWithReportedTeam(), isPending: false });
  render(<AdminInquiryDetailPage params={Promise.resolve({ id: 'inq-1' })} />);
  expect(screen.queryByRole('button', { name: '신고한 팀 대신 차단' })).not.toBeInTheDocument();
});

it('대리 차단은 확인 단계를 거쳐 inquiryId 로 호출된다', async () => {
  const mutate = vi.fn();
  blockMock.mockReturnValue({ mutate, isPending: false });
  const user = userEvent.setup();
  render(<AdminInquiryDetailPage params={Promise.resolve({ id: 'inq-1' })} />);

  await user.click(screen.getByRole('button', { name: '신고한 팀 대신 차단' }));
  expect(mutate).not.toHaveBeenCalled();          // 한 번 눌러선 실행되지 않는다
  await user.click(within(screen.getByRole('group', { name: '차단 확인' })).getByRole('button', { name: '차단' }));
  expect(mutate).toHaveBeenCalledWith('inq-1', expect.objectContaining({ onError: expect.any(Function) }));
});

it('대상 팀이 없으면 조치 버튼 대신 안내가 보인다', () => {
  inquiryMock.mockReturnValue({ data: { ...detailWithReportedTeam(), reportedTeam: null }, isPending: false });
  render(<AdminInquiryDetailPage params={Promise.resolve({ id: 'inq-1' })} />);
  expect(screen.getByText('신고 대상 팀을 알 수 없어요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '신고한 팀 대신 차단' })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: red 를 확인한다**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/inquiries"
```
Expected: 4개 FAIL

- [ ] **Step 4: 구현한다**

`reportedTeam` 이 있을 때만 조치 구역을 렌더한다. 요약 문구:

```
이 팀은 최근 30일 동안 3건 신고됐어요 (스팸·광고 2 · 괴롭힘·욕설 1)
```

사유 라벨은 `inquiryReportReasonLabel` (`@/lib/v1-status-labels`)을 쓴다 — 새 맵을 만들지 마라.

조치 버튼 두 개:
- **팀 정지** — 기존 팀 상태 변경 경로를 호출한다. 채팅·일정·컨택을 전부 막는 강한 조치이므로 **확인 단계 필수**.
- **신고한 팀 대신 차단** — `useV1BlockReportedTeam().mutate(inquiryId, { onError })`. 역시 **확인 단계**.

확인은 모달을 새로 만들지 말고 **2단계 인라인 확인**으로 한다(`role="group"` + `aria-label`). 컨택 상세의 차단 확인과 같은 관용구다 — 되돌릴 수 있는 동작에 모달 기계장치를 복제하지 않는다.

`status:write` capability 가 없으면 버튼 자체를 렌더하지 않는다.

에러는 인라인 `role="alert"` + `extractErrorMessage(err, '조치하지 못했어요. 잠시 후 다시 시도해 주세요.')`.

- [ ] **Step 5: green + 게이트**

```bash
cd apps/v1_web
./node_modules/.bin/vitest run "src/app/admin/inquiries"
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(v1-admin): 신고 상세에 누적 요약과 조치 버튼" -- "apps/v1_web/src/app/admin/inquiries"
```

---

## Task 7: 신고 누적 팀 목록 화면

**Files:**
- Create: `apps/v1_web/src/app/admin/reports/teams/page.tsx`
- Create: `apps/v1_web/src/app/admin/reports/teams/page.test.tsx`

**Interfaces:**
- Consumes: Task 5 의 `useV1AdminReportedTeams`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```tsx
it('신고 건수 내림차순으로 팀을 보여준다', () => {
  reportedTeamsMock.mockReturnValue({ data: { items: [rowA(), rowB()], windowDays: 30 }, isPending: false });
  render(<AdminReportedTeamsPage />);
  const rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('A팀');
});

it('행을 누르면 그 팀의 신고만 필터된 문의 목록으로 간다', () => {
  reportedTeamsMock.mockReturnValue({ data: { items: [rowA()], windowDays: 30 }, isPending: false });
  render(<AdminReportedTeamsPage />);
  expect(screen.getByRole('link', { name: /A팀/ })).toHaveAttribute(
    'href', '/admin/inquiries?category=report&reportedTeamId=team-a',
  );
});

it('정지된 팀은 상태를 함께 보여준다', () => {
  reportedTeamsMock.mockReturnValue({ data: { items: [rowSuspended()], windowDays: 30 }, isPending: false });
  render(<AdminReportedTeamsPage />);
  expect(screen.getByText('정지됨')).toBeInTheDocument();
});

it('신고가 없으면 빈 상태를 보여준다', () => {
  reportedTeamsMock.mockReturnValue({ data: { items: [], windowDays: 30 }, isPending: false });
  render(<AdminReportedTeamsPage />);
  expect(screen.getByText('신고 누적된 팀이 없어요')).toBeInTheDocument();
});
```

- [ ] **Step 2: red 확인 → 구현**

`AdminDataTable` / `AdminPageHeader` / `EmptyState` 등 기존 어드민 컴포넌트를 쓴다. 열 구성은 스펙 §7(b) 표를 따른다.

**행 링크는 `/admin/inquiries?category=report&reportedTeamId=<id>`** 로 만든다 — #657 의 딥링크를 재사용하는 것이 요점이다. 이 링크가 동작하려면 Task 3 의 `reportedTeamId` 필터와, **문의 목록 페이지가 URL 에서 `reportedTeamId` 를 읽는 것**이 필요하다(다음 단계).

상태는 색만으로 구분하지 말고 `정지됨` / `활성` 텍스트를 함께 표시한다.

- [ ] **Step 3: 문의 목록이 `reportedTeamId` 딥링크를 읽게 한다**

`apps/v1_web/src/app/admin/inquiries/page.tsx` 에 상태와 URL 동기화를 추가한다. **기존 `pickAllowed` 는 허용 목록 대조용이라 팀 id 에는 쓸 수 없다** — id 는 자유 문자열이므로 존재 여부만 본다.

```ts
  const [activeReportedTeamId, setActiveReportedTeamId] = useState(
    () => searchParams.get('reportedTeamId') ?? '',
  );
```

`filters` 에 싣고, URL 쓰기 effect 에도 포함한다. 화면에는 **필터가 걸려 있다는 표시와 해제 버튼**을 둔다 — 보이지 않는 필터가 목록을 좁히면 "왜 결과가 없지?" 가 된다(이 저장소에서 이미 겪은 함정이다).

- [ ] **Step 4: 게이트 + 커밋**

```bash
cd apps/v1_web
./node_modules/.bin/vitest run src/app/admin
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
git commit -m "feat(v1-admin): 신고 누적 팀 목록과 문의 목록 팀 필터" -- "apps/v1_web/src/app/admin"
```

---

## Task 8: 컨택 설정 화면에 차단 사유 표시

**Files:**
- Modify: `apps/v1_web/src/app/teams/[id]/contact/settings/team-contact-settings-client.tsx`
- Modify: `apps/v1_web/src/app/teams/[id]/contact/settings/team-contact-settings-client.test.tsx`
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts` (`listBlocks` select 에 `reason` 추가)
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts` (`V1TeamContactBlock` 타입에 `reason`)

**Interfaces:**
- Consumes: Task 4 가 남기는 `reason` 문자열

- [ ] **Step 1: 백엔드가 `reason` 을 돌려주는지 확인하고, 안 주면 추가한다**

`listBlocks` 의 `include`/`select` 를 읽는다. `reason` 이 빠져 있으면 추가한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```tsx
it('차단 사유가 있으면 함께 보여준다', () => {
  useV1TeamContactBlocksMock.mockReturnValue({
    data: { items: [{ id: 'b1', teamId: 'A', blockedTeamId: 'B', createdByUserId: 'u1',
                      reason: '운영자 조치 (신고 inq-1)', createdAt: '2026-08-24T00:00:00.000Z',
                      blockedTeam: { id: 'B', name: '상대팀' } }] },
    isLoading: false, isError: false,
  });

  render(<TeamContactSettingsPageClient teamId="team-1" />);

  expect(screen.getByText('운영자 조치 (신고 inq-1)')).toBeInTheDocument();
});

it('사유가 없으면 아무것도 덧붙이지 않는다', () => {
  useV1TeamContactBlocksMock.mockReturnValue({
    data: { items: [{ id: 'b1', teamId: 'A', blockedTeamId: 'B', createdByUserId: 'u1',
                      reason: null, createdAt: '2026-08-24T00:00:00.000Z',
                      blockedTeam: { id: 'B', name: '상대팀' } }] },
    isLoading: false, isError: false,
  });

  render(<TeamContactSettingsPageClient teamId="team-1" />);

  expect(screen.getByText('상대팀')).toBeInTheDocument();
  expect(screen.queryByText(/운영자 조치/)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: red 확인 → 구현**

차단 행의 날짜 줄 아래에 사유를 한 줄 추가한다. `tm-text-caption` + `var(--text-muted)`.

**왜 필요한가**: 운영자가 대리 차단하면 팀 운영진은 자기가 만들지 않은 차단을 보게 된다. 사유가 없으면 "이게 왜 여기 있지?" 가 되고, 팀은 영문도 모른 채 해제하거나 방치한다.

- [ ] **Step 4: 게이트 + 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/teams" && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
git commit -m "feat(v1-web): 차단 목록에 사유를 표시한다" -- "apps/v1_web/src/app/teams" apps/v1_web/src/hooks apps/v1_api/src/team-contacts
```

---

## Task 9: 통합 테스트 + changeset

**Files:**
- Create: `apps/v1_api/test/team-contacts/report-enforcement.integration-spec.ts`
- Create: `.changeset/team-report-enforcement.md`

- [ ] **Step 1: 통합 스펙을 쓴다**

`test/team-contacts/**` 글롭은 이미 등록돼 있다. **기존 통합 스펙 두 개를 먼저 읽고** 앱 부트스트랩·로그인·픽스처·정리 관용구를 그대로 따른다.

시나리오:
1. A팀 운영진이 B팀에 컨택 → B팀 운영진이 신고 → `reported_team_id` 가 **A팀** 으로 저장된다
2. 어드민이 신고 상세를 열면 대상 팀 요약에 **1건** 이 잡힌다
3. 어드민이 대리 차단 → `v1_team_contact_blocks` 에 `teamId=B, blockedTeamId=A, reason` 이 생긴다
4. 같은 요청을 다시 보내면 **200 + `alreadyBlocked: true`** (500 아님)
5. `GET /admin/reports/teams` 에 A팀이 나온다
6. `support` 역할로 대리 차단하면 **403**

- [ ] **Step 2: `--listTests` 로 CI 가 잡는지만 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --selectProjects integration --listTests | grep report-enforcement
```

**통합 테스트를 로컬에서 실행하지 마라** — 전용 DB 가 이 환경에 없다. CI 가 첫 실행이다.

- [ ] **Step 3: changeset 을 쓴다**

`.changeset/team-report-enforcement.md` — `"v1_api": minor` + `"v1_web": minor`, 본문은 사용자 관점 **해요체**.

- [ ] **Step 4: 전체 게이트**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --config <scratchpad>/jest.notypes.config.js --maxWorkers=2 src/admin src/inquiries src/team-contacts
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs && ./node_modules/.bin/vitest run
node scripts/qa/check-expand-contract-migrations.mjs "$(git rev-parse origin/dev)" "$(git rev-parse HEAD)"
```

- [ ] **Step 5: 커밋 + PR**

PR base 는 `dev`. 머지 직전 `gh pr view <N> --json baseRefName` 로 확인한다. UI 변경이 포함되므로 **alpha 배포 후 시각 검증 갤러리가 필수** 다(어드민 신고 상세 · 누적 목록 · 팀 설정 3화면 × 3폭 × 라이트/다크).

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 담당 |
|---|---|
| §4 `reportedTeamId` + 인덱스 + `onDelete: SetNull` | Task 1 |
| §4 백필 + 허용목록 | Task 1 |
| §5 신고 시점 기록 · 대상 미상 허용 | Task 2 |
| §6(a) 팀 정지 (기존 재사용) | Task 6 |
| §6(b) 대리 차단 + 멱등 + 감사 | Task 4 |
| §7(a) 상세 롤업 요약 | Task 3(집계) + Task 6(표시) |
| §7(b) 누적 팀 목록 + 딥링크 재사용 | Task 3(API) + Task 7(화면) |
| §8 엔드포인트 5종 | Task 3·4 |
| §9 권한·감사 | Task 4(백엔드) + Task 6(버튼 숨김) |
| §6 사유 노출 | Task 8 |
| §12 검증 | Task 9 |

빠진 항목 없음. **스펙 §10 은 8단계였으나 계획은 9개다** — 프론트 훅/타입(Task 5)을 화면에서 분리했다. 훅과 화면을 한 태스크에 묶으면 리뷰 표면이 백엔드 계약과 UI 두 가지로 섞인다.

**2. 플레이스홀더**

Task 6 Step 1 과 Task 8 Step 1 이 "먼저 읽어라" 로 돼 있는 것은 의도적이다 — 어드민 상세 화면의 렌더 관용구와 `listBlocks` 의 select 를 **추측으로 쓰면 브리프가 틀린다**(Phase 1~3 에서 4회 발생). 무엇을 확인해야 하는지는 명시했다.

**3. 타입 일관성**

- `reportedTeamId` 는 Task 1(스키마) → 2(저장) → 3(조회·필터) → 4(조치) 에서 같은 이름이다.
- `reportedTeam` 요약 객체의 필드(`teamId`/`name`/`status`/`windowDays`/`recentReportCount`/`reasonBreakdown`)는 Task 3 이 정의하고 Task 5(타입)·6(화면)이 그대로 쓴다.
- 목록 행(`totalCount`/`recentCount`/`topReason`/`lastReportedAt`)은 Task 3 정의, Task 5·7 소비.
- `blockReportedTeam` 반환 `{ blocked, alreadyBlocked, teamId, blockedTeamId }` 는 Task 4 정의, Task 5 훅이 그대로 쓴다.

**4. 모호함**

한 곳을 구현자 판단에 맡겼다: 팀 정지 버튼이 기존 `useV1ChangeTeamStatus` 훅을 재사용하는지, 없어서 새로 만들어야 하는지 (Task 6 Step 1 에서 확인하도록 지시). 나머지는 전부 값을 명시했다.
