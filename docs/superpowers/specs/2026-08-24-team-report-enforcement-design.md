# 팀 컨택 신고 — 운영 조치와 팀별 롤업 설계

> Phase 1~3 으로 신고 **접수** 는 끝났다. 이 문서는 접수된 신고를 운영자가 **판단하고 조치** 하는
> 경로와, 판단에 필요한 **팀별 누적 근거** 를 설계한다.

작성일: 2026-08-24 · 선행: `docs/superpowers/specs/2026-08-20-team-contact-message-design.md`

---

## 1. 배경 — 지금 무엇이 없나

신고는 `V1Inquiry(category='report', relatedType='team_contact', relatedId=contactId, reportReason)` 로
접수된다. 운영자는 어드민 문의 화면에서 사유별로 거를 수 있다(#641, #657).

**빠진 것은 기능이 아니라 경로다.**

| 필요 | 현재 |
|---|---|
| 팀 제재 수단 | ✅ `V1TeamStatus.suspended` + `POST /admin/teams/:teamId/status` |
| 제재의 실효성 | ✅ 채팅·일정·컨택이 전부 `team: { status: 'active' }` 게이트를 통과해야 한다 |
| 감사 로그 | ✅ `V1AdminActionLog` (`changeTeamStatus` 가 트랜잭션 안에서 before/after 를 남긴다) |
| **신고 → 조치 경로** | ❌ 없다 |
| **신고 대상 팀이 무엇인가** | ❌ **데이터에 없다** |
| **팀별 누적 근거** | ❌ 없다 |

### 핵심 결함: 신고 대상이 저장되지 않는다

`V1Inquiry` 는 신고자(`userId`)와 컨택(`relatedId`)만 안다. **누가 신고당했는지는 없다.**
대상은 "컨택의 두 팀 중 신고자가 속하지 않은 쪽" 으로 추론해야 하는데, 이는 멤버십 조회가 필요하고
신고자가 나중에 팀을 옮기면 **답이 달라진다.** 조치도 롤업도 전부 여기서 출발하므로 먼저 고친다.

---

## 2. 확정 결정

| # | 결정 | 근거 |
|---|---|---|
| 1 | 신고 대상 팀을 **저장한다**(`reportedTeamId`), 기존 신고는 **백필** | 추론은 시간이 지나면 답이 변한다. 과거분도 롤업에 들어와야 근거가 된다 |
| 2 | 컬럼은 **`V1Inquiry` 에 둔다**(전용 모델을 만들지 않는다) | `reportReason` 선례. 롤업이 인덱스 하나로 끝난다. 유저 신고가 생기면 그때 폴리모픽으로 넓힌다 |
| 3 | 원클릭 조치는 **① 팀 정지 ② 신고한 팀 대신 차단** 두 가지 | 사용자 확정. 경고·기각은 이번 범위 밖 |
| 4 | 롤업은 **신고 상세 요약 + 전용 목록** 둘 다 | 사용자 확정 |
| 5 | 운영자 대리 차단은 **사유를 남기고 팀이 직접 해제할 수 있다** | §6 참조 |

---

## 3. 측정한 코드 제약

- `V1TeamMembershipStatus` = `active | removed | left`. 백필의 "속한 팀" 판정은 `active` 만 센다.
- 테이블명: `v1_inquiries` / `v1_team_contacts` / `v1_team_memberships` / `v1_team_contact_blocks`.
- `V1TeamContactBlock` 은 `reason String?` 을 **이미 갖고 있다.** 새 컬럼 없이 대리 차단 사유를 담을 수 있다.
- `@@unique([teamId, blockedTeamId])` 가 있으므로 대리 차단은 **P2002 를 잡아 멱등 처리** 해야 한다
  (Phase 2·3 `createBlock` 과 같은 함정 — 이 저장소에 전역 P2002 필터가 없다).
- 어드민 권한: `owner`·`ops` 가 `status:write` 를 가진다. `viewer` 는 읽기만.
- `schema.prisma` 를 건드리므로 `gameSchemaSourceManifest.schema` **재핀이 필요하다**
  (`apps/v1_api/test/fixtures/game-schema.fixture.ts`).

---

## 4. 데이터 모델

```prisma
model V1Inquiry {
  // ...기존 필드...
  reportedTeamId String? @map("reported_team_id")   // 신고 대상 팀. 신고가 아니면 null

  reportedTeam V1Team? @relation("V1InquiryReportedTeam", fields: [reportedTeamId], references: [id], onDelete: SetNull)

  @@index([reportedTeamId, createdAt])
}
```

**`onDelete: SetNull` 인 이유**: 팀이 사라져도 신고 기록 자체는 남아야 한다. `Cascade` 면 팀 삭제가
신고를 지워 감사 이력에 구멍이 난다.

### 마이그레이션 두 단계

**(a) 순수 additive** — `ADD COLUMN` + `CREATE INDEX` + FK. expand-contract 게이트 통과.

**(b) 백필** — 기존 신고의 대상 팀을 한 번 계산해 채운다.

```sql
UPDATE v1_inquiries i
SET reported_team_id = sub.reported_team_id
FROM (
  SELECT i2.id,
         CASE
           WHEN EXISTS (SELECT 1 FROM v1_team_memberships m
                        WHERE m.team_id = c.from_team_id AND m.user_id = i2.user_id AND m.status = 'active')
             THEN c.to_team_id
           WHEN EXISTS (SELECT 1 FROM v1_team_memberships m
                        WHERE m.team_id = c.to_team_id AND m.user_id = i2.user_id AND m.status = 'active')
             THEN c.from_team_id
           ELSE NULL
         END AS reported_team_id
  FROM v1_inquiries i2
  JOIN v1_team_contacts c ON c.id = i2.related_id
  WHERE i2.related_type = 'team_contact'
    AND i2.category = 'report'
    AND i2.user_id IS NOT NULL
) sub
WHERE i.id = sub.id AND sub.reported_team_id IS NOT NULL;
```

**`UPDATE` 는 provably-additive 가 아니므로 expand-contract 게이트의 `REVIEWED_NON_ADDITIVE`
허용목록에 근거와 함께 등록해야 한다.** 근거: 신규 nullable 컬럼만 채우고 기존 컬럼을 읽지도 바꾸지도
않으며, 되돌리려면 `reported_team_id = NULL` 로 되돌리면 된다.

**대상을 못 정한 행은 null 로 남긴다.** 신고자가 이미 두 팀 모두를 떠났거나 양쪽 운영진이면 답이
없다 — 억지로 한쪽을 고르면 잘못된 팀에 신고가 누적된다. UI 는 null 을 "대상 미상" 으로 표시한다.

---

## 5. 신고 시점 기록

`InquiriesService.create()` 가 `category='report' && relatedType='team_contact'` 일 때 대상을 계산해 저장한다.

```
컨택 조회 → 신고자가 fromTeam 의 active 멤버면 대상 = toTeam
          → toTeam 의 active 멤버면 대상 = fromTeam
          → 둘 다 아니거나 둘 다면 null (신고는 정상 접수, 대상만 미상)
```

**대상을 못 정해도 신고 접수는 실패하지 않는다.** 신고를 막는 것보다 대상 미상으로 받아 두는 편이 낫다.

프론트가 `relatedId` 를 조작해 남의 컨택을 신고하는 경우는 **대상 계산이 자동으로 막는다** —
신고자가 그 컨택의 어느 팀에도 속하지 않으면 대상이 null 이 된다. 별도 권한 검사를 추가하지 않는다.

---

## 6. 원클릭 조치

### (a) 팀 정지

기존 `changeTeamStatus` 를 **재사용** 한다. 새 엔드포인트를 만들지 않고, 어드민 신고 상세 화면에서
그 API 를 호출한다. 감사 로그(`team.status.update`)가 그대로 남는다.

화면에는 **확인 단계** 를 둔다. 팀 정지는 채팅·일정·컨택을 전부 막는 강한 조치라 오클릭이 위험하다.

### (b) 신고한 팀을 대신 차단

새 엔드포인트: `POST /admin/inquiries/:inquiryId/block-reported-team`

```
신고 → reportedTeamId(대상) + 신고자 팀(컨택에서 역산) 을 구한다
     → V1TeamContactBlock(teamId=신고자팀, blockedTeamId=대상팀,
                          createdByUserId=운영자, reason='운영자 조치 (신고 <id>)')
     → 이미 있으면 멱등 통과(P2002 catch)
     → V1AdminActionLog 에 남긴다
```

**신뢰 문제와 그 해법.** 이 조치는 운영자가 **남의 팀 설정을 대신 바꾸는 것** 이다. A팀 운영진은
자기가 만들지 않은 차단을 자기 설정 화면에서 보게 된다.

- `reason` 에 근거를 남기고, **컨택 설정 화면이 사유를 렌더** 하도록 한 줄 추가한다(현재는 팀 이름과
  날짜만 보여준다).
- **팀이 직접 해제할 수 있다.** 신고한 것은 그 팀이고, 나중에 화해하면 풀 수 있어야 한다.
  운영자 차단을 잠그지 않는다.

---

## 7. 팀별 롤업

### (a) 신고 상세 안 요약

어드민 문의 상세에서 `category='report'` 이고 `reportedTeamId` 가 있으면 한 줄을 보여준다.

> 이 팀은 최근 30일 동안 **3건** 신고됐어요 (스팸·광고 2 · 괴롭힘·욕설 1)

조치를 판단하는 **바로 그 자리** 에 맥락을 놓는 것이 목적이다. 30일은 고정값으로 시작한다.

### (b) 신고 누적 팀 목록

`GET /admin/reports/teams` — `reportedTeamId` 로 그룹핑해 건수 내림차순.

| 열 | 내용 |
|---|---|
| 팀 | 이름 + 현재 상태(active/suspended) |
| 최근 30일 | 건수 |
| 전체 | 건수 |
| 주요 사유 | 최다 사유 라벨 |
| 마지막 신고 | 시각 |

행을 누르면 그 팀의 신고만 필터된 문의 목록으로 간다 — **#657 의 딥링크를 재사용** 한다
(`/admin/inquiries?category=report&reportedTeamId=<id>`). 그러려면 문의 목록에 `reportedTeamId`
필터가 추가돼야 한다.

---

## 8. 엔드포인트 요약

| 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|
| POST | `/admin/teams/:teamId/status` | `status:write` | **기존 재사용** |
| POST | `/admin/inquiries/:inquiryId/block-reported-team` | `status:write` | 신규. 멱등 |
| GET | `/admin/reports/teams` | `overview:read` | 신규. 롤업 목록 |
| GET | `/admin/inquiries` | `overview:read` | **기존 + `reportedTeamId` 필터** |
| GET | `/admin/inquiries/:inquiryId` | `overview:read` | **기존 + 롤업 요약 필드** |

---

## 9. 권한과 감사

- 조치 두 가지 모두 `status:write` 를 요구한다(`owner`·`ops`). `viewer` 는 버튼이 보이지 않는다.
- 두 조치 모두 `V1AdminActionLog` 에 남긴다. 대리 차단의 action 은 `inquiry.block_reported_team`.
- 로그에는 `beforeState`/`afterState` 를 남긴다 — `changeTeamStatus` 의 기존 형태를 따른다.

---

## 10. 단계

| 단계 | 내용 |
|---|---|
| **1** | 스키마 + 백필 + 재핀 |
| **2** | 신고 시점 대상 기록 |
| **3** | 롤업 조회(상세 요약 + 목록 API + 문의 목록 필터) |
| **4** | 조치 API(대리 차단) |
| **5** | 어드민 화면 — 신고 상세의 조치 버튼·롤업 요약 |
| **6** | 어드민 화면 — 신고 누적 팀 목록 |
| **7** | 컨택 설정 화면에 차단 사유 표시 |
| **8** | 통합 테스트 + changeset |

---

## 11. 위험

| 위험 | 대응 |
|---|---|
| 백필이 잘못된 팀을 지목 | `active` 멤버십만 인정하고, 애매하면 null. 억지로 채우지 않는다 |
| 대리 차단이 팀에게 불투명 | `reason` 을 남기고 설정 화면에 렌더. 팀이 직접 해제 가능 |
| 대리 차단 중복 요청 | `@@unique` + P2002 catch 로 멱등. Phase 2·3 과 같은 함정 |
| 팀 정지 오클릭 | 확인 단계 필수 |
| `schema.prisma` 변경 | 소스 스냅샷 재핀. 병합 충돌 시 **병합본으로 재계산** |
| `UPDATE` 백필이 게이트에 막힘 | `REVIEWED_NON_ADDITIVE` 에 근거와 함께 등록 |

---

## 12. 검증 계획

- **유닛**: 대상 계산(양쪽 소속·미소속·양쪽 모두 운영진), 대리 차단 멱등, 롤업 집계, 권한 거부
- **통합**: 신고 → 대상 저장 → 롤업 반영 → 대리 차단 → 재요청 멱등, 실 HTTP
- **백필**: 마이그레이션 재생 후 대상이 채워지는지 (CI 의 migration replay 가 검증)
- **alpha 실측**: 신고 생성 → 상세에서 롤업 확인 → 대리 차단 → 팀 설정 화면에서 사유 노출 확인
- **시각 검증**: 어드민 신고 상세·누적 목록·팀 설정 3화면 × 3폭 × 라이트/다크

## 13. 이번 범위가 아닌 것

- 경고(제재 없는 기록) — 새 모델이 필요하고, 누적 근거는 롤업이 이미 준다
- 기각 — 기존 문의 status 변경으로 가능하다
- 유저 신고 — 오늘 신고 대상은 팀뿐이다. 생기면 그때 폴리모픽으로 넓힌다
- 자동 제재(N건 넘으면 자동 정지) — 판단은 사람이 한다
