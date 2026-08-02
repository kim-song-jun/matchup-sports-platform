#!/usr/bin/env node

import { readFileSync } from 'node:fs';

// SSH alias 잔재 탐지. 테스트(scripts/qa/prod-deploy-security-guard.test.mjs)에서 직접
// 호출할 수 있도록 export 한다 — 이 가드 자체가 약해서 놓친 전례가 있어(2026-08-02,
// `ssh -o ... ec2` 미탐 + 인라인 주석 오탐) 동작을 테스트로 고정한다.
export function usesSshAlias(body) {
  // 전체 주석 줄과 트레일링 주석을 걷어낸다 — 전환 이력을 설명하는 문장에 `ssh ec2` 가
  // 나오는 것은 정상이고, 그걸 막으면 왜 바꿨는지 적을 수가 없다.
  // 공백이 앞선 `#` 만 자른다: `sha256#...` 같은 토큰 중간의 `#` 은 건드리지 않는다.
  const code = body
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s#.*$/, ''))
    .join('\n');
  // `ssh ec2` 만 보면 `ssh -o StrictHostKeyChecking=yes ec2` 같은 형태를 놓친다.
  // 옵션은 `-o Key=Val`(붙임/분리), `-i /path`, `-F ~/.ssh/config` 처럼 별도 인자를 갖는
  // 형태도 있으므로 둘 다 허용하되, 값 토큰이 ec2 자체를 삼키지 않도록 (?!ec2\b) 로 막는다.
  const OPTS = String.raw`(?:\s+-[^\s|;&<>]*(?:\s+(?!ec2\b)[^\s|;&<>-][^\s|;&<>]*)?|\s+[^\s|;&<>]+=[^\s|;&<>]*)*`;
  const sshAlias = new RegExp(String.raw`\bssh${OPTS}\s+ec2\b`);
  const scpAlias = new RegExp(String.raw`\bscp${OPTS}(?:\s+[^\s|;&<>]+)*\s+ec2:`);
  const rsyncSsh = /\brsync\b[^\n]*(?:-e\s+ssh|\bec2:)/;
  return sshAlias.test(code) || scpAlias.test(code) || rsyncSsh.test(code);
}

// 워크플로를 job 블록으로 쪼갠다. 아래 전제조건 검사는 반드시 **job 단위**여야 한다 —
// 파일 전체에서 grep 하면 다른 job 이 갖춘 것을 이 job 도 가진 것으로 착각한다.
export function splitJobs(workflow) {
  const lines = workflow.split('\n');
  const jobs = [];
  let current = null;
  let inJobs = false;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    // 최상위 키(들여쓰기 0)를 만나면 jobs: 섹션이 끝난 것이다.
    if (/^\S/.test(line)) { inJobs = false; continue; }
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      current = { name: header[1], body: [] };
      jobs.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return jobs.map((j) => ({ name: j.name, body: j.body.join('\n') }));
}

