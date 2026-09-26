import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('immutable privacy v1.4 (withdrawal grace period)', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const release = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-privacy-v1.4.json'), 'utf8'));
  const previous = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-privacy-v1.3.json'), 'utf8'));
  const sql = readFileSync(
    path.join(root, 'migrations/20260926091000_privacy_policy_v14_withdrawal_grace/migration.sql'),
    'utf8',
  );

  it('retains history, links to v1.3 and verifies an exact content digest', () => {
    expect(release.document.supersedesDocumentId).toBe(previous.document.id);
    expect(release.document.contentHash).toBe(createHash('sha256').update(release.document.content).digest('hex'));
    expect(sql).toContain(release.document.contentHash);
    expect(sql).toContain(createHash('md5').update(release.document.content).digest('hex'));
    expect(sql).toContain(release.document.content.replace(/'/g, "''"));
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('states the 30-day withdrawal grace period in the destruction clause and changes nothing else', () => {
    const clause = '회원이 탈퇴를 요청하면 30일의 유예기간 동안 계정을 삭제하지 않고 보관하며';
    expect(release.document.content).toContain(clause);
    const withoutChange = release.document.content
      .replace(/회원이 탈퇴를 요청하면 30일의 유예기간[^\n]*\n\n/, '')
      .replace('최종 변경일: 2026년 9월 26일', '최종 변경일: 2026년 9월 19일');
    expect(withoutChange).toBe(previous.document.content);
  });
});
