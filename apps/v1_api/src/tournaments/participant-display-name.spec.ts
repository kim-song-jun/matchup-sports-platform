import { participantDisplayName } from './participant-display-name';

/**
 * 경기 참가자 이름의 **단일 규칙**. 이 규칙이 한 곳에만 있었을 때 나머지 세 경로가
 * `realName` 을 그대로 박았다 — 2026-08-18 "닉네임 기본 + 프로필 토글" 정책에서
 * **사용자가 고르지 않은 쪽 이름**이 스냅샷에 남는다는 뜻이고, 스냅샷은 읽는 쪽
 * 게이팅의 **폴백값**이자 게이팅을 안 거치는 표면이 그대로 읽는 값이다.
 */
describe('participantDisplayName', () => {
  it('닉네임이 있으면 닉네임이다', () => {
    expect(
      participantDisplayName({ user: { profile: { nickname: '길동이', displayName: '표시이름' } } }),
    ).toBe('길동이');
  });

  it('닉네임이 없으면 표시이름으로 내려간다', () => {
    expect(
      participantDisplayName({ user: { profile: { nickname: null, displayName: '표시이름' } } }),
    ).toBe('표시이름');
  });

  /**
   * **폴백은 실명이 아니라 `'팀원'` 이다.** 예전엔 실명으로 떨어뜨리며 "이름 없는 참가자보다
   * 낫다"고 정당화했는데, 스키마상 이 폴백의 실제 발동 조건은 **프로필 행 부재** 하나뿐이고
   * **읽는 쪽 게이팅도 정확히 그 조건에서 스냅샷을 그대로 반환한다** — 두 폴백이 같은
   * 구멍으로 함께 뚫려 방어가 되지 않았다. 팀 매치 쪽이 이미 `'팀원'` 이고 그쪽이 맞다.
   */
  it('프로필이 없으면 팀원이다 — 실명으로 떨어지지 않는다', () => {
    expect(participantDisplayName({ user: { profile: null } })).toBe('팀원');
    expect(participantDisplayName({ user: null })).toBe('팀원');
  });

  /**
   * 빈 문자열은 폴백하지 않는다 — `??` 는 `null`/`undefined` 에서만 내려간다. `||` 로 바꾸면
   * 빈 닉네임이 `'팀원'` 으로 조용히 갈리고, 그건 프로필 저장 단계에서 막을 일이다.
   */
  it('닉네임이 빈 문자열이면 그대로 쓴다', () => {
    expect(
      participantDisplayName({ user: { profile: { nickname: '', displayName: null } } }),
    ).toBe('');
  });
});
