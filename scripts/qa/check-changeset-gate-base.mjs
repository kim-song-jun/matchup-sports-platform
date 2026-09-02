#!/usr/bin/env node
/**
 * changeset 게이트의 **base 해석**이 되돌아가지 않게 지킨다.
 *
 * 지키는 성질 하나: *"대상 브랜치가 전진해도 그쪽 changeset 을 내 것으로 세지 않는다."*
 *
 * 왜 가드가 필요한가 — `git diff A B`(2-dot)는 `A...B` 보다 **더 자연스러워 보인다.**
 * 다음 사람이 "왜 점 세 개지?" 하고 고쳐도 **아무것도 안 깨진다.** 더 많이 통과할 뿐이다
 * (2026-09-01 실측: 열린 PR 하나가 `scripts/` 6파일만 건드렸는데 2-dot 에선 "325 behavior
 * files, 20 changed Changesets" 로 통과했다 — 20건이 전부 남의 것이었다). 조용히 되돌아가는
 * 변경이라 텍스트로 못 막고, **성질로 막아야 한다.**
 *
 * 그래서 이 가드는 워크플로를 문자열로 검사하지 않는다. **그 스텝의 셸을 그대로 꺼내
 * 픽스처 저장소에서 실행하고 결과 목록을 본다.** 표현이 바뀌어도 성질만 지키면 통과한다.
 *
 * ## ⚠️ 이 가드가 **덮지 않는 것**
 *
 * base 해석 수정은 세 갈래였는데(가드 대상은 그중 하나다):
 *   ② 2-dot → 3-dot          ← **이 가드가 덮는다**
 *   ① 형식 가드 → 연산 시험     덮지 않는다
 *   ③ 폴백이 실제 base 를 받기  덮지 않는다
 *
 * ①③ 은 **merge-base 가 실패해야** 실행되는데, 이 픽스처에선 성공한다. 그래서 변이를 걸어도
 * 코드에 **도달조차 하지 않는다**(실측: ③을 예전 `origin/main` 고정으로 되돌려도 이 가드는
 * 통과했다). 도달 못 하는 코드를 "지킨다"고 적으면 그게 헛도는 테스트다.
 *
 * 게다가 ②가 자리를 잡으면 ③의 영향이 파일 목록에서 대부분 흡수된다 — `A...B` 가 분기점을
 * 알아서 구하므로 base 를 조금 다르게 골라도 목록이 잘 안 바뀐다. ③이 여전히 값을 바꾸는
 * 자리는 승격 절의 `git show ${BASE_SHA}:…`(버전 읽기)와 `git log ${BASE_SHA}..${HEAD_SHA}`
 * 이고, 이 픽스처는 그 경로를 만들지 않는다.
 *
 * 즉 ①③ 의 회귀는 **이 가드로 안 잡힌다.** 필요해지면 승격 경로를 모사하는 픽스처가 따로 있어야 한다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const workflowPath = args.find((a) => !a.startsWith('--')) ?? '.github/workflows/deploy.yml';
const STEP_NAME = 'Verify release changeset';
const OUT_FILE = '/tmp/teameet-changed-files.txt';

function fail(message) {
  console.error(`[changeset-gate-base] ${message}`);
  process.exit(1);
}

/** 워크플로에서 그 스텝의 `run:` 블록만 꺼낸다. 들여쓰기를 벗겨 그대로 실행 가능하게 만든다. */
function extractStepShell(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const nameIdx = lines.findIndex((l) => l.includes(`- name: ${STEP_NAME}`));
  if (nameIdx < 0) fail(`워크플로에서 "${STEP_NAME}" 스텝을 못 찾았다: ${path}`);
  const runIdx = lines.findIndex((l, i) => i > nameIdx && /^\s+run: \|/.test(l));
  if (runIdx < 0) fail(`"${STEP_NAME}" 스텝에 run: 블록이 없다`);
  const indent = lines[runIdx + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = runIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== '' && !line.startsWith(indent)) break;
    body.push(line.slice(indent.length));
  }
  if (body.length === 0) fail('run: 블록이 비어 있다');
  return body.join('\n');
}