// 러너에서 무언가를 실행하려면 그 job 자신이 준비물을 갖춰야 한다.
//  - 리포 스크립트를 돌린다  → actions/checkout 이 그 job 안에 있어야 한다
//  - aws CLI 를 호출한다     → 자격증명 스텝 + id-token: write 가 그 job 안에 있어야 한다
// 2026-08-02 실사고: SSH → SSM 전환에서 deploy job 의 checkout 과 AWS 자격증명 스텝이 함께
// 사라졌는데, 가드가 파일 전체를 grep 했기 때문에 build-images 의 것을 보고 green 을 냈다.
// 첫 승인 배포가 `sync-prod-runtime-env.sh: No such file or directory`(127) 로 죽었다.
export function findJobsMissingRunnerPrereqs(workflow) {
  const problems = [];
  // 워크플로 레벨 permissions 는 모든 job 이 상속한다 — 여기서 id-token: write 를 주면
  // job 블록에 다시 적을 필요가 없다(deploy-alpha.yml 이 그 형태다). jobs: 이전 구간만 본다.
  const preamble = workflow.split(/^jobs:\s*$/m)[0] ?? '';
  const inheritsIdToken = /^permissions:\s*$[\s\S]*?^\s+id-token:\s*write\s*$/m.test(preamble);
  for (const { name, body } of splitJobs(workflow)) {
    const code = body
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .map((line) => line.replace(/\s#.*$/, ''))
      .join('\n');
    const usesAwsCli = /\baws\s+(?:ssm|s3|ecr|sts|ec2|elbv2)\b/.test(code);
    const runsRepoScript = /\b(?:bash|sh|node)\s+scripts\//.test(code);
    if (!usesAwsCli && !runsRepoScript) continue;

    if (!/uses:\s*actions\/checkout@/.test(code)) {
      problems.push(
        `job '${name}': 리포 스크립트/aws 호출이 있는데 actions/checkout 스텝이 없습니다 ` +
          '(러너에 리포가 없어 첫 실행에서 exit 127 로 죽는다)',
      );
    }
    if (usesAwsCli && !/uses:\s*aws-actions\/configure-aws-credentials@/.test(code)) {
      problems.push(
        `job '${name}': aws CLI 를 호출하는데 configure-aws-credentials 스텝이 없습니다`,
      );
    }
    if (usesAwsCli && !inheritsIdToken && !/id-token:\s*write/.test(code)) {
      problems.push(
        `job '${name}': aws CLI 를 호출하는데 job 레벨 id-token: write 가 없습니다 ` +
          '(워크플로 기본값은 contents: read 뿐이라 OIDC 토큰을 못 받는다)',
      );
    }
  }
  return problems;
}

const workflowPath = process.argv[2] ?? '.github/workflows/deploy.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const errors = [];

for (const problem of findJobsMissingRunnerPrereqs(workflow)) {
  errors.push(`${workflowPath}: ${problem}`);
}

// deploy.yml 이 SSH 를 안 쓰게 됐어도, **그 워크플로가 호출하는 스크립트**가 여전히
// `ssh ec2` 를 쓰면 배포는 첫 실행에서 죽는다 — alias 를 만들던 "Setup SSH" 스텝이
// 사라졌기 때문이다. 2026-08-02 첫 프로덕션 배포가 정확히 이렇게 실패했다
// (resolve-prod-rollback-base.sh: "ssh: Could not resolve hostname ec2").
// 워크플로가 부르는 prod 스크립트 전체를 훑어 SSH 잔재를 막는다.
{
  const referenced = new Set(
    [...workflow.matchAll(/scripts\/release\/[a-z0-9-]+\.sh/g)].map((m) => m[0]),
  );
  for (const rel of referenced) {
    let body = '';
    try {
      body = readFileSync(rel, 'utf8');
    } catch {
      errors.push(`${rel}: ${workflowPath} 가 참조하지만 파일이 없습니다`);
      continue;
    }
    if (usesSshAlias(body)) {
      errors.push(
        `${rel}: production deploy scripts must not use the ssh/scp/rsync ec2 alias — ` +
          'the workflow no longer creates it (use SSM instead)',
      );
    }
  }
}

// docker-compose.prod.yml 은 alpha 가 베이스로 함께 로드한다(deploy-alpha.sh 가
// `-f docker-compose.prod.yml -f docker-compose.alpha.yml`). compose 는 override 병합
// **전에** 모든 파일의 변수를 보간하므로, 이 파일에 `${VAR:?...}` 를 넣으면 alpha 오버레이가
// 값을 덮어써도 베이스의 가드가 먼저 터져 alpha 배포가 깨진다.
// (2026-08-02 실사고: "error while interpolating services.v1_uploads_init.image")
// prod 전용 검증은 deploy/prod-manifest-common.sh 의 load_prod_release_manifest() 에 둔다.
{
  const composePath = 'deploy/docker-compose.prod.yml';
  let compose = '';
  try {
    compose = readFileSync(composePath, 'utf8');
  } catch {
    errors.push(`${composePath}: 파일을 읽을 수 없습니다`);
  }
  if (compose && /\$\{V1_(API|WEB)_IMAGE:\?/.test(compose)) {
    errors.push(
      `${composePath}: shared compose base must not use \${VAR:?} on V1_*_IMAGE — ` +
        'alpha loads this file as a base and compose interpolates before merging overrides ' +
        '(guard belongs in load_prod_release_manifest instead)',
    );
  }
  const manifestCommon = (() => {
    try { return readFileSync('deploy/prod-manifest-common.sh', 'utf8'); } catch { return ''; }
  })();
  if (!/V1_API_IMAGE V1_WEB_IMAGE/.test(manifestCommon)) {
    errors.push(
      'deploy/prod-manifest-common.sh: load_prod_release_manifest must assert that ' +
        'V1_API_IMAGE / V1_WEB_IMAGE are ECR digest URIs',
    );
  }
}

const requiredPatterns = [
  {
    pattern: /^permissions:\n  contents: read$/m,
    message: 'workflow permissions must be explicitly limited to contents: read',
  },
  {
    // SSH → SSM 전환(Phase C). 예전에는 EC2_KNOWN_HOSTS 핀과 StrictHostKeyChecking 으로
    // 호스트 검증을 fail-closed 시켰지만, 이제 인바운드 SSH 자체가 없다. 등가 계약은
    // "대상 인스턴스를 변수로 고정하고, 자격증명은 단기 OIDC 로만 얻는다" 이다.
    pattern: /INSTANCE_ID: \$\{\{ vars\.PROD_EC2_INSTANCE_ID \}\}/,
    message: 'production SSM commands must target the pinned PROD_EC2_INSTANCE_ID',
  },
  {
    pattern: /id-token: write/,
    message: 'production deploy must obtain AWS credentials through OIDC, not stored keys',
  },
  {
    pattern: /role-to-assume: \$\{\{ vars\.PROD_AWS_ROLE_ARN \}\}/,
    message: 'production deploy must assume the dedicated prod deploy role',
  },
  {
    // ECR digest 고정 전환(build-images 가 러너에서 docker/build-push-action 으로 직접
    // push) 이후 GA_PROD 는 더 이상 EC2 로 SSH streaming 할 필요가 없다 — alpha
    // (deploy-alpha.yml)와 동일하게 build-args 필드에 시크릿 식을 직접 건다.
    pattern: /NEXT_PUBLIC_GA_MEASUREMENT_ID=\$\{\{ secrets\.GA_PROD \}\}/,
    message: 'production analytics must use the registered GA_PROD secret',
  },
  {
    // 예전에는 시크릿을 heredoc 으로 SSH stdin 에 흘려 보내 인자 노출을 피했다.
    // SSM 에서는 send-command 파라미터가 CloudTrail 과 명령 이력에 남으므로 그 방식
    // 자체가 불가능하다 — 시크릿은 Parameter Store(SecureString) 를 거치고 명령에는
    // 경로만 실린다. 그 스크립트를 반드시 경유하도록 강제한다.
    pattern: /bash scripts\/release\/sync-prod-runtime-env\.sh/,
    message: 'runtime secrets must be delivered through Parameter Store, never in SSM command parameters',
  },
  {
    // 배포 소스는 러너에서 tar 로 묶어 S3 에 올린다. 운영자 백업 디렉터리가 그 tarball 에
    // 섞이면 프로덕션 백업이 배포 아티팩트로 흘러나간다.
    pattern: /--exclude=\.\/backups/,
    message: 'production release tarball must exclude the operator backup directory',
  },
  {
    // S3 객체는 반드시 버킷 소유자를 확인하고 받는다(계정 혼동 공격 방지).
    pattern: /--expected-bucket-owner/,
    message: 'production release artifacts must be fetched with --expected-bucket-owner',
  },
  {
    pattern:
      /\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/,
    message: 'manual production deploys must be restricted to the main branch',
  },
  {
    // ECR digest 고정 전환 이후 provenance/sbom attestation 매니페스트가 붙으면 이후
    // digest 조회·스캔 게이트가 예상과 다른 구조를 만난다(alpha-build 보고서 함정 #4).
    pattern: /provenance: false/,
    message: 'production image pushes must disable provenance attestation',
  },
  {
    pattern: /sbom: false/,
    message: 'production image pushes must disable SBOM attestation',
  },
  {
    // IMMUTABLE ECR 리포지토리는 같은 태그 재push 가 불가능하다 — 이미 존재하는 태그면
    // 빌드 자체를 skip 해야 재실행이 멱등하다.
    pattern: /if: steps\.images\.outputs\.api_exists != 'true'/,
    message: 'production API image build must skip when the immutable tag already exists',
  },
  {
    pattern: /imageTag="sha-\$\{RELEASE_SHA\}"/,
    message: 'production immutable image tags must be prefixed with sha-<commit sha>',
  },
  {
    // build-images job 만 OIDC 로 AWS(ECR push, 대상 검증)를 건드린다 — deploy job 은
    // SSH 만 쓰고 AWS API 를 직접 호출하지 않으므로 id-token: write 가 필요 없다.
    pattern: /id-token: write/,
    message: 'build-images job must request an OIDC token to assume the AWS deploy role',
  },
];

const forbiddenPatterns = [
  {
    pattern: /StrictHostKeyChecking\s+no/,
    message: 'production SSH must never disable host-key verification',
  },
  {
    pattern: /ssh[^\n]*\b[A-Z][A-Z0-9_]*_B64=/,
    message: 'encoded secrets must not be interpolated into the SSH process argument list',
  },
  {
    pattern: /secrets\.GA_MEASUREMENT_ID/,
    message: 'GA_MEASUREMENT_ID is not a registered repository secret; use GA_PROD',
  },
  {
    pattern: /--(?:max-used-space|min-free-space)/,
    message: 'production BuildKit does not support v0.17-only prune filters',
  },
];

for (const { pattern, message } of requiredPatterns) {
  if (!pattern.test(workflow)) errors.push(`${workflowPath}: ${message}`);
}

for (const { pattern, message } of forbiddenPatterns) {
  if (pattern.test(workflow)) errors.push(`${workflowPath}: ${message}`);
}

if (errors.length > 0) {
  console.error('[production-deploy-security] failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[production-deploy-security] passed');
