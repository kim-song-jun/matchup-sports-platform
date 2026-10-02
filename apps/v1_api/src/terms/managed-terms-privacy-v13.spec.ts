import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('immutable Android privacy v1.3', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const release = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-privacy-v1.3.json'), 'utf8'));
  const previous = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-privacy-v1.2.json'), 'utf8'));
  const sql = readFileSync(path.join(root, 'migrations/20260919091000_android_privacy_policy_v13/migration.sql'), 'utf8');
  it('retains history, links to v1.2 and verifies an exact content digest', () => {
    expect(release.document.supersedesDocumentId).toBe(previous.document.id);
    expect(release.document.contentHash).toBe(createHash('sha256').update(release.document.content).digest('hex'));
    expect(sql).toContain(release.document.contentHash);
    expect(sql).toContain(createHash('md5').update(release.document.content).digest('hex'));
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });
  it('distinguishes sign-out from explicit opt-out and describes chat identifiers', () => {
    expect(release.document.content).toContain('FCM 토큰은 유지합니다');
    expect(release.document.content).toContain('Firebase에 토큰 삭제를 요청합니다');
    expect(release.document.content).toContain('차단 해제 또는 계정 최종 삭제까지');
    expect(release.document.content).not.toContain('알림 동의를 철회하거나 로그아웃하면');
  });
});