/**
 * 픽스처: **#951 의 실제 모양**을 재현한다 — 옛 base 에서 분기했고, 자기 changeset 은
 * 없고, 그사이 base 쪽에 남의 changeset 이 들어왔다.
 */
function makeFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'cs-gate-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (rel, content, message) => {
    mkdirSync(join(repo, rel.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(repo, rel), `${content}\n`);
    git('add', '-A');
    git('-c', 'user.email=g@local', '-c', 'user.name=guard', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'base', '.');
  commit('README.md', 'fork point', 'fork');
  const fork = git('rev-parse', 'HEAD');

  // 내 브랜치: scripts 만 건드리고 changeset 은 안 낸다
  git('checkout', '-q', '-b', 'feature');
  const head = commit('scripts/mine.mjs', 'mine', 'mine: scripts only');

  // 대상 브랜치가 그사이 전진 — **남의 changeset** 이 들어온다
  git('checkout', '-q', 'base');
  const baseTip = commit('.changeset/someone-elses.md', '---\n"v1_web": patch\n---\n\nnot mine', 'other: changeset');

  return { repo, fork, head, baseTip };
}

/** 스텝 셸을 픽스처에서 실행하고, 그 스텝이 만든 변경 목록을 돌려준다. */
function runStep(shell, { repo, baseTip, head }) {
  if (existsSync(OUT_FILE)) rmSync(OUT_FILE);
  try {
    execFileSync('bash', ['-c', shell], {
      cwd: repo,
      env: { ...process.env, BASE_SHA: baseTip, HEAD_SHA: head, BASE_REF: '', HEAD_REF: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch {
    // 스텝 끝의 정책 스크립트는 픽스처에 없으므로 여기서 죽는다. 목록은 그 전에 쓰인다.
  }
  if (!existsSync(OUT_FILE)) fail('스텝이 변경 목록 파일을 만들지 않았다 — base 해석 단계에서 죽었을 수 있다');
  const list = readFileSync(OUT_FILE, 'utf8').split('\n').filter(Boolean);
  rmSync(OUT_FILE);
  return list;
}

function selfTest(fixture) {
  const g = (...a) => execFileSync('git', ['-C', fixture.repo, ...a], { encoding: 'utf8' }).trim();
  const twoDot = g('diff', '--name-only', fixture.baseTip, fixture.head).split('\n').filter(Boolean);
  const threeDot = g('diff', '--name-only', `${fixture.baseTip}...${fixture.head}`).split('\n').filter(Boolean);
  // 픽스처가 헛돌지 않는지 — 두 방식이 **실제로 갈려야** 이 가드가 의미가 있다
  if (!twoDot.some((f) => f.startsWith('.changeset/'))) {
    fail('self-test: 픽스처가 문제를 재현하지 못한다 — 2-dot 이 남의 changeset 을 안 집어온다');
  }
  if (threeDot.some((f) => f.startsWith('.changeset/'))) {
    fail('self-test: 픽스처가 이상하다 — 3-dot 이 남의 changeset 을 집어왔다');
  }
  console.log('[changeset-gate-base] self-test: 픽스처가 2-dot/3-dot 를 실제로 가른다');
}

const fixture = makeFixture();
try {
  if (args.includes('--self-test')) selfTest(fixture);
  const shell = extractStepShell(workflowPath);
  const list = runStep(shell, fixture);
  const foreign = list.filter((f) => f.startsWith('.changeset/'));
  if (foreign.length > 0) {
    fail(
      `base 가 전진했을 때 **남의 changeset 을 내 변경으로 세고 있다**: ${foreign.join(', ')}\n`
      + '  변경 목록을 만드는 diff 가 2-dot 이면 이렇게 된다. 분기점 기준(A...B)이어야 한다.',
    );
  }
  if (!list.includes('scripts/mine.mjs')) {
    fail(`내 변경이 목록에서 빠졌다 — 받은 목록: ${list.join(', ') || '(비어 있음)'}`);
  }
  console.log('[changeset-gate-base] 통과 — 남의 changeset 0건, 내 변경 포함');
} finally {
  rmSync(fixture.repo, { recursive: true, force: true });
}
