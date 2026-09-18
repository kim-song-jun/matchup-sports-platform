import {
  isParticipantOwnerVisible,
  isParticipantPubliclyEligible,
  type ParticipantConsentEligibility,
} from './public-consent';

/**
 * 이 스펙이 지키는 계약은 하나다: **본인 판정과 공개 판정이 정확히 "사용자 단위
 * 동의" 한 조각만큼만 달라야 한다.**
 *
 * 왜 중요한가 -- `countOwnerVisibleParticipations`("지금 동의를 켜면 N경기가
 * 공개돼요")가 `isParticipantOwnerVisible`을 쓰고, 동의를 켠 뒤 실제로 보이는
 * 목록은 `isParticipantPubliclyEligible`이 결정한다. 두 판정이 이 한 조각 외의
 * 조건에서 갈리면, 사용자에게 "N경기"라고 약속해 놓고 켜고 나서는 다른 수를
 * 보여주는 거짓 안내가 된다. 그 드리프트를 여기서 잡는다.
 */
describe('public-consent 판정', () => {
  const base: ParticipantConsentEligibility = {
    participantId: 'p1',
    linkedUserId: 'u1',
    userConsentState: null,
    latestParticipantSnapshotState: null,
  };

  describe('isParticipantOwnerVisible (본인 화면 기준)', () => {
    it('신원 연결이 없으면 본인에게도 보이지 않는다', () => {
      expect(isParticipantOwnerVisible({ ...base, linkedUserId: null })).toBe(false);
    });

    it('사용자 단위 동의를 아직 안 켰어도 본인에게는 보인다', () => {
      expect(isParticipantOwnerVisible({ ...base, userConsentState: null })).toBe(true);
    });

    it('사용자 단위로 명시적 거부(REVOKED)해도 본인에게는 보인다', () => {
      // 사용자 단위 거부는 "남에게 감춘다"이지 "나에게도 감춘다"가 아니다.
      expect(isParticipantOwnerVisible({ ...base, userConsentState: 'REVOKED' })).toBe(true);
    });

    it('이 경기 하나만 개별적으로 숨겼으면(participant REVOKED) 본인에게도 감춘다', () => {
      expect(isParticipantOwnerVisible({ ...base, latestParticipantSnapshotState: 'REVOKED' })).toBe(false);
    });
  });

  describe('두 판정의 차이는 사용자 단위 동의 하나뿐이다', () => {
    const linkStates: Array<string | null> = ['u1', null];
    const consentStates: Array<'GRANTED' | 'REVOKED' | null> = ['GRANTED', 'REVOKED', null];
    const snapshotStates: Array<'GRANTED' | 'REVOKED' | null> = ['GRANTED', 'REVOKED', null];

    it('userConsentState 를 GRANTED 로 고정하면 두 판정이 모든 조합에서 일치한다', () => {
      for (const linkedUserId of linkStates) {
        for (const latestParticipantSnapshotState of snapshotStates) {
          const row: ParticipantConsentEligibility = {
            participantId: 'p1',
            linkedUserId,
            userConsentState: 'GRANTED',
            latestParticipantSnapshotState,
          };
          expect(isParticipantOwnerVisible(row)).toBe(isParticipantPubliclyEligible(row));
        }
      }
    });

    it('본인에게 보이는데 공개는 안 되는 경우는 오직 "동의가 GRANTED 가 아닐 때"뿐이다', () => {
      for (const linkedUserId of linkStates) {
        for (const userConsentState of consentStates) {
          for (const latestParticipantSnapshotState of snapshotStates) {
            const row: ParticipantConsentEligibility = {
              participantId: 'p1',
              linkedUserId,
              userConsentState,
              latestParticipantSnapshotState,
            };
            const owner = isParticipantOwnerVisible(row);
            const publicly = isParticipantPubliclyEligible(row);
            // 공개 가능하면 본인에게도 반드시 보인다 (역은 성립하지 않는다).
            if (publicly) expect(owner).toBe(true);
            // 둘이 갈리는 유일한 사유가 동의 미승인인지 확인한다.
            if (owner && !publicly) expect(userConsentState).not.toBe('GRANTED');
          }
        }
      }
    });
  });
});
