import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('Kakao consent disclosures preserve existing consent history', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const priorRelease = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-kakao-consent.json'), 'utf8'));
  const priorSql = readFileSync(path.join(root, 'migrations/20261012013000_kakao_consent_disclosures/migration.sql'), 'utf8');
  const release = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-kakao-required-consent.json'), 'utf8'));
  const sql = readFileSync(path.join(root, 'migrations/20261012023000_kakao_required_consent_disclosures/migration.sql'), 'utf8');

  it('keeps the already deployed Kakao disclosure release verifiable and immutable', () => {
    for (const { document: doc } of priorRelease.policies) {
      expect(doc.contentHash).toBe(createHash('sha256').update(doc.content).digest('hex'));
      expect(priorSql).toContain(doc.content.replace(/'/g, "''"));
      expect(priorSql).toContain(doc.contentHash);
      expect(priorSql).toContain(createHash('md5').update(doc.content).digest('hex'));
      expect(priorSql).toContain(doc.supersedesDocumentId);
    }
    expect(priorSql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
  });

  it('appends the required-consent disclosure versions without changing the deployed release', () => {
    expect(priorRelease.policies.map((p: { document: { id: string } }) => p.document.id)).toEqual([
      'a1160000-0000-4000-8000-000000000004',
      'a1160000-0000-4000-8000-000000000002',
    ]);
    expect(priorSql).toContain("'a1160000-0000-4000-8000-000000000004'");
    expect(priorSql).toContain("'a1160000-0000-4000-8000-000000000002'");
    expect(release.policies.map((p: { code: string }) => p.code)).toEqual(['privacy_policy', 'signup_privacy']);
    const expected = [
      {
        id: 'a1170000-0000-4000-8000-000000000004',
        version: 'v1.6',
        supersedesDocumentId: 'a1160000-0000-4000-8000-000000000004',
      },
      {
        id: 'a1170000-0000-4000-8000-000000000002',
        version: 'v1.3',
        supersedesDocumentId: 'a1160000-0000-4000-8000-000000000002',
      },
    ];
    for (const [index, { document: doc }] of release.policies.entries()) {
      expect(doc).toMatchObject({ ...expected[index], requiresReconsent: false });
      expect(doc.contentHash).toBe(createHash('sha256').update(doc.content).digest('hex'));
      expect(sql).toContain(doc.content.replace(/'/g, "''"));
      expect(sql).toContain(doc.contentHash);
      expect(sql).toContain(createHash('md5').update(doc.content).digest('hex'));
      expect(sql).toContain(doc.supersedesDocumentId);
      expect(sql).toContain(`"title" = '${doc.title}'`);
      expect(sql).toContain(`"subtitle" = '${doc.subtitle}'`);
      expect(sql).toContain(`"change_summary" = '${doc.changeSummary}'`);
      expect(sql).toContain('"requires_reconsent" = false');
      expect(sql).toContain(`"effective_at" = '${doc.effectiveAt}'::timestamptz`);
      expect(sql).toContain('"published_at" IS NOT NULL');
      expect(sql).toContain('"status" = \'published\'');
      expect(doc.content).toContain('이메일, 이름, 휴대전화번호, 성별, 생년월일(출생 연도·생일)');
      expect(doc.content).toContain('카카오 닉네임과 프로필 이미지는 선택');
      expect(doc.content).toContain('Teameet 프로필 닉네임의 초기값으로 활용될 수 있습니다');
      expect(doc.content).toContain('사용자가 확인하고 변경할 수 있으며');
      expect(doc.content).toContain('사업자등록번호: 759-31-01615');
      expect(doc.content).toContain('주소: 경기도 평택시 탄현1로 108, 105호(서정동)');
      expect(doc.content).toContain('인증번호 입력 없이');
      expect(doc.content).toContain('게스트로 서비스를 둘러볼 수 있습니다');
      expect(doc.content).toContain('30일');
    }
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/v1_managed_terms_consent_events|v1_user_terms_consents/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
