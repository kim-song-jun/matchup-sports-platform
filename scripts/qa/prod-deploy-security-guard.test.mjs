import test from 'node:test';
import assert from 'node:assert/strict';

import { usesSshAlias, findJobsMissingRunnerPrereqs } from './check-production-deploy-security.mjs';

// 이 가드는 "prod 배포 스크립트에 SSH alias 잔재가 없는가" 를 지킨다. 그런데 가드 자체가
// 약해서 놓친 전례가 있다 — 2026-08-02 첫 프로덕션 배포가 `ssh ec2` 잔재로 죽었고,
// 그걸 막으려고 넣은 가드는 `ssh -o ... ec2` 형태를 못 잡고 인라인 주석에는 오탐을 냈다.
// 탐지 로직을 바꿀 때마다 이 표가 깨지는지로 확인한다.

const MUST_DETECT = [
  ['기본형', 'ssh ec2 "echo x"'],
  ['옵션 붙임형', 'ssh -o StrictHostKeyChecking=yes ec2 "x"'],
  ['옵션 별도 인자', 'ssh -F ~/.ssh/config ec2 "x"'],
  ['옵션 혼합', 'ssh -i /tmp/key -o A=1 ec2 bash -se'],
  ['옵션 다중', 'ssh -o A=1 -o B=2 ec2 bash -se'],
  ['scp 옵션', 'scp -o X=1 file ec2:/tmp/f'],
  ['rsync -e ssh', 'rsync -avz -e ssh ./ ec2:/tmp/'],
  ['rsync ec2 대상', 'rsync -avz ./ ec2:/tmp/'],
];

const MUST_IGNORE = [
  ['인라인 주석', 'docker ps   # 예전에는 ssh ec2 를 썼다'],
  ['전체 주석', '# ssh ec2 로 읽던 것을 SSM 으로 바꿨다'],
  ['SSM 정상 코드', 'aws ssm send-command --instance-ids "$INSTANCE_ID"'],
  ['SSM 조회', 'aws ssm get-command-invocation --command-id "$id" --query Status'],
  ['토큰 중간 #', 'echo "sha256#abc"  # 해시 출력'],
  ['유사 단어', 'ssh_helper ec2_thing'],
];

test('SSH alias 잔재를 형태와 무관하게 탐지한다', () => {
  for (const [label, line] of MUST_DETECT) {
    assert.equal(
      usesSshAlias(line),
      true,
      `탐지하지 못했습니다 — ${label}: ${line}\n` +
        '이 형태가 통과하면 SSH 잔재가 남은 채 CI 가 green 이 되고, 배포 때 처음 죽는다.',
    );
  }
});

test('주석과 정상 SSM 코드에는 오탐하지 않는다', () => {
  for (const [label, line] of MUST_IGNORE) {
    assert.equal(
      usesSshAlias(line),
      false,
      `오탐했습니다 — ${label}: ${line}\n` +
        '오탐은 정상 배포를 막고, 전환 이력을 코드 옆에 설명하지 못하게 만든다.',
    );
  }
});

// 2026-08-02: 첫 승인 배포가 exit 127 로 죽었다 — deploy job 에 checkout 도 AWS 자격증명도
// 없었는데, 가드가 파일 전체를 grep 하는 바람에 build-images 의 것을 보고 green 을 냈다.
// 아래 표는 "다른 job 이 갖췄다고 이 job 이 갖춘 게 아니다" 를 고정한다.
const JOB_FIXTURE = (deploySteps) => `
jobs:
  build-images:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@abc
      - uses: aws-actions/configure-aws-credentials@def
      - run: aws ecr describe-images

  deploy:
    runs-on: ubuntu-latest
${deploySteps}
`;

test('다른 job 의 checkout·자격증명을 이 job 것으로 착각하지 않는다', () => {
  const bare = JOB_FIXTURE(`    steps:
      - run: bash scripts/release/sync-prod-runtime-env.sh
      - run: aws ssm send-command --instance-ids "$ID"`);
  const problems = findJobsMissingRunnerPrereqs(bare);
  const deployProblems = problems.filter((p) => p.includes("job 'deploy'"));
  assert.equal(
    deployProblems.length,
    3,
    `deploy job 의 checkout·자격증명·id-token 누락 3건을 모두 잡아야 합니다. 실제: ${JSON.stringify(problems)}`,
  );
  assert.ok(problems.every((p) => !p.includes("job 'build-images'")),
    `준비물을 갖춘 build-images 를 오탐했습니다: ${JSON.stringify(problems)}`);
});

test('준비물을 모두 갖춘 job 은 통과시킨다', () => {
  const ok = JOB_FIXTURE(`    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@abc
      - uses: aws-actions/configure-aws-credentials@def
      - run: bash scripts/release/sync-prod-runtime-env.sh
      - run: aws ssm send-command --instance-ids "$ID"`);
  assert.deepEqual(findJobsMissingRunnerPrereqs(ok), []);
});

test('워크플로 레벨 permissions 로 상속된 id-token 은 인정한다', () => {
  // deploy-alpha.yml 이 이 형태다 — job 블록만 보면 없다고 오탐한다.
  const inherited = `
permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc
      - uses: aws-actions/configure-aws-credentials@def
      - run: aws ssm send-command --instance-ids "$ID"
`;
  assert.deepEqual(findJobsMissingRunnerPrereqs(inherited), []);
});

test('aws 도 스크립트도 안 쓰는 job 에는 준비물을 요구하지 않는다', () => {
  const trivial = `
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - run: echo "done"
`;
  assert.deepEqual(findJobsMissingRunnerPrereqs(trivial), []);
});

test('주석 속 aws·스크립트 언급은 요구조건을 발동시키지 않는다', () => {
  const commented = `
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      # 예전에는 aws ssm send-command 로 bash scripts/release/foo.sh 를 돌렸다
      - run: echo "done"
`;
  assert.deepEqual(findJobsMissingRunnerPrereqs(commented), []);
});

test('여러 줄 중 한 줄만 위반해도 탐지한다', () => {
  const body = [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    '# 아래는 SSM 으로 바꾼 부분',
    'aws ssm send-command --instance-ids "$ID"',
    'ssh -o BatchMode=yes ec2 "uptime"',
    'echo done',
  ].join('\n');
  assert.equal(usesSshAlias(body), true);
});
