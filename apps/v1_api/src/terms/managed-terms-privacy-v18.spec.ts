import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type Release = {
  policyId: string;
  code: string;
  document: Record<string, string | boolean> & { id: string; content: string; contentHash: string; effectiveAt: string };
};

const sqlLiteral = (text: string) => `'${text.replace(/'/g, "''")}'`;
const digest = (algorithm: 'sha256' | 'md5', text: string) => createHash(algorithm).update(text, 'utf8').digest('hex');
// The columns are timestamp without time zone holding UTC wall-clock time, whatever the session TimeZone is.
const utcWallClock = (instant: string) => `('${instant}'::timestamptz AT TIME ZONE 'UTC')`;

describe('immutable privacy_policy v1.8 and signup_privacy v1.4 (effective 2026-11-23 KST)', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');
  const release = JSON.parse(read('data/managed-terms-privacy-v1.8.json'));
  const policies: Release[] = release.policies;
  const privacy = policies.find((policy) => policy.code === 'privacy_policy')!;
  const signup = policies.find((policy) => policy.code === 'signup_privacy')!;
  const v17 = JSON.parse(read('data/managed-terms-privacy-v1.7.json'));
  const v13 = JSON.parse(read('data/managed-terms-kakao-required-consent.json')).policies.find(
    (policy: Release) => policy.code === 'signup_privacy',
  );
  const sql = read('migrations/20261122090000_privacy_policy_v18_signup_privacy_v14/migration.sql');
  // Statements end at an INSERT's conflict clause or at a DO block's closing tag (the block body has its own `;`).
  const statements = sql.replace(/^--.*\n/gm, '').split(/(?<=DO NOTHING|\$);\n/).filter((statement) => statement.trim());
  const effectiveDate = '2026년 11월 23일';

  it.each([
    ['privacy_policy', () => privacy, () => ({ policyId: v17.policyId, document: v17.document }), 'v1.8', 0],
    ['signup_privacy', () => signup, () => v13, 'v1.4', 2],
  ])('appends %s as a non-reconsent revision of the published one', (_code, current, previous, version, insertIndex) => {
    const { policyId, document } = current();
    const before = previous();
    const insert = statements[insertIndex];
    expect(policyId).toBe(before.policyId);
    expect(document).toMatchObject({ version, supersedesDocumentId: before.document.id, requiresReconsent: false });
    expect(document.contentHash).toBe(digest('sha256', document.content));
    expect(insert).toContain(`VALUES (${sqlLiteral(document.id)}, ${sqlLiteral(policyId)}, '${version}'`);
    expect(insert).toContain(
      `${sqlLiteral(document.content)}, '${document.contentHash}', ${sqlLiteral(String(document.changeSummary))}, false, 'published'::"V1TermsDocumentStatus", ` +
        `${utcWallClock(document.effectiveAt)}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), '${before.document.id}'`,
    );
  });

  it.each([
    ['privacy_policy', () => privacy, 1, 'Privacy v1.8'],
    ['signup_privacy', () => signup, 3, 'Signup privacy v1.4'],
  ])('guards %s against a conflicting row by its exact digest and effective time', (_code, current, guardIndex, label) => {
    const { document } = current();
    const guard = statements[guardIndex];
    expect(guard).toContain(`"content_hash" = '${document.contentHash}' AND md5("content") = '${digest('md5', document.content)}'`);
    expect(guard).toContain(`"effective_at" = ${utcWallClock(document.effectiveAt)} AND`);
    expect(guard).toContain(`"supersedes_document_id" = '${document.supersedesDocumentId}'`);
    expect(guard).toContain(`RAISE EXCEPTION '${label} canonical document conflict'`);
  });

  it('only inserts and never rewrites legal history', () => {
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE|DROP)\b/i);
    expect(statements).toHaveLength(4);
    expect(sql.match(/ON CONFLICT \("policy_id", "version"\) DO NOTHING/g)).toHaveLength(2);
  });

  it('takes effect at the start of the KST day the body names', () => {
    // KST is a fixed UTC+9 offset with no daylight saving time.
    for (const { document } of [privacy, signup]) {
      const kstWallClock = new Date(new Date(document.effectiveAt).getTime() + 9 * 60 * 60 * 1000).toISOString();
      expect(kstWallClock).toBe('2026-11-23T00:00:00.000Z');
    }
  });

  it('dates the body only where the date belongs', () => {
    expect(privacy.document.content.split(effectiveDate)).toHaveLength(3);
    expect(privacy.document.content).toContain(`이 개인정보처리방침은 ${effectiveDate}부터 적용됩니다.`);
    expect(privacy.document.content.trimEnd().endsWith(`최종 변경일: ${effectiveDate}`)).toBe(true);
    expect(signup.document.content.split(effectiveDate)).toHaveLength(2);
    expect(signup.document.content.trimEnd().endsWith(`시행일: ${effectiveDate}`)).toBe(true);
  });

  it('names the processors in use and drops the unused Alimtalk channel', () => {
    const content = privacy.document.content;
    expect(content).toContain('솔라피 주식회사(SOLAPI):\n휴대전화 인증번호 문자 발송');
    expect(content).toContain('Amazon Web Services Korea LLC:\n서버·데이터베이스 운영(서울 리전)');
    expect(content).not.toContain('가비아');
    expect(content).not.toContain('알림톡');
  });

  it('states that Kakao nickname and profile image are no longer received, in both documents', () => {
    for (const { document } of [privacy, signup]) {
      expect(document.content).toContain('카카오 닉네임과 프로필 이미지는 제공받지 않습니다.');
      expect(document.content).not.toContain('초기값으로 활용될 수 있습니다');
    }
  });

  it('keeps the six Kakao signup items the console requests as mandatory', () => {
    expect(privacy.document.content).toContain('이메일, 이름, 휴대전화번호, 성별, 생년월일(출생 연도·생일)을 필수 제공 항목으로 요청합니다.');
    expect(signup.document.content).toContain('이메일, 이름, 휴대전화번호, 성별, 생년월일(출생 연도·생일), 카카오 서비스 회원번호');
  });

  it('describes every Kakao unlink trigger and what happens on an unlink notice', () => {
    const content = privacy.document.content;
    expect(content).toContain('탈퇴를 신청하거나, 탈퇴 유예기간이 지나 계정을 파기하거나, 회사가 계정을 삭제하는 경우');
    expect(content).toContain('카카오 로그인을 해제하면 회사는 카카오에 해당 회원과 팀밋의 연결 해제를 요청합니다.');
    expect(content).toContain('연결이 해제되었다는 통지를 카카오로부터 받으면, 회사는 그 사실을 기록하고');
  });

  it('adds the new sections in order before the last-changed date', () => {
    const content = privacy.document.content;
    const headings = ['13. 카카오 로그인으로 수집하는 정보', '14. 로그인 수단의 연결과 해제', '15. 카카오 지도·장소 검색 이용 시 처리되는 정보',
      '16. 쿠키와 개인정보의 국외 이전', '17. 개인정보처리방침의 변경', '최종 변경일:'];
    // Headings stand on their own line; clause 6 also cites clause 16 by name inside a sentence.
    const positions = headings.map((heading) => content.indexOf(`\n\n${heading}`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('lists signup data for Apple sign-up in the consent document', () => {
    expect(signup.document.content).toContain('Apple 로그인 회원가입 시 수집하는 정보:\nApple 서비스 회원번호');
  });
});
