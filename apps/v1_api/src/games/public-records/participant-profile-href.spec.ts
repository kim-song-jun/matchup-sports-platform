import { resolveParticipantProfileHref } from './participant-name-gating';
import type { ParticipantConsentEligibility } from './public-consent';

/**
 * 공개 기록에서 선수 이름을 프로필로 잇는 링크의 **게이팅**.
 *
 * 2026-08-24 결정(B-2): 공개 응답에 `userId` 를 싣지 않는다. 계정 식별자를 내보내면
 * 이름을 가려 둔 경기에서도 같은 id 로 사람을 이어 붙일 수 있게 되는데, 링크 하나 걸자고
 * 그 표면을 새로 만들 이유가 없다. 대신 **열어도 되는지 판단까지 서버가 끝내고** 경로만
 * 내려준다.
 *
 * 이 스펙이 지키는 계약: 링크는 **계정이 있고 + 공개 동의를 켠** 사람에게만 생긴다.
 * 한쪽이라도 빠지면 `null` 이어야 한다 — 동의하지 않은 사람의 프로필 화면은 어차피
 * 비어 있으므로, 링크를 걸면 눌러도 아무것도 없는 곳으로 보내게 된다.
 */
const granted: ParticipantConsentEligibility = {
  participantId: 'p1',
  linkedUserId: 'u1',
  userConsentState: 'GRANTED',
  latestParticipantSnapshotState: null,
};

describe('resolveParticipantProfileHref', () => {
  it('계정이 있고 공개 동의를 켰으면 프로필 경로를 준다', () => {
    expect(resolveParticipantProfileHref('u1', granted)).toBe('/users/u1');
  });

  it('계정이 없는 참가자(게스트)는 링크가 없다', () => {
    // 라인업은 이름만으로도 짤 수 있다 — 그런 참가자에게는 열어 줄 프로필이 없다.
    expect(resolveParticipantProfileHref(null, granted)).toBeNull();
  });

  it('공개 동의를 켜지 않았으면 링크가 없다', () => {
    expect(resolveParticipantProfileHref('u1', { ...granted, userConsentState: null })).toBeNull();
    expect(resolveParticipantProfileHref('u1', { ...granted, userConsentState: 'REVOKED' })).toBeNull();
  });

  it('개별 숨김(참가자 스냅샷 REVOKED)이 걸려 있으면 링크가 없다', () => {
    expect(
      resolveParticipantProfileHref('u1', { ...granted, latestParticipantSnapshotState: 'REVOKED' }),
    ).toBeNull();
  });

  it('동의 정보 자체를 못 찾았으면 링크가 없다 (모르면 열지 않는다)', () => {
    expect(resolveParticipantProfileHref('u1', undefined)).toBeNull();
  });

  it('경로에 들어가는 값은 URL 로 인코딩한다', () => {
    expect(resolveParticipantProfileHref('u 1/x', granted)).toBe('/users/u%201%2Fx');
  });
});
