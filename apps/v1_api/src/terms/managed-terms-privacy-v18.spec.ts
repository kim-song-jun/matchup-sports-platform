import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type Release = {
  policyId: string;
  code: string;
  document: Record<string, string | boolean> & { contentTemplate: string; datePlaceholder: string };
};

const sqlLiteral = (text: string) => `'${text.replace(/'/g, "''")}'`;

describe('immutable privacy_policy v1.8 and signup_privacy v1.4 (effective when the migration runs)', () => {
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
  const kstDay = (timestamp: string) => `to_char(${timestamp} AT TIME ZONE 'Asia/Seoul', 'YYYY"년 "FMMM"월 "FMDD"일"')`;
  // The stored body is the template with the KST publication date spliced in where the placeholder stands.
  const bodyExpression = (document: Release['document'], day: string) =>
    document.contentTemplate.split(document.datePlaceholder).map(sqlLiteral).join(` || ${day} || `);

  it.each([
    ['privacy_policy', () => privacy, () => ({ policyId: v17.policyId, document: v17.document }), 'v1.8', 0],
    ['signup_privacy', () => signup, () => v13, 'v1.4', 2],
  ])('appends %s as a non-reconsent revision of the published one', (_code, current, previous, version, insertIndex) => {
    const entry = current();
    const before = previous();
    const insert = statements[insertIndex];
    expect(entry.policyId).toBe(before.policyId);
    expect(entry.document).toMatchObject({ version, supersedesDocumentId: before.document.id, requiresReconsent: false });
    expect(insert).toContain(`SELECT ${sqlLiteral(String(entry.document.id))}, ${sqlLiteral(entry.policyId)}, '${version}'`);
    expect(insert).toContain(`${bodyExpression(entry.document, 'day.published_day')} AS body`);
    expect(insert).toContain(`FROM (SELECT ${kstDay('CURRENT_TIMESTAMP')} AS published_day) AS day`);
    expect(insert).toContain("doc.body, encode(sha256(convert_to(doc.body, 'UTF8')), 'hex')");
    expect(insert).toContain(`false, 'published'::"V1TermsDocumentStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${sqlLiteral(String(entry.document.supersedesDocumentId))}`);
  });

  it.each([
    ['privacy_policy', () => privacy, 1, 'Privacy v1.8'],
    ['signup_privacy', () => signup, 3, 'Signup privacy v1.4'],
  ])('guards %s against a conflicting row using its own stored date and hash', (_code, current, guardIndex, label) => {
    const guard = statements[guardIndex];
    expect(guard).toContain(`AND t."content" = ${bodyExpression(current().document, kstDay('t."effective_at"'))} `);
    expect(guard).toContain(`t."content_hash" = encode(sha256(convert_to(t."content", 'UTF8')), 'hex')`);
    expect(guard).toContain('t."effective_at" = t."published_at"');
    expect(guard).toContain(`RAISE EXCEPTION '${label} canonical document conflict'`);
  });

  it('only inserts and never rewrites legal history', () => {
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE|DROP)\b/i);
    expect(statements).toHaveLength(4);
    expect(sql.match(/ON CONFLICT \("policy_id", "version"\) DO NOTHING/g)).toHaveLength(2);
  });

  it('dates the body with the publication date only where the date belongs', () => {
    const date = privacy.document.datePlaceholder;
    expect(privacy.document.contentTemplate.split(date)).toHaveLength(3);
    expect(privacy.document.contentTemplate).toContain(`이 개인정보처리방침은 ${date}부터 적용됩니다.`);
    expect(privacy.document.contentTemplate.trimEnd().endsWith(`최종 변경일: ${date}`)).toBe(true);
    expect(signup.document.contentTemplate.split(date)).toHaveLength(2);
    expect(signup.document.contentTemplate.trimEnd().endsWith(`시행일: ${date}`)).toBe(true);
  });

  it('names the processors in use and drops the unused Alimtalk channel', () => {
    const content = privacy.document.contentTemplate;
    expect(content).toContain('솔라피 주식회사(SOLAPI):\n휴대전화 인증번호 문자 발송');
    expect(content).toContain('Amazon Web Services Korea LLC:\n서버·데이터베이스 운영(서울 리전)');
    expect(content).not.toContain('가비아');
    expect(content).not.toContain('알림톡');
  });

  it('states that Kakao nickname and profile image are no longer received, in both documents', () => {
    for (const { document } of [privacy, signup]) {
      expect(document.contentTemplate).toContain('카카오 닉네임과 프로필 이미지는 제공받지 않습니다.');
      expect(document.contentTemplate).not.toContain('초기값으로 활용될 수 있습니다');
    }
  });

  it('keeps the six Kakao signup items the console requests as mandatory', () => {
    expect(privacy.document.contentTemplate).toContain('이메일, 이름, 휴대전화번호, 성별, 생년월일(출생 연도·생일)을 필수 제공 항목으로 요청합니다.');
    expect(signup.document.contentTemplate).toContain('이메일, 이름, 휴대전화번호, 성별, 생년월일(출생 연도·생일), 카카오 서비스 회원번호');
  });

  it('describes every Kakao unlink trigger and what happens on an unlink notice', () => {
    const content = privacy.document.contentTemplate;
    expect(content).toContain('탈퇴를 신청하거나, 탈퇴 유예기간이 지나 계정을 파기하거나, 회사가 계정을 삭제하는 경우');
    expect(content).toContain('카카오 로그인을 해제하면 회사는 카카오에 해당 회원과 팀밋의 연결 해제를 요청합니다.');
    expect(content).toContain('연결이 해제되었다는 통지를 카카오로부터 받으면, 회사는 그 사실을 기록하고');
  });

  it('adds the new sections in order before the last-changed date', () => {
    const content = privacy.document.contentTemplate;
    const headings = ['13. 카카오 로그인으로 수집하는 정보', '14. 로그인 수단의 연결과 해제', '15. 카카오 지도·장소 검색 이용 시 처리되는 정보',
      '16. 쿠키와 개인정보의 국외 이전', '17. 개인정보처리방침의 변경', '최종 변경일:'];
    // Headings stand on their own line; clause 6 also cites clause 16 by name inside a sentence.
    const positions = headings.map((heading) => content.indexOf(`\n\n${heading}`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('lists signup data for Apple sign-up in the consent document', () => {
    expect(signup.document.contentTemplate).toContain('Apple 로그인 회원가입 시 수집하는 정보:\nApple 서비스 회원번호');
  });
});
