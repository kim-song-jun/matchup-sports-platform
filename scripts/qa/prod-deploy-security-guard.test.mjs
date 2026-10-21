import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  usesSshAlias,
  findJobsMissingRunnerPrereqs,
  findProdRoleWithoutApproval,
  findPrivilegedAwsWithoutApproval,
  findPrivilegedAwsInScript,
  findUnwiredComposeVariables,
  findUnreadRuntimeEnvVariables,
  normalizeWorkflowSource,
} from './check-production-deploy-security.mjs';

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

test('workflow security checks normalize Windows line endings', () => {
  assert.equal(
    normalizeWorkflowSource('permissions:\r\n  contents: read\r\n'),
    'permissions:\n  contents: read\n',
  );
});

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

// compose 가 기본값 없이 참조하는 변수는 값이 없으면 **빈 문자열**이 된다. 2026-08-02
// 배포에서 DB_PASSWORD / JWT_SECRET 이 그랬고, 중첩 기본값을 타고 빈 JWT 서명 비밀키까지
// 번질 뻔했다(DB 인증 실패가 먼저 나서 실제로 뜨지는 않았다).
test('기본값 없는 compose 변수가 배포 경로에 배선되지 않으면 탐지한다', () => {
  const compose = `
services:
  api:
    environment:
      JWT_SECRET: \${V1_JWT_SECRET:-\${JWT_SECRET}}
      DBURL: postgres://u:\${V1_DB_PASSWORD:-\${DB_PASSWORD}}@h/db
      LOG: \${LOG_LEVEL:-info}
    image: \${V1_API_IMAGE}
`;
  const workflowWithout = 'env:\n  SECRET_KAKAO_CLIENT_ID: x\n';
  assert.deepEqual(
    findUnwiredComposeVariables(compose, workflowWithout),
    ['DB_PASSWORD', 'JWT_SECRET'],
    '중첩 기본값 안쪽의 무기본값 변수를 잡아야 합니다 — 그게 빈 문자열이 되는 뿌리입니다',
  );
});

test('배선된 변수와 매니페스트 제공 이미지 변수는 통과시킨다', () => {
  const compose = `
    image: \${V1_API_IMAGE}
    web: \${V1_WEB_IMAGE}
    jwt: \${V1_JWT_SECRET:-\${JWT_SECRET}}
    db: \${V1_DB_PASSWORD:-\${DB_PASSWORD}}
`;
  const workflowWith = [
    'env:',
    '  SECRET_DB_PASSWORD: ${{ secrets.DB_PASSWORD }}',
    '  SECRET_JWT_SECRET: ${{ secrets.JWT_SECRET }}',
  ].join('\n');
  assert.deepEqual(findUnwiredComposeVariables(compose, workflowWith), []);
});

test('기본값이 있는 변수에는 배선을 요구하지 않는다', () => {
  const compose = 'a: ${LOG_LEVEL:-info}\nb: ${FRONTEND_URL:-https://teameet.co.kr}\n';
  assert.deepEqual(findUnwiredComposeVariables(compose, 'env:\n'), []);
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

// --- .env 를 source 하지 않는 배포 스크립트의 "읽지 않은 변수" 탐지 -----------------
//
// 이 가드가 존재하는 이유는 실패 사례가 있어서다. deploy-prod.sh 가 .env 를 source 하지
// 않게 바뀐 뒤 V1_DB_HOST 를 env_value() 로 읽는 것을 빠뜨렸고, 그 결과
// `${V1_DB_HOST:-v1_postgres}` 분기의 else 쪽이 한 번도 실행될 수 없는 죽은 코드가 됐다.
// 그래서 아래 첫 테스트는 **탐지 실패 케이스**부터 확인한다 — 가드가 정작 자기가 막아야 할
// 상황에서 침묵하는 일이 이 저장소에서 반복됐기 때문이다.

test('참조만 하고 읽지 않은 런타임 env 변수를 탐지한다', () => {
  const script = [
    'env_value() { sed -n "s/^$1=//p" "${ENV_FILE}" | head -1; }',
    'V1_DB_USER="$(env_value V1_DB_USER)"',
    'if [[ "${V1_DB_HOST:-v1_postgres}" == "v1_postgres" ]]; then',
    '  compose up -d v1_postgres',
    'fi',
  ].join('\n');
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), ['V1_DB_HOST']);
});

