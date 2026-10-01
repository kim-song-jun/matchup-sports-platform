import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('immutable tournament refund v1.2 (deposit clauses scoped to fee-charging tournaments)', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const release = JSON.parse(
    readFileSync(path.join(root, 'data/managed-terms-tournament-refund-v1.2.json'), 'utf8'),
  );
  const baseline = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-v1.1.json'), 'utf8'));
  const previous = baseline.policies.find((p: { code: string }) => p.code === 'tournament_refund');
  const sql = readFileSync(
    path.join(root, 'migrations/20261001230000_tournament_refund_terms_v12_free_conditional/migration.sql'),
    'utf8',
  );

  it('retains history, links to v1.1 and verifies an exact content digest', () => {
    expect(release.policyId).toBe(previous.id);
    expect(release.document.supersedesDocumentId).toBe(previous.document.id);
    expect(release.document.contentHash).toBe(createHash('sha256').update(release.document.content).digest('hex'));
    expect(sql).toContain(release.document.contentHash);
    expect(sql).toContain(createHash('md5').update(release.document.content).digest('hex'));
    expect(sql).toContain(release.document.content.replace(/'/g, "''"));
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('does not trigger the global re-consent gate', () => {
    // The gate only evaluates signup-context placements; this policy lives in tournament_application.
    expect(release.document.requiresReconsent).toBe(false);
    expect(previous.document.content).not.toBe(release.document.content);
  });

  it('scopes the deposit clauses to fee-charging tournaments and changes nothing else', () => {
    const content: string = release.document.content;
    expect(content).toContain('참가비가 없는(무료) 대회는 신청과 동시에 접수되며 입금 절차가 없습니다.');
    expect(content).toContain('참가비가 있는 대회에서 대회 신청 후 2시간 이내에');
    const withoutChange = content
      .replace(/제1항부터 제3항까지의 입금 관련 조항은[^\n]*\n\n/, '')
      .replace('참가비가 있는 대회에서 대회 신청 후 2시간', '대회 신청 후 2시간')
      .replace('\n최종 변경일: 2026년 10월 1일', '');
    expect(withoutChange).toBe(previous.document.content);
  });
});
