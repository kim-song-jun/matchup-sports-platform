import { participantDisplayName } from './participant-display-name';

/**
 * 경기 참가자 이름의 **단일 규칙**. 이 규칙이 한 곳에만 있었을 때 나머지 두 경로가
 * `realName` 을 그대로 박았고, **신원이 연결된 참가자의 실명이 공개 경기 기록에 그대로
 * 떴다**(2026-09-08 alpha 실측). 규칙을 여기 모은 이유가 그거다.
 */
describe('participantDisplayName', () => {
  const realName = '홍길동';

  it('닉네임이 있으면 닉네임이다 — 실명을 경기 기록에 싣지 않는다', () => {
    expect(
      participantDisplayName({
        realName,
        user: { profile: { nickname: '길동이', displayName: '표시이름' } },
      }),
    ).toBe('길동이');
  });

  it('닉네임이 없으면 표시이름으로 내려간다', () => {
    expect(
      participantDisplayName({
        realName,
        user: { profile: { nickname: null, displayName: '표시이름' } },
      }),
    ).toBe('표시이름');
  });

  it('프로필이 없으면 실명으로 폴백한다 — 이름 없는 참가자를 만들지 않는다', () => {
    expect(participantDisplayName({ realName, user: { profile: null } })).toBe(realName);
    expect(participantDisplayName({ realName, user: null })).toBe(realName);
  });

  /**
   * **빈 문자열은 폴백하지 않는다.** `??` 는 `null`/`undefined` 에서만 내려간다 — 여기서
   * `||` 로 바꾸면 "빈 닉네임"이 실명으로 새는 경로가 생긴다. 폴백을 넓히지 말라는 뜻으로
   * 이 계약을 못 박는다(빈 닉네임은 프로필 저장 단계에서 막을 일이다).
   */
  it('닉네임이 빈 문자열이면 그대로 쓴다 — 실명으로 새지 않는다', () => {
    expect(
      participantDisplayName({ realName, user: { profile: { nickname: '', displayName: null } } }),
    ).toBe('');
  });
});
