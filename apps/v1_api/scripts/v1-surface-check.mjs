#!/usr/bin/env node
/**
 * v1_api 대회 표면 게이트 — **원시 대회 단건 조회를 래칫으로 0 까지 내린다.**
 *
 * ## 무엇을 막는가
 * `prisma.v1Tournament.findUnique/findFirst(…)` 를 **직접** 부르는 자리.
 * 그런 자리는 종류 조건을 **안 거는 것이 기본값**이라, 통합 백필(R3)로
 * `v1_tournaments` 에 정규 리그 시즌이 생기자 예전엔 존재하지 않던 id 가 그대로
 * 통과했다 — alpha 에서 비인증 공개 경로 `/tournaments/<리그id>/schedule` 이
 * **리그 제목을 실은 200** 을 줬다(실측, #863).
 *
 * 대신 `src/tournaments/tournament-surface-lookup.ts` 의
 * `findTournamentOnSurface(OrThrow)` 를 쓴다. 거기서는 허용 종류가 **필수 인자**라
 * 호출부가 생각하지 않고 지나갈 수 없다.
 *
 * ## 왜 baseline 래칫인가 (한 번에 다 고치지 않고)
 * 49곳을 한 PR 로 치환하면 리뷰가 잡을 결함이 없는데 규모만 크다. 대신 파일별
 * baseline 을 두고 **넘으면 실패**시킨다 — 새 코드는 헬퍼를 쓰게 되고, 기존은 그
 * 파일을 손댈 때 자연히 줄어든다. 위험군별 PR(P1 인증 → P2 운영자 → P3 나머지)이
 * baseline 을 내리며 진행한다.
 *
 * **줄었는데 baseline 이 그대로여도 실패한다.** 그게 이걸 래칫으로 만드는 유일한
 * 장치다 — 한쪽만 보면 래칫이 아니라 그냥 상한선이고, 줄인 만큼 다시 들어온다.
 * (`apps/v1_web/scripts/v1-pattern-check.mjs` 의 `checkLiteralBaseline` 과 같은 계약.)
 *
 * ## 두 번째 검사 — raw SQL
 * `$queryRaw`/`$executeRaw` 안의 `v1_tournaments` 는 Prisma 조회가 아니라 정규식이
 * 못 보는 자리다. 지금 7곳은 **누출이 아니다** — 셋은 `SELECT id … FOR UPDATE`(잠금만
 * 잡고 데이터를 안 돌려준다), 셋은 설정 축(대회·리그가 공유하는 축이라 일부러 안 거른다),
 * 하나는 마이그레이션이다. 다만 잠금은 **리그 행에도 걸리고**, 실제 게이트는 그 뒤의
 * Prisma 검사다 — 순서가 바뀌거나 뒤 검사가 사라지면 곧바로 구멍이 된다.
 * 그래서 목표는 0 이 아니라 **새로 늘어나면 눈에 띄게 하는 것**이다.
 *
 * ## 일부러 안 잡는 것 — 별칭·구조분해
 * `const t = this.prisma.v1Tournament; t.findFirst(…)` 형태는 이 정규식에 안 걸린다.
 * **지금 트리에 0건이고**(확인 명령은 `git grep -nE '(const|let)\s+\{?\s*v1Tournament'`),
 * 잡으려면 정규식이 복잡해져 오탐이 는다. **오탐이 나는 게이트는 baseline 을 올려
 * 무력화당한다** — 그게 더 나쁘다. 알면서 단순하게 둔다.
 *
 * 사용: node scripts/v1-surface-check.mjs   (apps/v1_api 에서)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const LOOKUP_BASELINE = 'scripts/tournament-surface-baseline.json';
const RAW_SQL_BASELINE = 'scripts/tournament-raw-sql-baseline.json';
const LEAGUE_ALLOWED_BASELINE = 'scripts/tournament-league-allowed-baseline.json';
const LEAGUE_WRITE_BASELINE = 'scripts/league-write-site-baseline.json';

/**
 * 헬퍼 자신은 세지 않는다 — **원시 조회가 허용된 유일한 자리**다.
 * baseline 에 1 로 적어 두면 "여기도 언젠가 없앨 것"으로 읽혀 다음 사람이 헷갈리고,
 * 그 1 이 남아 있는 한 baseline 합계가 0 이 되지 못해 완료를 판정할 수 없다.
 */
const SANCTIONED = new Set(['src/tournaments/tournament-surface-lookup.ts']);

/**
 * 원시 단건 조회 매칭. `findMany`/`count`/`groupBy` 는 대상이 아니다 — 그쪽은
 * `TOURNAMENT_SURFACE_KIND` 상수를 `where` 에 펴 넣는 방식으로 #856 이 이미 닫았다.
 */
