import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

type Release = { policyId: string; code: string; document: Record<string, string | boolean> & { content: string } };

describe('immutable privacy_policy v1.8 and signup_privacy v1.4', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');
  const policies: Release[] = JSON.parse(read('data/managed-terms-privacy-v1.8.json')).policies;
  const privacy = policies.find((policy) => policy.code === 'privacy_policy')!;
  const signup = policies.find((policy) => policy.code === 'signup_privacy')!;
  const v17 = JSON.parse(read('data/managed-terms-privacy-v1.7.json'));
  const v13 = JSON.parse(read('data/managed-terms-kakao-required-consent.json')).policies.find(
    (policy: Release) => policy.code === 'signup_privacy',
  );
  const sql = read('migrations/20261122090000_privacy_policy_v18_signup_privacy_v14/migration.sql');

  it.each([
    ['privacy_policy', () => privacy, () => ({ policyId: v17.policyId, document: v17.document }), 'v1.8'],
    ['signup_privacy', () => signup, () => v13, 'v1.4'],
  ])('appends %s as a non-reconsent revision of the published one with an exact content digest', (_code, current, previous, version) => {
    const release = current();
    const before = previous();
    expect(release.policyId).toBe(before.policyId);
    expect(release.document).toMatchObject({ version, supersedesDocumentId: before.document.id, requiresReconsent: false });
    expect(release.document.effectiveAt).toBe(privacy.document.effectiveAt);
    expect(release.document.contentHash).toBe(createHash('sha256').update(release.document.content, 'utf8').digest('hex'));
    expect(sql).toContain(`'${release.document.contentHash}'`);
    expect(sql).toContain(createHash('md5').update(release.document.content, 'utf8').digest('hex'));
    expect(sql).toContain(release.document.content.replace(/'/g, "''"));
    expect(sql).toContain(`'${release.document.supersedesDocumentId}'`);
  });

  it('only inserts, never rewrites legal history, and guards each row', () => {
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE|DROP)\b/i);
    expect(sql.match(/INSERT INTO "v1_managed_terms_documents"/g)).toHaveLength(2);
    expect(sql.match(/ON CONFLICT \("policy_id", "version"\) DO NOTHING/g)).toHaveLength(2);
    expect(sql.match(/RAISE EXCEPTION/g)).toHaveLength(2);
  });

  it('dates the body with the effective date in both documents', () => {
    const day = new Date(String(privacy.document.effectiveAt));
    const korean = `${day.getUTCFullYear()}년 ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`;
    expect(privacy.document.content.trimEnd().endsWith(`최종 변경일: ${korean}`)).toBe(true);
    expect(privacy.document.content).toContain(`이 개인정보처리방침은 ${korean}부터 적용됩니다.`);
    expect(signup.document.content.trimEnd().endsWith(`시행일: ${korean}`)).toBe(true);
  });

  it('names the SMS vendor in use and drops the unused Alimtalk channel', () => {
    const { content } = privacy.document;
    expect(content).toContain('솔라피(SOLAPI):\n휴대전화 인증번호 문자 발송');
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

  it('describes every Kakao unlink trigger and the unlink notice', () => {
    const { content } = privacy.document;
    expect(content).toContain('탈퇴를 신청하거나, 탈퇴 유예기간이 지나 계정을 파기하거나, 회사가 계정을 삭제하는 경우');
    expect(content).toContain('카카오 로그인을 해제하면 회사는 카카오에 해당 회원과 팀밋의 연결 해제를 요청합니다.');
    expect(content).toContain('카카오로부터 그 사실을 통지받아 기록하고');
  });

  it('adds the overseas transfer, cookie and change sections in order before the last-changed date', () => {
    const { content } = privacy.document;
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
