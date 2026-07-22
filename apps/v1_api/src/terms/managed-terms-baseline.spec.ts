import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type Baseline = {
  canonicalVersion: string;
  policies: Array<{
    id: string;
    code: string;
    document: {
      id: string;
      version: string;
      content: string;
      contentHash: string;
    };
    placements: Array<{
      context: 'signup' | 'tournament_application' | 'footer';
      requirement: 'required' | 'optional' | 'display_only';
    }>;
  }>;
};

const prismaRoot = path.resolve(__dirname, '../../prisma');
const baselinePath = path.join(prismaRoot, 'data/managed-terms-v1.1.json');
const migrationPath = path.join(
  prismaRoot,
  'migrations/20260722090000_v1_managed_terms_v11_baseline/migration.sql',
);

describe('managed terms v1.1 baseline', () => {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
  const migrationSql = readFileSync(migrationPath, 'utf8');

  it('registers the complete current fixed-copy inventory as v1.1', () => {
    expect(baseline.canonicalVersion).toBe('v1.1');
    expect(baseline.policies.map((policy) => policy.code)).toEqual([
      'signup_service_terms',
      'signup_privacy',
      'footer_service_terms',
      'privacy_policy',
      'location_terms',
      'tournament_rules',
      'tournament_privacy',
      'tournament_refund',
      'tournament_media',
      'tournament_policy',
      'support',
    ]);
    expect(baseline.policies.every((policy) => policy.document.version === 'v1.1')).toBe(true);
  });

  it('stores a valid sha256 for every immutable document body', () => {
    for (const policy of baseline.policies) {
      const actual = createHash('sha256')
        .update(policy.document.content, 'utf8')
        .digest('hex');
      expect(actual).toBe(policy.document.contentHash);
    }
  });

  it('keeps signup and tournament requirements separate from footer display documents', () => {
    const placement = (code: string, context: string) =>
      baseline.policies
        .find((policy) => policy.code === code)
        ?.placements.find((item) => item.context === context);

    expect(placement('signup_service_terms', 'signup')?.requirement).toBe('required');
    expect(placement('footer_service_terms', 'footer')?.requirement).toBe('display_only');
    expect(placement('signup_privacy', 'signup')?.requirement).toBe('required');
    expect(placement('tournament_rules', 'tournament_application')?.requirement).toBe('required');
    expect(placement('tournament_privacy', 'tournament_application')?.requirement).toBe('required');
    expect(placement('tournament_refund', 'tournament_application')?.requirement).toBe('required');
    expect(placement('tournament_media', 'tournament_application')?.requirement).toBe('optional');
  });

  it('keeps identical signup and footer service terms as independently manageable documents', () => {
    const signup = baseline.policies.find((policy) => policy.code === 'signup_service_terms');
    const footer = baseline.policies.find((policy) => policy.code === 'footer_service_terms');

    expect(signup?.id).not.toBe(footer?.id);
    expect(signup?.document.id).not.toBe(footer?.document.id);
    expect(signup?.document.content).toBe(footer?.document.content);
  });

  it('never mutates or deletes the legacy document and consent sources', () => {
    const forbiddenLegacyMutation =
      /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"?(?:v1_terms_documents|v1_user_terms_consents|v1_tournament_registrations)"?/i;
    expect(migrationSql).not.toMatch(forbiddenLegacyMutation);
    expect(migrationSql).toContain(
      '-- Additive managed-terms baseline. No legacy table or value is updated or deleted.',
    );
  });

  it('makes both legacy backfills idempotent and records parity evidence', () => {
    expect(migrationSql.match(/ON CONFLICT \("dedupe_key"\) DO NOTHING;/g)).toHaveLength(3);
    expect(migrationSql).toContain("'legacy_user_consent'::\"V1ManagedTermsConsentSource\"");
    expect(migrationSql).toContain(
      "'legacy_tournament_boolean'::\"V1ManagedTermsConsentSource\"",
    );
    expect(migrationSql).toContain("'legacyUserConsentsUnmapped'");
    expect(migrationSql).toContain("'agreedMediaTrue'");
  });
});