const RAW_LOOKUP = /\bv1Tournament\s*\.\s*(findUnique|findFirst)(OrThrow)?\s*\(/g;

/** raw SQL 안의 테이블 이름. 주석은 세지 않는다 — 이 파일들엔 설명 주석이 많다. */
const RAW_TABLE = /\bv1_tournaments\b/g;
const LEAGUE_WRITE = /\bv1League\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g;

/**
 * **리그를 의도적으로 허용하는 자리.** 원시 호출을 0 으로 만든 뒤에도 남는 구멍이 하나
 * 있다 — 호출부가 `ALL_COMPETITION_KINDS` 를 넘기면 헬퍼를 쓰면서도 리그가 통과한다.
 * 그건 **정당한 선택일 수 있지만 언제나 리뷰 대상**이어야 하므로 개수를 묶는다.
 * (주석 줄은 세지 않는다 — 이 저장소는 주석에서 식별자를 그대로 인용한다.)
 */
const LEAGUE_ALLOWED = /\bALL_COMPETITION_KINDS\b/g;

const violations = [];

function countRawLookups(source) {
  return (source.match(RAW_LOOKUP) ?? []).length;
}

function countLeagueAllowed(source) {
  let n = 0;
  // **import 는 세지 않는다** — 세면 호출 1곳이 2로 잡혀 baseline 이 실제와 어긋나고,
  // "몇 군데서 리그를 허용하는가"라는 이 검사의 질문에 답하지 못한다.
  //
  // **한 줄 판정으로는 부족하다**(Copilot 리뷰 지적, 실측 재현): Prettier 가 import 를
  // 여러 줄로 감싸면 specifier 가 자기 줄에 오는데(`  ALL_COMPETITION_KINDS,`) 그 줄은
  // `import` 로 시작하지 않아 그대로 세어진다 → 1곳이 2로 잡혀 **게이트가 오탐으로 깨진다.**
  // 그래서 `import` 부터 `from '…';` 까지를 **블록으로** 건너뛴다.
  let inImport = false;
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    if (inImport) {
      if (/\bfrom\s*['"]/.test(trimmed) || trimmed.endsWith(';')) inImport = false;
      continue;
    }
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      // 한 줄로 끝나지 않는 import 면 다음 줄부터 블록으로 이어 건너뛴다.
      if (!/\bfrom\s*['"]/.test(trimmed)) inImport = true;
      continue;
    }
    n += (line.match(LEAGUE_ALLOWED) ?? []).length;
  }
  return n;
}

function countRawSqlTable(source) {
  let n = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    n += (line.match(RAW_TABLE) ?? []).length;
  }
  return n;
}

/**
 * `v1League` 에 **쓰는** 자리를 센다.
 *
 * 다른 세 검사는 전부 *읽기*를 센다. 그래서 리그를 만들거나 상태를 바꾸는 자리가 늘어도
 * 아무 검사에도 안 걸렸고, 실제로 **dual-write 없이 7곳이 살아 있었다**(2026-08-31).
 * 통합 축에 거울을 안 만든 리그는 read-swap 뒤 **에러 없이 화면에서 사라진다** —
 * 읽는 코드를 아무리 세도 이건 안 보인다.
 *
 * 새 쓰기 자리가 늘면 CI 가 멈춰서 "dual-write 붙였나" 를 묻게 하는 것이 이 검사의 일이다.
 */
function countLeagueWrites(source) {
  let n = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    n += (line.match(LEAGUE_WRITE) ?? []).length;
  }
  return n;
}

/** baseline 값은 숫자이거나 `{ allowed, why }` 다 — 남겨 두는 이유를 적을 수 있게. */
function allowedOf(entry) {
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object' && typeof entry.allowed === 'number') return entry.allowed;
  return 0;
}

/**
 * 파일별 baseline 을 넘지 않는지 보는 공용 검사. 두 검사가 같은 구조라 함수로 묶는다 —
 * 복붙하면 "파일이 사라졌는데 baseline 에 남아 있다" 같은 가장자리 처리가 한쪽에만 남는다
 * (`apps/v1_web/scripts/v1-pattern-check.mjs` 가 같은 이유로 같은 선택을 했다).
 */
function checkBaseline({ label, baselinePath, files, count, hint }) {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (e) {
    violations.push(`[게이트 실행 실패] ${baselinePath} 를 읽을 수 없다 (${e.message})`);
    return null;
  }

  const seen = new Set();
  let total = 0;
  for (const file of files) {
    const n = count(readFileSync(file, 'utf8'));
    seen.add(file);
    total += n;
    const allowed = allowedOf(baseline[file]);
    if (n > allowed) {
      violations.push(`[${label}] ${file}: ${n}곳 (허용 ${allowed}) — ${hint}`);
    } else if (n < allowed) {
      violations.push(
        `[baseline 갱신 필요] ${file}: ${n}곳으로 줄었는데 baseline 은 ${allowed} 이다 — ` +
          `${baselinePath} 를 ${n} 로 낮춰야 그만큼 다시 들어오지 못한다`,
      );
    }
  }

  // 파일이 사라졌는데 baseline 에 남아 있으면 그 몫이 다른 곳으로 새어 나갈 수 있다.
  for (const file of Object.keys(baseline)) {
    if (file.startsWith('_') || seen.has(file)) continue;
    violations.push(`[baseline 갱신 필요] ${file}: 파일이 없는데 baseline 에 남아 있다`);
  }

  const allowedTotal = Object.entries(baseline)
    .filter(([f]) => !f.startsWith('_'))
    .reduce((sum, [, entry]) => sum + allowedOf(entry), 0);
  return { total, allowedTotal };
}

function main() {
  let list;
  try {
    // 스펙은 제외한다 — 인라인 mock 이 같은 문자열을 갖고, 그건 프로덕션 조회가 아니다.
    //
    // `prisma/` 도 본다: alpha QA 시드가 **리그를 만든다**(고정 id upsert). 시드를 스캔에서
    // 빼면 그 두 자리가 v1League 쓰기 검사에 안 걸리고, 거울 없는 QA 리그가 read-swap 뒤
    // 조용히 사라진다 — 그런데 QA 리그가 바로 그 read-swap 을 검증하는 화면이라, 빈 목록이
    // "전환 성공"인지 "전부 망가짐"인지 구분되지 않게 된다.
    list = execSync('find src prisma -name "*.ts" ! -name "*.spec.ts"', { encoding: 'utf8' });
  } catch (e) {
    violations.push(`[게이트 실행 실패] 소스 목록을 만들 수 없다 (${e.message})`);
    return;
  }

  const all = list.split('\n').filter(Boolean);
  if (all.length === 0) {
    // 이 검사가 조용히 0건을 세고 통과하면 게이트가 있으나 마나다.
    violations.push('[게이트 실행 실패] src 아래 TS 파일이 0개다');
    return;
  }

  const lookup = checkBaseline({
    label: '원시 대회 조회',
    baselinePath: LOOKUP_BASELINE,
    files: all.filter((f) => !SANCTIONED.has(f)),
    count: countRawLookups,
    hint: 'findTournamentOnSurface(OrThrow) 를 써라 (src/tournaments/tournament-surface-lookup.ts)',
  });

  const leagueAllowed = checkBaseline({
    label: '리그 허용 지점',
    baselinePath: LEAGUE_ALLOWED_BASELINE,
    files: all.filter((f) => !SANCTIONED.has(f)),
    count: countLeagueAllowed,
    hint: '리그를 대회 표면에 허용하는 선택이다 — baseline 에 이유(why)와 함께 올려라',
  });

  const leagueWrites = checkBaseline({
    label: 'v1League 쓰기 자리',
    baselinePath: LEAGUE_WRITE_BASELINE,
    files: all,
    count: countLeagueWrites,
    hint: '리그를 만들거나 바꾸는 자리다 — 통합 축에 거울을 쓰는 dual-write 를 같은 트랜잭션에 붙이고 baseline 을 올려라',
  });

  const rawSql = checkBaseline({
    label: 'raw SQL 대회 테이블',
    baselinePath: RAW_SQL_BASELINE,
    files: all,
    count: countRawSqlTable,
    hint: 'raw SQL 은 종류 조건을 못 건다 — 꼭 필요하면 baseline 에 이유(why)와 함께 올려라',
  });

  // **개수를 반드시 찍는다.** CI 에서 스텝 이름만 보고 "돌았다"고 판단하면, 스크립트가
  // 조용히 0건을 세고 통과해도 알 수 없다 — 로그에 숫자가 남아야 실제로 센 것이 보인다.
  // 로컬과 다른 숫자가 찍히면 CI 가 다른 파일 집합을 보고 있다는 뜻이다(cwd·glob 차이).
  console.log(
    `[v1-surface-check] 파일 ${all.length}개 스캔 · ` +
      `원시 대회 단건 조회 ${lookup?.total ?? '?'}곳 (baseline ${lookup?.allowedTotal ?? '?'}) · ` +
      `raw SQL 대회 테이블 ${rawSql?.total ?? '?'}곳 (baseline ${rawSql?.allowedTotal ?? '?'}) · ` +
      `리그 허용 ${leagueAllowed?.total ?? '?'}곳 (baseline ${leagueAllowed?.allowedTotal ?? '?'})`,
      `v1League 쓰기 ${leagueWrites?.total ?? '?'}곳 (baseline ${leagueWrites?.allowedTotal ?? '?'})`,
  );
}

main();

if (violations.length > 0) {
  console.error(`\n[v1-surface-check] 위반 ${violations.length}건:\n`);
  for (const v of violations) console.error(`  - ${v}`);
  console.error('');
  process.exit(1);
}
console.log('[v1-surface-check] 통과');
