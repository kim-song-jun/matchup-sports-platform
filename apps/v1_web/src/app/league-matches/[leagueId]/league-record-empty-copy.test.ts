import { describe, expect, it } from 'vitest';
import { leagueRecordEmptySub } from './league-record-empty-copy';

describe('leagueRecordEmptySub', () => {
  // 순위가 비는 이유 두 가지는 **처방이 다르다** — 동의 게이팅은 할 일이 있고,
  // 결과 없음은 기다리는 것 말고 할 일이 없다. 한 문구로 뭉치면 "연동하면 되는데
  // 그냥 기다리는" 사용자가 생긴다.
  it('동의 게이팅으로 가려졌으면 연동·동의로 풀린다는 것을 알린다', () => {
    expect(leagueRecordEmptySub('goals', true)).toContain('신원 연동');
    expect(leagueRecordEmptySub('goals', true)).toContain('동의');
    expect(leagueRecordEmptySub('assists', true)).toContain('신원 연동');
  });

  it('아직 결과가 없는 것뿐이면 연동 이야기를 꺼내지 않는다', () => {
    // 할 일이 없는 사용자에게 연동을 권하면 잘못된 처방이 된다.
    expect(leagueRecordEmptySub('goals', false)).not.toContain('신원 연동');
    expect(leagueRecordEmptySub('assists', false)).not.toContain('신원 연동');
    expect(leagueRecordEmptySub('goals', false)).toContain('확정된 경기 결과');
  });

  it('득점과 도움을 문구에서 구분한다', () => {
    expect(leagueRecordEmptySub('goals', true)).toContain('득점');
    expect(leagueRecordEmptySub('goals', true)).not.toContain('도움');
    expect(leagueRecordEmptySub('assists', true)).toContain('도움');
    expect(leagueRecordEmptySub('assists', false)).toContain('도움');
  });

  // 두 화면(순위표·시상)이 같은 문구를 쓰는 것이 이 모듈의 존재 이유다.
  // 네 조합이 서로 다른 문구여야 한다 — 하나라도 같아지면 분기가 무너진 것이다.
  it('네 조합이 모두 다른 문구다', () => {
    const all = [
      leagueRecordEmptySub('goals', true),
      leagueRecordEmptySub('goals', false),
      leagueRecordEmptySub('assists', true),
      leagueRecordEmptySub('assists', false),
    ];
    expect(new Set(all).size).toBe(4);
  });
});
