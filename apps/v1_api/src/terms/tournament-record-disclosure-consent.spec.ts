/**
 * tournament-record-disclosure-consent.spec.ts
 *
 * 2026-08-18 사용자 결정: 대회 경기 기록 공개(실명 표시)에 대한 동의 근거가 없던 문제를
 * 신규 정책 `tournament_record_disclosure`(선택, tournament_privacy 와는 별도 policy) 로
 * 해결한다 -- 근거: `V1ManagedTermsPlacement`가 `@@unique([policyId, context])`라 한 정책은
 * 같은 context 에 requirement 하나만 가질 수 있어, 필수 정책(tournament_privacy) 문서
 * 안에 선택 항목을 섞으면 그 항목도 사실상 강제 동의가 된다.
 *
 * DB 가 없는 환경이라 마이그레이션을 재생해 검증할 수 없다 -- 대신 migration.sql 의 실제
 * 텍스트를 읽어 계약을 고정한다. 이 테스트가 잡아야 하는 회귀: (a) 요구사항이 optional 에서
 * required 로 바뀜, (b) content 에서 "선택"·"제한이 없" 문구가 사라짐(실질적으로 강제
 * 동의처럼 보이게 됨), (c) tournament_privacy 문서가 실수로 UPDATE 되어 v1.1 동의자 재동의가
 * 트리거됨, (d) content_hash 가 실제 저장되는 content 바이트와 어긋남(DB CHECK 없음).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
);

describe('tournament_record_disclosure consent (v1.2 도입)', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  function extractContent(): string {
    // migration.sql 은 $terms$...$terms$ postgres dollar-quoting 을 쓴다 (v1.1 baseline 과 동일 관례).
    const match = sql.match(/\$terms\$([\s\S]*?)\$terms\$/);
    if (!match) throw new Error('content not found between $terms$ delimiters');
    return match[1];
  }

  it('새 정책을 신설한다 (code=tournament_record_disclosure)', () => {
    expect(sql).toContain("'tournament_record_disclosure'");
    expect(sql).toMatch(/INSERT INTO "v1_managed_terms_policies"/);
  });

  it('문서 버전과 발행 상태를 갖는다', () => {
    expect(sql).toMatch(/'v1\.1',\s*\n\s*'대회 경기 기록 공개 동의'/);
    expect(sql).toContain("'published'::\"V1TermsDocumentStatus\"");
  });

  it('content_hash 가 실제 저장되는 content 바이트의 sha256 과 일치한다', () => {
    const content = extractContent();
    const hashMatch = sql.match(/\$terms\$,\s*\n\s*'([0-9a-f]{64})'/);
    expect(hashMatch).not.toBeNull();
    const storedHash = hashMatch![1];
    const actualHash = createHash('sha256').update(content, 'utf8').digest('hex');
    expect(actualHash).toBe(storedHash);
  });

  it('공개 항목·목적·위치·철회 방법을 문안에 명시한다', () => {
    const content = extractContent();
    expect(content).toContain('이름, 등번호, 포지션, 소속 팀명');
    expect(content).toContain('공개 목적');
    expect(content).toContain('공개 위치');
    expect(content).toContain('마이페이지');
  });

  it('선택 동의이며 미동의 시 참가 제한이 없음을 문안에 명시한다', () => {
    const content = extractContent();
    expect(content).toContain('선택 사항');
    expect(content).toMatch(/동의하지 않아도 대회 (신청 및 참가에는|참가) 제한/);
    expect(content).toContain('닉네임');
  });

  it('placement 는 tournament_application 컨텍스트에서 optional 이다 (필수와 분리)', () => {
    const placementMatch = sql.match(
      /INSERT INTO "v1_managed_terms_placements"[\s\S]*?VALUES \(([\s\S]*?)\)\nON CONFLICT/,
    );
    expect(placementMatch).not.toBeNull();
    const body = placementMatch![1];
    expect(body).toContain("'tournament_application'::\"V1ManagedTermsContext\"");
    expect(body).toContain("'optional'::\"V1ManagedTermsRequirement\"");
    expect(body).not.toContain("'required'::\"V1ManagedTermsRequirement\"");
  });

  it('기존 tournament_privacy 문서를 UPDATE 하거나 재동의를 강제하지 않는다 (소급 금지)', () => {
    // 이 마이그레이션은 순수 INSERT 만 수행한다 -- UPDATE/ALTER/DROP 이 전혀 없어야
    // 기존 V1ManagedTermsConsentEvent·tournamentRealNameVisible 값이 안전하다. 실행되는
    // SQL 문(주석 제외)만 검사한다 -- 근거 설명을 담은 헤더 주석은 문서화 목적으로
    // tournament_privacy 의 id 를 인용하지만 그 자체는 아무것도 실행하지 않는다.
    const executableSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/\b(UPDATE|ALTER|DROP)\b/i);
    expect(executableSql).not.toContain('a1100000-0000-4000-8000-000000000007'); // tournament_privacy policy id
    expect(executableSql).not.toContain('a1110000-0000-4000-8000-000000000007'); // tournament_privacy v1.1 document id
  });

  it('모든 INSERT 가 ON CONFLICT DO NOTHING 으로 재적용에 안전하다 (idempotent)', () => {
    const inserts = sql.match(/^INSERT INTO/gm) ?? [];
    const onConflicts = sql.match(/ON CONFLICT \("id"\) DO NOTHING;/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(3);
    expect(onConflicts.length).toBe(inserts.length);
  });
});