test('env_value 로 읽은 변수는 통과시킨다', () => {
  const script = [
    'V1_DB_HOST="$(env_value V1_DB_HOST)"',
    'if [[ "${V1_DB_HOST:-v1_postgres}" == "v1_postgres" ]]; then :; fi',
  ].join('\n');
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), []);
});

test('매니페스트가 채우는 이미지 변수는 요구하지 않는다', () => {
  const script = 'compose up -d "${V1_API_IMAGE}" "${V1_WEB_IMAGE}"\n';
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), []);
});

test('주석 안의 변수 참조는 오탐하지 않는다', () => {
  const script = [
    '# 예전에는 ${V1_DB_LEGACY} 를 봤다',
    'echo ok  # ${V1_DB_ANOTHER} 도 마찬가지',
  ].join('\n');
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), []);
});

test('읽지 않은 변수가 여러 개면 모두 정렬해 돌려준다', () => {
  const script = 'echo "${V1_DB_PORT}" "${V1_DB_HOST:-x}"\n';
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), ['V1_DB_HOST', 'V1_DB_PORT']);
});

test('실제 deploy-prod.sh 에 읽지 않은 변수가 없다', () => {
  const script = readFileSync('deploy/deploy-prod.sh', 'utf8');
  assert.deepEqual(findUnreadRuntimeEnvVariables(script), []);
});

// --- 승인 전 job 이 prod 서버·운영 비밀값에 닿지 못하게 막는 검사 ----------------------------
//
// build-images(승인 전)가 SSM send-command 와 SSM·Parameter Store·KMS 권한이 있는 배포 역할을
// 쓰던 것이 문제였다. 아래 표는 그 길이 어떤 모양으로 되돌아와도 잡히는지, 그리고 승인된
// deploy job 의 정상 동작은 막지 않는지를 고정한다.

const SCRIPTS = {
  'scripts/release/read-state.sh': 'aws ssm send-command --instance-ids "$ID"\n',
  'scripts/release/read-state-flagged.sh': 'aws --region ap-northeast-2 ssm send-command --instance-ids "$ID"\n',
  'scripts/release/uses-helper.sh':
    'source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/helper.sh"\n',
  'scripts/release/helper.sh': 'aws kms decrypt --key-id k\n',
  'scripts/release/ecr-only.sh': 'aws ecr describe-images --repository-name r\naws s3api put-object --bucket b\n',
  'scripts/release/comment-only.sh': '# aws ssm send-command 는 deploy job 에서만 쓴다\naws ecr describe-images\n',
  'scripts/release/chain.sh': 'bash scripts/release/read-state.sh\n',
};
const readScript = (path) => SCRIPTS[path] ?? null;

const job = (name, { environment = false, role = 'PROD_BUILD_AWS_ROLE_ARN', steps }) => `
jobs:
  ${name}:
    runs-on: ubuntu-latest
${environment ? '    environment: production\n' : ''}    steps:
      - uses: actions/checkout@abc
      - uses: aws-actions/configure-aws-credentials@def
        with:
          role-to-assume: \${{ vars.${role} }}
${steps.map((step) => `      - run: ${step}`).join('\n')}
`;

test('승인 전 job 이 배포 역할을 assume 하면 탐지한다', () => {
  const wf = job('build-images', { role: 'PROD_AWS_ROLE_ARN', steps: ['aws ecr describe-images'] });
  assert.equal(findProdRoleWithoutApproval(wf).length, 1);
  assert.equal(findPrivilegedAwsWithoutApproval(wf).length, 1, '빌드 역할이 아닌 역할도 별도로 잡아야 합니다');
});

test('승인된 job 은 배포 역할을 쓸 수 있다', () => {
  const wf = job('deploy', { environment: true, role: 'PROD_AWS_ROLE_ARN', steps: ['aws ssm send-command --instance-ids "$ID"'] });
  assert.deepEqual(findProdRoleWithoutApproval(wf), []);
  assert.deepEqual(findPrivilegedAwsWithoutApproval(wf, readScript), []);
});

