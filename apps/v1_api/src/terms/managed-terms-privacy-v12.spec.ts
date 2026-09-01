import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type PrivacyRelease = {
  canonicalVersion: string;
  policyId: string;
  document: {
    id: string;
    version: string;
    content: string;
    contentHash: string;
    requiresReconsent: boolean;
    supersedesDocumentId: string;
  };
};

describe('managed privacy policy v1.2', () => {
  const prismaRoot = path.resolve(__dirname, '../../prisma');
  const release = JSON.parse(readFileSync(
    path.join(prismaRoot, 'data/managed-terms-privacy-v1.2.json'),
    'utf8',
  )) as PrivacyRelease;
  const migration = readFileSync(
    path.join(
      prismaRoot,
      'migrations/20260831090000_android_privacy_policy_v12/migration.sql',
    ),
    'utf8',
  ).replace(/\r\n?/g, '\n');
  const baseline = JSON.parse(readFileSync(
    path.join(prismaRoot, 'data/managed-terms-v1.1.json'),
    'utf8',
  )) as { policies: Array<{ code: string; document: { content: string } }> };

  it('publishes an immutable, non-reconsent Android privacy revision', () => {
    expect(release.canonicalVersion).toBe('v1.2');
    expect(release.document.version).toBe('v1.2');
    expect(release.document.requiresReconsent).toBe(false);
    expect(release.document.supersedesDocumentId).toBe(
      'a1110000-0000-4000-8000-000000000004',
    );
    expect(createHash('sha256').update(release.document.content, 'utf8').digest('hex'))
      .toBe(release.document.contentHash);
  });

  it('covers the shipped Android data paths and account deletion route', () => {
    expect(release.document.content).toContain('Firebase Cloud Messaging');
    expect(release.document.content).toContain('대략적 위치 권한');
    expect(release.document.content).toContain('Open-Meteo');
    expect(release.document.content).toContain('기기 저장소 전체를 조회하는 권한을 요청하지 않습니다');
    expect(release.document.content).toContain('https://teameet.co.kr/account-deletion');
  });

  it('adds a new document without updating or deleting legal history', () => {
    expect(migration).toContain(release.document.id);
    expect(migration).toContain(release.document.contentHash);
    expect(migration).toContain('ON CONFLICT ("policy_id", "version") DO NOTHING');
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it('fails the migration when the canonical v1.2 row is not materialized', () => {
    const canonicalContentMd5 = createHash('md5')
      .update(release.document.content, 'utf8')
      .digest('hex');

    expect(migration).toContain('DO $privacy_v12_guard$');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain(release.document.supersedesDocumentId);
    expect(migration).toContain(release.document.contentHash);
    expect(migration).toContain(`md5(candidate."content") = '${canonicalContentMd5}'`);
  });

  it('builds exactly the canonical v1.2 body from v1.1 plus the migration appendix', () => {
    const priorContent = baseline.policies.find((policy) => policy.code === 'privacy_policy')
      ?.document.content;
    const appendix = migration.split('$android_privacy$')[1];

    expect(priorContent).toBeDefined();
    expect(appendix).toBeDefined();
    expect(priorContent!.replace(/\n시행일: 2026년 7월 1일$/, '') + appendix)
      .toBe(release.document.content);
  });
});
