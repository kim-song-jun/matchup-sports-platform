# DB 앱 유저 최소권한 복구 런북 (superuser 제거)

> 2026-08-09 조사 중 발견. alpha·prod 양쪽 DB의 **앱 런타임 유저가 PostgreSQL superuser**다.
> 이 문서는 운영자/DBA가 실행하는 런북이다 — 에이전트·CI는 실행하지 않는다(프로덕션 DB `ALTER ROLE`).

## 무엇이 문제인가 (실측)

alpha(`teameet_alpha`) DB에서 확인한 로그인 가능 role 전체:

```
    rolname    | rolsuper | rolcreatedb | rolcreaterole | rolreplication | rolbypassrls | rolcanlogin
---------------+----------+-------------+---------------+----------------+--------------+-------------
 teameet_alpha |    t     |      t      |       t       |       t        |      t       |      t
```

- **로그인 가능한 유일한 role이면서 superuser 전권**을 가진다. 앱이 매 요청 이 role로 접속한다.
- prod(`teameet_v1`)도 동일한 것으로 조사됐다(SSM 대상 인스턴스 기준). prod DB는 별도 접근
  경로가 없어 이 문서 작성 시점엔 재확인 못 함 — **운영자가 prod에서 같은 쿼리로 먼저 확인**할 것:
  ```sql
  SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolcanlogin ORDER BY rolname;
  ```

**원인**: `postgres` 공식 이미지가 `POSTGRES_USER`만 지정되면 그 이름으로 `initdb`를 돌려
그 role을 superuser로 만든다. 즉 앱이 요구해서가 아니라 **기본 초기화의 부산물**이다.

## 앱이 실제로 필요로 하는 권한 (근거)

마이그레이션 전수 확인 결과 superuser 전용 구문은 **0건**이다:
- 없음: `CREATE EXTENSION`, `ROW LEVEL SECURITY`/`ALTER ... FORCE RLS`, `ALTER SYSTEM`,
  `SECURITY DEFINER`, `CREATE ROLE/USER`, `COPY ... FROM PROGRAM`.
- 있음: `CREATE FUNCTION ... LANGUAGE plpgsql`(plpgsql은 PG 기본 trusted 언어), `CREATE TRIGGER`
  (테이블 owner 권한으로 충분).

alpha의 `public` 스키마 테이블 106개가 전부 `teameet_alpha` 소유이므로, 마이그레이션의 DDL
(테이블/인덱스/트리거/함수 생성)은 **owner 권한만으로 이미 전부 수행 가능**하다. 즉 superuser·
createrole·replication·bypassrls는 앱 런타임에도 마이그레이션에도 불필요하다.

## 런북 (alpha 먼저 → 1일 soak → prod)

> **self-downgrade 금지.** 접속 중인 세션의 role을 스스로 다운그레이드하면 캐시 무효화 타이밍
> 이슈가 생길 수 있다 — 반드시 별도 break-glass superuser로 접속해 앱 role을 낮춘다.

### Step 0 — break-glass superuser 생성 (기존 superuser 세션에서)

```sql
-- alpha
CREATE ROLE teameet_alpha_break_glass WITH LOGIN SUPERUSER PASSWORD '<강한 랜덤 비밀번호>';
-- prod
-- CREATE ROLE teameet_v1_break_glass WITH LOGIN SUPERUSER PASSWORD '<강한 랜덤 비밀번호>';
```
비밀번호는 비밀 관리소에 보관. 복구 완료 후 이 계정은 남겨두거나(비상용) 삭제한다.

### Step 1 — break-glass로 재접속한 뒤 앱 role 다운그레이드

```sql
-- alpha
ALTER ROLE teameet_alpha  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- prod (soak 후)
-- ALTER ROLE teameet_v1  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
```

### Step 2 — 검증

```sql
SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname = 'teameet_alpha';
-- 기대: rolcanlogin = t, rolsuper = f (나머지 권한 플래그도 전부 f)
```
그다음 앱 정상성 확인:
- `prisma migrate deploy`가 여전히 성공(다음 배포에서 자동 확인, 또는 수동으로 한 번).
- `GET /api/v1/health` 의 `checks.db` 가 `true`.
- 대회/팀/스케줄 생성·조회 같은 대표 쓰기·읽기 경로 스모크.

### 롤백

앱이 깨지면 break-glass로 접속해 되돌린다:
```sql
ALTER ROLE teameet_alpha SUPERUSER;  -- 임시 원복 후 원인 조사
```

## 변경 불필요한 것

- `DATABASE_URL`, `deploy/docker-compose.*.yml`, 배포 스크립트 — role 이름·비밀번호·`LOGIN`이
  그대로라 접속 문자열이 바뀌지 않는다. 가장 작은 diff로 끝난다.

## 후속 과제 (별도, 이 런북과 분리)

**마이그레이션 role과 런타임 role의 완전 분리(Option B)** — 런타임은 DML만 가능한
`teameet_v1_runtime`을 쓰고, DDL(마이그레이션)은 owner role로만. 이건 실제 코드/배포 변경
(`DATABASE_URL` 분리, `deploy-alpha.sh`/`deploy-prod.sh`의 migrate 단계만 DDL role로 override)이
필요하므로 위 런북과 분리해 진행한다. 위 런북(superuser만 제거)이 즉효·최소 diff의 1차 방어다.
