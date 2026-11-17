#!/usr/bin/env node

// Lifecycle rules for the two alpha ECR repositories. Must equal what the repositories carry live;
// scripts/qa/check-alpha-immutable-deploy.mjs compares the rendered output with an independent copy.

const untaggedRule = {
  description: 'Expire untagged images older than 7 days',
  selection: { tagStatus: 'untagged', countType: 'sinceImagePushed', countUnit: 'days', countNumber: 7 },
};

const releaseRule = {
  description: 'Keep the 30 most recent release images',
  selection: { tagStatus: 'tagged', tagPrefixList: ['sha-'], countType: 'imageCountMoreThan', countNumber: 30 },
};

// Only the API repository carries the Task 168 tool images.
const task168Rule = {
  description: 'Keep Task 168 tool images (retagged per deploy, so push time is not recency)',
  selection: { tagStatus: 'tagged', tagPrefixList: ['task168-'], countType: 'imageCountMoreThan', countNumber: 10 },
};

const rulesByRepository = {
  api: [untaggedRule, task168Rule, releaseRule],
  web: [untaggedRule, releaseRule],
};

export function renderAlphaEcrLifecyclePolicies() {
  return Object.fromEntries(
    Object.entries(rulesByRepository).map(([repository, rules]) => [
      repository,
      {
        rules: rules.map(({ description, selection }, index) => ({
          rulePriority: index + 1,
          description,
          selection: { ...selection },
          action: { type: 'expire' },
        })),
      },
    ]),
  );
}

if (process.argv[1]?.endsWith('render-alpha-ecr-lifecycle-policies.mjs')) {
  try {
    const [flag, repository, ...rest] = process.argv.slice(2);
    if (flag !== '--repository' || rest.length > 0) throw new Error('Expected --repository <api|web>');
    const policy = renderAlphaEcrLifecyclePolicies()[repository];
    if (policy === undefined) throw new Error('repository must be api or web');
    process.stdout.write(`${JSON.stringify(policy)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
