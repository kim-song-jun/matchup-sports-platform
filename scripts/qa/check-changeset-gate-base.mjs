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
 * ## 덮는 범위 — base 해석 세 갈래 전부
 *
 * ```
 * ② 2-dot → 3-dot            픽스처 1 (base 가 전진한 상태)
 * ① 형식 가드 → 연산 시험       픽스처 2 (merge-base 를 실패시켜 그 분기를 연다)
 * ③ 폴백이 실제 base 를 받기    픽스처 2 (그때 어느 base 를 고르는지 목록으로 본다)
 * ```
 *
 * ①③ 은 **merge-base 가 실패해야** 실행된다. 첫 픽스처에선 성공하므로 변이를 걸어도 그
 * 코드에 **도달조차 하지 않았다** — 처음엔 실제로 그래서 ③ 변이가 통과했다. 그래서 무관한
 * 이력(orphan)의 커밋을 base 로 넘겨 rc 1 을 만드는 픽스처를 따로 뒀다.
 *
 * ⚠️ **`A...B` 가 base 선택을 흡수한다고 착각하지 마라.** 흡수는 base 가 **근처일 때만**
 * 성립한다. 실측(2026-09-01): 같은 head 에 대해 base 가 `dev tip` 이면 6파일·changeset 0건,
 * `merge-base(main, head)` 면 **1852파일·changeset 340건** 이었다(dev 가 main 보다 1899커밋
 * 앞서 있다). 즉 ③이 틀리면 ②가 막은 20건의 **17배** 구멍이 열린다 — ①만 고치고 ③을 두면
 * 지금보다 **더 나빠진다.**
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

/**
 * 픽스처 2 — **①③ 분기를 강제로 연다.**
 *
 * ①(가드)과 ③(폴백이 실제 base 를 받기)은 `merge-base` 가 실패해야 실행된다. 그래서
 * 무관한 이력(orphan)의 커밋을 base 로 넘겨 rc 1 을 만든다. 원인이 무엇이든 상관없다 —
 * 여기서 필요한 건 **그 분기에 도달시키는 것**뿐이다.
 *
 * 그 상태에서 ③이 어느 base 를 고르는지가 목록으로 드러난다:
 *   실제 base(dev tip) 를 받으면  → 내 변경만 (dev 쪽 남의 changeset 은 3-dot 이 뺀다)
 *   `origin/main` 고정이면        → main 이 한참 뒤라 **dev 가 그동안 쌓은 남의 changeset**
 *                                   이 통째로 내 변경으로 잡힌다
 */
function makeFallbackFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'cs-gate-fb-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (rel, content, message) => {
    mkdirSync(join(repo, rel.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(repo, rel), `${content}\n`);
    git('add', '-A');
    git('-c', 'user.email=g@local', '-c', 'user.name=guard', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main', '.');
  commit('README.md', 'old main', 'main: old');

  // dev 가 main 보다 한참 앞선다 — 그동안 남의 changeset 이 쌓인다
  git('checkout', '-q', '-b', 'dev');
  commit('.changeset/other-one.md', '---\n"v1_web": patch\n---\n\nnot mine', 'other 1');
  const devTip = commit('.changeset/other-two.md', '---\n"v1_web": patch\n---\n\nnot mine', 'other 2');

  // 내 브랜치는 **dev 에서** 갈라진다 (= 실제 PR 의 모양)
  git('checkout', '-q', '-b', 'feature');
  const head = commit('scripts/mine.mjs', 'mine', 'mine: scripts only');

  // base 로 넘길 무관한 이력 — merge-base 가 rc 1 로 실패한다
  git('checkout', '-q', '--orphan', 'decoy');
  git('rm', '-rqf', '.');
  const decoy = commit('DECOY', 'unrelated', 'decoy root');

  git('checkout', '-q', 'feature');
  git('remote', 'add', 'origin', repo);
  git('fetch', '-q', '--no-tags', 'origin', 'main', 'dev');
  return { repo, decoy, head, devTip };
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
  console.log('[changeset-gate-base] ② 통과 — 남의 changeset 0건, 내 변경 포함');

  // ①③ — merge-base 를 실패시켜 그 분기를 실제로 열고, 어느 base 를 고르는지 본다
  const fb = makeFallbackFixture();
  try {
    const mbRc = (() => {
      try { execFileSync('git', ['-C', fb.repo, 'merge-base', fb.decoy, fb.head], { stdio: 'ignore' }); return 0; }
      catch (e) { return e?.status ?? -1; }
    })();
    if (mbRc === 0) fail('self-test: 픽스처가 merge-base 를 실패시키지 못했다 — ①③ 분기에 도달 못 한다');

    const fbList = runStep(shell, { repo: fb.repo, baseTip: fb.decoy, head: fb.head });
    const fbForeign = fbList.filter((f) => f.startsWith('.changeset/'));
    if (fbForeign.length > 0) {
      fail(
        `폴백이 **엉뚱한 base** 를 골랐다 — 남의 changeset 이 내 변경으로 잡힌다: ${fbForeign.join(', ')}\n`
        + '  보강은 실제 base(BASE_REF)를 받아야 한다. `origin/main` 같은 고정 기준을 쓰면\n'
        + '  그 브랜치가 뒤처진 만큼 diff 창이 넓어져 남의 changeset 을 통째로 집어온다.',
      );
    }
    if (!fbList.includes('scripts/mine.mjs')) {
      fail(
        fbList.length === 0
          // 목록이 **비어 있다** = base 해석이 실패해 diff 가 아무것도 못 냈다는 뜻이다.
          // 가드가 형식만 보면 여기서 보강이 안 타고 `A...B` 가 그대로 죽는다.
          ? 'merge-base 가 실패했는데 보강이 실행되지 않았다 — 변경 목록이 비어 있다.\n'
            + '  가드가 형식(40자 hex)만 보고 있으면 payload 의 base 는 늘 형식이 맞아 보강이 죽는다.\n'
            + '  형식이 아니라 **연산(merge-base)이 되는지**를 시험해야 한다.'
          : `폴백 경로에서 내 변경이 빠졌다 — 받은 목록: ${fbList.join(', ')}`,
      );
    }
    console.log('[changeset-gate-base] ①③ 통과 — merge-base 실패 시 실제 base 로 보강, 남의 changeset 0건');
  } finally {
    rmSync(fb.repo, { recursive: true, force: true });
  }
} finally {
  rmSync(fixture.repo, { recursive: true, force: true });
}
