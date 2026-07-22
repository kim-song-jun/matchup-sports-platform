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
      title: string;
      subtitle: string;
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
      'signup_location',
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

  it('stores the final signup titles and subtitles', () => {
    const signupItems = baseline.policies
      .filter((policy) => policy.placements.some((item) => item.context === 'signup'));
    const byCode = new Map(signupItems.map((policy) => [policy.code, policy.document]));

    expect(byCode.get('signup_service_terms')).toMatchObject({
      title: '서비스 이용약관',
      subtitle: '팀밋 서비스 이용을 위한 기본 약관이에요.',
    });
    expect(byCode.get('signup_privacy')).toMatchObject({
      title: '개인정보 수집 및 이용 동의',
      subtitle: '회원가입 및 서비스 이용에 필요한 개인정보 수집·이용 동의예요.',
    });
    expect(byCode.get('signup_location')).toMatchObject({
      title: '위치기반서비스 이용 동의',
      subtitle: '선택 · 주변 매치 추천에 사용되는 동의예요.',
    });
  });

  it('stores the final footer titles and subtitles', () => {
    const byCode = new Map(baseline.policies.map((policy) => [policy.code, policy.document]));

    expect(byCode.get('footer_service_terms')).toMatchObject({
      title: '서비스 이용약관',
      subtitle: '팀밋 서비스 이용을 위한 기본 약관이에요.',
    });
    expect(byCode.get('privacy_policy')).toMatchObject({
      title: '개인정보처리방침',
      subtitle: '회원가입 및 서비스 이용에 필요한 개인정보 수집·이용 동의예요.',
    });
    expect(byCode.get('location_terms')).toMatchObject({
      title: '위치기반서비스 이용약관',
      subtitle: '팀밋 서비스 이용을 위한 기본 약관이에요.',
    });
    expect(byCode.get('tournament_policy')).toMatchObject({
      title: '대회 운영정책',
      subtitle: '팀밋 서비스 이용을 위한 기본 약관이에요.',
    });
  });

  it('stores the final tournament application titles and subtitles', () => {
    const byCode = new Map(baseline.policies.map((policy) => [policy.code, policy.document]));

    expect(byCode.get('tournament_rules')).toMatchObject({
      title: '대회 규정 및 안내사항 동의',
      subtitle: '참가 자격, 경기 운영, 노쇼, 실격, 허위 신분 제출 금지에 대한 동의입니다.',
    });
    expect(byCode.get('tournament_privacy')).toMatchObject({
      title: '대회 참가 개인정보 수집·이용 동의',
      subtitle: '대회 참가자 확인 및 참가 자격 검토를 위한 동의입니다.',
    });
    expect(byCode.get('tournament_refund')).toMatchObject({
      title: '참가비 입금·취소·환불 정책 동의',
      subtitle: '입금 기한, 신청 취소, 환불 기준에 대한 동의입니다.',
    });
    expect(byCode.get('tournament_media')).toMatchObject({
      title: '사진·영상 촬영 및 홍보 활용 동의',
      subtitle: '대회 기록, 홍보 콘텐츠, 협찬사 결과 보고에 활용될 수 있습니다.',
    });
  });

  it('keeps signup and tournament requirements separate from footer display documents', () => {
    const placement = (code: string, context: string) =>
      baseline.policies
        .find((policy) => policy.code === code)
        ?.placements.find((item) => item.context === context);

    expect(placement('signup_service_terms', 'signup')?.requirement).toBe('required');
    expect(placement('footer_service_terms', 'footer')?.requirement).toBe('display_only');
    expect(placement('signup_privacy', 'signup')?.requirement).toBe('required');
    expect(placement('signup_location', 'signup')?.requirement).toBe('optional');
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

  it('keeps signup and footer location terms as independently manageable documents', () => {
    const signup = baseline.policies.find((policy) => policy.code === 'signup_location');
    const footer = baseline.policies.find((policy) => policy.code === 'location_terms');

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