test('승인 전 job 의 서버·비밀값 접근 AWS 호출을 형태와 무관하게 탐지한다', () => {
  const inline = [
    ['인라인 ssm', 'aws ssm send-command --instance-ids "$ID"'],
    ['인라인 kms', 'aws kms decrypt --key-id k'],
    ['인라인 ec2', 'aws ec2 describe-instances'],
    ['전역 옵션이 앞선 형태', 'aws --region ap-northeast-2 ssm get-command-invocation'],
    ['--region=값 형태', 'aws --region=ap-northeast-2 ssm send-command'],
    ['직접 부르는 스크립트(사고 당시 모양)', 'bash scripts/release/read-state.sh'],
    ['옵션이 앞선 스크립트 내부 호출', 'bash scripts/release/read-state-flagged.sh'],
    ['source 한 헬퍼 안의 호출', 'bash scripts/release/uses-helper.sh'],
    ['스크립트가 부르는 스크립트 안의 호출', 'bash scripts/release/chain.sh'],
  ];
  for (const [label, step] of inline) {
    const problems = findPrivilegedAwsWithoutApproval(job('build-images', { steps: [step] }), readScript);
    assert.ok(
      problems.length >= 1,
      `탐지하지 못했습니다 — ${label}: ${step}\n이 형태가 통과하면 승인 전에 prod 서버를 건드릴 수 있습니다.`,
    );
  }
});

test('빌드 역할의 ECR·S3 작업과 주석 속 언급은 오탐하지 않는다', () => {
  const steps = [
    'aws ecr describe-images --repository-name r',
    'aws s3api put-object --bucket b --key k',
    'bash scripts/release/ecr-only.sh',
    'bash scripts/release/comment-only.sh',
  ];
  assert.deepEqual(findPrivilegedAwsWithoutApproval(job('build-images', { steps }), readScript), []);
  assert.deepEqual(findProdRoleWithoutApproval(job('build-images', { steps })), []);
});

test('자격증명을 받지 않는 job 은 검사하지 않는다', () => {
  const gates = `
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc
      - run: bash scripts/release/read-state.sh
`;
  assert.deepEqual(findPrivilegedAwsWithoutApproval(gates, readScript), []);
});

test('스크립트 내부 탐색은 순환 source 에서도 끝나고 없는 파일은 건너뛴다', () => {
  const loop = { 'scripts/a.sh': 'source b.sh\n', 'scripts/b.sh': 'source a.sh\n' };
  assert.deepEqual(findPrivilegedAwsInScript('scripts/a.sh', (p) => loop[p] ?? null), []);
  assert.deepEqual(findPrivilegedAwsInScript('scripts/missing.sh', () => null), []);
});

// 리뷰에서 통과된 우회 형태들 — 줄 끝 `\` 이어붙이기, 따옴표, 스크립트 호출 형태(선택 플래그·`./`·
// 직접 실행·env 접두), source/import 로 이어진 파일, SDK 직접 사용. 이 표가 깨지면 승인 전 job 이
// 서버에 닿는 길이 다시 열린다.
const EVASION_SCRIPTS = {
  'scripts/release/continued.sh': 'set -e\naws \\\n  ssm send-command --instance-ids "$ID"\n',
  'scripts/release/quoted.sh': 'aws "ssm" send-command --instance-ids "$ID"\n',
  'scripts/release/after-comment.sh': '# 메모 \\\naws ssm send-command --instance-ids "$ID"\n',
  'scripts/release/sdk.py': 'import boto3\nboto3.client("ssm").send_command()\n',
  'scripts/release/sdk.mjs': "import { SSMClient } from '@aws-sdk/client-ssm';\n",
  'scripts/release/uses-sdk.mjs': "import './sdk.mjs';\n",
  'scripts/release/uses-sdk-bare.mjs': "import { run } from './sdk';\n",
  'scripts/release/required-sdk.cjs': "const ssm = require('./sdk.mjs');\n",
  'scripts/release/ecr-continued.sh': 'aws ecr \\\n  describe-images --repository-name r\n',
  'scripts/release/comment-backslash.sh': '# aws \\\nssm 호출은 deploy job 에서만 한다\necho ok\n',
  'scripts/release/comment-sdk.sh': '# boto3 로 읽던 것을 SSM 호출로 바꿨다가 deploy job 으로 옮겼다\necho ok\n',
};
const evasionRead = (path) => EVASION_SCRIPTS[path] ?? SCRIPTS[path] ?? null;

const jobRun = (run) => `
jobs:
  build-images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc
      - uses: aws-actions/configure-aws-credentials@def
        with:
          role-to-assume: \${{ vars.PROD_BUILD_AWS_ROLE_ARN }}
      - name: step
        run: |
${run.split('\n').map((line) => `          ${line}`).join('\n')}
`;

