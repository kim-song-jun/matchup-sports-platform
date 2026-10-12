import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('Kakao consent disclosures preserve existing consent history', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const release = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-kakao-consent.json'), 'utf8'));
  const sql = readFileSync(path.join(root, 'migrations/20261012013000_kakao_consent_disclosures/migration.sql'), 'utf8');
  it('adds immutable versions with exact digests and rejects conflicting publication', () => {
    expect(release.policies.map((p: { code: string }) => p.code)).toEqual(['privacy_policy', 'signup_privacy']);
    for (const { document: doc } of release.policies) {
      expect(doc.contentHash).toBe(createHash('sha256').update(doc.content).digest('hex'));
      expect(sql).toContain(doc.content.replace(/'/g, "''"));
      expect(sql).toContain(doc.contentHash);
      expect(sql).toContain(createHash('md5').update(doc.content).digest('hex'));
      expect(sql).toContain(doc.supersedesDocumentId);
      expect(doc.content).toContain('추가 인증번호 입력 없이');
      expect(doc.content).toContain('카카오 정보 제공은 선택 동의');
      expect(doc.content).toContain('30일');
    }
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
