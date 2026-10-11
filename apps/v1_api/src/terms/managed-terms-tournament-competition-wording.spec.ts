import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type Doc = {
  code: string;
  policyId: string;
  id: string;
  version: string;
  title: string;
  subtitle: string | null;
  content: string;
  contentHash: string;
  requiresReconsent: boolean;
  supersedesDocumentId: string;
};

const NOUN = '대회 / 리그 / 매치';
// The My Page toggle is still labelled "대회 기록 실명 표시"; the consent text must name it as it appears.
const UI_LABEL = '마이페이지 > 설정 > 대회 기록 실명 표시';

describe('immutable tournament-application terms (대회 / 리그 / 매치 wording)', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const release: { documents: Doc[] } = JSON.parse(
    readFileSync(path.join(root, 'data/managed-terms-tournament-competition-wording.json'), 'utf8'),
  );
  const sql = readFileSync(
    path.join(
      root,
      'migrations/20261011120000_tournament_terms_competition_league_match_wording/migration.sql',
    ),
    'utf8',
  );
  const baseline = JSON.parse(readFileSync(path.join(root, 'data/managed-terms-v1.1.json'), 'utf8'));
  const refundV12 = JSON.parse(
    readFileSync(path.join(root, 'data/managed-terms-tournament-refund-v1.2.json'), 'utf8'),
  );
  const disclosureSql = readFileSync(
    path.join(root, 'migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql'),
    'utf8',
  );

  const byCode = (code: string) => {
    const doc = release.documents.find((d) => d.code === code);
    if (!doc) throw new Error(`missing ${code}`);
    return doc;
  };

  /** The text each new revision replaces, reconstructed from the immutable predecessor sources. */
  const predecessorContent = (code: string): { id: string; policyId: string; content: string } => {
    if (code === 'tournament_refund') {
      return { id: refundV12.document.id, policyId: refundV12.policyId, content: refundV12.document.content };
    }
    if (code === 'tournament_record_disclosure') {
      const match = disclosureSql.match(/\$terms\$([\s\S]*?)\$terms\$/);
      return {
        id: '86b39028-bd47-4a4e-9c09-6a4c71c34df6',
        policyId: 'f772fb99-2671-4066-8874-54867ce0ecf4',
        content: match![1],
      };
    }
    const policy = baseline.policies.find((p: { code: string }) => p.code === code);
    return { id: policy.document.id, policyId: policy.id, content: policy.document.content };
  };

  it('covers every document shown in the tournament/league application step', () => {
    expect(release.documents.map((d) => d.code).sort()).toEqual([
      'tournament_media',
      'tournament_privacy',
      'tournament_record_disclosure',
      'tournament_refund',
      'tournament_rules',
    ]);
  });

  it.each([
    'tournament_rules',
    'tournament_privacy',
    'tournament_refund',
    'tournament_media',
    'tournament_record_disclosure',
  ])('%s: supersedes its predecessor, verifies the digest, and keeps history', (code) => {
    const doc = byCode(code);
    const previous = predecessorContent(code);
    expect(doc.policyId).toBe(previous.policyId);
    expect(doc.supersedesDocumentId).toBe(previous.id);
    expect(doc.contentHash).toBe(createHash('sha256').update(doc.content).digest('hex'));
    expect(sql).toContain(doc.contentHash);
    expect(sql).toContain(createHash('md5').update(doc.content).digest('hex'));
    expect(sql).toContain(doc.content.replace(/'/g, "''"));
    expect(sql).toContain(doc.id);
  });

  it('only rewrites the wording: undoing the substitution reproduces the predecessor text', () => {
    for (const doc of release.documents) {
      const previous = predecessorContent(doc.code).content;
      const undone = doc.content
        .replace(UI_LABEL, '@@UI@@')
        .replace(/\n최종 변경일: 2026년 10월 11일$/, '')
        .replace(/ 개최일/g, '일')
        .split(NOUN)
        .join('대회')
        .replace('@@UI@@', UI_LABEL);
      // The refund predecessor already carries its own 최종 변경일 line.
      const expected = previous.replace(/\n최종 변경일: 2026년 10월 1일$/, '');
      expect(undone).toBe(expected);
      expect(doc.content).toContain(NOUN);
      expect(doc.content.replace(UI_LABEL, '').replace(new RegExp(NOUN, 'g'), '')).not.toMatch(/대회/);
    }
  });

  it('keeps the My Page toggle name exactly as the screen labels it', () => {
    expect(byCode('tournament_record_disclosure').content).toContain(UI_LABEL);
  });

  it('keeps titles and subtitles, which the apply screen rewrites per competition kind', () => {
    for (const doc of release.documents) {
      const previous =
        doc.code === 'tournament_refund'
          ? refundV12.document
          : doc.code === 'tournament_record_disclosure'
            ? { title: '대회 경기 기록 공개 동의', subtitle: null }
            : baseline.policies.find((p: { code: string }) => p.code === doc.code).document;
      expect(doc.title).toBe(previous.title);
      expect(doc.subtitle ?? null).toBe(previous.subtitle ?? null);
    }
  });

  it('does not trigger the global re-consent gate and never rewrites history', () => {
    // The gate only evaluates signup-context placements; these policies live in tournament_application.
    for (const doc of release.documents) expect(doc.requiresReconsent).toBe(false);
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/INSERT INTO "v1_managed_terms_(?:placements|policies)"/);
    expect(sql.match(/RAISE EXCEPTION/g)).toHaveLength(release.documents.length);
  });
});
