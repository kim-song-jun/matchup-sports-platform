import test from 'node:test';
import assert from 'node:assert/strict';

import { usesSshAlias } from './check-production-deploy-security.mjs';

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
