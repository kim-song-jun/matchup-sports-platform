/**
 * team-record-result.spec.ts
 *
 * 프로덕션 실측 버그 회귀 테스트: 정규시간 1:1 + 승부차기 2:3 인 경기가
 * `v1_team_record_facts.result` 에 DRAWN 으로 잘못 기록됐다
 * (`GameResultOfficialFactsService.project()` 가 승부차기를 무시했다).
 */
import { resolveTeamRecordResult } from './team-record-result';

describe('resolveTeamRecordResult', () => {
  it('정규시간 승부가 갈리면 승부차기 값과 무관하게 정규시간이 이긴다', () => {
    expect(resolveTeamRecordResult(3, 1, undefined, undefined)).toBe('WON');
    expect(resolveTeamRecordResult(1, 3, undefined, undefined)).toBe('LOST');
    // 있을 수 없는 조합(정규시간이 갈렸는데 승부차기 값도 있음)이지만 방어적으로
    // 정규시간을 최우선으로 둔다.
    expect(resolveTeamRecordResult(2, 1, 3, 5)).toBe('WON');
  });

  it('정규시간이 무승부이고 승부차기를 이겼으면 WON', () => {
    // 프로덕션 실측: 정규시간 1:1, 승부차기 2:3 -- 진 팀 관점에서 이 케이스와
    // 대칭이다.
    expect(resolveTeamRecordResult(1, 1, 3, 2)).toBe('WON');
  });

  it('정규시간이 무승부이고 승부차기를 졌으면 LOST', () => {
    expect(resolveTeamRecordResult(1, 1, 2, 3)).toBe('LOST');
  });

  it('정규시간도 승부차기도 무승부이면 DRAWN', () => {
    expect(resolveTeamRecordResult(1, 1, 2, 2)).toBe('DRAWN');
  });

  it('승부차기가 없으면(penalties 미기록) 정규시간 무승부가 그대로 DRAWN', () => {
    expect(resolveTeamRecordResult(1, 1, undefined, undefined)).toBe('DRAWN');
  });
});
