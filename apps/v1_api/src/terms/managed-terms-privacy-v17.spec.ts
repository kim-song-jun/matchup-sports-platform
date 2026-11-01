import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

describe('immutable privacy v1.7 (self-service withdrawal cancellation)', () => {
  const root = path.resolve(__dirname, '../../prisma');
  const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');
  const release = JSON.parse(read('data/managed-terms-privacy-v1.7.json'));
  const v16 = JSON.parse(read('data/managed-terms-kakao-required-consent.json')).policies.find(
    (policy: { code: string }) => policy.code === 'privacy_policy',
  );
  const previous = v16.document;
  const sql = read('migrations/20261101120000_privacy_policy_v17_withdrawal_self_cancel/migration.sql');

  const withdrawalClause =
    '회원이 탈퇴를 요청하면 30일의 유예기간 동안 계정을 삭제하지 않고 보관합니다. ' +
    '유예기간에는 회원이 직접 로그인해 탈퇴 신청을 철회하거나, 고객센터를 통해 계정 복구를 요청할 수 있습니다. ' +
    '철회하면 계정을 다시 이용할 수 있으나, 탈퇴 신청 때 정리된 팀 소속과 참가 명단은 자동으로 되돌아오지 않습니다. ' +
    '유예기간에는 해당 계정에 등록된 이메일과 휴대전화번호로 새로 가입할 수 없습니다. ' +
    '유예기간이 지나면 계정과 개인정보를 지체 없이 파기합니다. ' +
    '다만 3. 개인정보의 보유 및 이용 기간에 따라 보관이 필요한 정보는 해당 기간 동안 보관한 뒤 파기합니다.';

  it('appends a non-reconsent revision after v1.6 with an exact content digest', () => {
    expect(previous.version).toBe('v1.6');
    expect(release.policyId).toBe(v16.policyId);
    expect(release.document).toMatchObject({
      id: 'a1180000-0000-4000-8000-000000000004',
      version: 'v1.7',
      supersedesDocumentId: previous.id,
      effectiveAt: '2026-11-01T00:00:00.000Z',
      changeSummary: '회원이 직접 탈퇴 신청을 철회하는 방법, 유예기간 뒤 자동 파기, 유예기간 중 이메일·휴대전화번호 사용 안내',
      requiresReconsent: false,
    });
    expect(release.document.contentHash).toBe(createHash('sha256').update(release.document.content, 'utf8').digest('hex'));
    expect(sql).toContain(release.document.contentHash);
    expect(sql).toContain(createHash('md5').update(release.document.content, 'utf8').digest('hex'));
    expect(sql).toContain(release.document.content.replace(/'/g, "''"));
    expect(sql).toContain(`'${release.document.supersedesDocumentId}'`);
    expect(sql).toContain('false, \'published\'');
    expect(sql).toContain('ON CONFLICT ("policy_id", "version") DO NOTHING');
  });

  it('retains every earlier revision and never rewrites legal history', () => {
    expect(sql).not.toMatch(/\b(?:UPDATE\s+"|DELETE\s+FROM|TRUNCATE|DROP)\b/i);
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql.match(/INSERT INTO "v1_managed_terms_documents"/g)).toHaveLength(1);
  });

  it('changes only the withdrawal paragraph of clause 7 and the last-changed date relative to v1.6', () => {
    const { content } = release.document;
    expect(content).toContain(`7. 개인정보의 파기 절차 및 방법\n\n${withdrawalClause}\n\n전자적 파일 형태의 개인정보는`);
    expect(content.trimEnd().endsWith('최종 변경일: 2026년 11월 1일')).toBe(true);

    const restored = content
      .replace(withdrawalClause, previous.content.match(/회원이 탈퇴를 요청하면 30일의 유예기간[^\n]*/)[0])
      .replace('최종 변경일: 2026년 11월 1일', '최종 변경일: 2026년 10월 12일');
    expect(restored).toBe(previous.content);
  });
});