test('승인 전 job 의 우회 형태(이어붙이기·따옴표·호출 형태·SDK)를 탐지한다', () => {
  const forms = [
    ['인라인 줄 끝 \\ 이어붙이기', 'aws \\\n  ssm send-command --instance-ids "$ID"'],
    ['인라인 따옴표 서비스', "aws 'ec2' describe-instances"],
    ['인라인 따옴표 aws', '"aws" kms decrypt --key-id k'],
    ['python -m awscli', 'python3 -m awscli ssm get-command-invocation'],
    ['aws-cli 컨테이너', 'docker run amazon/aws-cli ssm send-command'],
    ['bash -x', 'bash -x scripts/release/read-state.sh'],
    ['bash 여러 플래그와 값 가진 -o', 'bash -eu -o pipefail scripts/release/read-state.sh'],
    ['따옴표 경로', 'bash "scripts/release/read-state.sh"'],
    ['./ 접두', 'bash ./scripts/release/read-state.sh'],
    ['직접 실행 ./', './scripts/release/read-state.sh'],
    ['직접 실행(접두 없음)', 'scripts/release/read-state.sh --flag'],
    ['env 접두', 'env X=1 bash scripts/release/read-state.sh'],
    ['sh', 'sh scripts/release/read-state.sh'],
    ['source 경로', 'source scripts/release/read-state.sh'],
    ['dot source ./', '. ./scripts/release/read-state.sh'],
    ['스크립트 안의 줄 끝 \\ 이어붙이기', 'bash scripts/release/continued.sh'],
    ['스크립트 안의 따옴표 서비스', 'bash scripts/release/quoted.sh'],
    ['백슬래시로 끝나는 주석 다음 줄의 호출', 'bash scripts/release/after-comment.sh'],
    ['인라인 python SDK', `python3 -c "import boto3; boto3.client('ssm')"`],
    ['인라인 node SDK', `node -e "require('@aws-sdk/client-ssm')"`],
    ['python 스크립트 SDK', 'python3 scripts/release/sdk.py'],
    ['node 스크립트 SDK', 'node scripts/release/sdk.mjs'],
    ['SDK 를 import 하는 스크립트', 'node scripts/release/uses-sdk.mjs'],
    ['확장자 없는 상대 import', 'node scripts/release/uses-sdk-bare.mjs'],
    ['require 한 파일의 SDK', 'node scripts/release/required-sdk.cjs'],
  ];
  const missed = forms
    .filter(([, run]) => findPrivilegedAwsWithoutApproval(jobRun(run), evasionRead).length === 0)
    .map(([label]) => label);
  assert.deepEqual(
    missed,
    [],
    '탐지하지 못한 형태가 있습니다 — 통과하면 승인 전에 prod 서버를 건드릴 수 있습니다.',
  );
});

test('우회 방지를 넓혀도 정상 빌드 단계와 주석은 오탐하지 않는다', () => {
  const clean = [
    'aws ecr \\\n  describe-images --repository-name r',
    'aws s3api put-object --bucket b --key k',
    'bash scripts/release/ecr-continued.sh',
    'bash -x ./scripts/release/ecr-continued.sh',
    'bash scripts/release/comment-backslash.sh',
    'bash scripts/release/comment-sdk.sh',
    '# aws ssm send-command 와 boto3 는 deploy job 에서만 쓴다\necho ok',
    'echo "aws is fine"  # aws ssm 은 여기 없다',
  ];
  for (const run of clean) {
    assert.deepEqual(findPrivilegedAwsWithoutApproval(jobRun(run), evasionRead), [], `오탐했습니다: ${run}`);
  }
});

test('승인된 job 은 우회 형태 호출도 그대로 쓸 수 있다', () => {
  const approved = jobRun('bash -x ./scripts/release/continued.sh\npython3 scripts/release/sdk.py')
    .replace('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    environment: production\n');
  assert.deepEqual(findPrivilegedAwsWithoutApproval(approved, evasionRead), []);
});

test('실제 deploy.yml 의 build-images 는 이 경계를 지킨다', () => {
  const real = normalizeWorkflowSource(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  assert.deepEqual(findProdRoleWithoutApproval(real), []);
  assert.deepEqual(findPrivilegedAwsWithoutApproval(real), []);
});
