/**
 * 배포 복구 경로가 **어느 단계에서 실패했는지 말하게** 하는 계약.
 *
 * 2026-09-08 alpha 배포가 네 번 실패했고 매번 복구도 실패했는데, 로그에 남은 건
 * `[alpha-deploy] CRITICAL: active release restore failed` 한 줄뿐이었다. 복구 함수는
 * 14 단계인데 전부 `|| return 1` 로만 끝나 **아무 것도 남기지 않았다** — 코드만으로는
 * 후보를 7 개까지밖에 못 좁혔다. 다음 사람도 같은 자리에서 막힌다.
 *
 * 여기서 못 박는 것은 둘이다.
 *   (a) 기전 — `alpha_restore_step` 이 실패를 **이름과 함께, 종료코드를 잃지 않고** 올린다.
 *   (b) 완전성 — 복구 함수의 모든 `|| return 1` 이 그 래퍼를 거친다.
 *
 * (b) 만으로는 부족하다. 모든 단계가 래퍼를 거쳐도 **래퍼 자체가 실패를 삼키면** 전부
 * 조용해진다. 실제로 이 래퍼의 첫 구현이 그랬다:
 *   `if ! "$@"; then local rc=$?` → 그 자리의 `$?` 는 `!` 의 결과라 실패 시 0 이다.
 * 단계 이름은 찍히는데 실패가 전파되지 않았다. **그래서 (a) 에 "종료코드 전파" 가 있다** —
 * 이름 출력만 확인하면 그 고장난 버전이 통과한다.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const COMMON = 'deploy/alpha-release-common.sh';
const DEPLOY = 'deploy/deploy-alpha.sh';

/**
 * 실제 스크립트를 source 해서 래퍼를 그대로 돌린다 — 사본을 검증하지 않는다.
 *
 * `execFileSync` 를 쓰면 **성공한 실행의 stderr 를 잃는다**(반환값이 stdout 뿐이다).
 * 이 파일의 첫 판은 그래서 "실패 이름이 안 남는다" 고 잘못 판정했다 — 하네스가 증거를
 * 버린 것이었다. `spawnSync` 로 셋(stdout·stderr·종료코드)을 다 받는다.
 */
function runStep(script) {
  const res = spawnSync(
    'bash',
    ['-c', `set -Eeuo pipefail\nsource ${COMMON} >/dev/null 2>&1\n${script}`],
    { encoding: 'utf8' },
  );
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

test('(a-1) 성공한 단계는 아무 것도 남기지 않는다 — 정상 배포를 시끄럽게 만들지 않는다', () => {
  const r = runStep(`alpha_restore_step ok_step true`);
  assert.equal(r.code, 0);
  assert.equal(r.stderr.trim(), '');
});

test('(a-2) 실패한 단계는 그 이름을 남긴다', () => {
  const r = runStep(`alpha_restore_step the_failing_one false || true`);
  assert.match(r.stderr, /restore step failed: the_failing_one/);
});

/**
 * **이 테스트가 이 파일의 핵심이다.** 이름만 찍고 0 을 돌려주는 래퍼는 (a-2) 를 통과하지만
 * 실패를 삼킨다 — 호출부의 `|| return 1` 이 영영 발동하지 않는다.
 */
test('(a-3) 실패한 단계의 종료코드가 그대로 올라온다 — 실패가 사라지지 않는다', () => {
  const r = runStep(`alpha_restore_step boom bash -c 'exit 7'`);
  assert.equal(r.code, 7, '종료코드를 잃었다 — 호출부의 `|| return 1` 이 무력화된다');
});

test('(a-4) 호출부의 `|| return 1` 이 실제로 발동해 이후 단계가 실행되지 않는다', () => {
  const r = runStep(
    `chain() { alpha_restore_step boom false || return 1; echo REACHED; }; chain`,
  );
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.stdout, /REACHED/, '실패 뒤 다음 단계가 실행됐다');
});

/** 대입 사이트(`x="$(alpha_restore_step … jq …)"`)가 성립하려면 stdout 이 그대로 나와야 한다. */
test('(a-5) 성공한 단계의 stdout 은 그대로 통과한다', () => {
  const r = runStep(`v="$(alpha_restore_step echo_step echo hello)"; printf '%s' "$v"`);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'hello');
});

/**
 * 래퍼와 별개로, **함수가 실패를 반환하는지** 자체가 고장나 있었다. 호출부에 `|| return 1` 이
 * 있어도 불려간 함수가 0 을 돌려주면 아무 일도 일어나지 않는다 — 아래 둘이 그랬다.
 */
/**
 * **호출부와 같은 모양으로 불러야 한다.** 이 함수들을 그냥 실행하면 `set -e` 가 먼저
 * 죽여서 **버그를 되돌려도 테스트가 통과한다**(실제로 그렇게 썼다가 변이가 GREEN 이었다).
 * 프로덕션은 `f || return 1` 문맥에서 부르는데 그 자리에서는 `set -e` 가 꺼진다 —
 * 그래서 "0 을 반환한다" 는 버그가 비로소 드러난다. 아래는 그 문맥을 그대로 재현한다.
 */
