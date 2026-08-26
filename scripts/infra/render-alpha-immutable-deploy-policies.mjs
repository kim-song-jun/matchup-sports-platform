#!/usr/bin/env node

export function renderAlphaImmutableDeployPolicies({ region, accountId, bucket, instanceId }) {
  requireValue(region, 'region');
  requireValue(accountId, 'accountId');
  requireValue(bucket, 'bucket');
  requireValue(instanceId, 'instanceId');

  const apiRepository = 'teameet-alpha-v1-api';
  const webRepository = 'teameet-alpha-v1-web';
  const parameterArn = `arn:aws:ssm:${region}:${accountId}:parameter/teameet/alpha/env/SLACK_INQUIRY_WEBHOOK_URL`;
  return {
    github: {
      Version: '2012-10-17',
      Statement: [
        { Sid: 'EcrLogin', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
        {
          Sid: 'ImmutableImagePush',
          Effect: 'Allow',
          Action: [
            'ecr:BatchCheckLayerAvailability',
            'ecr:BatchGetImage',
            'ecr:CompleteLayerUpload',
            'ecr:DescribeImages',
            'ecr:DescribeImageScanFindings',
            'ecr:DescribeRepositories',
            'ecr:GetDownloadUrlForLayer',
            'ecr:InitiateLayerUpload',
            'ecr:PutImage',
            'ecr:UploadLayerPart',
          ],
          Resource: [
            `arn:aws:ecr:${region}:${accountId}:repository/${apiRepository}`,
            `arn:aws:ecr:${region}:${accountId}:repository/${webRepository}`,
          ],
        },
        {
          Sid: 'ReleaseBucketMetadata',
          Effect: 'Allow',
          Action: ['s3:GetBucketVersioning', 's3:ListBucket'],
          Resource: `arn:aws:s3:::${bucket}`,
        },
        {
          Sid: 'ImmutableReleaseObjects',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'],
          Resource: [
            `arn:aws:s3:::${bucket}/releases/*`,
            `arn:aws:s3:::${bucket}/manifests/*`,
          ],
        },
        { Sid: 'DescribeAlphaTarget', Effect: 'Allow', Action: 'ec2:DescribeInstances', Resource: '*' },
        {
          Sid: 'InvokeAlphaInstance',
          Effect: 'Allow',
          Action: 'ssm:SendCommand',
          Resource: [
            `arn:aws:ssm:${region}::document/AWS-RunShellScript`,
            `arn:aws:ec2:${region}:${accountId}:instance/${instanceId}`,
          ],
        },
        { Sid: 'ReadAlphaCommand', Effect: 'Allow', Action: 'ssm:GetCommandInvocation', Resource: '*' },
        {
          Sid: 'WriteAlphaRuntimeParameter',
          Effect: 'Allow',
          Action: 'ssm:PutParameter',
          Resource: parameterArn,
        },
      ],
    },
    instance: {
      Version: '2012-10-17',
      Statement: [
        { Sid: 'EcrLogin', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
        {
          Sid: 'ImmutableImagePull',
          Effect: 'Allow',
          Action: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
          Resource: [
            `arn:aws:ecr:${region}:${accountId}:repository/${apiRepository}`,
            `arn:aws:ecr:${region}:${accountId}:repository/${webRepository}`,
          ],
        },
        {
          Sid: 'PinnedReleaseRead',
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:GetObjectVersion'],
          Resource: [
            `arn:aws:s3:::${bucket}/releases/*`,
            `arn:aws:s3:::${bucket}/manifests/*`,
          ],
        },
        {
          Sid: 'ReadAlphaRuntimeParameter',
          Effect: 'Allow',
          Action: 'ssm:GetParameter',
          Resource: parameterArn,
        },
      ],
    },
  };
}

function requireValue(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Expected paired CLI arguments');
    values.set(key, value);
  }
  return values;
}

if (process.argv[1]?.endsWith('render-alpha-immutable-deploy-policies.mjs')) {
  try {
    const values = parseArguments(process.argv.slice(2));
    const policies = renderAlphaImmutableDeployPolicies({
      region: values.get('--region'),
      accountId: values.get('--account'),
      bucket: values.get('--bucket'),
      instanceId: values.get('--instance'),
    });
    const selected = values.get('--policy') ?? 'all';
    if (!['all', 'github', 'instance'].includes(selected)) throw new Error('policy must be all, github, or instance');
    process.stdout.write(`${JSON.stringify(selected === 'all' ? policies : policies[selected])}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