function callsInGuardContext(setup, call) {
  return runStep(
    `${setup}\nprobe() { ${call} || return 1; echo REACHED; }\nprobe || true`,
  );
}

test('(c-1) extract_active_manifest 는 .active 가 없으면 실패를 반환한다', () => {
  const r = callsInGuardContext(
    `d="$(mktemp -d)"; echo '{}' > "$d/state.json"; ALPHA_RELEASE_STATE_FILE="$d/state.json"`,
    `extract_active_manifest "$d/out.json"`,
  );
  assert.doesNotMatch(
    r.stdout,
    /REACHED/,
    '끝의 chmod 가 jq 실패를 삼켰다 — 호출부의 `|| return 1` 이 무력화된다',
  );
});

/**
 * 네 필드를 **하나씩** 빼서 각각 확인한다. 하나만 빠진 매니페스트를 안 쓰면 다른 줄이 대신
 * 걸려서 통과해 버린다 — 실제로 `.release.version` 의 가드만 지운 변이가 GREEN 이었다.
 */
const MANIFEST_FIELDS = [
  { name: 'release.version', omit: (m) => delete m.release.version },
  { name: 'release.sha', omit: (m) => delete m.release.sha },
  { name: 'images.api.uri', omit: (m) => delete m.images.api.uri },
  { name: 'images.web.uri', omit: (m) => delete m.images.web.uri },
];

for (const field of MANIFEST_FIELDS) {
  test(`(c-2) load_alpha_release_manifest 는 ${field.name} 이 없으면 실패를 반환한다`, () => {
    // 예전 코드는 **마지막 대입만** 반환값이 되어, 앞쪽이 실패해도 0 이 나갔다. 그러면
    // ALPHA_API_IMAGE 가 빈 문자열인 채 `pull_release_images` 가 `docker pull ""` 를 부른다.
    const manifest = {
      release: { version: 'v', sha: 's' },
      images: { api: { uri: 'repo@sha256:a' }, web: { uri: 'repo@sha256:b' } },
    };
    field.omit(manifest);
    const r = callsInGuardContext(
      `d="$(mktemp -d)"; printf '%s' '${JSON.stringify(manifest)}' > "$d/m.json"`,
      `load_alpha_release_manifest "$d/m.json"`,
    );
    assert.doesNotMatch(r.stdout, /REACHED/, `${field.name} 의 실패가 사라졌다`);
  });
}

/** 이어붙인 줄(`\\` 로 끊긴 명령)을 한 줄로 합친다 — 안 합치면 `|| return 1` 이 있는 줄만 보고 앞을 놓친다. */
function joinContinuations(source) {
  return source.replace(/\\\n\s*/g, ' ');
}

function functionBody(source, name) {
  const start = source.indexOf(`\n${name}() {\n`);
  assert.notEqual(start, -1, `${name} 을 찾지 못했다`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} 의 끝을 찾지 못했다`);
  return source.slice(start, end);
}

/** 복구 경로의 "단계" = 실패하면 복구를 중단시키는 줄. */
function guardedLines(body) {
  return joinContinuations(body)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('|| return 1'));
}

const RESTORE_FUNCTIONS = [
  { file: COMMON, name: 'restore_active_release', floor: 14 },
  { file: DEPLOY, name: 'restore_legacy_runtime', floor: 15 },
];

for (const { file, name, floor } of RESTORE_FUNCTIONS) {
  test(`(b) ${name} 의 모든 단계가 alpha_restore_step 을 거친다`, () => {
    const body = functionBody(readFileSync(file, 'utf8'), name);
    const steps = guardedLines(body);
    const unwrapped = steps.filter((line) => !line.includes('alpha_restore_step'));

    assert.deepEqual(
      unwrapped,
      [],
      `래퍼를 거치지 않는 단계가 있다 — 실패해도 이름이 안 남는다:\n${unwrapped.join('\n')}`,
    );
    // 개수를 함께 못 박는다. "전부 래퍼를 거친다" 만으로는 함수가 통째로 비어도 통과한다.
    assert.ok(
      steps.length >= floor,
      `${name} 의 단계가 ${steps.length} 개다 — ${floor} 개 아래로 줄었다면 의도한 변경인지 확인하라`,
    );
  });
}

/**
 * 래퍼가 없으면 (b) 는 의미가 없다. 이름을 바꾸거나 지우면 여기서 먼저 걸린다.
 */
test('(b-0) alpha_restore_step 이 공유 스크립트에 정의돼 있다', () => {
  assert.match(readFileSync(COMMON, 'utf8'), /^alpha_restore_step\(\) \{$/m);
});
